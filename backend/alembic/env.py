from alembic import context
from app.db import Base, engine
from app import models
config = context.config

if context.is_offline_mode():
    context.configure(url=str(engine.url), target_metadata=Base.metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    from contextlib import nullcontext
    supplied = config.attributes.get('connection')
    with (nullcontext(supplied) if supplied is not None else engine.connect()) as connection:
        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()
