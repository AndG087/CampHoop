from dataclasses import replace
from datetime import timedelta
import re
import pytest
from sqlalchemy import select
from app.account_utils import now
from app.mail_delivery import decrypt,deliver_pending
from app.models import AccountToken, AuthSession, Club, ClubInvitation, ClubMember, MailMessage, Notification, User
from app.config import settings
from conftest import login

PASSWORD='test-account-password-2026!'

@pytest.fixture(autouse=True)
def account_settings(monkeypatch,tmp_path):
    local=replace(settings,data_dir=tmp_path,mail_transport='capture')
    for module in ['app.accounts','app.mail_delivery']:monkeypatch.setattr(module+'.settings',local)

def mail_token(db,email,subject):
    with db() as s:
        messages=list(s.scalars(select(MailMessage).where(MailMessage.recipient==email).order_by(MailMessage.created_at.desc())))
        body=next(decrypt(m.encrypted_body) for m in messages if subject in m.subject)
    return re.search(r'#token=([\w-]+)',body)[1]

def signup(client,db,email='owner@example.test',verify=True):
    client.post('/api/auth/logout')
    response=client.post('/api/auth/register',json={'email':email,'name':email.split('@')[0].title(),'password':PASSWORD})
    assert response.status_code==201,response.text
    if verify:assert client.post('/api/auth/verify',json={'token':mail_token(db,email,'Confirme')}).status_code==200
    return response.json()['id']

def club(client,name='Clube real'):
    response=client.post('/api/clubs',json={'name':name,'shortName':'CR','city':'Campinas'})
    assert response.status_code==200,response.text
    return response.json()['id']

def team(client,club_id,name='Equipe real'):
    response=client.post('/api/management/teams',json={'name':name,'clubId':club_id,'category':'Sub-17','gender':'Feminino','coach':'Responsável','season':'2026/27'})
    assert response.status_code==200,response.text
    return response.json()['id']

def sign_in(client,email):
    assert client.post('/api/auth/login',json={'email':email,'password':PASSWORD}).status_code==200

def test_registration_verification_and_club_ownership(client,db):
    id=signup(client,db,verify=False)
    assert client.get('/api/auth/me').json()['isDemo'] is False
    assert client.post('/api/clubs',json={'name':'Clube real','shortName':'CR','city':'Campinas'}).status_code==403
    token=mail_token(db,'owner@example.test','Confirme')
    assert client.post('/api/auth/verify',json={'token':token}).status_code==200
    assert client.post('/api/auth/verify',json={'token':token}).status_code==400
    cid=club(client);tid=team(client,cid)
    me=client.get('/api/auth/me').json()
    assert me['emailVerified'] and me['role']=='tecnico' and me['clubs'][0]['id']==cid
    assert tid in me['managedTeamIds'] and 'Conta de teste' not in me['context']
    with db() as s:
        assert s.get(ClubMember,(cid,id)).role=='owner'
        assert s.get(Club,cid).owner_id==id
        assert all(t.token_hash!=token for t in s.scalars(select(AccountToken)))

def test_registration_cannot_self_assign_roles_or_use_demo_domain(client):
    for data in [{'email':'attacker@example.test','role':'estatistico'},{'email':'new@camphoop.demo'}]:
        response=client.post('/api/auth/register',json={'name':'Test User','password':PASSWORD,**data})
        assert response.status_code==422

def test_confirmation_requires_the_registered_account_and_cannot_validate_a_pre_registered_identity(client,db):
    signup(client,db,verify=False)
    raw=mail_token(db,'owner@example.test','Confirme')
    client.post('/api/auth/logout')
    assert client.post('/api/auth/verify',json={'token':raw}).status_code==401
    signup(client,db,'different@example.test')
    assert client.post('/api/auth/verify',json={'token':raw}).status_code==403
    sign_in(client,'owner@example.test')
    assert client.get('/api/auth/me').json()['emailVerified'] is False
    assert client.post('/api/auth/verify',json={'token':raw}).status_code==200

