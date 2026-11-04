"""Bounded retries and recovery of interrupted mail delivery."""
from alembic import op
import sqlalchemy as sa
revision='0006'
down_revision='0005'
branch_labels=None
depends_on=None

def upgrade():
    op.add_column('mail_messages',sa.Column('attempted_at',sa.DateTime(timezone=True),nullable=True))

def downgrade():
    op.drop_column('mail_messages','attempted_at')
