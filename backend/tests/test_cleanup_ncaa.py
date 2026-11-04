from datetime import date, timedelta
import json
import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from app.account_utils import now
from app.db import Base
from app.cleanup_ncaa import clean, plan
from app.database_backup import backup, read_backup, restore
from app.models import Athlete, Club, ClubInvitation, ClubMember, CoachTeam, Competition, Game, Notification, PlayerStat, SourceImport, TacticsDraft, Team, TrainingSlot, User


def imported_data(db):
    with db() as s:
        for n in [1,2]:
            s.add(Club(id=f'ncaa-club-cleanup{n}',name=f'NCAA {n}',short_name='NCAA',city='USA'))
        s.flush()
        for n in [1,2]:
            s.add(Team(id=f'ncaa-w-team-cleanup{n}',club_id=f'ncaa-club-cleanup{n}',category='Universitário',gender='Feminino',source_id=f'ncaa-w-team-cleanup{n}'))
        s.add(Team(id='another-provider-team',club_id='c3',category='Adulto',gender='Feminino',source_id='another-provider-team'))
        s.flush()
        s.add(Athlete(id='ncaa-w-athlete-cleanup',team_id='ncaa-w-team-cleanup1',name='Imported athlete',season='2026/27',source_id='ncaa-w-athlete-cleanup'))
        s.add(Competition(id='ncaa-w-2027',name='NCAA test',season='2026/27',divisions=[],source_id='ncaa-w-2027'))
        s.add(SourceImport(id='ncaa-2027',provider='SportsDataverse / ESPN',season=2027,imported_at=now(),manifest={'season':'2026/27','counts':{}}))
        s.flush()
        s.add(Game(id='ncaa-w-game-cleanup',season='2026/27',home_id='ncaa-w-team-cleanup1',away_id='ncaa-w-team-cleanup2',competition_id='ncaa-w-2027',date=date(2026,11,1),status='encerrado',home_score=12,away_score=10,imported=True,source_id='ncaa-w-game-cleanup'))
        s.flush()
        s.add(PlayerStat(game_id='ncaa-w-game-cleanup',team_id='ncaa-w-team-cleanup1',athlete_id='ncaa-w-athlete-cleanup',points=12))
        s.add(CoachTeam(user_id='tecnico',team_id='ncaa-w-team-cleanup1'))
        s.get(User,'tecnico').team_id='ncaa-w-team-cleanup1'
        s.get(User,'atleta').team_id='ncaa-w-team-cleanup1'
        s.get(User,'atleta').athlete_id='ncaa-w-athlete-cleanup'
        s.get(User,'atleta').active_club_id='ncaa-club-cleanup1'
        s.add(User(id='real-athlete',name='Own athlete',email='athlete@example.test',password_hash='preserved-private-hash',role='atleta',is_demo=False,team_id='t1',athlete_id='t1-a0',active_club_id='c1'))
        s.flush()
        s.add(ClubMember(club_id='c1',user_id='real-athlete',role='atleta',team_id='t1',athlete_id='t1-a0',joined_at=now()))
        s.add(ClubInvitation(id='own-invitation',club_id='c1',email='next@example.test',role='atleta',team_id='t1',athlete_id='t1-a1',created_by='tecnico',created_at=now(),expires_at=now()+timedelta(days=7),token_hash='test-private-hash'))
        s.add(Notification(id='own-notice',user_id='real-athlete',club_id='c1',title='Own notice',body='Preserve',href='/convites',created_at=now()))
        s.commit()


def test_preview_backup_restore_cleanup_and_idempotency_preserve_local_records(db,tmp_path):
    imported_data(db)
    with db() as s:
        before=plan(s)
        assert before['remove']['teams']==2 and not before['blockers']
        assert s.get(Team,'ncaa-w-team-cleanup1') is not None
        directory=backup(s,tmp_path,tmp_path)
        assert (directory/'RESTORE_VERIFIED').exists()
        payload=read_backup(directory)
        assert len(payload['tables']['users'])==before['preserve']['users']
        engine=create_engine('sqlite:///'+(directory/'archive.sqlite').as_posix())
        try:
            with Session(engine) as archived:
                assert archived.get(User,'atleta').athlete_id=='ncaa-w-athlete-cleanup'
                assert archived.get(User,'real-athlete').password_hash=='preserved-private-hash'
                assert archived.get(PlayerStat,('ncaa-w-game-cleanup','ncaa-w-athlete-cleanup')).points==12
        finally:engine.dispose()
        result=clean(s);s.commit();s.expire_all()
        assert result['removed']['teams']==2
        assert s.get(User,'atleta').athlete_id is None and s.get(User,'atleta').team_id is None
        assert s.get(User,'real-athlete').athlete_id=='t1-a0'
        assert s.get(ClubMember,('c1','real-athlete')).athlete_id=='t1-a0'
        assert s.get(ClubInvitation,'own-invitation').team_id=='t1'
        assert s.get(Notification,'own-notice').club_id=='c1'
        assert s.get(Team,'another-provider-team') is not None
        assert s.get(Game,'g') is not None
        assert not any(plan(s)['remove'].values())
        assert not any(clean(s)['removed'].values())


