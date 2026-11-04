"""Owned roster management. Provider records are never writable through this API."""
from uuid import uuid4
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session
from .auth import coached_team_ids, manages_team, require_role, require_user
from .db import get_db
from . import management_schemas as p
from .models import Athlete, Club, ClubMember, CoachTeam, Competition, Enrollment, Game, MatchEvent, PlayerStat, TacticalPlay, TacticsDraft, Team, TeamSeason, User
from .read import today
from .seasons import resolve_season, validate_season, validate_new_season

router=APIRouter(prefix='/api/management',tags=['Gestão do elenco'])

def clean(value,minimum=2):
    text=' '.join(value.split())
    if len(text)<minimum:raise HTTPException(422,'Preencha nomes e campos de texto válidos.')
    return text

def get(db,model,id):
    row=db.get(model,id)
    if not row:raise HTTPException(404,'Registro não encontrado.')
    return row

def lock_coach(db,user):
    require_role(user,'tecnico')
    # Serialize edits by one owner without blocking foreign-key references to the user.
    db.scalar(select(User).where(User.id==user.id).with_for_update(key_share=True))

def team_period(db,team,season):
    return db.get(TeamSeason,(team.id,season)) or team

def locked_teams(db,user,ids):
    lock_coach(db,user)
    rows=list(db.scalars(select(Team).where(Team.id.in_(set(ids))).order_by(Team.id).with_for_update()))
    if len(rows)!=len(set(ids)):raise HTTPException(404,'Equipe não encontrada.')
    for team in rows:require_owned(user,team,db)
    return {team.id:team for team in rows}

def require_owned(user,team,db):
    require_role(user,'tecnico')
    if team.source_id:raise HTTPException(403,'A equipe importada da NCAA é somente leitura. Crie uma equipe própria.')
    if not manages_team(db,user,team):raise HTTPException(403,'Só o responsável por esta equipe ou pelo clube pode editar seu elenco.')

def athlete_has_records(db,id):
    return bool(db.scalar(select(PlayerStat.game_id).where(PlayerStat.athlete_id==id).limit(1)) or db.scalar(select(MatchEvent.id).where(or_(MatchEvent.athlete_id==id,MatchEvent.out_athlete_id==id)).limit(1)))

def athlete_in_boards(db,id,team_id,season):
    boards=[p.board for p in db.scalars(select(TacticalPlay).where(TacticalPlay.team_id==team_id,TacticalPlay.season==season))]+[d.content.get('board',{}) for d in db.scalars(select(TacticsDraft).where(TacticsDraft.team_id==team_id,TacticsDraft.season==season))]
    return any(any(p.get('athleteId')==id for p in b.get('players',[])) for b in boards)

def require_period(db,team_id,season):
    validate_season(season)
    row=db.get(TeamSeason,(team_id,season))
    if not row:raise HTTPException(409,'Vincule a equipe a esta temporada antes de cadastrar seu elenco.')
    return row

def ensure_idle(db,team_ids,season):
    game=db.scalar(select(Game.id).where(Game.season==season,Game.status=='ao-vivo',or_(Game.home_id.in_(team_ids),Game.away_id.in_(team_ids))).limit(1))
    if game:raise HTTPException(409,'O elenco não pode ser alterado durante uma partida em andamento.')

def check_name(db,club_id,season,name,exclude=None):
    query=select(TeamSeason.team_id).join(Team).where(Team.club_id==club_id,TeamSeason.season==season,func.lower(TeamSeason.name)==name.lower())
    if exclude:query=query.where(Team.id!=exclude)
    if db.scalar(query.limit(1)):raise HTTPException(409,'Já existe uma equipe com esse nome neste clube e temporada.')

def check_jersey(db,team_id,season,number,exclude=None):
    if number is None:return
    query=select(Athlete.id).where(Athlete.team_id==team_id,Athlete.season==season,Athlete.number==number)
    if exclude:query=query.where(Athlete.id!=exclude)
    if db.scalar(query.limit(1)):raise HTTPException(409,'Este número já está em uso no elenco desta temporada.')

def details(body):
    return {'name':clean(body.name),'category':body.category,'gender':body.gender,'coach':clean(body.coach)}

def clone_athlete(origin,team_id,season,number,position):
    if not origin.person_id:origin.person_id=uuid4().hex
    return Athlete(id='athlete-'+uuid4().hex,person_id=origin.person_id,team_id=team_id,season=season,name=origin.name,number=number,position=position,birth_date=origin.birth_date,height_cm=origin.height_cm,photo_url=origin.photo_url,member_since=origin.member_since,status=origin.status,revision=1)

