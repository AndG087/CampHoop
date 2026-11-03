from datetime import datetime, timedelta, timezone
from hashlib import sha256
import secrets
from fastapi import Depends, HTTPException, Request
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.orm import Session
from .config import settings
from .db import get_db
from .models import AuthSession, User

passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash(secrets.token_urlsafe(32))
COOKIE = 'camphoop_session'

def optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    record = db.get(AuthSession, sha256(token.encode()).hexdigest())
    if not record:
        return None
    expires = record.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires <= datetime.now(timezone.utc):
        return None
    user = db.get(User, record.user_id)
    return user if user and user.active else None

def require_user(user: User | None = Depends(optional_user)) -> User:
    if not user:
        raise HTTPException(401, 'Entre na sua conta para continuar.')
    return user

def require_role(user: User | None, role: str):
    if not user:
        raise HTTPException(401, 'Entre na sua conta para continuar.')
    if user.role != role:
        raise HTTPException(403, 'Seu perfil não tem permissão para esta ação.')

def require_team(user: User | None, team_id: str):
    require_role(user, 'tecnico')
    if user.team_id != team_id:
        raise HTTPException(403, 'Só o técnico da equipe pode alterar estes dados.')

def create_session(db: Session, email: str, password: str):
    user = db.scalar(select(User).where(User.email == email.strip().lower(), User.active.is_(True)))
    if not passwords.verify(password, user.password_hash if user else DUMMY_HASH):
        raise HTTPException(401, 'E-mail ou senha inválidos.')
    if not user:
        raise HTTPException(401, 'E-mail ou senha inválidos.')
    token = secrets.token_urlsafe(48)
    db.add(AuthSession(token_hash=sha256(token.encode()).hexdigest(), user_id=user.id, expires_at=datetime.now(timezone.utc) + timedelta(hours=settings.session_hours)))
    return user, token
