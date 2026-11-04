"""Separate roster snapshots, games and private tactics by season."""
from alembic import op
import sqlalchemy as sa
revision='0002'
down_revision='0001'
branch_labels=None
depends_on=None

def upgrade():
    op.add_column('athletes',sa.Column('season',sa.String(12),nullable=True))
    op.create_index('ix_athletes_season','athletes',['season'])
    op.add_column('games',sa.Column('season',sa.String(12),nullable=True))
    op.create_index('ix_games_season','games',['season'])
    op.add_column('games',sa.Column('source_status',sa.String(40),nullable=True))
    op.execute("UPDATE athletes SET season='2024/25' WHERE source_id IS NOT NULL")
    op.execute("UPDATE games SET season=competitions.season FROM competitions WHERE games.competition_id=competitions.id")
    op.execute("UPDATE games SET season=(EXTRACT(YEAR FROM date)::int - CASE WHEN EXTRACT(MONTH FROM date)<7 THEN 1 ELSE 0 END)::text || '/' || RIGHT((EXTRACT(YEAR FROM date)::int + CASE WHEN EXTRACT(MONTH FROM date)>=7 THEN 1 ELSE 0 END)::text,2) WHERE season IS NULL")
    op.add_column('tactical_plays',sa.Column('season',sa.String(12),nullable=False,server_default='2024/25'))
    op.create_index('ix_tactical_plays_season','tactical_plays',['season'])
    op.drop_constraint('play_name_unique','tactical_plays',type_='unique')
    op.create_unique_constraint('play_name_unique','tactical_plays',['team_id','season','normalized_name'])
    op.alter_column('tactical_plays','season',server_default=None)
    op.add_column('tactics_drafts',sa.Column('season',sa.String(12),nullable=False,server_default='2024/25'))
    op.drop_constraint('tactics_drafts_pkey','tactics_drafts',type_='primary')
    op.create_primary_key('tactics_drafts_pkey','tactics_drafts',['season','user_id','team_id'])
    op.alter_column('tactics_drafts','season',server_default=None)

def downgrade():
    # A downgrade must not silently merge private drafts or roster snapshots.
    count=op.get_bind().execute(sa.text("SELECT count(*) FROM tactics_drafts WHERE season <> '2024/25'")).scalar()
    if count:
        raise RuntimeError('Archive non-2024/25 tactical drafts before downgrading.')
    op.drop_constraint('tactics_drafts_pkey','tactics_drafts',type_='primary')
    op.create_primary_key('tactics_drafts_pkey','tactics_drafts',['user_id','team_id'])
    op.drop_column('tactics_drafts','season')
    op.drop_constraint('play_name_unique','tactical_plays',type_='unique')
    op.create_unique_constraint('play_name_unique','tactical_plays',['team_id','normalized_name'])
    op.drop_index('ix_tactical_plays_season','tactical_plays')
    op.drop_column('tactical_plays','season')
    op.drop_column('games','source_status')
    op.drop_index('ix_games_season','games')
    op.drop_column('games','season')
    op.drop_index('ix_athletes_season','athletes')
    op.drop_column('athletes','season')
