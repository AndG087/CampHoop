"""Server-side Google authorization code flow, with PKCE, nonce and cookie-bound state."""
import base64
from datetime import timedelta
from functools import partial
import logging
import secrets
from urllib.parse import urlencode
from uuid import uuid4
import httpx
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.id_token import verify_oauth2_token
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from .account_utils import aware, digest, new_token, now, require_verified
from .accounts import cookie
from .auth import COOKIE, optional_user, passwords, require_user
from .config import settings
from .db import get_db
from .mail_delivery import encrypt, decrypt, notify
from .models import AuthSession, GoogleIdentity, MailIntegration, OAuthAttempt, User

router=APIRouter(prefix='/api/auth',tags=['Google e Gmail'])
STATE_COOKIE='camphoop_google_state'
GMAIL_SCOPE='https://www.googleapis.com/auth/gmail.send'

class RedactOAuthQuery(logging.Filter):
    def filter(self,record):
        if isinstance(record.args,tuple) and len(record.args)>=3 and '/auth/google/' in str(record.args[2]):
            values=list(record.args);values[2]=str(values[2]).split('?')[0]+'?[redacted]';record.args=tuple(values)
        return True

logging.getLogger('uvicorn.access').addFilter(RedactOAuthQuery())

def enabled():return bool(settings.google_client_id and settings.google_client_secret)

@router.get('/providers')
def providers():
    return {'google':enabled(),'gmail':bool(enabled() and settings.gmail_sender),'localDelivery':settings.environment=='development' and settings.mail_transport in ('auto','capture')}

def gmail_allowed(user):
    require_verified(user)
    if not settings.gmail_sender or user.email!=settings.gmail_sender:raise HTTPException(403,'Somente a conta remetente configurada pode conectar o Gmail do aplicativo.')

