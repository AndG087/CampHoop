from datetime import date
import pytest
from sqlalchemy import select
from app.models import Athlete, Game, PlayerStat, Team, TeamSeason, User
from conftest import login

def team_body(name='Equipe própria',season='2026/27',**overrides):
    return {'name':name,'category':'Sub-17','gender':'Feminino','coach':'Técnica responsável','season':season,'club':{'name':name+' Clube','shortName':'CP','city':'Campinas'},**overrides}

def make_team(client,name='Equipe própria',season='2026/27'):
    r=client.post('/api/management/teams',json=team_body(name,season));assert r.status_code==200,r.text
    return r.json()['id']

def athlete_body(team_id,name='Atleta própria',number=8,**overrides):
    return {'teamId':team_id,'season':'2026/27','name':name,'number':number,'position':'Armadora','birthDate':'2009-03-14','heightCm':168,'memberSince':'2026-08','photoUrl':None,'status':'ativo',**overrides}

def make_athlete(client,team_id,name='Atleta própria',number=8):
    r=client.post('/api/management/athletes',json=athlete_body(team_id,name,number));assert r.status_code==200,r.text
    return r.json()['id']

def future_body(**overrides):
    return {'name':'Elenco futuro','category':'Sub-17','gender':'Feminino','coach':'Técnica futura','sourceSeason':'2026/27','targetSeason':'2027/28','copyRoster':True,**overrides}

@pytest.mark.parametrize('role',[None,'atleta','basico','estatistico','organizador'])
def test_only_coaches_create_and_manage_rosters(client,role):
    if role:login(client,role)
    expected=403 if role else 401
    assert client.post('/api/management/teams',json=team_body()).status_code==expected
    assert client.get('/api/management/options').status_code==expected

def test_team_creation_appears_without_games_and_preserves_work_context(client):
    login(client,'tecnico');tid=make_team(client)
    profile=client.get('/api/teams/'+tid+'?season=2026/27').json()
    assert profile['team']['name']=='Equipe própria' and profile['athletes']==0
    assert profile['team']['revision']==1 and not profile['team']['imported']
    session=client.get('/api/auth/me').json()
    assert session['teamId']==tid and tid in session['managedTeamIds'] and 't1' in session['teamIds']
    assert client.post('/api/management/active-team',json={'teamId':'t1'}).status_code==200
    assert client.post('/api/management/active-team',json={'teamId':tid}).status_code==200
    assert client.post('/api/management/active-team',json={'teamId':'t2'}).status_code==403
    assert any(t['id']==tid and t['editable'] for t in client.get('/api/management/options').json()['teams'])

def test_edit_team_revision_and_division_changes_use_season_snapshot(client):
    login(client,'tecnico');a=make_team(client,'Equipe A');b=make_team(client,'Equipe B')
    payload={'name':'Equipe A revisada','category':'Sub-15','gender':'Masculino','coach':'Novo técnico','revision':1}
    assert client.put(f'/api/management/teams/{a}?season=2026/27',json=payload).status_code==200
    assert client.put(f'/api/management/teams/{a}?season=2026/27',json=payload).status_code==409
    assert client.get(f'/api/teams/{a}?season=2026/27').json()['team']['category']=='Sub-15'
    game={'competitionId':None,'homeTeamId':a,'awayTeamId':b,'date':'2026-11-12','time':'18:00','venue':'Quadra'}
    assert client.post('/api/games?season=2026/27',json=game).status_code==409
    assert client.put(f'/api/management/teams/{b}?season=2026/27',json={**payload,'name':'Equipe B revisada'}).status_code==200
    assert client.post('/api/games?season=2026/27',json=game).status_code==200
    assert client.put(f'/api/management/teams/{a}?season=2026/27',json={**payload,'revision':2,'category':'Sub-17'}).status_code==409

