import asyncio
from contextlib import asynccontextmanager
import logging
from datetime import date, datetime, timezone
from hashlib import sha256
from uuid import uuid4
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import delete, or_, select, text, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from . import live, schemas as p
from .auth import athlete_context, can_coach, COOKIE, create_session, optional_user, require_match_operator, require_role, require_team, require_user, work_team_id
from .config import settings
from .db import get_db, SessionLocal
from .models import AuthSession, Athlete, ClubMember, Competition, Enrollment, Game, SourceImport, TacticalPlay, TacticsDraft, Team, TeamSeason, TrainingChange, TrainingSlot, User
from .read import Snapshot, home_json, schedule_json, today, user_json
from .seasons import available_seasons, resolve_season, academic_season, is_historical
from .management import router as management_router, team_period, require_period
from .team_controls import router as controls_router, require_consent
from .accounts import router as accounts_router
from .notifications import router as notifications_router
from .mail_delivery import deliver_pending
from .account_utils import active_club_id

def mail_batch():
    with SessionLocal() as db:deliver_pending(db)

@asynccontextmanager
async def lifespan(application):
    async def mail_worker():
        while True:
            try:await asyncio.to_thread(mail_batch)
            except Exception:logging.getLogger(__name__).warning('Mail delivery batch unavailable; retrying later.')
            await asyncio.sleep(5)
    task=asyncio.create_task(mail_worker()) if get_db not in application.dependency_overrides else None
    yield
    if task:
        task.cancel()
        try:await task
        except asyncio.CancelledError:pass

app = FastAPI(title='CampHoop API', version='0.3.0', lifespan=lifespan, description='Gestão de clubes, elencos, convites e notificações por temporada. Importação NCAA opcional.')
app.include_router(management_router)
app.include_router(controls_router)
app.include_router(accounts_router)
app.include_router(notifications_router)
app.add_middleware(CORSMiddleware, allow_origins=list(settings.origins), allow_credentials=True, allow_methods=['GET','POST','PUT','DELETE'], allow_headers=['Content-Type'])
app.add_middleware(GZipMiddleware,minimum_size=1200,compresslevel=3)

@app.middleware('http')
async def origin_guard(request: Request, call_next):
    if request.method not in ('GET','HEAD','OPTIONS') and request.headers.get('origin') not in (*settings.origins, None):
        return JSONResponse({'detail':'Origem não autorizada.'}, status_code=403)
    response = await call_next(request)
    if request.url.path.startswith('/api'):
        response.headers['Cache-Control'] = 'no-store'
    return response

@app.exception_handler(IntegrityError)
async def integrity_error(_request, _error):
    return JSONResponse({'detail':'Registro duplicado ou conflito com os dados atuais. Atualize e tente novamente.'}, status_code=409)

@app.exception_handler(RequestValidationError)
async def validation_error(_request, error):
    # Do not echo credentials or request bodies in error responses/logs.
    return JSONResponse({'detail':'Dados inválidos. Confira os campos informados.', 'fields':['.'.join(map(str,e['loc'])) for e in error.errors()]}, status_code=422)

def get(db, model, id):
    obj = db.get(model,id)
    if not obj:
        raise HTTPException(404,'Registro não encontrado.')
    return obj
def owner(user, competition, db):
    require_role(user,'organizador')
    if competition.organizer_id != user.id:
        raise HTTPException(403,'Só o organizador deste campeonato pode alterá-lo.')
    if not user.is_demo:
        member=db.get(ClubMember,(competition.club_id,user.id)) if competition.club_id else None
        if not member or member.role!='organizador':raise HTTPException(403,'Seu vínculo de organizador com este clube foi encerrado.')
def no_game(db,team_id,day):
    if db.scalar(select(Game.id).where(Game.date==day,or_(Game.home_id==team_id,Game.away_id==team_id)).limit(1)):
        raise HTTPException(409,'A equipe já tem jogo nesse dia.')

