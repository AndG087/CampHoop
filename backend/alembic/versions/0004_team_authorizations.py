"""Explicit consent for local fixtures and competition enrollment."""
from alembic import op
import sqlalchemy as sa
revision='0004'
down_revision='0003'
branch_labels=None
depends_on=None

def upgrade():
    op.create_table('team_authorizations',
        sa.Column('id',sa.String(100),primary_key=True),
        sa.Column('team_id',sa.String(100),sa.ForeignKey('teams.id'),nullable=False),
        sa.Column('season',sa.String(12),nullable=False),
        sa.Column('kind',sa.String(20),nullable=False),
        sa.Column('resource',sa.String(220),nullable=False),
        sa.UniqueConstraint('team_id','season','kind','resource',name='team_authorization_unique'))
    op.create_index('ix_team_authorizations_team_id','team_authorizations',['team_id'])

def downgrade():
    op.drop_index('ix_team_authorizations_team_id','team_authorizations')
    op.drop_table('team_authorizations')
