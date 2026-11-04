from datetime import date
from sqlalchemy import select
from app.models import Athlete, CoachTeam, Competition, Game, PlayerStat, TeamSeason, User
from app.seasons import is_historical
from conftest import login
from test_management import athlete_body, future_body, make_athlete, make_team, team_body

def edit_payload(client,id,**changes):
    data=client.get('/api/management/athletes/'+id).json()
    for key in ('id','season','identityLocked'):data.pop(key)
    return {**data,**changes}

def game_body(a,b,day='2026-11-12'):
    return {'competitionId':None,'homeTeamId':a,'awayTeamId':b,'date':day,'time':'18:00','venue':'Quadra'}

def test_private_empty_season_and_creation_window_do_not_pollute_public_selector(client):
    login(client,'tecnico')
    assert client.post('/api/management/teams',json=team_body('Spam','2098/99')).status_code==422
    a=make_team(client,'Futuro','2027/28');b=make_team(client,'Outro futuro','2027/28')
    assert '2027/28' in [s['season'] for s in client.get('/api/meta').json()['availableSeasons']]
    login(client,'other')
    assert '2027/28' not in [s['season'] for s in client.get('/api/meta').json()['availableSeasons']]
    client.post('/api/auth/logout')
    assert '2027/28' not in [s['season'] for s in client.get('/api/meta').json()['availableSeasons']]
    assert client.get('/api/meta?season=2027/28').status_code==422
    login(client,'tecnico')
    assert client.post('/api/games?season=2027/28',json=game_body(a,b,'2027-11-12')).status_code==200
    client.post('/api/auth/logout')
    assert '2027/28' in [s['season'] for s in client.get('/api/meta').json()['availableSeasons']]

def test_friendly_requires_exact_opponent_date_consent_and_does_not_block_victim(client,db):
    login(client,'tecnico');a=make_team(client,'Equipe A')
    login(client,'other');b=make_team(client,'Equipe B');c=make_team(client,'Equipe C')
    login(client,'tecnico')
    assert client.post('/api/games?season=2026/27',json=game_body(a,b)).status_code==403
    with db() as s:assert s.scalar(select(Game.id).where(Game.home_id==a)) is None
    # The unapproved request did not reserve B's date.
    login(client,'other')
    assert client.post('/api/games?season=2026/27',json=game_body(b,c)).status_code==200
    consent=client.post(f'/api/management/teams/{b}/authorizations',json={'season':'2026/27','kind':'friendly','opponentId':a,'date':'2026-11-13'})
    assert consent.status_code==200,consent.text
    login(client,'tecnico')
    assert client.post('/api/games?season=2026/27',json=game_body(a,b,'2026-11-14')).status_code==403
    assert client.post('/api/games?season=2026/27',json=game_body(a,b,'2026-11-13')).status_code==200
    assert client.delete(f'/api/management/teams/{b}/authorizations/{consent.json()["id"]}').status_code==403
    login(client,'other')
    assert client.delete(f'/api/management/teams/{b}/authorizations/{consent.json()["id"]}').status_code==200

def test_organizer_cannot_enroll_local_team_without_owner_approval(client,db):
    login(client,'tecnico');a=make_team(client)
    login(client,'organizador')
    comp=client.post('/api/competitions?season=2026/27',json={'name':'Copa consentida','divisions':[{'category':'Sub-17','gender':'Feminino'}]}).json()
    assert client.post(f'/api/competitions/{comp}/enroll',json={'ids':[a]}).status_code==403
    login(client,'tecnico')
    result=client.post(f'/api/management/teams/{a}/authorizations',json={'season':'2026/27','kind':'enroll','competitionId':comp})
    assert result.status_code==200,result.text
    login(client,'organizador')
    assert client.post(f'/api/competitions/{comp}/enroll',json={'ids':[a]}).status_code==200

def test_recorded_identity_cannot_rewrite_finished_box_score(client,db):
    login(client,'tecnico');a=make_team(client,'Equipe A');b=make_team(client,'Equipe B');ath=make_athlete(client,a)
    with db() as s:
        s.add(Game(id='finished-local',season='2026/27',home_id=a,away_id=b,date=date(2026,11,1),status='encerrado'));s.flush()
        s.add(PlayerStat(game_id='finished-local',athlete_id=ath,team_id=a,points=10,played=True));s.commit()
    before=client.get('/api/matches/finished-local').json()['box']
    for change in [{'name':'Nome trocado'},{'number':23},{'position':'Pivô'}]:
        result=client.put('/api/management/athletes/'+ath,json=edit_payload(client,ath,**change))
        assert result.status_code==409,result.text
    assert client.put('/api/management/athletes/'+ath,json=edit_payload(client,ath,heightCm=170)).status_code==200
    assert client.request('DELETE','/api/management/athletes/'+ath,json={'revision':2}).status_code==409
    assert client.request('DELETE',f'/api/management/teams/{a}?season=2026/27',json={'revision':1}).status_code==409
    assert client.get('/api/matches/finished-local').json()['box']==before