def ensure_person_free(db,person_id,season):
    if person_id and db.scalar(select(Athlete.id).where(Athlete.person_id==person_id,Athlete.season==season).limit(1)):
        raise HTTPException(409,'Este atleta já tem um vínculo nesta temporada. Edite o vínculo existente.')

@router.get('/options')
def options(season:str|None=None,user:User=Depends(require_user),db:Session=Depends(get_db)):
    require_role(user,'tecnico');selected=resolve_season(db,season)
    ids=coached_team_ids(db,user)
    rows=list(db.scalars(select(Team).where(Team.id.in_(ids)).order_by(Team.id)))
    clubs={c.id:c for c in db.scalars(select(Club).where(Club.id.in_({t.club_id for t in rows}))) }
    periods=list(db.scalars(select(TeamSeason).where(TeamSeason.team_id.in_(ids))))
    source_teams=set(db.scalars(select(Enrollment.team_id).join(Competition).where(Competition.season==selected))) if selected else set()
    teams=[]
    for t in rows:
        current=next((s for s in periods if s.team_id==t.id and s.season==selected),None)
        view=current or t;c=clubs[t.club_id]
        teams.append({'id':t.id,'name':getattr(view,'name',None) or f'{view.category} {view.gender}','clubName':c.name,'category':view.category,'gender':view.gender,'imported':bool(t.source_id),'editable':manages_team(db,user,t) and not t.source_id,'available':bool(current) or t.id in source_teams,'seasons':[s.season for s in periods if s.team_id==t.id]})
    own={t.id for t in rows if not t.source_id and manages_team(db,user,t)}
    current_people=set(db.scalars(select(Athlete.person_id).where(Athlete.season==selected,Athlete.person_id.is_not(None))))
    seen=set();athletes=[]
    for a in db.scalars(select(Athlete).where(Athlete.team_id.in_(own),Athlete.source_id.is_(None),Athlete.season!=selected).order_by(Athlete.season.desc(),Athlete.name,Athlete.id)):
        identity=a.person_id or a.id
        if identity in seen or a.person_id in current_people:continue
        seen.add(identity)
        athletes.append({'id':a.id,'name':a.name,'season':a.season,'teamId':a.team_id,'number':a.number,'position':a.position})
    allowed_clubs=select(ClubMember.club_id).where(ClubMember.user_id==user.id,ClubMember.role.in_(['owner','tecnico']))
    return {'season':selected,'teams':teams,'athletes':athletes,'clubs':[{'id':c.id,'name':c.name,'shortName':c.short_name,'city':c.city} for c in db.scalars(select(Club).where((Club.owner_id==user.id)|(Club.id.in_(allowed_clubs))).order_by(Club.name))]}

@router.post('/active-team')
def active(body:p.ActiveTeam,season:str|None=None,user:User=Depends(require_user),db:Session=Depends(get_db)):
    lock_coach(db,user)
    if body.teamId not in coached_team_ids(db,user):raise HTTPException(403,'Equipe não autorizada para esta conta.')
    user.team_id=body.teamId
    club_id=get(db,Team,body.teamId).club_id
    user.active_club_id=club_id if db.get(ClubMember,(club_id,user.id)) else None
    db.commit()
    return {'ok':True}

@router.post('/teams')
def create_team(body:p.NewTeam,user:User=Depends(require_user),db:Session=Depends(get_db)):
    lock_coach(db,user);validate_new_season(body.season)
    values=details(body)
    if body.clubId:
        club=db.scalar(select(Club).where(Club.id==body.clubId).with_for_update())
        if not club:raise HTTPException(404,'Clube não encontrado.')
        membership=db.get(ClubMember,(club.id,user.id))
        if club.owner_id!=user.id and not (membership and membership.role=='tecnico'):raise HTTPException(403,'Escolha um clube no qual você seja técnico ou responsável.')
    else:
        name=clean(body.club.name)
        if db.scalar(select(Club.id).where(Club.owner_id==user.id,func.lower(Club.name)==name.lower())):raise HTTPException(409,'Este clube já existe. Selecione-o na lista de clubes próprios.')
        club=Club(id='club-'+uuid4().hex,name=name,short_name=clean(body.club.shortName,1).upper(),city=clean(body.club.city),owner_id=user.id)
        db.add(club);db.flush()
        from .account_utils import now
        db.add(ClubMember(club_id=club.id,user_id=user.id,role='owner',joined_at=now()))
    check_name(db,club.id,body.season,values['name'])
    team=Team(id='team-'+uuid4().hex,club_id=club.id,owner_id=user.id,**values)
    db.add(team);db.flush()
    db.add(TeamSeason(team_id=team.id,season=body.season,revision=1,**values))
    db.add(CoachTeam(user_id=user.id,team_id=team.id))
    if body.makeActive:user.team_id=team.id;user.active_club_id=club.id
    db.commit();return {'id':team.id,'season':body.season}