def test_another_coach_cannot_edit_link_or_read_private_fields(client):
    login(client,'tecnico');a=make_team(client);ath=make_athlete(client,a)
    login(client,'other');b=make_team(client,'Outro clube')
    assert client.get('/api/management/athletes/'+ath).status_code==403
    assert client.post('/api/management/athletes',json=athlete_body(a)).status_code==403
    edit=athlete_body(b);edit.pop('season');edit.pop('identityLocked',None);edit['revision']=1
    assert client.put('/api/management/athletes/'+ath,json=edit).status_code==403
    assert client.post('/api/management/roster-links',json={'athleteId':ath,'teamId':b,'season':'2026/27','number':8,'position':'Ala'}).status_code==403
    assert client.post(f'/api/management/teams/{a}/seasons',json=future_body()).status_code==403
    assert all(p['id']!=ath for p in client.get('/api/management/options').json()['athletes'])

def test_public_age_private_birth_and_edits_from_non_active_owned_team(client,db):
    login(client,'tecnico');a=make_team(client,'Equipe A');ath=make_athlete(client,a);make_team(client,'Equipe B')
    private=client.get('/api/athletes/'+ath).json()
    assert private['private']['birthDate']=='2009-03-14'
    edit=client.get('/api/management/athletes/'+ath).json();edit.pop('id');edit.pop('season');edit.pop('identityLocked',None)
    assert client.put('/api/management/athletes/'+ath,json={**edit,'name':'Atleta editada','number':9}).status_code==200
    assert client.put('/api/management/athletes/'+ath,json=edit).status_code==409
    client.post('/api/auth/logout')
    public=client.get('/api/athletes/'+ath).json()
    assert public['private'] is None and isinstance(public['age'],int)
    assert '2009-03-14' not in client.get('/api/athletes?season=2026/27').text
    login(client,'other');assert client.get('/api/athletes/'+ath).json()['private'] is None
    with db() as s:
        user=s.get(User,'atleta');user.athlete_id=ath;user.team_id=a;s.commit()
    login(client,'atleta');assert client.get('/api/athletes/'+ath).json()['private']['birthDate']=='2009-03-14'

@pytest.mark.parametrize('changes',[{'number':100},{'heightCm':0},{'birthDate':'2999-01-01'},{'photoUrl':'file:///private.txt'},{'status':'historico'},{'name':'  '},{'source_id':'forged'}])
def test_invalid_player_data_is_rejected_atomically(client,changes):
    login(client,'tecnico');a=make_team(client)
    assert client.post('/api/management/athletes',json=athlete_body(a,**changes)).status_code==422
    assert client.get(f'/api/teams/{a}?season=2026/27').json()['athletes']==0

def test_duplicate_jersey_and_duplicate_team_name_are_rejected(client):
    login(client,'tecnico');a=make_team(client);make_athlete(client,a)
    assert client.post('/api/management/athletes',json=athlete_body(a,'Outra atleta')).status_code==409
    club=client.get('/api/management/options').json()['clubs'][0]
    body=team_body();body.pop('club');body['clubId']=club['id']
    assert client.post('/api/management/teams',json=body).status_code==409
    assert client.post('/api/management/teams',json=team_body('Erro','2026/28')).status_code==422

def test_ncaa_teams_and_profiles_remain_immutable(client,db):
    with db() as s:
        t=s.get(Team,'t1');t.source_id='ncaa-source';a=s.get(Athlete,'t1-a0');a.source_id='ncaa-athlete';s.commit()
    login(client,'tecnico')
    assert client.post('/api/management/athletes',json=athlete_body('t1')).status_code==403
    assert client.post('/api/management/teams/t1/seasons',json=future_body()).status_code==403
    assert client.get('/api/management/athletes/t1-a0').status_code==403
    assert client.post('/api/management/teams',json={**team_body(),'clubId':'c1','club':None}).status_code==403
    assert client.get('/api/teams/t1').json()['team']['imported']