class Hub:
    def __init__(self):
        self.clients = set()
    async def publish(self, game):
        payload={'type':'match.updated','matchId':game.id,'revision':game.revision}
        for ws in tuple(self.clients):
            try:
                await asyncio.wait_for(ws.send_json(payload),timeout=2)
            except Exception:
                self.clients.discard(ws)
hub = Hub()

@app.websocket('/api/ws')
async def websocket(ws: WebSocket):
    if ws.headers.get('origin') not in settings.origins:
        await ws.close(code=1008)
        return
    await ws.accept()
    hub.clients.add(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        hub.clients.discard(ws)

@app.get('/api/health')
def health(db: Session=Depends(get_db)):
    db.execute(text('SELECT 1'))
    return {'status':'ok','database':'postgresql' if db.bind.dialect.name=='postgresql' else db.bind.dialect.name}

@app.get('/api/meta')
def meta(season:str|None=None,user:User|None=Depends(optional_user),db: Session=Depends(get_db)):
    choices_available=available_seasons(db,user,public=True)
    if season and season not in choices_available:raise HTTPException(422,'Temporada não publicada ou sem vínculo com esta conta.')
    default=resolve_season(db)
    selected=season or (default if default in choices_available else next(iter(choices_available),None))
    records=list(db.scalars(select(SourceImport).order_by(SourceImport.season.desc())))
    source=next((s for s in records if s.manifest['season']==selected),None)
    spans={label:{'firstGame':first.isoformat(),'lastGame':last.isoformat()} for label,first,last in db.execute(select(Game.season,func.min(Game.date),func.max(Game.date)).where(Game.imported.is_(True)).group_by(Game.season)) if first and last}
    local_teams=dict(db.execute(select(TeamSeason.season,func.count()).group_by(TeamSeason.season)).tuples().all())
    local_athletes=dict(db.execute(select(Athlete.season,func.count()).where(Athlete.source_id.is_(None)).group_by(Athlete.season)).tuples().all())
    local_games=dict(db.execute(select(Game.season,func.count()).where(Game.imported.is_(False)).group_by(Game.season)).tuples().all())
    choices=[]
    for label in choices_available:
        record=next((r for r in records if r.manifest['season']==label),None)
        counts={'teams':local_teams.get(label,0),'athletes':local_athletes.get(label,0),'games':local_games.get(label,0)}
        choices.append({'season':label,'historical':is_historical(label),'origin':'ncaa' if record else 'local','counts':record.manifest['counts'] if record else counts,'localCounts':counts,'importedAt':record.imported_at.isoformat() if record else None,'scope':record.manifest['scope'] if record else 'Dados cadastrados no CampHoop',**spans.get(label,{})})
    return {'today':today().isoformat(),'timezone':'America/Sao_Paulo','season':selected,'historical':is_historical(selected),'source':source.manifest if source else None,'importedAt':source.imported_at.isoformat() if source else None,'availableSeasons':choices}

@app.post('/api/auth/login')
def login(body:p.Login,response:Response,db:Session=Depends(get_db)):
    user,token=create_session(db,body.email,body.password)
    db.commit()
    response.set_cookie(COOKIE,token,httponly=True,secure=settings.secure_cookie,samesite='lax',max_age=settings.session_hours*3600,path='/api')
    response.headers['Cache-Control']='no-store'
    return user_json(db,athlete_context(db,user))
@app.get('/api/auth/me')
def me(response:Response,user:User|None=Depends(optional_user),db:Session=Depends(get_db)):
    response.headers['Cache-Control']='no-store'
    return user_json(db,user) if user else None
@app.post('/api/auth/logout')
def logout(request:Request,response:Response,db:Session=Depends(get_db)):
    token=request.cookies.get(COOKIE)
    if token:
        db.execute(delete(AuthSession).where(AuthSession.token_hash==sha256(token.encode()).hexdigest()))
        db.commit()
    response.delete_cookie(COOKIE,path='/api')
    return {'ok':True}

@app.get('/api/athletes')
def athletes(season:str|None=None,db:Session=Depends(get_db)):
    s=Snapshot(db,season)
    return [s.athlete(a.id) for a in sorted(s.athletes.values(),key=lambda a:a.name)]
@app.get('/api/athletes/{id}')
def athlete(id:str,user:User|None=Depends(optional_user),db:Session=Depends(get_db)):
    a=db.get(Athlete,id)
    s=Snapshot(db,a.season if a else None)
    return s.athlete_profile(id,user) if id in s.athletes else None
@app.get('/api/teams')
def teams(season:str|None=None,db:Session=Depends(get_db)):
    s=Snapshot(db,season)
    return [s.team(id) for id in s.teams]
@app.get('/api/teams/summary')
def summaries(season:str|None=None,db:Session=Depends(get_db)):
    s=Snapshot(db,season)
    return [s.team_summary(id) for id in s.teams]
@app.get('/api/teams/{id}')
def team(id:str,season:str|None=None,db:Session=Depends(get_db)):
    s=Snapshot(db,season)
    return s.team_profile(id) if id in s.teams else None
@app.get('/api/competitions')
def competitions(season:str|None=None,db:Session=Depends(get_db)):
    s=Snapshot(db,season)
    return [s.competition(id) for id in s.competitions]
@app.get('/api/competitions/{id}')
def competition(id:str,db:Session=Depends(get_db)):
    c=db.get(Competition,id)
    s=Snapshot(db,c.season if c and available_seasons(db) else None)
    return s.competition_profile(id) if id in s.competitions else None
@app.get('/api/games')
def games(season:str|None=None,limit:int=Query(200,ge=1,le=500),offset:int=Query(0,ge=0,le=20000),status:str|None=Query(None,pattern='^(ao-vivo|agendado|encerrado|adiado)$'),db:Session=Depends(get_db)):
    s=Snapshot(db,season)
    selected=[g for g in s.games.values() if status is None or g.status==status]
    selected.sort(key=lambda g:(g.status!='ao-vivo',abs((g.date-today()).days),g.date,g.time or '',g.id))
    return [s.game(g.id) for g in selected[offset:offset+limit]]
@app.get('/api/public/games')
def public_games(season:str|None=None,db:Session=Depends(get_db)):
    s=Snapshot(db,season)
    upcoming=sorted((g for g in s.games.values() if g.status=='agendado'),key=lambda g:(g.date,g.time or '',g.id))[:6]
    finished=sorted((g for g in s.games.values() if g.status=='encerrado'),key=lambda g:(g.date,g.time or '',g.id),reverse=True)[:6]
    return {'live':[s.game(g.id) for g in s.games.values() if g.status=='ao-vivo'],'upcoming':[s.game(g.id) for g in upcoming],'results':[s.game(g.id) for g in finished]}
@app.get('/api/home')
def home(scope:str=Query('minha',pattern='^(minha|todas)$'),season:str|None=None,user:User=Depends(require_user),db:Session=Depends(get_db)):
    return home_json(db,Snapshot(db,season),user,scope)
@app.get('/api/schedule')
def schedule(start:date,end:date,season:str|None=None,user:User|None=Depends(optional_user),db:Session=Depends(get_db)):
    if end<start or (end-start).days>366:
        raise HTTPException(422,'Consulte um intervalo de até 366 dias.')
    return schedule_json(db,Snapshot(db,season),start,end,user)

@app.post('/api/competitions')
def create_competition(body:p.NewCompetition,season:str|None=None,user:User=Depends(require_user),db:Session=Depends(get_db)):
    require_role(user,'organizador')
    club_id=None
    if not user.is_demo:
        selected_club=active_club_id(db,user)
        member=db.get(ClubMember,(selected_club,user.id)) if selected_club else None
        if not member or member.role!='organizador':raise HTTPException(403,'Selecione um clube no qual você seja organizador.')
        club_id=member.club_id
    name=' '.join(body.name.split())
    if len(name)<3 or db.scalar(select(Competition.id).where(Competition.name.ilike(name))):
        raise HTTPException(409,'Nome inválido ou já utilizado.')
    divisions=list({(d.category,d.gender):d.model_dump() for d in body.divisions}.values())
    university=all(d['category']=='Universitário' for d in divisions)
    c=Competition(id=uuid4().hex,name=name,divisions=divisions,organizer_id=user.id,season=resolve_season(db,season) or academic_season(today()),note='Inscreva as equipes para preparar a tabela.',standings_mode='win-rate' if university else 'points',ruleset='by-division')
    c.club_id=club_id
    db.add(c);db.commit()
    return c.id
@app.post('/api/competitions/{id}/enroll')
def enroll(id:str,body:p.Enroll,user:User=Depends(require_user),db:Session=Depends(get_db)):
    teams={t.id:t for t in db.scalars(select(Team).where(Team.id.in_(set(body.ids))).order_by(Team.id).with_for_update())}
    c=db.scalar(select(Competition).where(Competition.id==id).with_for_update())
    if not c: raise HTTPException(404,'Campeonato não encontrado.')
    owner(user,c,db)
    if c.status!='inscricoes':raise HTTPException(409,'Inscrições encerradas.')
    if len(teams)!=len(set(body.ids)):raise HTTPException(404,'Equipe não encontrada.')
    for tid,t in teams.items():
        require_consent(db,t,user,c.season,'enroll',c.id)
        view=team_period(db,t,c.season)
        if t.owner_id and not t.source_id:require_period(db,t.id,c.season)
        if not any(d['category']==view.category and d['gender']==view.gender for d in c.divisions):raise HTTPException(409,'A equipe não pertence a uma divisão deste campeonato.')
        if db.get(Enrollment,(id,tid)):raise HTTPException(409,'Equipe já inscrita.')
        db.add(Enrollment(competition_id=id,team_id=tid))
    db.commit()
    return {'ok':True}

@app.post('/api/games')
def schedule_game(body:p.NewGame,season:str|None=None,user:User=Depends(require_user),db:Session=Depends(get_db)):
    if body.homeTeamId==body.awayTeamId:raise HTTPException(409,'Escolha duas equipes diferentes.')
    # Lock both teams in a deterministic order: serializes concurrent scheduling.
    locked_teams={t.id:t for t in db.scalars(select(Team).where(Team.id.in_([body.homeTeamId,body.awayTeamId])).order_by(Team.id).with_for_update())}
    if len(locked_teams)!=2:raise HTTPException(404,'Equipe não encontrada.')
    h,a=locked_teams[body.homeTeamId],locked_teams[body.awayTeamId]
    c=get(db,Competition,body.competitionId) if body.competitionId else None
    if c:
        owner(user,c,db)
        if c.status=='finalizado' or not all(db.get(Enrollment,(c.id,tid)) for tid in locked_teams):raise HTTPException(409,'Campeonato encerrado ou equipes não inscritas.')
    else:
        require_role(user,'tecnico')
        if not any(can_coach(db,user,tid) for tid in locked_teams):raise HTTPException(403,'Agende amistosos da própria equipe.')
    for tid in locked_teams:no_game(db,tid,body.date)
    selected=c.season if c else resolve_season(db,season) or academic_season(body.date)
    for t in [h,a]:
        if t.owner_id and not t.source_id:require_period(db,t.id,selected)
        if not c:require_consent(db,t,user,selected,'friendly',f'{body.date.isoformat()}:{a.id if t.id==h.id else h.id}')
    hv,av=team_period(db,h,selected),team_period(db,a,selected)
    if (hv.category,hv.gender)!=(av.category,av.gender):raise HTTPException(409,'As equipes precisam ser da mesma categoria e gênero.')
    men=hv.category=='Universitário' and hv.gender=='Masculino'
    periods,length=(2,1200) if men else (4,600)
    if academic_season(body.date)!=selected:raise HTTPException(422,'Escolha uma data dentro da temporada selecionada (julho a junho).')
    g=Game(id=uuid4().hex,season=selected,competition_id=c.id if c else None,home_id=h.id,away_id=a.id,date=body.date,time=body.time,venue=body.venue,status='agendado',regulation_periods=periods,period_seconds=length,remaining_seconds=length)
    db.add(g);db.commit()
    return {'id':g.id}

def slot_json(s):return {'id':s.id,'teamId':s.team_id,'weekday':s.weekday,'time':s.time,'venue':s.venue}
@app.get('/api/training/slots')
def slots(teamId:str,user:User=Depends(require_user),db:Session=Depends(get_db)):
    if not (can_coach(db,user,teamId) or (user.role=='atleta' and work_team_id(db,user)==teamId)):raise HTTPException(403,'Treinos privados da equipe.')
    return [slot_json(s) for s in db.scalars(select(TrainingSlot).where(TrainingSlot.team_id==teamId).order_by(TrainingSlot.weekday,TrainingSlot.time))]
@app.post('/api/training/slots')
def add_slot(body:p.Slot,user:User=Depends(require_user),db:Session=Depends(get_db)):
    require_team(user,body.teamId,db)
    db.add(TrainingSlot(id=uuid4().hex,team_id=body.teamId,weekday=body.weekday,time=body.time,venue=body.venue));db.commit()
    return {'ok':True}
@app.delete('/api/training/slots/{id}')
def remove_slot(id:str,user:User=Depends(require_user),db:Session=Depends(get_db)):
    s=get(db,TrainingSlot,id);require_team(user,s.team_id,db)
    db.delete(s);db.commit();return {'ok':True}
def validate_slot(db,user,team_id,slot_id,day):
    require_team(user,team_id,db)
    s=get(db,TrainingSlot,slot_id)
    if s.team_id!=team_id or (day.weekday()+1)%7!=s.weekday:raise HTTPException(409,'Horário fixo não corresponde a esta equipe e data.')
    return s
def cancel_slot(db,body):
    if not db.scalar(select(TrainingChange).where(TrainingChange.slot_id==body.slotId,TrainingChange.date==body.date)):
        db.add(TrainingChange(id=uuid4().hex,team_id=body.teamId,slot_id=body.slotId,date=body.date,kind='cancelado'))
@app.post('/api/training/cancel')
def cancel(body:p.Cancel,user:User=Depends(require_user),db:Session=Depends(get_db)):
    validate_slot(db,user,body.teamId,body.slotId,body.date);cancel_slot(db,body);db.commit();return {'ok':True}
@app.post('/api/training/restore')
def restore(body:p.Cancel,user:User=Depends(require_user),db:Session=Depends(get_db)):
    validate_slot(db,user,body.teamId,body.slotId,body.date)
    db.execute(delete(TrainingChange).where(TrainingChange.team_id==body.teamId,TrainingChange.slot_id==body.slotId,TrainingChange.date==body.date,TrainingChange.kind=='cancelado'));db.commit();return {'ok':True}
def extra(db,body):
    no_game(db,body.teamId,body.date)
    db.add(TrainingChange(id=uuid4().hex,team_id=body.teamId,kind='avulso',date=body.date,time=body.time,venue=body.venue,note=body.note))
@app.post('/api/training/extra')
def add_extra(body:p.Extra,user:User=Depends(require_user),db:Session=Depends(get_db)):
    require_team(user,body.teamId,db);extra(db,body);db.commit();return {'ok':True}
@app.delete('/api/training/extra/{id}')
def remove_extra(id:str,user:User=Depends(require_user),db:Session=Depends(get_db)):
    c=get(db,TrainingChange,id);require_team(user,c.team_id,db)
    if c.kind!='avulso':raise HTTPException(409,'Use a ação restaurar para este treino.')
    db.delete(c);db.commit();return {'ok':True}
@app.post('/api/training/reschedule')
def reschedule(body:p.Reschedule,user:User=Depends(require_user),db:Session=Depends(get_db)):
    validate_slot(db,user,body.teamId,body.slotId,body.fromDate)
    extra(db,body)
    cancel_slot(db,p.Cancel(teamId=body.teamId,slotId=body.slotId,date=body.fromDate))
    db.commit();return {'ok':True}

def play_json(play):return {'id':play.id,'teamId':play.team_id,'name':play.name,'kind':play.kind,'notes':play.notes,'board':play.board,'revision':play.revision,'updatedAt':play.updated_at.isoformat()}
def validate_draft(db,team_id,draft,season=None):
    query=select(Athlete.id).where(Athlete.team_id==team_id)
    if season:query=query.where(Athlete.season==season)
    own=set(db.scalars(query))
    if any(p.athleteId not in own for p in draft.board.players):raise HTTPException(422,'Escolha atletas da própria equipe.')
    if draft.playId:
        play=get(db,TacticalPlay,draft.playId)
        if play.team_id!=team_id or play.season!=(season or 'local'):raise HTTPException(403,'Jogada de outra equipe ou temporada.')
def initial_draft(s,team_id):
    positions=[(50,77),(9,18),(91,18),(34,43),(66,43)]
    roster=sorted((a for a in s.athletes.values() if a.team_id==team_id and a.status in ('ativo','historico','registrado')),key=lambda a:(a.number is None,a.number or 0,a.name))[:5]
    return {'playId':None,'baseRevision':None,'name':'Nova jogada','kind':'ataque','notes':'','board':{'court':'half','players':[{'id':f'slot-{i+1}','athleteId':a.id,'x':positions[i][0],'y':positions[i][1]} for i,a in enumerate(roster)],'defenders':[{'id':f'defender-{i+1}','x':x,'y':y} for i,(x,y) in enumerate([(48,64),(15,28),(85,28),(39,34),(61,34)])],'showDefenders':False,'ball':{'x':56,'y':78},'drawings':[]}}
@app.get('/api/tactics/{team_id}')
def workspace(team_id:str,season:str|None=None,user:User=Depends(require_user),db:Session=Depends(get_db)):
    require_team(user,team_id,db);s=Snapshot(db,season);key=s.season or 'local'
    if team_id not in s.teams:raise HTTPException(404,'Equipe sem dados nesta temporada.')
    initial=initial_draft(s,team_id);draft=db.get(TacticsDraft,{'season':key,'user_id':user.id,'team_id':team_id})
    return {'team':s.team(team_id),'season':s.season,'roster':[s.athlete(a.id) for a in s.roster[team_id]],'initial':initial,'draft':draft.content if draft else initial,'plays':[play_json(p) for p in db.scalars(select(TacticalPlay).where(TacticalPlay.team_id==team_id,TacticalPlay.season==key).order_by(TacticalPlay.updated_at.desc()))]}
@app.put('/api/tactics/{team_id}/draft')
def save_draft(team_id:str,body:p.Draft,season:str|None=None,user:User=Depends(require_user),db:Session=Depends(get_db)):
    require_team(user,team_id,db);db.scalar(select(Team).where(Team.id==team_id).with_for_update());selected=resolve_season(db,season);validate_draft(db,team_id,body,selected)
    db.merge(TacticsDraft(season=selected or 'local',user_id=user.id,team_id=team_id,content=body.model_dump()));db.commit();return {'ok':True}
@app.post('/api/tactics/{team_id}/plays')
def save_play(team_id:str,body:p.Draft,season:str|None=None,user:User=Depends(require_user),db:Session=Depends(get_db)):
    require_team(user,team_id,db);db.scalar(select(Team).where(Team.id==team_id).with_for_update());selected=resolve_season(db,season);validate_draft(db,team_id,body,selected)
    name=' '.join(body.name.split())
    if len(name)<3:raise HTTPException(422,'Use um nome de 3 a 80 caracteres.')
    play=db.scalar(select(TacticalPlay).where(TacticalPlay.id==body.playId).with_for_update()) if body.playId else None
    if play and play.revision!=body.baseRevision:raise HTTPException(409,'A jogada foi atualizada em outra tela. Reabra a versão do caderno.')
    if not play:
        play=TacticalPlay(id=uuid4().hex,season=selected or 'local',team_id=team_id,revision=0)
        db.add(play)
    play.name,play.normalized_name,play.kind,play.notes,play.board=name,name.casefold(),body.kind,body.notes.strip(),body.board.model_dump()
    play.revision+=1;play.updated_at=datetime.now(timezone.utc)
    db.merge(TacticsDraft(season=selected or 'local',user_id=user.id,team_id=team_id,content={**body.model_dump(),'playId':play.id,'baseRevision':play.revision,'name':name,'notes':play.notes}));db.commit()
    return play_json(play)
@app.delete('/api/tactics/{team_id}/plays/{id}')
def delete_play(team_id:str,id:str,revision:int=Query(ge=1),season:str|None=None,user:User=Depends(require_user),db:Session=Depends(get_db)):
    require_team(user,team_id,db)
    play=db.scalar(select(TacticalPlay).where(TacticalPlay.id==id).with_for_update())
    if not play or play.team_id!=team_id or play.season!=(resolve_season(db,season) or 'local'):raise HTTPException(404,'Jogada não encontrada nesta temporada.')
    if play.revision!=revision:raise HTTPException(409,'A jogada foi atualizada em outra tela.')
    for draft in db.scalars(select(TacticsDraft).where(TacticsDraft.team_id==team_id)):
        if draft.content.get('playId')==id:draft.content={**draft.content,'playId':None,'baseRevision':None}
    db.delete(play);db.commit();return {'ok':True}

@app.get('/api/matches/{id}')
def match(id:str,db:Session=Depends(get_db)):
    g=db.get(Game,id)
    return live.json_match(db,g) if g else None
@app.post('/api/matches/{id}/start')
async def start(id:str,body:p.Revision,user:User=Depends(require_user),db:Session=Depends(get_db)):
    require_role(user,'estatistico');db.scalar(select(User).where(User.id==user.id).with_for_update(key_share=True));g=live.locked(db,id,body.revision);require_match_operator(db,user,g);live.start(db,g);live.update_score(db,g);await hub.publish(g);return {'ok':True}
@app.post('/api/matches/{id}/control')
async def control(id:str,body:p.Control,user:User=Depends(require_user),db:Session=Depends(get_db)):
    require_role(user,'estatistico');db.scalar(select(User).where(User.id==user.id).with_for_update(key_share=True));g=live.locked(db,id,body.revision);require_match_operator(db,user,g);live.control(db,g,body.command);live.update_score(db,g);await hub.publish(g);return {'ok':True}
@app.post('/api/matches/{id}/actions')
async def record(id:str,body:p.Record,user:User=Depends(require_user),db:Session=Depends(get_db)):
    require_role(user,'estatistico');db.scalar(select(User).where(User.id==user.id).with_for_update(key_share=True));g=live.locked(db,id,body.revision);require_match_operator(db,user,g);live.record(db,g,body.input);live.update_score(db,g);await hub.publish(g);return {'ok':True}
@app.post('/api/matches/{id}/undo')
async def undo(id:str,body:p.Revision,user:User=Depends(require_user),db:Session=Depends(get_db)):
    require_role(user,'estatistico');db.scalar(select(User).where(User.id==user.id).with_for_update(key_share=True));g=live.locked(db,id,body.revision);require_match_operator(db,user,g);live.undo(db,g);live.update_score(db,g);await hub.publish(g);return {'ok':True}
