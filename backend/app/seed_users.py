"""Create explicit local test accounts. Never prints passwords or creates production defaults."""
import os
from sqlalchemy import select
from .auth import passwords
from .db import SessionLocal
from .models import User

ACCOUNTS=[('tecnico','marina','Marina Costa'),('atleta','luiza','Luiza Martins'),('estatistico','carlos','Carlos Mendes'),('organizador','beatriz','Beatriz Nogueira'),('basico','joao','João Pereira')]
def seed(db,password):
    if not password or len(password)<12:
        raise ValueError('Set DEMO_PASSWORD with at least 12 characters in backend/.env')
    for role,slug,name in ACCOUNTS:
        email=f'{slug}@camphoop.demo'
        if not db.scalar(select(User.id).where(User.email==email)):
            db.add(User(id=f'local-{slug}',email=email,name=name,password_hash=passwords.hash(password),role=role,is_demo=True))
            db.flush()
    db.commit()
if __name__=='__main__':
    with SessionLocal() as db:seed(db,os.getenv('DEMO_PASSWORD'))
    print('Local test accounts ready. Password is configured in backend/.env; existing users are preserved.')
