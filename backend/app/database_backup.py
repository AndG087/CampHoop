"""Private, portable database backups with a checked restore into an empty database."""
from datetime import date, datetime, timezone
from hashlib import sha256
from pathlib import Path
import gzip
import json
import shutil
from uuid import uuid4
from sqlalchemy import Date, DateTime, create_engine, event, func, inspect, select, text
from sqlalchemy.orm import Session
from .db import Base
from . import models  # Register all application tables.


def count(db,table):return db.scalar(select(func.count()).select_from(table))


def read_backup(directory):
    directory=Path(directory)
    manifest=json.loads((directory/'manifest.json').read_text(encoding='utf-8'))
    path=directory/'database.json.gz'
    if sha256(path.read_bytes()).hexdigest()!=manifest['sha256']:raise RuntimeError('Backup checksum mismatch.')
    with gzip.open(path,'rt',encoding='utf-8') as file:payload=json.load(file)
    if payload['format']!=1 or set(payload['tables'])!=set(Base.metadata.tables):raise RuntimeError('Unsupported backup schema.')
    if {name:len(rows) for name,rows in payload['tables'].items()}!=manifest['counts']:raise RuntimeError('Incomplete backup.')
    return payload


def restore(db,directory):
    """Refuse nonempty destinations; restore nullable owner references after their users."""
    payload=read_backup(directory)
    if any(count(db,t) for t in Base.metadata.tables.values()):raise RuntimeError('Restore requires an empty application database.')
    inserted=set();deferred=[]
    for table in Base.metadata.sorted_tables:
        rows=[]
        for original in payload['tables'][table.name]:
            row=dict(original)
            for column in table.columns:
                value=row[column.name]
                if value is not None:
                    if isinstance(column.type,DateTime):row[column.name]=datetime.fromisoformat(value)
                    elif isinstance(column.type,Date):row[column.name]=date.fromisoformat(value)
                    if column.nullable and any(fk.column.table.name not in inserted for fk in column.foreign_keys):
                        deferred.append((table,{pk.name:row[pk.name] for pk in table.primary_key},column.name,row[column.name]))
                        row[column.name]=None
            rows.append(row)
        for offset in range(0,len(rows),300):db.execute(table.insert(),rows[offset:offset+300])
        inserted.add(table.name)
    for table,keys,column,value in deferred:
        db.execute(table.update().where(*(table.c[name]==key for name,key in keys.items())).values({column:value}))
    db.flush()
    for name,rows in payload['tables'].items():
        if count(db,Base.metadata.tables[name])!=len(rows):raise RuntimeError('Restored row count mismatch: '+name)
    return {name:len(rows) for name,rows in payload['tables'].items()}


def backup(db,parent,data_dir):
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    directory=Path(parent).resolve()/f'before-ncaa-cleanup-{stamp}-{uuid4().hex[:8]}'
    directory.mkdir(parents=True,exist_ok=False)
    payload={'format':1,'createdAt':datetime.now(timezone.utc).isoformat(),'revision':None,'tables':{}}
    if inspect(db.connection()).has_table('alembic_version'):
        payload['revision']=db.execute(text('SELECT version_num FROM alembic_version')).scalar()
    for name,table in Base.metadata.tables.items():
        payload['tables'][name]=[dict(row) for row in db.execute(select(table).order_by(*table.primary_key.columns)).mappings()]
    path=directory/'database.json.gz'
    with gzip.open(path,'xt',encoding='utf-8') as file:
        json.dump(payload,file,ensure_ascii=False,allow_nan=False,default=lambda value:value.isoformat() if isinstance(value,(date,datetime)) else value)
    manifest={'createdAt':payload['createdAt'],'revision':payload['revision'],'sha256':sha256(path.read_bytes()).hexdigest(),'counts':{name:len(rows) for name,rows in payload['tables'].items()}}
    (directory/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    key=Path(data_dir)/'mail-encryption.key'
    if key.exists():shutil.copyfile(key,directory/key.name)
    # This retained SQLite copy is also a usable local archive of the pre-cleanup state.
    engine=create_engine('sqlite:///'+(directory/'archive.sqlite').as_posix())
    @event.listens_for(engine,'connect')
    def enable_foreign_keys(connection,_):connection.execute('PRAGMA foreign_keys=ON')
    try:
        Base.metadata.create_all(engine)
        with Session(engine) as restored:
            restore(restored,directory)
            if restored.execute(text('PRAGMA foreign_key_check')).first():raise RuntimeError('Backup restore violates foreign keys.')
            restored.commit()
        if payload['revision']:
            with engine.begin() as connection:
                connection.execute(text('CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY)'))
                connection.execute(text('INSERT INTO alembic_version (version_num) VALUES (:revision)'),{'revision':payload['revision']})
    finally:engine.dispose()
    (directory/'RESTORE_VERIFIED').write_text('Checksums, row counts and foreign keys verified.\n',encoding='utf-8')
    return directory