def test_coach_grants_can_be_revoked_and_stale_work_team_does_not_restore_them(client,db):
    login(client,'tecnico');a=make_team(client);ath=make_athlete(client,a)
    assert client.post(f'/api/management/teams/{a}/access',json={'email':'other@test.local'}).status_code==200
    login(client,'other')
    assert client.post('/api/management/active-team',json={'teamId':a}).status_code==200
    assert client.get('/api/athletes/'+ath).json()['private']['birthDate']
    assert client.get(f'/api/tactics/{a}?season=2026/27').status_code==200
    login(client,'tecnico')
    assert client.delete(f'/api/management/teams/{a}/access/other').status_code==200
    login(client,'other')
    assert client.get('/api/athletes/'+ath).json()['private'] is None
    assert client.get(f'/api/tactics/{a}?season=2026/27').status_code==403
    assert client.get(f'/api/training/slots?teamId={a}').status_code==403
    assert client.post('/api/management/active-team',json={'teamId':a}).status_code==403
    with db() as s:
        s.get(User,'other').team_id=a;s.commit() # Even a stale stored selection grants no coaching rights.
    assert client.get('/api/athletes/'+ath).json()['private'] is None
    assert client.get(f'/api/tactics/{a}?season=2026/27').status_code==403

def test_non_owner_can_end_own_legacy_coaching_access(client):
    login(client,'tecnico')
    assert client.delete('/api/management/teams/t1/access/tecnico').status_code==200
    assert 't1' not in client.get('/api/auth/me').json()['teamIds']
    assert client.get('/api/tactics/t1').status_code==403

def test_link_candidates_are_deduplicated_and_exclude_people_already_linked(client):
    login(client,'tecnico');a=make_team(client);ath=make_athlete(client,a)
    assert client.post(f'/api/management/teams/{a}/seasons',json=future_body()).status_code==200
    assert client.post(f'/api/management/teams/{a}/seasons',json=future_body(targetSeason='2028/29',copyRoster=False)).status_code==200
    options=client.get('/api/management/options?season=2028/29').json()['athletes']
    assert len(options)==1 and options[0]['season']=='2027/28'
    assert client.get('/api/management/options?season=2027/28').json()['athletes']==[]

def test_athlete_account_tracks_transfer_and_can_read_own_identity_across_seasons(client,db):
    login(client,'tecnico');a=make_team(client,'Equipe A');b=make_team(client,'Equipe B');ath=make_athlete(client,a)
    with db() as s:
        account=s.get(User,'atleta');account.athlete_id=ath;account.team_id=a;s.commit()
    assert client.put('/api/management/athletes/'+ath,json=edit_payload(client,ath,teamId=b)).status_code==200
    with db() as s:assert s.get(User,'atleta').team_id==b
    assert client.post(f'/api/management/teams/{b}/seasons',json=future_body()).status_code==200
    next_id=client.get(f'/api/teams/{b}?season=2027/28').json()['roster'][0]['id']
    login(client,'atleta')
    for id in [ath,next_id]:assert client.get('/api/athletes/'+id).json()['private']['birthDate']=='2009-03-14'
    me=client.get('/api/auth/me?season=2027/28').json()
    assert me['athleteId']==next_id and me['teamId']==b and set(me['athleteIds'])=={ath,next_id}
    assert client.get('/api/auth/me?season=2026/27').json()['athleteId']==ath

def test_edit_read_uses_no_mutation_lock_and_member_since_accepts_1900s(client,monkeypatch):
    login(client,'tecnico');a=make_team(client)
    response=client.post('/api/management/athletes',json=athlete_body(a,memberSince='1998-05'))
    assert response.status_code==200
    def fail(*_):raise AssertionError('A read must not lock the team')
    monkeypatch.setattr('app.management.locked_teams',fail)
    assert client.get('/api/management/athletes/'+response.json()['id']).status_code==200

def test_unused_links_periods_and_teams_can_be_deleted_but_recorded_links_cannot(client,db):
    login(client,'tecnico');a=make_team(client);ath=make_athlete(client,a)
    assert client.request('DELETE','/api/management/athletes/'+ath,json={'revision':2}).status_code==409
    assert client.request('DELETE','/api/management/athletes/'+ath,json={'revision':1}).status_code==200
    assert client.post(f'/api/management/teams/{a}/seasons',json=future_body(copyRoster=False)).status_code==200
    assert client.request('DELETE',f'/api/management/teams/{a}/seasons/2027/28',json={'revision':1}).status_code==200
    assert client.request('DELETE',f'/api/management/teams/{a}?season=2026/27',json={'revision':1}).status_code==200
    assert a not in client.get('/api/auth/me').json()['teamIds']
    assert client.get(f'/api/teams/{a}?season=2026/27').json() is None
    assert client.request('DELETE','/api/management/athletes/t1-a0',json={'revision':1}).status_code==403

def test_historical_flag_uses_academic_year_end():
    assert is_historical('2025/26',date(2026,11,3))
    assert is_historical('2024/25',date(2026,11,3))
    assert not is_historical('2026/27',date(2026,11,3))
    assert not is_historical('2027/28',date(2026,11,3))

def test_published_local_history_remains_visible_but_legacy_far_future_is_hidden(client,db):
    login(client,'tecnico');a=make_team(client,'Equipe A');b=make_team(client,'Equipe B')
    with db() as s:
        for label,day in [('2020/21',date(2020,11,1)),('2098/99',date(2098,11,1))]:
            s.add(TeamSeason(team_id=a,season=label,name='Arquivo local',category='Sub-17',gender='Feminino',coach='Responsável',revision=1))
            s.add(Game(id='archive-'+label,season=label,home_id=a,away_id=b,date=day,status='encerrado'))
        s.commit()
    client.post('/api/auth/logout')
    labels=[s['season'] for s in client.get('/api/meta').json()['availableSeasons']]
    assert '2020/21' in labels and '2098/99' not in labels
    assert client.get('/api/meta?season=2020/21').json()['historical']
