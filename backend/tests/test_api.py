from datetime import datetime, timedelta, timezone
import pytest
from fastapi.websockets import WebSocketDisconnect
from sqlalchemy import select
from app.models import AuthSession, Game, PlayerStat, TrainingChange
from conftest import login

def test_auth_password_cookie_expiry_and_logout(client,db):
    assert client.get('/api/auth/me').json() is None
    assert client.get('/api/home').status_code==401
    bad=client.post('/api/auth/login',json={'email':'tecnico@test.local','password':'wrong'})
    assert bad.status_code==401
    assert 'wrong' not in bad.text
    r=login(client,'tecnico')
    assert 'HttpOnly' in r.headers['set-cookie'] and 'SameSite=lax' in r.headers['set-cookie']
    assert client.get('/api/auth/me').json()['teamId']=='t1'
    with db() as s:
        session=s.scalar(select(AuthSession));session.expires_at=datetime.now(timezone.utc)-timedelta(seconds=1);s.commit()
    assert client.get('/api/auth/me').json() is None
    login(client,'tecnico');client.post('/api/auth/logout')
    assert client.get('/api/auth/me').json() is None

def test_public_reads_do_not_fabricate_demographics(client):
    athletes=client.get('/api/athletes').json()
    assert len(athletes)==18
    assert all(a['age'] is None and a['heightCm'] is None and a['status']=='historico' for a in athletes)
    assert client.get('/api/athletes/t1-a0').json()['private'] is None
    assert client.get('/api/matches/g').json()['state']['periodSeconds']==1200
    assert client.get('/api/schedule?start=2025-01-01&end=2027-01-01').status_code==422

@pytest.mark.parametrize('role',[None,'tecnico','atleta','organizador','basico'])
def test_only_statistician_can_record(client,role):
    if role:login(client,role)
    assert client.post('/api/matches/g/start',json={'revision':0}).status_code==(403 if role else 401)

def test_origin_restrictions(client):
    assert client.post('/api/auth/logout',headers={'origin':'https://attacker.example'}).status_code==403
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect('/api/ws',headers={'origin':'https://attacker.example'}):pass

def test_live_projection_revisions_undo_fouls_and_ws(client):
    login(client,'estatistico')
    with client.websocket_connect('/api/ws',headers={'origin':'http://localhost:5173'}) as ws:
        assert client.post('/api/matches/g/start',json={'revision':0}).status_code==200
        assert ws.receive_json()=={'type':'match.updated','matchId':'g','revision':1}
        assert client.post('/api/matches/g/start',json={'revision':0}).status_code==409
        match=client.get('/api/matches/g').json();a=next(a for a in match['box'] if a['teamId']=='t1' and a['onCourt'])
        payload={'action':'three','teamId':'t1','athleteId':a['athleteId']}
        assert client.post('/api/matches/g/actions',json={'revision':1,'input':payload}).status_code==200
        ws.receive_json()
        assert client.get('/api/matches/g').json()['homeScore']==3
        assert client.post('/api/matches/g/undo',json={'revision':2}).status_code==200;ws.receive_json()
        assert client.get('/api/matches/g').json()['homeScore']==0
        for rev in range(3,8):
            assert client.post('/api/matches/g/actions',json={'revision':rev,'input':{**payload,'action':'foul'}}).status_code==200;ws.receive_json()
        current=client.get('/api/matches/g').json()
        assert not next(x for x in current['box'] if x['athleteId']==a['athleteId'])['onCourt']
        assert client.post('/api/matches/g/actions',json={'revision':8,'input':payload}).status_code==409

def test_finish_ncaa_two_halves_persists_all_read_models(client,db):
    login(client,'estatistico')
    client.post('/api/matches/g/start',json={'revision':0})
    a=next(a for a in client.get('/api/matches/g').json()['box'] if a['teamId']=='t1' and a['onCourt'])
    client.post('/api/matches/g/actions',json={'revision':1,'input':{'action':'two','teamId':'t1','athleteId':a['athleteId']}})
    assert client.post('/api/matches/g/control',json={'revision':2,'command':{'type':'finish'}}).status_code==409
    def command(rev,body):
        r=client.post('/api/matches/g/control',json={'revision':rev,'command':body});assert r.status_code==200,r.text
    command(2,{'type':'set','seconds':0});command(3,{'type':'next-period'});command(4,{'type':'set','seconds':0});command(5,{'type':'finish'})
    assert client.get('/api/teams/t1').json()['wins']==1
    assert client.get('/api/athletes/'+a['athleteId']).json()['pointsPerGame']==2
    assert client.get('/api/competitions/comp').json()['standings'][0]['rows'][0]['winRate']==100
    assert client.get('/api/home?scope=todas').json()['games']==1
    with db() as s:
        assert s.get(Game,'g').home_score==2
        assert s.get(PlayerStat,('g',a['athleteId'])).minutes is None

