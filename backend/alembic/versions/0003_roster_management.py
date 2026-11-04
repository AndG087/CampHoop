"""Owned teams and local roster snapshots, preserving imported records."""
from alembic import op
import sqlalchemy as sa
revision='0003'
down_revision='0002'
branch_labels=None
depends_on=None

def upgrade():
    op.add_column('clubs',sa.Column('owner_id',sa.String(100),nullable=True))
    op.create_foreign_key('club_owner_fk','clubs','users',['owner_id'],['id'])
    op.create_index('ix_clubs_owner_id','clubs',['owner_id'])
    op.add_column('teams',sa.Column('name',sa.String(100),nullable=True))
    op.add_column('teams',sa.Column('owner_id',sa.String(100),nullable=True))
    op.create_foreign_key('team_owner_fk','teams','users',['owner_id'],['id'])
    op.create_index('ix_teams_owner_id','teams',['owner_id'])
    op.create_table('team_seasons',sa.Column('team_id',sa.String(100),sa.ForeignKey('teams.id'),primary_key=True),sa.Column('season',sa.String(12),primary_key=True),sa.Column('name',sa.String(100),nullable=False),sa.Column('category',sa.String(30),nullable=False),sa.Column('gender',sa.String(20),nullable=False),sa.Column('coach',sa.String(120),nullable=False),sa.Column('revision',sa.Integer(),nullable=False))
    op.create_table('coach_teams',sa.Column('user_id',sa.String(100),sa.ForeignKey('users.id'),primary_key=True),sa.Column('team_id',sa.String(100),sa.ForeignKey('teams.id'),primary_key=True))
    op.execute("INSERT INTO coach_teams (user_id,team_id) SELECT id,team_id FROM users WHERE role='tecnico' AND team_id IS NOT NULL")
    op.add_column('athletes',sa.Column('person_id',sa.String(100),nullable=True))
    op.add_column('athletes',sa.Column('revision',sa.Integer(),nullable=False,server_default='1'))
    op.alter_column('athletes','revision',server_default=None)
    op.create_index('ix_athletes_person_id','athletes',['person_id'])
    op.create_unique_constraint('athlete_person_season_unique','athletes',['person_id','season'])
    op.create_index('manual_jersey_unique','athletes',['team_id','season','number'],unique=True,postgresql_where=sa.text('source_id IS NULL AND number IS NOT NULL'))

def downgrade():
    if op.get_bind().execute(sa.text('SELECT count(*) FROM team_seasons')).scalar():
        raise RuntimeError('Archive local teams and roster links before downgrading.')
    op.drop_index('manual_jersey_unique','athletes')
    op.drop_constraint('athlete_person_season_unique','athletes',type_='unique')
    op.drop_index('ix_athletes_person_id','athletes')
    op.drop_column('athletes','revision')
    op.drop_column('athletes','person_id')
    op.drop_table('coach_teams')
    op.drop_table('team_seasons')
    op.drop_index('ix_teams_owner_id','teams')
    op.drop_constraint('team_owner_fk','teams',type_='foreignkey')
    op.drop_column('teams','owner_id')
    op.drop_column('teams','name')
    op.drop_index('ix_clubs_owner_id','clubs')
    op.drop_constraint('club_owner_fk','clubs',type_='foreignkey')
    op.drop_column('clubs','owner_id')