def test_next_season_copy_preserves_previous_names_numbers_statistics_and_identity(client,db):
    login(client,'tecnico');a=make_team(client,'Equipe A');b=make_team(client,'Equipe B');ath=make_athlete(client,a)
    with db() as s:
        s.add(Game(id='past-local',season='2026/27',home_id=a,away_id=b,date=date(2026,11,1),status='encerrado',home_score=12,away_score=3));s.flush()
        s.add(PlayerStat(game_id='past-local',athlete_id=ath,team_id=a,points=12,played=True));s.commit()
    assert client.post(f'/api/management/teams/{a}/seasons',json=future_body()).status_code==200
    new=client.get(f'/api/teams/{a}?season=2027/28').json()
    old=client.get(f'/api/teams/{a}?season=2026/27').json()
    assert new['team']['name']=='Elenco futuro' and old['team']['name']=='Equipe A'
    assert len(new['roster'])==1 and new['roster'][0]['id']!=ath
    assert new['roster'][0]['games']==0 and old['roster'][0]['pointsPerGame']==12
    edit=client.get('/api/management/athletes/'+new['roster'][0]['id']).json();edit.pop('id');edit.pop('season');edit.pop('identityLocked',None)
    assert client.put('/api/management/athletes/'+new['roster'][0]['id'],json={**edit,'name':'Nome na nova temporada','number':23}).status_code==200
    assert client.get('/api/athletes/'+ath).json()['name']=='Atleta própria'
    assert client.get('/api/athletes/'+ath).json()['number']==8
    with db() as s:
        assert s.get(Athlete,ath).person_id==s.get(Athlete,new['roster'][0]['id']).person_id
        assert s.get(PlayerStat,('past-local',ath)).points==12
    assert '2027/28' in [row['season'] for row in client.get('/api/meta').json()['availableSeasons']]

def test_copy_skips_existing_person_and_copies_the_remaining_roster(client,db):
    login(client,'tecnico');a=make_team(client,'Equipe A');b=make_team(client,'Equipe B');ath=make_athlete(client,a)
    make_athlete(client,a,'Segunda atleta',9)
    assert client.post(f'/api/management/teams/{b}/seasons',json=future_body(copyRoster=False)).status_code==200
    payload={'athleteId':ath,'teamId':b,'season':'2027/28','number':8,'position':'Armadora'}
    assert client.post('/api/management/roster-links',json=payload).status_code==200
    assert client.post('/api/management/roster-links',json=payload).status_code==409
    result=client.post(f'/api/management/teams/{a}/seasons',json=future_body());assert result.status_code==200
    assert result.json()['copiedAthletes']==1 and result.json()['skippedAthletes'][0]['id']==ath
    with db() as s:
        assert s.get(TeamSeason,(a,'2027/28')) is not None
        assert len(list(s.scalars(select(Athlete).where(Athlete.team_id==a,Athlete.season=='2026/27'))))==2

def test_roster_edits_are_blocked_during_live_games(client):
    login(client,'tecnico');a=make_team(client,'Equipe A');b=make_team(client,'Equipe B');ath=make_athlete(client,a);make_athlete(client,b)
    game=client.post('/api/games?season=2026/27',json={'competitionId':None,'homeTeamId':a,'awayTeamId':b,'date':'2026-11-12','time':'18:00','venue':'Quadra'}).json()['id']
    login(client,'estatistico');assert client.post(f'/api/matches/{game}/start',json={'revision':0}).status_code==200
    login(client,'tecnico')
    assert client.post('/api/management/athletes',json=athlete_body(a,'Nova atleta',33)).status_code==409
    edit=client.get('/api/management/athletes/'+ath).json();edit.pop('id');edit.pop('season');edit.pop('identityLocked',None)
    assert client.put('/api/management/athletes/'+ath,json={**edit,'number':9}).status_code==409


def test_same_season_transfer_is_allowed_before_games_and_blocked_after_records(client,db):
    login(client,'tecnico');a=make_team(client,'Equipe A');b=make_team(client,'Equipe B');ath=make_athlete(client,a)
    edit=client.get('/api/management/athletes/'+ath).json();edit.pop('id');edit.pop('season');edit.pop('identityLocked',None)
    assert client.put('/api/management/athletes/'+ath,json={**edit,'teamId':b}).status_code==200
    assert client.get('/api/athletes/'+ath).json()['team']['id']==b
    with db() as s:
        s.add(Game(id='played-local',season='2026/27',home_id=a,away_id=b,date=date(2026,11,1),status='encerrado'));s.flush()
        s.add(PlayerStat(game_id='played-local',athlete_id=ath,team_id=b,points=8,played=True));s.commit()
    edit=client.get('/api/management/athletes/'+ath).json();edit.pop('id');edit.pop('season');edit.pop('identityLocked',None)
    assert client.put('/api/management/athletes/'+ath,json={**edit,'teamId':a}).status_code==409
    assert client.get('/api/athletes/'+ath).json()['team']['id']==b