def test_password_recovery_generic_response_single_use_and_session_revocation(client,db):
    uid=signup(client,db)
    known=client.post('/api/auth/password/forgot',json={'email':'owner@example.test'})
    missing=client.post('/api/auth/password/forgot',json={'email':'missing@example.test'})
    assert known.status_code==missing.status_code==202 and known.json()==missing.json()
    raw=mail_token(db,'owner@example.test','Redefinir')
    assert raw not in known.text
    assert client.post('/api/auth/password/reset',json={'token':raw,'password':'new-password-strong-2026!'}).status_code==200
    assert client.get('/api/auth/me').json() is None
    assert client.post('/api/auth/password/reset',json={'token':raw,'password':PASSWORD}).status_code==400
    assert client.post('/api/auth/login',json={'email':'owner@example.test','password':PASSWORD}).status_code==401
    assert client.post('/api/auth/login',json={'email':'owner@example.test','password':'new-password-strong-2026!'}).status_code==200
    with db() as s:assert len(list(s.scalars(select(AuthSession).where(AuthSession.user_id==uid))))==1

def test_expired_and_superseded_recovery_links_are_rejected(client,db):
    signup(client,db)
    client.post('/api/auth/password/forgot',json={'email':'owner@example.test'});old=mail_token(db,'owner@example.test','Redefinir')
    client.post('/api/auth/password/forgot',json={'email':'owner@example.test'});new=mail_token(db,'owner@example.test','Redefinir')
    assert old!=new
    assert client.post('/api/auth/password/reset',json={'token':old,'password':PASSWORD}).status_code==400
    with db() as s:
        for token in s.scalars(select(AccountToken).where(AccountToken.purpose=='reset')):token.expires_at=now()-timedelta(minutes=1)
        s.commit()
    assert client.post('/api/auth/password/reset',json={'token':new,'password':PASSWORD}).status_code==400

def test_demo_accounts_do_not_receive_recovery_mail(client,db):
    login(client,'tecnico')
    assert client.post('/api/auth/verification').status_code==403
    assert client.post('/api/auth/password/forgot',json={'email':'tecnico@test.local'}).status_code==202
    with db() as s:assert list(s.scalars(select(MailMessage)))==[]

def test_invite_acceptance_is_bound_to_verified_email_and_club(client,db):
    owner=signup(client,db);cid=club(client);tid=team(client,cid)
    invitation=client.post(f'/api/clubs/{cid}/invitations',json={'email':'coach@example.test','role':'tecnico','teamId':tid})
    assert invitation.status_code==201,invitation.text
    raw=mail_token(db,'coach@example.test','Convite')
    assert raw not in invitation.text and 'token' not in invitation.json()
    assert client.post('/api/invitations/preview',json={'token':raw}).json()['club']=='Clube real'
    signup(client,db,'stranger@example.test')
    assert client.get('/api/clubs/'+cid).status_code==403
    assert client.post('/api/invitations/accept',json={'token':raw}).status_code==403
    uid=signup(client,db,'coach@example.test',verify=False)
    assert client.post('/api/invitations/accept',json={'token':raw}).status_code==403
    client.post('/api/auth/verify',json={'token':mail_token(db,'coach@example.test','Confirme')})
    accepted=client.post('/api/invitations/accept',json={'token':raw})
    assert accepted.status_code==200,accepted.text
    assert client.get('/api/auth/me').json()['role']=='tecnico'
    assert tid in client.get('/api/auth/me').json()['teamIds']
    assert client.get('/api/clubs/'+cid).json()['owner'] is False
    assert client.post('/api/invitations/accept',json={'token':raw}).status_code==400
    assert client.post(f'/api/clubs/{cid}/invitations',json={'email':'bad@example.test','role':'tecnico','teamId':tid}).status_code==403
    with db() as s:assert s.get(ClubMember,(cid,uid)).role=='tecnico'

