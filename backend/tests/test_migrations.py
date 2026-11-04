"""Exercise the removal against real PostgreSQL migration state and existing rows."""
import os
from pathlib import Path
import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from test_accounts import signup, club


@pytest.mark.skipif(not os.getenv('POSTGRES_TEST_URL'),reason='Requires isolated PostgreSQL migration schema')
def test_remove_external_authorizations_preserves_account_club_and_messages(client,db):
    user_id=signup(client,db)
    club_id=club(client)
    with db() as session:
        connection=session.get_bind()
        config=Config(str(Path(__file__).resolve().parents[1]/'alembic.ini'))
        config.attributes['connection']=connection
        command.downgrade(config,'0006')
        connection.commit()
        connection.execute(sa.text('INSERT INTO google_identities (subject,user_id) VALUES (:subject,:user)'),{'subject':'old-identity','user':user_id})
        connection.execute(sa.text('INSERT INTO mail_integrations (id,user_id,email,encrypted_refresh) VALUES (:id,:user,:email,:refresh)'),{'id':'gmail','user':user_id,'email':'owner@example.test','refresh':'old-encrypted-authorization'})
        connection.execute(sa.text("INSERT INTO oauth_attempts (state_hash,nonce_hash,verifier,mode,expires_at) VALUES ('old-state','old-nonce','old-verifier','login',CURRENT_TIMESTAMP)"))
        before={table:connection.execute(sa.text(f'SELECT count(*) FROM {table}')).scalar() for table in ['users','clubs','club_members','notifications','mail_messages']}
        connection.commit()
        command.upgrade(config,'head')
        connection.commit()
        assert not {'google_identities','oauth_attempts','mail_integrations'} & set(sa.inspect(connection).get_table_names())
        for table,count in before.items():
            assert connection.execute(sa.text(f'SELECT count(*) FROM {table}')).scalar()==count
    assert client.get('/api/account').json()['id']==user_id
    assert client.get('/api/clubs/'+club_id).status_code==200
