from datetime import datetime
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy import select, delete
from .models import Athlete, Game, MatchEvent, PlayerStat, Team
from .read import Snapshot, seconds_left

FIELDS = ['points','offensiveRebounds','defensiveRebounds','assists','steals','blocks','turnovers','fouls','fieldMade','fieldAttempts','freeMade','freeAttempts']
DB_FIELDS = ['points','offensive_rebounds','defensive_rebounds','assists','steals','blocks','turnovers','fouls','field_made','field_attempts','free_made','free_attempts']
def fail(message):
    raise HTTPException(409, message)
def events(db, game):
    return list(db.scalars(select(MatchEvent).where(MatchEvent.game_id == game.id).order_by(MatchEvent.sequence)))
def event_json(e):
    return {'id':e.id,'action':e.action,'teamId':e.team_id,'athleteId':e.athlete_id,'outAthleteId':e.out_athlete_id,'period':e.period,'seconds':e.seconds}
def projection(db, g, s=None):
    s = s or Snapshot(db, g.season, game=g)
    roster = sorted((a for a in s.athletes.values() if a.team_id in (g.home_id,g.away_id)), key=lambda a:(a.number is None,a.number or 0,a.name))
    initial = {tid:[a.id for a in sorted(roster, key=lambda a: not a.is_starter) if a.team_id == tid and a.status in ('ativo','historico','registrado')][:5] for tid in (g.home_id,g.away_id)}
    lineups = g.lineups or initial
    box = {a.id:{'athleteId':a.id,'teamId':a.team_id,'name':a.name,'number':a.number,'position':a.position,'eligible':a.status in ('ativo','historico','registrado'),'played':a.id in lineups.get(a.team_id,[]),'onCourt':a.id in lineups.get(a.team_id,[]),**dict.fromkeys(FIELDS,0)} for a in roster}
    evs = events(db,g)
    quarters = [{'home':0,'away':0} for _ in range(max(g.regulation_periods,g.period))]
    if g.imported:
        for line in box.values():line.update(played=False,onCourt=False)
        for stat in s.lines:
            if stat.game_id == g.id and stat.athlete_id in box:
                line = box[stat.athlete_id]
                line.update({key:getattr(stat,field) for key,field in zip(FIELDS,DB_FIELDS)})
                line.update(played=stat.played,onCourt=False)
        return box, g.quarters, evs
    for e in evs:
        line = box[e.athlete_id]
        line['played'] = True
        action = e.action
        if action == 'substitution':
            if e.out_athlete_id in box:
                box[e.out_athlete_id]['onCourt'] = False
            line['onCourt'] = True
        elif action in ('two','three','miss-two','miss-three'):
            line['fieldAttempts'] += 1
            if action in ('two','three'):
                points = 2 if action == 'two' else 3
                line['fieldMade'] += 1
                line['points'] += points
                quarters[e.period-1]['home' if e.team_id == g.home_id else 'away'] += points
        elif action in ('free','miss-free'):
            line['freeAttempts'] += 1
            if action == 'free':
                line['freeMade'] += 1
                line['points'] += 1
                quarters[e.period-1]['home' if e.team_id == g.home_id else 'away'] += 1
        else:
            key = {'off-rebound':'offensiveRebounds','def-rebound':'defensiveRebounds','assist':'assists','steal':'steals','block':'blocks','turnover':'turnovers','foul':'fouls'}[action]
            line[key] += 1
            if key == 'fouls' and line[key] >= 5:
                line['onCourt'] = False
    if g.status == 'encerrado':
        for line in box.values():
            line['onCourt'] = False
    return box,quarters,evs
def json_match(db,g):
    s = Snapshot(db, g.season, game=g)
    box,quarters,evs = projection(db,g,s)
    score = {tid:sum(line['points'] for line in box.values() if line['teamId']==tid) for tid in (g.home_id,g.away_id)}
    return {'game':s.game(g.id),'state':{'matchId':g.id,'revision':g.revision,'status':g.status,'period':g.period,'remainingSeconds':g.remaining_seconds,'runningSince':g.running_since,'events':[event_json(e) for e in evs],'regulationPeriods':g.regulation_periods,'periodSeconds':g.period_seconds},'historical':g.imported,'statsComplete':g.stats_complete,'sourceUrl':g.source_url,'homeScore':(g.home_score or 0) if g.imported else score[g.home_id],'awayScore':(g.away_score or 0) if g.imported else score[g.away_id],'box':list(box.values()),'quarters':quarters}