def test_imported_games_readonly_even_to_operator(client,db):
    with db() as s:g=s.get(Game,'g');g.imported=True;g.status='encerrado';g.home_score=67;g.away_score=58;g.stats_complete=False;s.commit()
    login(client,'estatistico')
    assert client.post('/api/matches/g/start',json={'revision':0}).status_code==409
    match=client.get('/api/matches/g').json()
    assert match['homeScore']==67 and not match['statsComplete']

def test_imported_scheduled_game_has_no_fabricated_score_or_lineup(client,db):
    with db() as s:
        g=s.get(Game,'g');g.imported=True;g.stats_complete=False;s.commit()
    match=client.get('/api/matches/g').json()
    assert match['game']['homeScore'] is None and match['game']['awayScore'] is None
    assert all(not a['played'] and not a['onCourt'] for a in match['box'])
    login(client,'estatistico')
    assert client.post('/api/matches/g/start',json={'revision':0}).status_code==409

def test_training_is_private_and_reschedule_is_atomic(client,db):
    login(client,'tecnico')
    slot={'teamId':'t1','weekday':2,'time':'17:00','venue':'Court'}
    assert client.post('/api/training/slots',json=slot).status_code==200
    id=client.get('/api/training/slots?teamId=t1').json()[0]['id']
    assert client.get('/api/training/slots?teamId=t2').status_code==403
    body={'teamId':'t1','slotId':id,'fromDate':'2026-11-03','date':'2026-11-10','time':'17:00','venue':'Court'}
    assert client.post('/api/training/reschedule',json=body).status_code==409
    with db() as s:assert list(s.scalars(select(TrainingChange)))==[]
    assert client.post('/api/training/reschedule',json={**body,'date':'2026-11-04'}).status_code==200
    client.post('/api/auth/logout')
    assert all(e['kind']=='jogo' for e in client.get('/api/schedule?start=2026-11-01&end=2026-11-15').json())

def test_competition_permissions_enrollment_and_duplicate_date(client):
    login(client,'tecnico')
    body={'competitionId':None,'homeTeamId':'t1','awayTeamId':'t2','date':'2026-11-10','time':'18:00','venue':'Court'}
    assert client.post('/api/games',json=body).status_code==409
    assert client.post('/api/games',json={**body,'homeTeamId':'t2','awayTeamId':'t3','date':'2026-11-11'}).status_code==403
    assert client.post('/api/games',json={**body,'date':'2026-11-11'}).status_code==200
    login(client,'organizador')
    r=client.post('/api/competitions',json={'name':'My tournament','divisions':[{'category':'Universitário','gender':'Masculino'}]});assert r.status_code==200
    id=r.json()
    assert client.post(f'/api/competitions/{id}/enroll',json={'ids':['t1','missing']}).status_code==404
    assert client.get(f'/api/competitions/{id}').json()['teams']==0
    assert client.post(f'/api/competitions/{id}/enroll',json={'ids':['t1','t2']}).status_code==200
    scheduled=client.post('/api/games',json={**body,'competitionId':id,'date':'2026-11-12'})
    assert scheduled.status_code==200
    assert client.get('/api/matches/'+scheduled.json()['id']).json()['state']['periodSeconds']==1200

def test_tactics_geometry_ownership_revisions_and_private_drafts(client):
    login(client,'tecnico')
    draft=client.get('/api/tactics/t1').json()['draft']
    assert len(draft['board']['players'])==5
    assert client.get('/api/tactics/t2').status_code==403
    bad={**draft,'board':{**draft['board'],'ball':{'x':101,'y':10}}}
    assert client.put('/api/tactics/t1/draft',json=bad).status_code==422
    bad={**draft,'board':{**draft['board'],'players':[{**draft['board']['players'][0],'athleteId':'t2-a0'}]}}
    assert client.put('/api/tactics/t1/draft',json=bad).status_code==422
    saved=client.post('/api/tactics/t1/plays',json=draft);assert saved.status_code==200,saved.text
    play=saved.json();draft.update(playId=play['id'],baseRevision=play['revision'])
    assert client.post('/api/tactics/t1/plays',json=draft).json()['revision']==2
    assert client.post('/api/tactics/t1/plays',json=draft).status_code==409
    assert client.delete(f"/api/tactics/t1/plays/{play['id']}?revision=1").status_code==409
    login(client,'other')
    assert client.get('/api/tactics/t1').status_code==403
    assert client.get('/api/tactics/t2').json()['plays']==[]
