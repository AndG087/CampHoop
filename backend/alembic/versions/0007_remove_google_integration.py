"""Remove external sign-in and Gmail authorization; preserve accounts and mail."""
from alembic import op
import sqlalchemy as sa

revision='0007'
down_revision='0006'
branch_labels=None
depends_on=None


def upgrade():
    op.drop_table('oauth_attempts')
    op.drop_table('google_identities')
    op.drop_table('mail_integrations')


def downgrade():
    # Authorization data is intentionally not restored by a downgrade.
    op.create_table('google_identities',
        sa.Column('subject',sa.String(255),primary_key=True),
        sa.Column('user_id',sa.String(100),sa.ForeignKey('users.id',ondelete='CASCADE'),nullable=False,unique=True))
    op.create_table('oauth_attempts',
        sa.Column('state_hash',sa.String(64),primary_key=True),
        sa.Column('nonce_hash',sa.String(64),nullable=False),
        sa.Column('verifier',sa.String(150),nullable=False),
        sa.Column('mode',sa.String(15),nullable=False),
        sa.Column('user_id',sa.String(100),sa.ForeignKey('users.id',ondelete='CASCADE')),
        sa.Column('expires_at',sa.DateTime(timezone=True),nullable=False),
        sa.Column('consumed_at',sa.DateTime(timezone=True)))
    op.create_table('mail_integrations',
        sa.Column('id',sa.String(20),primary_key=True),
        sa.Column('user_id',sa.String(100),sa.ForeignKey('users.id'),nullable=False),
        sa.Column('email',sa.String(254),nullable=False),
        sa.Column('encrypted_refresh',sa.Text(),nullable=False))