def locked(db,id,revision):
    existing=db.get(Game,id)
    if existing:
        list(db.scalars(select(Team.id).where(Team.id.in_([existing.home_id,existing.away_id])).order_by(Team.id).with_for_update()))
    g = db.scalar(select(Game).where(Game.id==id).with_for_update().execution_options(populate_existing=True))
    if not g:
        raise HTTPException(404,'Partida não encontrada.')
    if g.imported or g.status=='encerrado':
        fail('Esta partida encerrada não pode ser alterada.')
    if g.revision != revision:
        fail('A partida foi atualizada em outra tela. Atualize e tente novamente.')
    return g
def update_score(db,g):
    box,quarters,_ = projection(db,g)
    g.home_score = sum(a['points'] for a in box.values() if a['teamId']==g.home_id)
    g.away_score = sum(a['points'] for a in box.values() if a['teamId']==g.away_id)
    g.quarters = quarters
    g.revision += 1
    if g.status == 'encerrado':
        db.execute(delete(PlayerStat).where(PlayerStat.game_id==g.id))
        for a in box.values():
            db.add(PlayerStat(game_id=g.id,athlete_id=a['athleteId'],team_id=a['teamId'],played=a['played'],minutes=None,**{field:a[key] for key,field in zip(FIELDS,DB_FIELDS)}))
    db.commit()
def start(db,g):
    if g.status != 'agendado':
        fail('Esta partida já foi iniciada.')
    box,_,_ = projection(db,g)
    if not all(any(a['teamId']==tid and a['onCourt'] for a in box.values()) for tid in (g.home_id,g.away_id)):
        fail('As duas equipes precisam de atletas disponíveis.')
    g.lineups = {tid:[a['athleteId'] for a in box.values() if a['teamId']==tid and a['onCourt']] for tid in (g.home_id,g.away_id)}
    g.status = 'ao-vivo'
def control(db,g,command):
    if g.status != 'ao-vivo':
        fail('Inicie a partida antes de operar o relógio.')
    remaining = seconds_left(g)
    box,_,_ = projection(db,g)
    scores = [sum(a['points'] for a in box.values() if a['teamId']==tid) for tid in (g.home_id,g.away_id)]
    length = g.period_seconds if g.period <= g.regulation_periods else 300
    if command.type == 'play':
        if remaining==0 or (g.running_since is not None and remaining>0):
            fail('O relógio já está correndo ou precisa ser ajustado.')
        g.remaining_seconds,g.running_since = remaining,datetime.now().timestamp()*1000
    elif command.type == 'pause':
        g.remaining_seconds,g.running_since = remaining,None
    elif command.type == 'set':
        if g.running_since is not None and remaining>0:
            fail('Pause o relógio antes de ajustar.')
        if command.seconds is None or command.seconds>length:
            fail('Tempo inválido para este período.')
        g.remaining_seconds,g.running_since = command.seconds,None
    elif command.type == 'next-period':
        if remaining != 0 or (g.period>=g.regulation_periods and scores[0]!=scores[1]):
            fail('Zere o relógio. Se já houver vencedor, encerre o jogo.')
        g.period += 1
        g.remaining_seconds = g.period_seconds if g.period<=g.regulation_periods else 300
        g.running_since = None
    elif command.type == 'finish':
        if remaining!=0 or g.period<g.regulation_periods or scores[0]==scores[1]:
            fail('Encerre após o último período, com relógio zerado e um vencedor.')
        g.status,g.running_since,g.remaining_seconds = 'encerrado',None,0
def record(db,g,input):
    if g.status != 'ao-vivo':
        fail('Inicie a partida para registrar ações.')
    box,_,evs = projection(db,g)
    a = box.get(input.athleteId)
    if not a or a['teamId']!=input.teamId or not a['eligible'] or a['fouls']>=5:
        fail('Escolha um atleta disponível desta equipe.')
    if input.action=='substitution':
        out = box.get(input.outAthleteId)
        if a['onCourt'] or (input.outAthleteId and (not out or not out['onCourt'] or out['teamId']!=input.teamId)) or (not out and sum(x['onCourt'] and x['teamId']==input.teamId for x in box.values())>=5):
            fail('Substituição inválida: escolha quem entra e quem sai.')
    elif not a['onCourt']:
        fail('O atleta precisa estar em quadra.')
    db.add(MatchEvent(id=uuid4().hex,game_id=g.id,sequence=(evs[-1].sequence+1 if evs else 1),action=input.action,team_id=input.teamId,athlete_id=input.athleteId,out_athlete_id=input.outAthleteId if input.action=='substitution' else None,period=g.period,seconds=seconds_left(g)))
    db.flush()
def undo(db,g):
    evs = events(db,g)
    if g.status!='ao-vivo' or not evs:
        fail('Não há ação para desfazer.')
    db.delete(evs[-1])
    db.flush()
