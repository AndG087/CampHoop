from datetime import datetime, timedelta, timezone
from hashlib import sha256
import secrets
from fastapi import Depends, HTTPException, Request
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.orm import Session
from types import SimpleNamespace
from .config import settings
from .db import get_db
from .models import Athlete, AuthSession, User, Team, CoachTeam

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
    if not user or not user.active:return None
    return athlete_context(db,user,request.query_params.get('season'))

def require_user(user: User | None = Depends(optional_user)) -> User:
    if not user:
        raise HTTPException(401, 'Entre na sua conta para continuar.')
    return user

def require_role(user: User | None, role: str):
    if not user:
        raise HTTPException(401, 'Entre na sua conta para continuar.')
    if user.role != role:
        raise HTTPException(403, 'Seu perfil não tem permissão para esta ação.')

def coached_team_ids(db: Session, user: User):
    if user.role!='tecnico':return set()
    return set(db.scalars(select(CoachTeam.team_id).where(CoachTeam.user_id==user.id))) | set(db.scalars(select(Team.id).where(Team.owner_id==user.id)))

def own_athlete_ids(db,user):
    if user.role!='atleta' or not user.athlete_id:return set()
    anchor=db.get(Athlete,user.athlete_id)
    if not anchor:return set()
    return set(db.scalars(select(Athlete.id).where(Athlete.person_id==anchor.person_id))) if anchor.person_id else {anchor.id}

def athlete_context(db,user,season=None):
    if user.role!='atleta' or not user.athlete_id:return user
    from .seasons import resolve_season
    selected=resolve_season(db,season)
    record=db.scalar(select(Athlete).where(Athlete.id.in_(own_athlete_ids(db,user)),Athlete.season==selected))
    anchor=db.get(Athlete,user.athlete_id)
    view=record or anchor
    if not view:return user
    values={c.name:getattr(user,c.name) for c in User.__table__.columns}
    return SimpleNamespace(**{**values,'team_id':view.team_id,'athlete_id':view.id})

def can_coach(db: Session, user: User | None, team_id: str):
    return bool(user and user.role=='tecnico' and team_id in coached_team_ids(db,user))

def work_team_id(db,user):
    if not user:return None
    if user.role!='tecnico':return user.team_id
    allowed=coached_team_ids(db,user)
    return user.team_id if user.team_id in allowed else next(iter(sorted(allowed)),None)

def require_team(user: User | None, team_id: str, db: Session | None = None):
    require_role(user, 'tecnico')
    if not (can_coach(db,user,team_id) if db is not None else user.team_id==team_id):
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