@router.put('/teams/{id}')
def edit_team(id:str,body:p.EditTeam,season:str,user:User=Depends(require_user),db:Session=Depends(get_db)):
    team=locked_teams(db,user,[id])[id];row=require_period(db,id,season)
    if row.revision!=body.revision:raise HTTPException(409,'A equipe foi atualizada em outra tela. Reabra a edição.')
    ensure_idle(db,[id],season);values=details(body)
    if (row.category,row.gender)!=(values['category'],values['gender']):
        games=db.scalar(select(Game.id).where(Game.season==season,or_(Game.home_id==id,Game.away_id==id)).limit(1))
        enrolled=db.scalar(select(Enrollment.team_id).join(Competition).where(Competition.season==season,Enrollment.team_id==id).limit(1))
        if games or enrolled:raise HTTPException(409,'Categoria e gênero não podem mudar após inscrição ou agendamento. Use uma nova temporada.')
    check_name(db,team.club_id,season,values['name'],id)
    for key,value in values.items():setattr(row,key,value)
    row.revision+=1;db.commit();return {'id':id,'season':season}

@router.post('/teams/{id}/seasons')
def create_period(id:str,body:p.NewTeamSeason,user:User=Depends(require_user),db:Session=Depends(get_db)):
    team=locked_teams(db,user,[id])[id];require_period(db,id,body.sourceSeason);validate_new_season(body.targetSeason)
    if db.get(TeamSeason,(id,body.targetSeason)):raise HTTPException(409,'A equipe já está vinculada a essa temporada.')
    ensure_idle(db,[id],body.sourceSeason);values=details(body)
    check_name(db,team.club_id,body.targetSeason,values['name'])
    origins=list(db.scalars(select(Athlete).where(Athlete.team_id==id,Athlete.season==body.sourceSeason,Athlete.source_id.is_(None)))) if body.copyRoster else []
    used=set(db.scalars(select(Athlete.person_id).where(Athlete.season==body.targetSeason,Athlete.person_id.is_not(None))))
    skipped=[a for a in origins if a.person_id in used]
    origins=[a for a in origins if a.person_id not in used]
    db.add(TeamSeason(team_id=id,season=body.targetSeason,revision=1,**values));db.flush()
    for a in origins:db.add(clone_athlete(a,id,body.targetSeason,a.number,a.position))
    db.commit();return {'id':id,'season':body.targetSeason,'copiedAthletes':len(origins),'skippedAthletes':[{'id':a.id,'name':a.name} for a in skipped]}

def validate_athlete(body):
    if body.birthDate and not date(1900,1,1)<=body.birthDate<=today():raise HTTPException(422,'Informe uma data de nascimento válida, até hoje.')
    if body.memberSince and not '1900-01'<=body.memberSince<=today().isoformat()[:7]:raise HTTPException(422,'No clube desde: informe um mês entre janeiro de 1900 e o mês atual.')
    return {'name':clean(body.name),'number':body.number,'position':clean(body.position),'birth_date':body.birthDate,'height_cm':body.heightCm,'member_since':body.memberSince,'photo_url':str(body.photoUrl) if body.photoUrl else None,'status':body.status}

@router.post('/athletes')
def create_athlete(body:p.NewAthlete,user:User=Depends(require_user),db:Session=Depends(get_db)):
    locked_teams(db,user,[body.teamId]);require_period(db,body.teamId,body.season);ensure_idle(db,[body.teamId],body.season)
    values=validate_athlete(body);check_jersey(db,body.teamId,body.season,body.number)
    athlete=Athlete(id='athlete-'+uuid4().hex,person_id=uuid4().hex,team_id=body.teamId,season=body.season,revision=1,**values)
    db.add(athlete);db.commit();return {'id':athlete.id,'season':body.season}

