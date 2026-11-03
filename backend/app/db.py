from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import settings

class Base(DeclarativeBase):
    pass

def make_engine(url: str):
    if url.startswith('sqlite'):
        engine = create_engine(url, connect_args={'check_same_thread': False})
        @event.listens_for(engine, 'connect')
        def foreign_keys(connection, _):
            connection.execute('PRAGMA foreign_keys=ON')
        return engine
    # PGlite's socket shares one PostgreSQL backend across serial clients.
    # Disable named prepared statements so reconnects cannot reuse another client's names.
    return create_engine(url, pool_pre_ping=True, pool_size=1, max_overflow=0, connect_args={'prepare_threshold': None, 'connect_timeout': 10})

engine = make_engine(settings.database_url)
SessionLocal = sessionmaker(engine, expire_on_commit=False)

def get_db():
    with SessionLocal() as db:
        yield db