@router.get('/google/start')
def start(mode:str=Query(default='login',pattern='^(login|link|gmail)$'),user:User|None=Depends(optional_user),db:Session=Depends(get_db)):
    if not enabled():raise HTTPException(503,'A entrada com Google ainda não foi configurada neste ambiente.')
    if mode!='login':
        if not user:raise HTTPException(401,'Entre na sua conta antes de conectar o Google.')
        require_verified(user)
        if mode=='gmail':gmail_allowed(user)
    elif user and not user.is_demo:
        raise HTTPException(409,'Você já entrou. Conecte o Google pela página Minha conta.')
    raw,nonce,verifier=new_token(),new_token(),secrets.token_urlsafe(64)
    challenge=base64.urlsafe_b64encode(__import__('hashlib').sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    db.add(OAuthAttempt(state_hash=digest(raw),nonce_hash=digest(nonce),verifier=verifier,mode=mode,user_id=user.id if mode!='login' else None,expires_at=now()+timedelta(minutes=10)))
    db.commit()
    values={'client_id':settings.google_client_id,'redirect_uri':settings.google_redirect_uri,'response_type':'code','scope':'openid email profile'+(' '+GMAIL_SCOPE if mode=='gmail' else ''),'state':raw,'nonce':nonce,'code_challenge':challenge,'code_challenge_method':'S256','prompt':'consent' if mode=='gmail' else 'select_account'}
    if mode=='gmail':values['access_type']='offline'
    response=RedirectResponse('https://accounts.google.com/o/oauth2/v2/auth?'+urlencode(values),status_code=302)
    response.set_cookie(STATE_COOKIE,raw,max_age=600,httponly=True,secure=settings.secure_cookie,samesite='lax',path='/api/auth/google')
    if mode=='login' and user:response.delete_cookie(COOKIE,path='/api')
    return response

def exchange(code,verifier):
    response=httpx.post('https://oauth2.googleapis.com/token',data={'client_id':settings.google_client_id,'client_secret':settings.google_client_secret,'redirect_uri':settings.google_redirect_uri,'grant_type':'authorization_code','code':code,'code_verifier':verifier},timeout=12)
    response.raise_for_status();tokens=response.json()
    claims=verify_oauth2_token(tokens['id_token'],partial(GoogleRequest(),timeout=12),settings.google_client_id)
    return tokens,claims

def redirect_error(code):
    response=RedirectResponse(settings.app_url+'/login?google='+code,status_code=302)
    response.delete_cookie(STATE_COOKIE,path='/api/auth/google')
    return response

@router.get('/google/callback')
def callback(request:Request,state:str=Query(default='',max_length=200),code:str=Query(default='',max_length=4096),error:str|None=Query(default=None,max_length=100),user:User|None=Depends(optional_user),db:Session=Depends(get_db)):
    browser=request.cookies.get(STATE_COOKIE,'')
    if not browser or not state or not secrets.compare_digest(browser,state):return redirect_error('invalid_state')
    row=db.scalar(select(OAuthAttempt).where(OAuthAttempt.state_hash==digest(state)).with_for_update())
    if not row or row.consumed_at or aware(row.expires_at)<=now():return redirect_error('expired')
    row.consumed_at=now();mode,user_id,verifier,nonce=row.mode,row.user_id,row.verifier,row.nonce_hash
    db.commit()
    if error or not code:return redirect_error('cancelled')
    try:
        tokens,claims=exchange(code,verifier)
        if claims.get('email_verified') is not True or not claims.get('sub') or not claims.get('email') or not secrets.compare_digest(digest(claims.get('nonce','')),nonce):return redirect_error('identity_invalid')
        email=claims['email'].strip().lower()
        if mode!='login' and (not user or user.id!=user_id or user.email!=email or user.is_demo):return redirect_error('wrong_account')
        identity=db.get(GoogleIdentity,claims['sub'])
        if identity and mode!='login' and identity.user_id!=user_id:return redirect_error('already_linked')
        if mode=='gmail':
            gmail_allowed(user)
            if GMAIL_SCOPE not in tokens.get('scope','').split():return redirect_error('mail_scope')
            old=db.get(MailIntegration,'gmail')
            refresh=tokens.get('refresh_token') or (decrypt(old.encrypted_refresh) if old and old.user_id==user.id else None)
            if not refresh:return redirect_error('mail_scope')
            if old:old.user_id=user.id;old.email=email;old.encrypted_refresh=encrypt(refresh)
            else:db.add(MailIntegration(id='gmail',user_id=user.id,email=email,encrypted_refresh=encrypt(refresh)))
            notify(db,user.id,'Gmail conectado','O CampHoop já pode enviar convites e mensagens de conta pelo remetente autorizado.','/conta',email=False)
            db.commit();response=RedirectResponse(settings.app_url+'/conta?google=gmail_connected',status_code=302)
        else:
            if mode=='link':
                record=db.get(User,user_id)
                existing=db.scalar(select(GoogleIdentity).where(GoogleIdentity.user_id==user_id))
                if existing and existing.subject!=claims['sub']:return redirect_error('already_linked')
            elif identity:record=db.get(User,identity.user_id)
            else:
                if db.scalar(select(User.id).where(User.email==email)):return redirect_error('link_required')
                if email.endswith('@camphoop.demo'):return redirect_error('identity_invalid')
                record=User(id=uuid4().hex,email=email,name=str(claims.get('name') or email.split('@')[0])[:120],role='basico',password_hash=passwords.hash(new_token()),has_password=False,email_verified=True,is_demo=False)
                db.add(record);db.flush()
                notify(db,record.id,'Bem-vindo ao CampHoop','Sua conta Google foi confirmada. Crie um clube ou aceite seu convite.','/clubes',email=False)
            if not record or not record.active or record.is_demo:return redirect_error('inactive')
            if record.email!=email:return redirect_error('email_changed')
            if not identity:db.add(GoogleIdentity(subject=claims['sub'],user_id=record.id))
            if mode=='link':notify(db,record.id,'Google conectado','Agora você também pode entrar com sua conta Google.','/conta',email=False)
            token=secrets.token_urlsafe(48)
            db.add(AuthSession(token_hash=digest(token),user_id=record.id,expires_at=now()+timedelta(hours=settings.session_hours)))
            db.commit();response=RedirectResponse(settings.app_url+('/conta?google=connected' if mode=='link' else '/conta'),status_code=302);cookie(response,token)
        response.delete_cookie(STATE_COOKIE,path='/api/auth/google')
        return response
    except Exception:
        db.rollback()
        return redirect_error('provider_unavailable')

@router.delete('/gmail')
def disconnect(user:User=Depends(require_user),db:Session=Depends(get_db)):
    gmail_allowed(user);row=db.get(MailIntegration,'gmail')
    if not row or row.user_id!=user.id:raise HTTPException(404,'Conexão Gmail não encontrada.')
    try:
        response=httpx.post('https://oauth2.googleapis.com/revoke',data={'token':decrypt(row.encrypted_refresh)},timeout=12)
        if response.status_code not in (200,400):raise RuntimeError('REVOKE_FAILED')
    except Exception:raise HTTPException(502,'Não foi possível revogar a autorização no Google. Tente novamente.')
    db.delete(row);db.commit();return {'ok':True}