@router.get('/athletes/{id}')
def athlete_details(id:str,user:User=Depends(require_user),db:Session=Depends(get_db)):
    a=get(db,Athlete,id);require_owned(user,get(db,Team,a.team_id),db)
    if a.source_id:raise HTTPException(403,'Cadastro importado da NCAA é somente leitura.')
    return {'id':a.id,'season':a.season,'revision':a.revision,'identityLocked':athlete_has_records(db,id),'teamId':a.team_id,'name':a.name,'number':a.number,'position':a.position,'birthDate':a.birth_date.isoformat() if a.birth_date else None,'heightCm':a.height_cm,'memberSince':a.member_since,'photoUrl':a.photo_url,'status':a.status}

@router.put('/athletes/{id}')
def edit_athlete(id:str,body:p.EditAthlete,user:User=Depends(require_user),db:Session=Depends(get_db)):
    a=get(db,Athlete,id);old_team=a.team_id
    # Accounts are locked before teams, matching invitation/member changes.
    person_ids=select(Athlete.id).where(Athlete.person_id==a.person_id) if a.person_id else select(Athlete.id).where(Athlete.id==id)
    account_ids=set(db.scalars(select(User.id).where(User.athlete_id.in_(person_ids))))|{user.id}
    list(db.scalars(select(User).where(User.id.in_(account_ids)).order_by(User.id).with_for_update(key_share=True)))
    locked_teams(db,user,[old_team,body.teamId])
    a=db.scalar(select(Athlete).where(Athlete.id==id).with_for_update().execution_options(populate_existing=True))
    if a.source_id:raise HTTPException(403,'Cadastro importado da NCAA é somente leitura.')
    if a.revision!=body.revision or a.team_id!=old_team:raise HTTPException(409,'O atleta foi atualizado em outra tela. Reabra a edição.')
    require_period(db,body.teamId,a.season);ensure_idle(db,[old_team,body.teamId],a.season)
    used=athlete_has_records(db,id)
    values=validate_athlete(body)
    if used and (a.name,a.number,a.position)!=(values['name'],values['number'],values['position']):
        raise HTTPException(409,'Nome, número e posição estão preservados pelos registros de jogo. Use um novo vínculo em outra temporada.')
    if old_team!=body.teamId:
        if used:raise HTTPException(409,'O vínculo tem registros de jogo e não pode ser movido. Preserve-o e crie um vínculo em outra temporada.')
        if athlete_in_boards(db,id,old_team,a.season):raise HTTPException(409,'Remova o atleta das jogadas e rascunhos da equipe antes de mudar seu vínculo.')
        old_club=db.get(Team,old_team).club_id;new_club=db.get(Team,body.teamId).club_id
        real_accounts=list(db.scalars(select(User).where(User.id.in_(account_ids-{user.id}),User.is_demo.is_(False))))
        if old_club!=new_club and real_accounts:raise HTTPException(409,'Para transferir a conta de um atleta entre clubes, crie um novo vínculo e envie um convite no clube de destino.')
        for member in db.scalars(select(ClubMember).where(ClubMember.user_id.in_(account_ids-{user.id}),ClubMember.role=='atleta',ClubMember.club_id==old_club)):
            if member.athlete_id==id:member.team_id=body.teamId
        db.execute(update(User).where(User.role=='atleta',User.athlete_id==id).values(team_id=body.teamId))
    check_jersey(db,body.teamId,a.season,body.number,id)
    a.team_id=body.teamId
    for key,value in values.items():setattr(a,key,value)
    a.revision+=1;db.commit();return {'id':id,'season':a.season}

@router.post('/roster-links')
def link_athlete(body:p.LinkAthlete,user:User=Depends(require_user),db:Session=Depends(get_db)):
    origin=get(db,Athlete,body.athleteId);old_team=origin.team_id;locked_teams(db,user,[old_team,body.teamId])
    origin=db.scalar(select(Athlete).where(Athlete.id==body.athleteId).with_for_update().execution_options(populate_existing=True))
    if origin.team_id!=old_team:raise HTTPException(409,'O vínculo foi alterado em outra tela. Reabra o cadastro.')
    if origin.source_id:raise HTTPException(403,'Use apenas cadastros próprios para criar novos vínculos.')
    require_period(db,body.teamId,body.season);ensure_idle(db,[body.teamId],body.season)
    if origin.season==body.season:raise HTTPException(409,'O atleta já tem um vínculo nessa temporada. Edite o vínculo existente.')
    ensure_person_free(db,origin.person_id,body.season);check_jersey(db,body.teamId,body.season,body.number)
    athlete=clone_athlete(origin,body.teamId,body.season,body.number,clean(body.position));db.add(athlete)
    db.commit();return {'id':athlete.id,'season':body.season}
