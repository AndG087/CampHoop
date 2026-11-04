import pytest
import os
from time import sleep
from uuid import uuid4
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.exc import OperationalError
from app.auth import passwords
from app.db import Base, get_db
from app.main import app
from app.models import Athlete, Club, CoachTeam, Competition, Enrollment, Game, Team, User
from datetime import date

PASSWORD='test-password-123!'
@pytest.fixture()
def db():
    postgres_url=os.getenv('POSTGRES_TEST_URL')
    connection=None
    if postgres_url:
        from alembic import command
        from alembic.config import Config
        from pathlib import Path
        engine=create_engine(postgres_url,pool_size=1,max_overflow=0,connect_args={'prepare_threshold':None,'connect_timeout':10})
        # PGlite releases its single socket asynchronously after the preceding test.
        for attempt in range(5):
            try:
                connection=engine.connect()
                break
            except OperationalError:
                if attempt==4:raise
                sleep(0.1)
        schema='camphoop_test_'+uuid4().hex
        assert schema.startswith('camphoop_test_') and len(schema)==46
        connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
        connection.exec_driver_sql(f'SET search_path TO "{schema}"')
        connection.commit()
        config=Config(str(Path(__file__).resolve().parents[1]/'alembic.ini'))
        config.attributes['connection']=connection
        command.upgrade(config,'head')
        connection.commit()
        factory=sessionmaker(connection,expire_on_commit=False)
    else:
        engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
        @event.listens_for(engine,'connect')
        def fk(c,_):c.execute('PRAGMA foreign_keys=ON')
        Base.metadata.create_all(engine)
        factory=sessionmaker(engine,expire_on_commit=False)
    with factory() as s:
        s.add_all([Club(id=x,name=x,short_name=x,city='Test') for x in ['c1','c2','c3']]);s.flush()
        s.add_all([Team(id=x,club_id=c,category='Universitário',gender='Masculino') for x,c in [('t1','c1'),('t2','c2'),('t3','c3')]]);s.flush()
        s.add_all([Athlete(id=f'{tid}-a{i}',season='2026/27',team_id=tid,name=f'{tid} Athlete {i}',number=i,position='Guard',status='historico') for tid in ['t1','t2','t3'] for i in range(6)]);s.flush()
        hash=passwords.hash(PASSWORD)
        s.add_all([User(id=role,email=f'{role}@test.local',name=role,password_hash=hash,role=role,is_demo=True,team_id='t1' if role in ['tecnico','atleta'] else None,athlete_id='t1-a0' if role=='atleta' else None) for role in ['tecnico','atleta','estatistico','organizador','basico']]);s.flush()
        s.add(User(id='other',email='other@test.local',name='Other coach',password_hash=hash,role='tecnico',is_demo=True,team_id='t2'));s.flush()
        s.add_all([CoachTeam(user_id='tecnico',team_id='t1'),CoachTeam(user_id='other',team_id='t2')]);s.flush()
        s.add(Competition(id='comp',season='2026/27',name='Test Cup',divisions=[{'category':'Universitário','gender':'Masculino'}],organizer_id='organizador',ruleset='ncaa-m',standings_mode='win-rate'));s.flush()
        s.add_all([Enrollment(competition_id='comp',team_id=t) for t in ['t1','t2']])
        s.add(Game(id='g',season='2026/27',competition_id='comp',home_id='t1',away_id='t2',date=date(2026,11,10),time='18:00',venue='Test',status='agendado',regulation_periods=2,period_seconds=1200,remaining_seconds=1200));s.commit()
    def override():
        with factory() as s:yield s
    app.dependency_overrides[get_db]=override
    yield factory
    app.dependency_overrides.clear()
    if connection is not None:
        connection.rollback()
        connection.exec_driver_sql('SET search_path TO public')
        # Only the unique schema created by this test fixture is removed.
        connection.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
        connection.commit()
        connection.close()
    engine.dispose()
@pytest.fixture()
def client(db):
    with TestClient(app) as c:yield c
def login(client,role):
    result=client.post('/api/auth/login',json={'email':f'{role}@test.local','password':PASSWORD})
    assert result.status_code==200,result.text
    return result
