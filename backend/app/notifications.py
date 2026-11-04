from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.orm import Session
from .auth import require_user
from .account_utils import aware, now
from .db import get_db
from .models import Notification, User

router=APIRouter(prefix='/api/notifications',tags=['Notificações'])

@router.get('/summary')
def summary(user:User=Depends(require_user),db:Session=Depends(get_db)):
    return {'unread':db.scalar(select(func.count()).select_from(Notification).where(Notification.user_id==user.id,Notification.read_at.is_(None)))}

@router.get('')
def notifications(cursor:str|None=Query(default=None,max_length=100),unread:bool=False,user:User=Depends(require_user),db:Session=Depends(get_db)):
    query=select(Notification).where(Notification.user_id==user.id)
    if unread:query=query.where(Notification.read_at.is_(None))
    if cursor:
        anchor=db.get(Notification,cursor)
        if not anchor or anchor.user_id!=user.id:raise HTTPException(404,'Notificação não encontrada.')
        query=query.where(or_(Notification.created_at<anchor.created_at,and_(Notification.created_at==anchor.created_at,Notification.id<anchor.id)))
    rows=list(db.scalars(query.order_by(Notification.created_at.desc(),Notification.id.desc()).limit(51)))
    items=[{'id':n.id,'title':n.title,'body':n.body,'href':n.href,'createdAt':aware(n.created_at).isoformat(),'readAt':aware(n.read_at).isoformat() if n.read_at else None} for n in rows[:50]]
    return {'items':items,'nextCursor':rows[49].id if len(rows)>50 else None,**summary(user,db)}

@router.put('/read-all')
def read_all(user:User=Depends(require_user),db:Session=Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id==user.id,Notification.read_at.is_(None)).values(read_at=now()));db.commit();return {'ok':True}

@router.put('/{id}/read')
def read(id:str,user:User=Depends(require_user),db:Session=Depends(get_db)):
    row=db.get(Notification,id)
    if not row or row.user_id!=user.id:raise HTTPException(404,'Notificação não encontrada.')
    if not row.read_at:row.read_at=now();db.commit()
    return {'ok':True}
