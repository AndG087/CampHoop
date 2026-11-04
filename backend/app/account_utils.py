from datetime import datetime,timedelta,timezone
from hashlib import sha256
import secrets
from fastapi import HTTPException
from sqlalchemy import select
from .models import AccountToken, Club, ClubMember, RateLimit
from .config import settings

def now():return datetime.now(timezone.utc)
def aware(value):return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
def digest(value):return sha256(value.encode()).hexdigest()
def new_token():return secrets.token_urlsafe(40)

def rate_limit(db,scope,identity,limit,seconds=3600):
    # Each window has its own row; the unique key serializes first-use races.
    window=int(now().timestamp())//seconds
    key=f'{scope}:{digest(identity)[:48]}:{window}'
    row=db.scalar(select(RateLimit).where(RateLimit.key==key).with_for_update())
    if row:
        row.count+=1
        return row.count<=limit
    db.add(RateLimit(key=key,count=1,expires_at=now()+timedelta(seconds=seconds*2)))
    db.flush()
    return True

def require_verified(user):
    if user.is_demo:raise HTTPException(403,'Use uma conta real para convidar pessoas ou gerenciar clubes.')
    if not user.email_verified:raise HTTPException(403,'Confirme seu e-mail antes de continuar.')


def can_invite_members(user):
    return bool(user and (settings.environment=='development' and user.is_demo and user.role=='tecnico' or not user.is_demo and user.email_verified))


def require_inviter(user):
    if not can_invite_members(user):require_verified(user)

def club_owner(db,user,club_id,lock=False):
    query=select(Club).where(Club.id==club_id)
    club=db.scalar(query.with_for_update() if lock else query)
    if not club or club.owner_id!=user.id:raise HTTPException(403,'Somente o responsável pelo clube pode gerenciar seus membros.')
    return club

def club_member(db,user,club_id):
    member=db.get(ClubMember,(club_id,user.id))
    if not member:raise HTTPException(403,'Você não tem vínculo com este clube.')
    return member

def active_club_id(db,user):
    if user.active_club_id and db.get(ClubMember,(user.active_club_id,user.id)):return user.active_club_id
    return db.scalar(select(ClubMember.club_id).join(Club).where(ClubMember.user_id==user.id).order_by(Club.name,Club.id).limit(1))

def issue_token(db,user,purpose,minutes):
    for row in db.scalars(select(AccountToken).where(AccountToken.user_id==user.id,AccountToken.purpose==purpose,AccountToken.consumed_at.is_(None))):row.consumed_at=now()
    raw=new_token()
    db.add(AccountToken(token_hash=digest(raw),user_id=user.id,purpose=purpose,expires_at=now()+timedelta(minutes=minutes)))
    return raw

def consume_token(db,raw,purpose):
    row=db.scalar(select(AccountToken).where(AccountToken.token_hash==digest(raw)).with_for_update())
    if not row or row.purpose!=purpose or row.consumed_at or aware(row.expires_at)<=now():raise HTTPException(400,'Este link expirou ou já foi usado. Solicite um novo.')
    row.consumed_at=now()
    return row
