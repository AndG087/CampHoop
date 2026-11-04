"""Create a fresh, isolated account-testing database; never touches the NCAA database."""
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
engine.dispose()
print(json.dumps({'directory':str(directory),'databaseUrl':database_url,'mailbox':str(directory/'mailbox')},ensure_ascii=True))