def test_revocation_and_expiry_prevent_invite_acceptance(client,db):
    signup(client,db);cid=club(client);tid=team(client,cid)
    inv=client.post(f'/api/clubs/{cid}/invitations',json={'email':'coach@example.test','role':'tecnico','teamId':tid}).json()
    raw=mail_token(db,'coach@example.test','Convite')
    assert client.delete(f'/api/clubs/{cid}/invitations/{inv["id"]}').status_code==200
    signup(client,db,'coach@example.test')
    assert client.post('/api/invitations/accept',json={'token':raw}).status_code==400

def test_member_revocation_removes_private_access_and_reassigns_created_teams(client,db):
    owner=signup(client,db);cid=club(client);tid=team(client,cid)
    inv=client.post(f'/api/clubs/{cid}/invitations',json={'email':'coach@example.test','role':'tecnico','teamId':tid}).json()
    uid=signup(client,db,'coach@example.test')
    assert client.post('/api/invitations/accept',json={'invitationId':inv['id']}).status_code==200
    owned=team(client,cid,'Equipe criada pelo convidado')
    assert client.get('/api/tactics/'+tid+'?season=2026/27').status_code==200
    sign_in(client,'owner@example.test')
    assert owned in client.get('/api/auth/me').json()['managedTeamIds']
    assert client.delete(f'/api/clubs/{cid}/members/{uid}').status_code==200
    sign_in(client,'coach@example.test')
    assert tid not in client.get('/api/auth/me').json()['teamIds']
    assert owned not in client.get('/api/auth/me').json()['managedTeamIds']
    assert client.get('/api/tactics/'+tid+'?season=2026/27').status_code==403
    assert client.get('/api/clubs/'+cid).status_code==403
    with db() as s:
        from app.models import Team
        assert s.get(Team,owned).owner_id==owner

def test_notifications_are_private_and_read_state_is_persistent(client,db):
    uid=signup(client,db)
    inbox=client.get('/api/notifications').json();assert inbox['unread']>=2
    id=inbox['items'][0]['id']
    assert client.put('/api/notifications/'+id+'/read').status_code==200
    assert client.get('/api/notifications/summary').json()['unread']==inbox['unread']-1
    signup(client,db,'other@example.test')
    assert client.put('/api/notifications/'+id+'/read').status_code==404
    assert client.get('/api/notifications?cursor='+id).status_code==404
    assert all(n['id']!=id for n in client.get('/api/notifications').json()['items'])
    assert client.put('/api/notifications/read-all').status_code==200
    assert client.get('/api/notifications/summary').json()['unread']==0

def test_mail_outbox_is_encrypted_and_capture_delivery_is_local(client,db,account_settings,tmp_path):
    signup(client,db)
    with db() as s:
        row=s.scalar(select(MailMessage));assert 'http' not in row.encrypted_body and '#token=' not in row.encrypted_body
        deliver_pending(s)
        assert s.get(MailMessage,row.id).status=='captured'
    assert list(tmp_path.glob('mailbox/*.json'))

@pytest.mark.parametrize('method,path',[
    ('get','/api/auth/providers'),
    ('get','/api/auth/google/start'),
    ('get','/api/auth/google/callback'),
    ('delete','/api/auth/gmail'),
])
def test_external_identity_routes_are_no_longer_exposed(client,method,path):
    assert getattr(client,method)(path,follow_redirects=False).status_code==404


def test_account_uses_password_without_external_connection_fields(client,db):
    signup(client,db)
    account=client.get('/api/account').json()
    assert account['hasPassword'] and account['emailVerified']
    assert account['mail']=={'transport':'capture'}
    assert 'googleLinked' not in account and 'canConnectGmail' not in account


def test_auto_delivery_uses_optional_smtp_and_otherwise_local_capture(client,db,monkeypatch):
    from app import mail_delivery
    local=replace(mail_delivery.settings,mail_transport='auto',smtp_host='',smtp_user='',smtp_password='')
    monkeypatch.setattr(mail_delivery,'settings',local)
    with db() as s:
        assert mail_delivery.transport(s)=='capture'
        monkeypatch.setattr(mail_delivery,'settings',replace(local,environment='production'))
        assert mail_delivery.transport(s)=='disabled'
        monkeypatch.setattr(mail_delivery,'settings',replace(local,smtp_host='smtp.example.invalid',smtp_user='sender@example.invalid',smtp_password='test-smtp-password'))
        assert mail_delivery.transport(s)=='smtp'


