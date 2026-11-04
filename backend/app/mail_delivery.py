"""Encrypted transactional mail outbox; delivery never logs bodies or credentials."""
import base64
import json
import os
import smtplib
import ssl
from datetime import timedelta
from email.message import EmailMessage
from uuid import uuid4
from cryptography.fernet import Fernet
import httpx
from sqlalchemy import select
from .config import settings
from .models import MailIntegration, MailMessage, Notification, User
from .account_utils import aware, now

def cipher():
    key=settings.mail_encryption_key.encode()
    if not key:
        if settings.environment!='development':raise RuntimeError('MAIL_ENCRYPTION_KEY_REQUIRED')
        path=settings.data_dir/'mail-encryption.key'
        path.parent.mkdir(parents=True,exist_ok=True)
        if not path.exists():
            try:
                with path.open('xb') as file:file.write(Fernet.generate_key())
            except FileExistsError:pass
        key=path.read_bytes().strip()
    return Fernet(key)

def encrypt(value):return cipher().encrypt(value.encode()).decode()
def decrypt(value):return cipher().decrypt(value.encode()).decode()

def queue_mail(db,email,subject,body,user_id=None,club_id=None):
    row=MailMessage(id=uuid4().hex,user_id=user_id,club_id=club_id,recipient=email,subject=subject[:150],encrypted_body=encrypt(body),created_at=now(),status='pending',attempts=0)
    db.add(row)
    return row

def notify(db,user_id,title,body,href='/notificacoes',club_id=None,email=True):
    row=Notification(id=uuid4().hex,user_id=user_id,club_id=club_id,title=title,body=body,href=href,created_at=now())
    db.add(row)
    user=db.get(User,user_id)
    if email and user and not user.is_demo and user.email_verified and user.email_notifications:
        queue_mail(db,user.email,title,body+'\n\n'+settings.app_url+href,user.id,club_id)
    return row

def transport(db):
    mode=settings.mail_transport
    if mode=='auto':
        if db.get(MailIntegration,'gmail'):return 'gmail'
        if settings.smtp_user and settings.smtp_password:return 'smtp'
        return 'capture' if settings.environment=='development' else 'disabled'
    return mode

def gmail_access(refresh):
    response=httpx.post('https://oauth2.googleapis.com/token',data={'client_id':settings.google_client_id,'client_secret':settings.google_client_secret,'refresh_token':refresh,'grant_type':'refresh_token'},timeout=12)
    response.raise_for_status()
    return response.json()['access_token']

def deliver_one(db,id):
    row=db.scalar(select(MailMessage).where(MailMessage.id==id).with_for_update(skip_locked=True))
    if not row or row.status not in ('pending','failed') or row.attempts>=3:return
    mode=transport(db)
    if settings.environment=='development' and row.recipient.endswith('.test'):mode='capture'
    integration=db.get(MailIntegration,'gmail') if mode=='gmail' else None
    refresh=decrypt(integration.encrypted_refresh) if integration else None
    sender=integration.email if integration else settings.smtp_user
    email,subject,body=row.recipient,row.subject,decrypt(row.encrypted_body)
    row.status='sending';row.attempts+=1;row.attempted_at=now();db.commit() # Release the database during network I/O.
    status='sent';error=None
    try:
        if mode=='capture' and settings.environment=='development':
            path=settings.data_dir/'mailbox';path.mkdir(parents=True,exist_ok=True)
            (path/(id+'.json')).write_text(json.dumps({'to':email,'subject':subject,'body':body},ensure_ascii=False),encoding='utf8')
            status='captured'
        elif mode in ('smtp','gmail'):
            message=EmailMessage();message['From']=sender;message['To']=email;message['Subject']=subject;message.set_content(body)
            if mode=='gmail':
                encoded=base64.urlsafe_b64encode(message.as_bytes()).decode()
                response=httpx.post('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',headers={'Authorization':'Bearer '+gmail_access(refresh)},json={'raw':encoded},timeout=12)
                response.raise_for_status()
            else:
                smtp_class=smtplib.SMTP_SSL if settings.smtp_port==465 else smtplib.SMTP
                with smtp_class(settings.smtp_host,settings.smtp_port,timeout=12) as smtp:
                    if settings.smtp_port!=465:smtp.starttls(context=ssl.create_default_context())
                    smtp.login(settings.smtp_user,settings.smtp_password);smtp.send_message(message)
        else:raise RuntimeError('MAIL_NOT_CONFIGURED')
    except Exception:
        status='failed';error='DELIVERY_FAILED'
    row=db.get(MailMessage,id)
    if row:row.status=status;row.sent_at=now() if status in ('sent','captured') else None;row.error_code=error;db.commit()

def deliver_pending(db,limit=10):
    from .models import RateLimit
    from sqlalchemy import delete
    db.execute(delete(RateLimit).where(RateLimit.expires_at<now()))
    rows=list(db.scalars(select(MailMessage).where(MailMessage.status.in_(['pending','failed','sending']),MailMessage.attempts<3).order_by(MailMessage.created_at).limit(limit)))
    ids=[]
    for row in rows:
        if row.status=='sending':
            if row.attempted_at and aware(row.attempted_at)>now()-timedelta(minutes=5):continue
            row.status='failed'
        if row.status=='failed' and row.attempted_at and aware(row.attempted_at)>now()-timedelta(seconds=30*2**max(0,row.attempts-1)):continue
        ids.append(row.id)
    db.commit()
    for id in ids:deliver_one(db,id)

def mail_status(db):
    return {'transport':transport(db),'gmailConnected':bool(db.get(MailIntegration,'gmail'))}
