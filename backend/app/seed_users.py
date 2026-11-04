"""Create explicit local test accounts. Never prints passwords or creates production defaults."""
import os
from sqlalchemy import select
from .auth import passwords
from .db import SessionLocal
from .models import Athlete, CoachTeam, Team, User

ACCOUNTS=[('tecnico','marina','Marina Costa'),('atleta','luiza','Luiza Martins'),('estatistico','carlos','Carlos Mendes'),('organizador','beatriz','Beatriz Nogueira'),('basico','joao','João Pereira')]
def seed(db,password):
    if not password or len(password)<12:
        raise ValueError('Set DEMO_PASSWORD with at least 12 characters in backend/.env')
    team_id='ncaa-w-team-41'
    if not db.get(Team,team_id):raise ValueError('Import NCAA data first')
    athlete_id=db.scalar(select(Athlete.id).where(Athlete.team_id==team_id).order_by(Athlete.id))
    for role,slug,name in ACCOUNTS:
        email=f'{slug}@camphoop.demo'
        if not db.scalar(select(User.id).where(User.email==email)):
            db.add(User(id=f'local-{slug}',email=email,name=name,password_hash=passwords.hash(password),role=role,is_demo=True,team_id=team_id if role in ('tecnico','atleta') else None,athlete_id=athlete_id if role=='atleta' else None))
            db.flush()
            if role=='tecnico':db.add(CoachTeam(user_id=f'local-{slug}',team_id=team_id))
    db.commit()
if __name__=='__main__':
    with SessionLocal() as db:seed(db,os.getenv('DEMO_PASSWORD'))
    print('Local test accounts ready. Password is configured in backend/.env; existing users are preserved.')
