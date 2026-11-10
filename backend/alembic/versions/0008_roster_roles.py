"""Captain and starters per roster link; removed athletes free their jersey number."""
from alembic import op
import sqlalchemy as sa

revision='0008'
down_revision='0007'
branch_labels=None
depends_on=None

ACTIVE_JERSEY="source_id IS NULL AND number IS NOT NULL AND status <> 'desligado'"
ANY_JERSEY='source_id IS NULL AND number IS NOT NULL'


def upgrade():
    with op.batch_alter_table('athletes') as batch:
        batch.add_column(sa.Column('is_captain',sa.Boolean(),nullable=False,server_default=sa.false()))
        batch.add_column(sa.Column('is_starter',sa.Boolean(),nullable=False,server_default=sa.false()))
    op.drop_index('manual_jersey_unique','athletes')
    op.create_index('manual_jersey_unique','athletes',['team_id','season','number'],unique=True,postgresql_where=sa.text(ACTIVE_JERSEY),sqlite_where=sa.text(ACTIVE_JERSEY))


def downgrade():
    if op.get_bind().execute(sa.text("SELECT count(*) FROM athletes WHERE status='desligado'")).scalar():
        raise RuntimeError('Reinsert or delete athletes removed from their teams before downgrading.')
    op.drop_index('manual_jersey_unique','athletes')
    op.create_index('manual_jersey_unique','athletes',['team_id','season','number'],unique=True,postgresql_where=sa.text(ANY_JERSEY),sqlite_where=sa.text(ANY_JERSEY))
    with op.batch_alter_table('athletes') as batch:
        batch.drop_column('is_starter')
        batch.drop_column('is_captain')