def test_smtp_delivery_does_not_require_an_external_identity_provider(client,db,monkeypatch):
    from app import mail_delivery
    signup(client,db)
    monkeypatch.setattr(mail_delivery,'settings',replace(mail_delivery.settings,mail_transport='auto',smtp_host='smtp.example.invalid',smtp_port=465,smtp_user='sender@example.invalid',smtp_password='test-smtp-password'))
    sent=[]
    class SMTP:
        def __init__(self,host,port,timeout):assert (host,port)==('smtp.example.invalid',465)
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def login(self,user,password):assert (user,password)==('sender@example.invalid','test-smtp-password')
        def send_message(self,message):sent.append(message)
    monkeypatch.setattr(mail_delivery.smtplib,'SMTP_SSL',SMTP)
    with db() as s:
        row=s.scalar(select(MailMessage));row.recipient='recipient@example.invalid';s.commit()
        mail_delivery.deliver_pending(s)
        assert s.get(MailMessage,row.id).status=='sent'
    assert len(sent)==1 and sent[0]['From']=='sender@example.invalid'
    assert '#token=' in sent[0].get_content()


def test_real_statistics_operator_is_scoped_to_assigned_team_and_demo_cannot_operate_real_games(client,db):
    signup(client,db);cid=club(client);a=team(client,cid);b=team(client,cid,'Adversário')
    from test_management import athlete_body
    for tid in [a,b]:assert client.post('/api/management/athletes',json=athlete_body(tid)).status_code==200
    game=client.post('/api/games?season=2026/27',json={'competitionId':None,'homeTeamId':a,'awayTeamId':b,'date':'2026-11-12','time':'18:00','venue':'Quadra'}).json()['id']
    invitation=client.post(f'/api/clubs/{cid}/invitations',json={'email':'stats@example.test','role':'estatistico','teamId':a}).json()
    login(client,'estatistico')
    assert client.post(f'/api/matches/{game}/start',json={'revision':0}).status_code==403
    uid=signup(client,db,'stats@example.test')
    assert client.post('/api/invitations/accept',json={'invitationId':invitation['id']}).status_code==200
    assert client.post('/api/matches/g/start',json={'revision':0}).status_code==403
    assert client.post(f'/api/matches/{game}/start',json={'revision':0}).status_code==200
    assert client.get('/api/auth/me').json()['operatorTeamIds']==[a]
    sign_in(client,'owner@example.test')
    assert client.delete(f'/api/clubs/{cid}/members/{uid}').status_code==200
    sign_in(client,'stats@example.test')
    rev=client.get(f'/api/matches/{game}').json()['state']['revision']
    assert client.post(f'/api/matches/{game}/undo',json={'revision':rev}).status_code==403

def test_removed_athlete_keeps_own_history_but_not_club_training_access(client,db):
    signup(client,db);cid=club(client);tid=team(client,cid)
    from test_management import athlete_body
    athlete=client.post('/api/management/athletes',json=athlete_body(tid)).json()['id']
    invitation=client.post(f'/api/clubs/{cid}/invitations',json={'email':'athlete@example.test','role':'atleta','teamId':tid,'athleteId':athlete}).json()
    uid=signup(client,db,'athlete@example.test')
    assert client.post('/api/invitations/accept',json={'invitationId':invitation['id']}).status_code==200
    assert client.get('/api/training/slots?teamId='+tid).status_code==200
    sign_in(client,'owner@example.test');assert client.delete(f'/api/clubs/{cid}/members/{uid}').status_code==200
    sign_in(client,'athlete@example.test')
    assert client.get('/api/training/slots?teamId='+tid).status_code==403
    assert client.get('/api/athletes/'+athlete).json()['private']['birthDate']=='2009-03-14'

