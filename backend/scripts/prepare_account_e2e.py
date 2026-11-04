"""Create isolated account test data, including a fictional coach; never touches NCAA."""
from pathlib import Path
import json
import os
from uuid import uuid4

root=Path(__file__).resolve().parents[1]
directory=(root/'data'/('e2e-accounts-'+uuid4().hex)).resolve()
if directory.parent!=(root/'data').resolve():raise RuntimeError('Invalid test directory')
directory.mkdir(parents=True,exist_ok=False)
database_url='sqlite:///'+(directory/'accounts.sqlite').as_posix()
os.environ['DATABASE_URL']=database_url
from app.db import Base,engine
import app.models
Base.metadata.create_all(engine)
from sqlalchemy.orm import Session
from app.auth import passwords
from app.models import User
with Session(engine) as db:
    db.add(User(id='local-marina',email='marina@camphoop.demo',name='Marina Costa',password_hash=passwords.hash('Isolated-Demo-password-2026!'),role='tecnico',is_demo=True))
    db.commit()
engine.dispose()
print(json.dumps({'directory':str(directory),'databaseUrl':database_url,'mailbox':str(directory/'mailbox')},ensure_ascii=True))
