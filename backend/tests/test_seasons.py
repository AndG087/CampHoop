from datetime import date, datetime, timezone
from sqlalchemy import select
from app.models import Athlete, Competition, Enrollment, Game, PlayerStat, SourceImport
from app.read import Snapshot
from conftest import login

def add_history(factory):
    with factory() as s:
        for year,label in [(2025,'2024/25'),(2027,'2026/27')]:
            s.add(SourceImport(id=f'ncaa-{year}',provider='Test provider',season=year,imported_at=datetime.now(timezone.utc),manifest={'season':label,'scope':'Test snapshot','counts':{'teams':2,'games':1,'athletes':1}}))
        s.add(Athlete(id='old-athlete',season='2024/25',team_id='t1',name='Historical roster',number=99,position='Guard',status='historico'));s.flush()
        s.add(Competition(id='old-comp',season='2024/25',name='Historical cup',status='finalizado',phase='Final',divisions=[{'category':'Universitário','gender':'Masculino'}],standings_mode='win-rate'));s.flush()
        s.add_all([Enrollment(competition_id='old-comp',team_id=t) for t in ['t1','t2']])
        s.add(Game(id='old-game',season='2024/25',competition_id='old-comp',home_id='t1',away_id='t2',date=date(2025,4,1),status='encerrado',home_score=12,away_score=3,imported=True,stats_complete=False));s.flush()
        s.add(PlayerStat(game_id='old-game',athlete_id='old-athlete',team_id='t1',points=12,played=True));s.commit()

def test_season_queries_and_direct_links_never_mix_rosters_or_statistics(client,db):
    add_history(db)
    assert client.get('/api/meta').json()['season']=='2026/27'
    assert [s['season'] for s in client.get('/api/meta').json()['availableSeasons']]==['2026/27','2024/25']
    assert len(client.get('/api/athletes').json())==18
    old=client.get('/api/athletes?season=2024/25').json()
    assert len(old)==1 and old[0]['pointsPerGame']==12
    assert all(a['games']==0 for a in client.get('/api/athletes?season=2026/27').json())
    assert client.get('/api/teams/t1?season=2024/25').json()['wins']==1
    assert client.get('/api/teams/t1?season=2026/27').json()['wins']==0
    assert client.get('/api/athletes/old-athlete').json()['season']=='2024/25'
    assert client.get('/api/matches/old-game').json()['homeScore']==12
    assert client.get('/api/competitions/old-comp').json()['games'][0]['id']=='old-game'
    assert client.get('/api/athletes?season=2025/26').status_code==422
    assert client.get('/api/games?limit=501').status_code==422
    assert [g['id'] for g in client.get('/api/games?season=2024/25').json()]==['old-game']

def test_private_tactics_and_roster_validation_are_separate_by_season(client,db):
    add_history(db);login(client,'tecnico')
    old=client.get('/api/tactics/t1?season=2024/25').json()['draft']
    assert old['board']['players'][0]['athleteId']=='old-athlete'
    old['name']='Same play name'
    assert client.post('/api/tactics/t1/plays?season=2024/25',json=old).status_code==200
    current=client.get('/api/tactics/t1?season=2026/27').json()
    assert current['plays']==[] and current['draft']['name']=='Nova jogada'
    current['draft']['name']='Same play name'
    assert client.post('/api/tactics/t1/plays?season=2026/27',json=current['draft']).status_code==200
    assert len(client.get('/api/tactics/t1?season=2024/25').json()['plays'])==1
    assert len(client.get('/api/tactics/t1?season=2026/27').json()['plays'])==1
    assert client.put('/api/tactics/t1/draft?season=2026/27',json=old).status_code==422
    login(client,'estatistico')
    assert client.post('/api/matches/g/start',json={'revision':0}).status_code==200
    assert all(a['athleteId']!='old-athlete' for a in client.get('/api/matches/g').json()['box'])

def test_scheduling_rejects_a_date_outside_the_chosen_season(client,db):
    add_history(db);login(client,'tecnico')
    body={'competitionId':None,'homeTeamId':'t1','awayTeamId':'t2','date':'2030-01-15','time':'18:00','venue':'Test'}
    assert client.post('/api/games?season=2026/27',json=body).status_code==422