def test_invitation_cannot_use_a_team_from_another_club(client,db):
    signup(client,db);a=club(client)
    signup(client,db,'other@example.test');b=club(client,'Outro clube');tid=team(client,b)
    sign_in(client,'owner@example.test')
    assert client.post(f'/api/clubs/{a}/invitations',json={'email':'guest@example.test','role':'tecnico','teamId':tid}).status_code==403

def test_expired_invitation_and_role_mismatch_do_not_change_account(client,db):
    signup(client,db);cid=club(client);tid=team(client,cid)
    invitation=client.post(f'/api/clubs/{cid}/invitations',json={'email':'coach@example.test','role':'tecnico','teamId':tid}).json()
    uid=signup(client,db,'coach@example.test')
    with db() as s:s.get(ClubInvitation,invitation['id']).expires_at=now()-timedelta(seconds=1);s.commit()
    assert client.post('/api/invitations/accept',json={'invitationId':invitation['id']}).status_code==400
    assert client.get('/api/auth/me').json()['role']=='basico'

def test_mail_delivery_failure_retries_without_losing_or_exposing_body(client,db,monkeypatch):
    signup(client,db)
    from app import mail_delivery
    monkeypatch.setattr(mail_delivery,'settings',replace(mail_delivery.settings,mail_transport='smtp',smtp_user='sender@example.test',smtp_password='test-smtp-password'))
    def unavailable(*args,**kwargs):raise RuntimeError('test-smtp-password must not be persisted in an error')
    monkeypatch.setattr(mail_delivery.smtplib,'SMTP_SSL',unavailable)
    # Use a non-.test reserved recipient to exercise the transport, but intercept the connection.
    with db() as s:
        row=s.scalar(select(MailMessage));row.recipient='sender@example.invalid';s.commit()
        mail_delivery.deliver_pending(s)
        assert s.get(MailMessage,row.id).status=='failed' and s.get(MailMessage,row.id).attempts==1
        assert s.get(MailMessage,row.id).error_code=='DELIVERY_FAILED'
        mail_delivery.deliver_pending(s);assert s.get(MailMessage,row.id).attempts==1
        row.attempted_at=now()-timedelta(minutes=10);row.status='sending';s.commit()
        monkeypatch.setattr(mail_delivery,'settings',replace(mail_delivery.settings,mail_transport='capture'))
        mail_delivery.deliver_pending(s)
        assert s.get(MailMessage,row.id).status=='captured' and s.get(MailMessage,row.id).attempts==2

def test_removed_organizer_cannot_continue_scheduling_a_club_competition(client,db):
    signup(client,db);cid=club(client);a=team(client,cid);b=team(client,cid,'Equipe B')
    invitation=client.post(f'/api/clubs/{cid}/invitations',json={'email':'organizer@example.test','role':'organizador'}).json()
    uid=signup(client,db,'organizer@example.test')
    assert client.post('/api/invitations/accept',json={'invitationId':invitation['id']}).status_code==200
    response=client.post('/api/competitions?season=2026/27',json={'name':'Copa do clube','divisions':[{'category':'Sub-17','gender':'Feminino'}]})
    assert response.status_code==200,response.text
    competition=response.json()
    sign_in(client,'owner@example.test')
    for tid in [a,b]:assert client.post(f'/api/management/teams/{tid}/authorizations',json={'season':'2026/27','kind':'enroll','competitionId':competition}).status_code==200
    sign_in(client,'organizer@example.test')
    assert client.post(f'/api/competitions/{competition}/enroll',json={'ids':[a,b]}).status_code==200
    body={'competitionId':competition,'homeTeamId':a,'awayTeamId':b,'date':'2026-11-12','time':'18:00','venue':'Quadra'}
    assert client.post('/api/games?season=2026/27',json=body).status_code==200
    sign_in(client,'owner@example.test');assert client.delete(f'/api/clubs/{cid}/members/{uid}').status_code==200
    sign_in(client,'organizer@example.test')
    response=client.post('/api/games?season=2026/27',json={**body,'date':'2026-11-13'})
    assert response.status_code==403 and 'vínculo de organizador' in response.text
    assert competition not in client.get('/api/auth/me').json()['competitionIds']