@pytest.mark.parametrize('dependency',['local_game','local_athlete','training','real_user','invitation'])
def test_cleanup_refuses_local_dependencies_without_modifying_data(db,dependency):
    imported_data(db)
    with db() as s:
        if dependency=='local_game':s.add(Game(id='local-game-on-ncaa',home_id='t1',away_id='ncaa-w-team-cleanup1',date=date(2026,11,1),season='2026/27',status='agendado'))
        if dependency=='local_athlete':s.add(Athlete(id='own-athlete-on-ncaa',team_id='ncaa-w-team-cleanup1',name='Own athlete',season='2026/27'))
        if dependency=='training':s.add(TrainingSlot(id='own-training',team_id='ncaa-w-team-cleanup1',weekday=1,time='18:00',venue='Own venue'))
        if dependency=='real_user':s.get(User,'real-athlete').team_id='ncaa-w-team-cleanup1'
        if dependency=='invitation':s.get(ClubInvitation,'own-invitation').athlete_id='ncaa-w-athlete-cleanup'
        s.commit()
        assert plan(s)['blockers']
        with pytest.raises(RuntimeError,match='cleanup refused'):clean(s)
        assert s.get(Game,'ncaa-w-game-cleanup') is not None
        assert s.get(User,'atleta').athlete_id=='ncaa-w-athlete-cleanup'


def test_backup_integrity_and_nonempty_destination_are_checked(db,tmp_path):
    with db() as s:
        directory=backup(s,tmp_path,tmp_path)
        with pytest.raises(RuntimeError,match='empty application database'):restore(s,directory)
        with (directory/'database.json.gz').open('ab') as file:file.write(b'corrupted')
        with pytest.raises(RuntimeError,match='checksum mismatch'):read_backup(directory)


def test_backup_reuses_the_single_checked_out_database_connection(tmp_path):
    engine=create_engine('sqlite:///'+(tmp_path/'single.sqlite').as_posix(),pool_size=1,max_overflow=0,pool_timeout=1)
    try:
        Base.metadata.create_all(engine)
        with Session(engine) as s:
            s.connection()
            directory=backup(s,tmp_path/'backups',tmp_path)
            assert (directory/'RESTORE_VERIFIED').exists()
    finally:engine.dispose()


def test_seed_works_without_ncaa_and_preserves_existing_accounts(db):
    from app.seed_users import seed
    with db() as s:
        seed(s,'Isolated-test-password-2026!')
        marina=s.scalar(select(User).where(User.email=='marina@camphoop.demo'))
        assert marina.team_id is None
        marina.team_id='t1';s.commit();original_hash=marina.password_hash
        seed(s,'Another-isolated-password-2026!')
        assert marina.team_id=='t1' and marina.password_hash==original_hash
        assert s.scalar(select(func.count()).select_from(SourceImport))==0


@pytest.mark.parametrize('edited',[False,True])
def test_only_unchanged_automatic_demo_drafts_can_be_removed(db,edited):
    from app.main import initial_draft
    from types import SimpleNamespace
    imported_data(db)
    with db() as s:
        aid='ncaa-w-athlete-cleanup';team_id='ncaa-w-team-cleanup1'
        content=initial_draft(SimpleNamespace(athletes={aid:s.get(Athlete,aid)}),team_id)
        if edited:content['board']['ball']['x']=60
        s.add(TacticsDraft(season='2026/27',user_id='tecnico',team_id=team_id,content=content));s.commit()
        if edited:
            assert plan(s)['blockers']['edited_tactics_drafts']==1
            with pytest.raises(RuntimeError,match='cleanup refused'):clean(s)
        else:
            assert plan(s)['remove']['automatic_demo_drafts']==1
            clean(s);s.commit()
            assert s.scalar(select(func.count()).select_from(TacticsDraft))==0
