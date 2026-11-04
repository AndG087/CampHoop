from datetime import timedelta
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session
from . import account_schemas as p
from .account_utils import aware, club_member, club_owner, consume_token, digest, issue_token, new_token, now, rate_limit, require_verified, require_inviter
from .auth import COOKIE, create_session, passwords, require_user, coached_team_ids, own_athlete_ids
from .config import settings
from .db import get_db
from .models import AccountToken, Athlete, AuthSession, Club, ClubInvitation, ClubMember, CoachTeam, MailMessage, Team, User
from .mail_delivery import mail_status, notify, queue_mail
from .read import user_json

router=APIRouter(prefix='/api',tags=['Contas e clubes'])

def cookie(response,token):
    response.set_cookie(COOKIE,token,httponly=True,secure=settings.secure_cookie,samesite='lax',max_age=settings.session_hours*3600,path='/api')

def queue_verification(db,user):
    token=issue_token(db,user,'verify',24*60)
    queue_mail(db,user.email,'Confirme seu e-mail no CampHoop',f'Olá, {user.name}.\n\nConfirme seu e-mail para criar clubes e aceitar convites:\n{settings.app_url}/confirmar-email#token={token}\n\nO link vale por 24 horas. Se você não criou uma conta, ignore esta mensagem.',user.id)

@router.post('/auth/register',status_code=201)
def register(body:p.Register,request:Request,response:Response,db:Session=Depends(get_db)):
    if not rate_limit(db,'register',request.client.host if request.client else 'unknown',10):
        db.commit();raise HTTPException(429,'Muitas tentativas. Tente novamente mais tarde.')
    if db.scalar(select(User.id).where(User.email==body.email)):raise HTTPException(409,'Já existe uma conta com este e-mail. Entre ou recupere a senha.')
    if body.email.endswith('@camphoop.demo'):raise HTTPException(422,'Este domínio é reservado para contas de teste.')
    name=' '.join(body.name.split())
    if len(name)<2:raise HTTPException(422,'Informe seu nome.')
    user=User(id=uuid4().hex,email=body.email,name=name,password_hash=passwords.hash(body.password),role='basico',is_demo=False,email_verified=False,has_password=True)
    db.add(user);db.flush();queue_verification(db,user)
    user,token=create_session(db,body.email,body.password)
    notify(db,user.id,'Bem-vindo ao CampHoop','Confirme seu e-mail para criar seu clube ou aceitar um convite.','/conta',email=False)
    db.commit();cookie(response,token)
    return user_json(db,user)

@router.post('/auth/verification',status_code=202)
def resend_verification(user:User=Depends(require_user),db:Session=Depends(get_db)):
    user=db.get(User,user.id)
    if user.is_demo:raise HTTPException(403,'As contas de teste não recebem e-mails reais.')
    if user.email_verified:return {'ok':True}
    if not rate_limit(db,'verification',user.id,3):db.commit();raise HTTPException(429,'Aguarde antes de solicitar outro e-mail.')
    queue_verification(db,user);db.commit();return {'ok':True}

@router.post('/auth/verify')
def verify(body:p.TokenInput,current:User=Depends(require_user),db:Session=Depends(get_db)):
    row=consume_token(db,body.token,'verify');user=db.get(User,row.user_id)
    if not user or not user.active:raise HTTPException(400,'Link inválido.')
    if current.id!=user.id:raise HTTPException(403,'Entre na conta que você criou com este e-mail antes de confirmar.')
    user.email_verified=True
    notify(db,user.id,'E-mail confirmado','Sua conta está pronta para criar clubes e aceitar convites.','/clubes',email=False)
    db.commit();return {'ok':True}

@router.post('/auth/password/forgot',status_code=202)
def forgot(body:p.EmailInput,request:Request,db:Session=Depends(get_db)):
    allowed=rate_limit(db,'forgot-ip',request.client.host if request.client else 'unknown',20)
    if allowed:allowed=rate_limit(db,'forgot-email',body.email,3)
    user=db.scalar(select(User).where(User.email==body.email,User.active.is_(True),User.is_demo.is_(False))) if allowed else None
    if user:
        raw=issue_token(db,user,'reset',30)
        queue_mail(db,user.email,'Redefinir senha do CampHoop',f'Olá, {user.name}.\n\nEscolha uma nova senha:\n{settings.app_url}/redefinir-senha#token={raw}\n\nO link vale por 30 minutos e funciona uma única vez. Se você não pediu a alteração, ignore esta mensagem.',user.id)
    db.commit();return {'message':'Se houver uma conta com este e-mail, enviaremos as instruções de recuperação.'}

@router.post('/auth/password/reset')
def reset(body:p.ResetPassword,response:Response,db:Session=Depends(get_db)):
    row=consume_token(db,body.token,'reset')
    user=db.scalar(select(User).where(User.id==row.user_id).with_for_update())
    if not user or not user.active or user.is_demo:raise HTTPException(400,'Link inválido.')
    user.password_hash=passwords.hash(body.password);user.has_password=True;user.email_verified=True
    db.execute(delete(AuthSession).where(AuthSession.user_id==user.id))
    for token in db.scalars(select(AccountToken).where(AccountToken.user_id==user.id,AccountToken.consumed_at.is_(None))):token.consumed_at=now()
    notify(db,user.id,'Senha alterada','Sua senha foi redefinida e as sessões anteriores foram encerradas.','/conta',email=False)
    queue_mail(db,user.email,'Sua senha do CampHoop foi alterada','Sua senha foi redefinida. Se você não reconhece esta ação, recupere a senha imediatamente.\n\n'+settings.app_url+'/recuperar-senha',user.id)
    db.commit();response.delete_cookie(COOKIE,path='/api');return {'ok':True}

@router.get('/account')
def account(user:User=Depends(require_user),db:Session=Depends(get_db)):
    return {**user_json(db,user),'mail':mail_status(db)}

@router.put('/account/preferences')
def preferences(body:p.Preferences,user:User=Depends(require_user),db:Session=Depends(get_db)):
    user=db.get(User,user.id);user.email_notifications=body.emailNotifications;db.commit();return {'ok':True}

def club_json(club,member):
    return {'id':club.id,'name':club.name,'shortName':club.short_name,'city':club.city,'role':member.role,'teamId':member.team_id,'athleteId':member.athlete_id}

@router.get('/clubs')
def clubs(user:User=Depends(require_user),db:Session=Depends(get_db)):
    return [club_json(c,m) for c,m in db.execute(select(Club,ClubMember).join(ClubMember).where(ClubMember.user_id==user.id).order_by(Club.name))]

@router.post('/clubs')
def create_club(body:p.NewClub,user:User=Depends(require_user),db:Session=Depends(get_db)):
    require_verified(user)
    user=db.scalar(select(User).where(User.id==user.id).with_for_update(key_share=True))
    if user.role not in ('basico','tecnico'):raise HTTPException(409,'Criar um clube exige perfil de técnico. Seu perfil atual é mantido para preservar seus vínculos.')
    if not rate_limit(db,'clubs',user.id,10):db.commit();raise HTTPException(429,'Limite de criação de clubes atingido.')
    values={key:' '.join(value.split()) for key,value in body.model_dump().items()}
    if min(len(values[k]) for k in ['name','city'])<2 or not values['shortName']:raise HTTPException(422,'Preencha nome, sigla e cidade.')
    if db.scalar(select(Club.id).where(Club.owner_id==user.id,func.lower(Club.name)==values['name'].lower())):raise HTTPException(409,'Você já tem um clube com este nome.')
    club=Club(id='club-'+uuid4().hex,name=values['name'],short_name=values['shortName'].upper(),city=values['city'],owner_id=user.id)
    db.add(club);db.flush()
    member=ClubMember(club_id=club.id,user_id=user.id,role='owner',joined_at=now());db.add(member)
    user.role='tecnico';user.active_club_id=club.id
    notify(db,user.id,'Seu clube está pronto',f'{club.name} foi criado. Cadastre a primeira equipe e convide sua comissão.','/clubes/'+club.id,club.id,email=False)
    db.commit();return club_json(club,member)

@router.post('/clubs/{id}/active')
def active_club(id:str,user:User=Depends(require_user),db:Session=Depends(get_db)):
    member=club_member(db,user,id);record=db.get(User,user.id);record.active_club_id=id
    if record.role=='tecnico':
        teams=list(db.scalars(select(Team.id).where(Team.club_id==id,Team.id.in_(coached_team_ids(db,user))).order_by(Team.id)))
        if record.team_id not in teams:record.team_id=next(iter(teams),None)
    elif member.team_id:record.team_id=member.team_id
    db.commit();return {'ok':True}

def invitation_json(row):
    state='accepted' if row.accepted_at else 'revoked' if row.revoked_at else 'expired' if aware(row.expires_at)<=now() else 'pending'
    return {'id':row.id,'email':row.email,'role':row.role,'teamId':row.team_id,'athleteId':row.athlete_id,'expiresAt':aware(row.expires_at).isoformat(),'status':state}

@router.get('/clubs/{id}')
def club_detail(id:str,user:User=Depends(require_user),db:Session=Depends(get_db)):
    member=club_member(db,user,id);club=db.get(Club,id);owner=club.owner_id==user.id
    teams=[{'id':t.id,'name':t.name or f'{t.category} {t.gender}'} for t in db.scalars(select(Team).where(Team.club_id==id).order_by(Team.name))]
    members=[{'id':u.id,'name':u.name,'email':u.email,'role':m.role,'teamId':m.team_id,'athleteId':m.athlete_id} for u,m in db.execute(select(User,ClubMember).join(ClubMember).where(ClubMember.club_id==id))] if owner else [{'id':user.id,'name':user.name,'email':user.email,'role':member.role,'teamId':member.team_id,'athleteId':member.athlete_id}]
    athletes=[{'id':a.id,'name':a.name,'teamId':a.team_id,'season':a.season} for a in db.scalars(select(Athlete).where(Athlete.team_id.in_([t['id'] for t in teams]),Athlete.source_id.is_(None)).order_by(Athlete.name,Athlete.season.desc()))] if owner else []
    return {**club_json(club,member),'owner':owner,'members':members,'teams':teams,'athletes':athletes,'invitations':[invitation_json(i) for i in db.scalars(select(ClubInvitation).where(ClubInvitation.club_id==id).order_by(ClubInvitation.created_at.desc()).limit(100))] if owner else []}

def validate_assignment(db,club_id,role,team_id,athlete_id):
    if role in ('tecnico','estatistico','atleta') and not team_id:raise HTTPException(422,'Escolha a equipe desse membro.')
    team=db.get(Team,team_id) if team_id else None
    if team_id and (not team or team.club_id!=club_id or team.source_id):raise HTTPException(403,'Escolha uma equipe própria deste clube.')
    athlete=db.get(Athlete,athlete_id) if athlete_id else None
    if role=='atleta':
        if not athlete or athlete.team_id!=team_id or athlete.source_id:raise HTTPException(422,'Vincule o convite ao cadastro próprio do atleta nesta equipe.')
    elif athlete_id:raise HTTPException(422,'Somente convites de atleta podem vincular um perfil individual.')
    return team,athlete


def athlete_identity_ids(db,athlete):
    return list(db.scalars(select(Athlete.id).where(Athlete.person_id==athlete.person_id))) if athlete.person_id else [athlete.id]


@router.get('/clubs/{id}/athletes/{athlete_id}/account')
def athlete_account(id:str,athlete_id:str,user:User=Depends(require_user),db:Session=Depends(get_db)):
    require_inviter(user);club_owner(db,user,id)
    athlete=db.get(Athlete,athlete_id)
    if not athlete:raise HTTPException(404,'Atleta não encontrado.')
    validate_assignment(db,id,'atleta',athlete.team_id,athlete.id)
    ids=athlete_identity_ids(db,athlete)
    linked=db.scalar(select(User).where(User.athlete_id.in_(ids)))
    pending=db.scalar(select(ClubInvitation).where(ClubInvitation.club_id==id,ClubInvitation.athlete_id.in_(ids),ClubInvitation.revoked_at.is_(None),ClubInvitation.accepted_at.is_(None),ClubInvitation.expires_at>now()).order_by(ClubInvitation.created_at.desc()))
    return {'linkedAccount':{'name':linked.name,'email':linked.email,'isMember':bool(db.get(ClubMember,(id,linked.id)))} if linked else None,'pendingInvitation':invitation_json(pending) if pending else None}


@router.post('/clubs/{id}/invitations',status_code=201)
def invite(id:str,body:p.Invite,user:User=Depends(require_user),db:Session=Depends(get_db)):
    require_inviter(user);club=club_owner(db,user,id,lock=True)
    if body.email==user.email or body.email.endswith('@camphoop.demo'):raise HTTPException(422,'Convide outra pessoa com um e-mail real.')
    target=db.scalar(select(User).where(User.email==body.email))
    member=db.get(ClubMember,(id,target.id)) if target else None
    if member and (member.role!='basico' or body.role=='basico'):raise HTTPException(409,'Esta pessoa já é membro do clube com um perfil definido.')
    if not rate_limit(db,'invite',user.id,30):db.commit();raise HTTPException(429,'Limite de convites atingido. Tente mais tarde.')
    _,athlete=validate_assignment(db,id,body.role,body.teamId,body.athleteId)
    if athlete:
        ids=athlete_identity_ids(db,athlete)
        linked=db.scalar(select(User).where(User.athlete_id.in_(ids),User.email!=body.email).limit(1))
        if linked:raise HTTPException(409,'Este perfil de atleta já tem uma conta associada.')
        pending=db.scalar(select(ClubInvitation.id).where(ClubInvitation.club_id==id,ClubInvitation.athlete_id.in_(ids),ClubInvitation.email!=body.email,ClubInvitation.revoked_at.is_(None),ClubInvitation.accepted_at.is_(None),ClubInvitation.expires_at>now()).limit(1))
        if pending:raise HTTPException(409,'Já existe um convite pendente para este atleta. Revogue-o antes de convidar outra pessoa.')
    for old in db.scalars(select(ClubInvitation).where(ClubInvitation.club_id==id,ClubInvitation.email==body.email,ClubInvitation.accepted_at.is_(None),ClubInvitation.revoked_at.is_(None))):old.revoked_at=now()
    raw=new_token();row=ClubInvitation(id=uuid4().hex,club_id=id,email=body.email,role=body.role,team_id=body.teamId,athlete_id=body.athleteId,token_hash=digest(raw),created_by=user.id,created_at=now(),expires_at=now()+timedelta(days=7))
    db.add(row)
    queue_mail(db,body.email,f'Convite para {club.name}',f'{user.name} convidou você para {club.name} no CampHoop, com perfil {body.role}.\n\nConfira e aceite o convite:\n{settings.app_url}/convite#token={raw}\n\nO link vale por 7 dias. Entre com a conta deste e-mail; o convite não concede acesso antes de ser aceito.',target.id if target else None,id)
    if target:notify(db,target.id,'Você recebeu um convite',f'{club.name} convidou você para participar do clube.','/convites',id,email=False)
    db.commit();return invitation_json(row)

@router.delete('/clubs/{id}/invitations/{invitation_id}')
def revoke_invite(id:str,invitation_id:str,user:User=Depends(require_user),db:Session=Depends(get_db)):
    club_owner(db,user,id,lock=True);row=db.get(ClubInvitation,invitation_id)
    if not row or row.club_id!=id:raise HTTPException(404,'Convite não encontrado.')
    if row.accepted_at:raise HTTPException(409,'O convite já foi aceito. Gerencie o membro do clube.')
    row.revoked_at=now();db.commit();return {'ok':True}

def invitation_live(row):
    if not row or row.revoked_at or row.accepted_at or aware(row.expires_at)<=now():raise HTTPException(400,'Convite expirado, revogado ou já utilizado.')

@router.post('/invitations/preview')
def preview(body:p.TokenInput,db:Session=Depends(get_db)):
    row=db.scalar(select(ClubInvitation).where(ClubInvitation.token_hash==digest(body.token)));invitation_live(row)
    club=db.get(Club,row.club_id)
    return {'club':club.name,'role':row.role,'expiresAt':aware(row.expires_at).isoformat()}

@router.get('/invitations')
def pending(user:User=Depends(require_user),db:Session=Depends(get_db)):
    require_verified(user)
    return [{**invitation_json(i),'club':c.name} for i,c in db.execute(select(ClubInvitation,Club).join(Club).where(ClubInvitation.email==user.email,ClubInvitation.revoked_at.is_(None),ClubInvitation.accepted_at.is_(None),ClubInvitation.expires_at>now()).order_by(ClubInvitation.created_at.desc()).limit(100))]

@router.post('/invitations/accept')
def accept(body:p.AcceptInvitation,user:User=Depends(require_user),db:Session=Depends(get_db)):
    require_verified(user)
    if bool(body.token)==bool(body.invitationId):raise HTTPException(422,'Escolha um convite.')
    initial=db.get(ClubInvitation,body.invitationId) if body.invitationId else db.scalar(select(ClubInvitation).where(ClubInvitation.token_hash==digest(body.token)))
    invitation_live(initial)
    record=db.scalar(select(User).where(User.id==user.id).with_for_update(key_share=True))
    club=db.scalar(select(Club).where(Club.id==initial.club_id).with_for_update())
    row=db.scalar(select(ClubInvitation).where(ClubInvitation.id==initial.id).with_for_update().execution_options(populate_existing=True));invitation_live(row)
    if row.email!=record.email:raise HTTPException(403,'Entre com a conta do e-mail que recebeu o convite.')
    member=db.get(ClubMember,(club.id,user.id))
    if member and (member.role!='basico' or row.role=='basico'):raise HTTPException(409,'Você já pertence a este clube com um perfil definido.')
    if record.role not in ('basico',row.role):raise HTTPException(409,'O perfil do convite é diferente do perfil atual da sua conta. Peça um convite compatível.')
    team,athlete=validate_assignment(db,club.id,row.role,row.team_id,row.athlete_id)
    if athlete:
        ids=athlete_identity_ids(db,athlete)
        list(db.scalars(select(Athlete).where(Athlete.id.in_(ids)).order_by(Athlete.id).with_for_update()))
        linked=db.scalar(select(User.id).where(User.athlete_id.in_(ids),User.id!=user.id).limit(1))
        if linked:raise HTTPException(409,'Este perfil de atleta já tem uma conta associada.')
        if record.athlete_id and record.athlete_id not in ids:raise HTTPException(409,'Sua conta já está vinculada a outra pessoa.')
        record.athlete_id=athlete.id
    record.role=row.role
    if team:record.team_id=team.id
    record.active_club_id=club.id
    if member:member.role=row.role;member.team_id=row.team_id;member.athlete_id=row.athlete_id
    else:db.add(ClubMember(club_id=club.id,user_id=user.id,role=row.role,team_id=row.team_id,athlete_id=row.athlete_id,joined_at=now()))
    if row.role=='tecnico' and not db.get(CoachTeam,(user.id,team.id)):db.add(CoachTeam(user_id=user.id,team_id=team.id))
    row.accepted_at=now();row.accepted_by=user.id
    notify(db,club.owner_id,'Novo membro no clube',f'{user.name} aceitou o convite para {club.name}.','/clubes/'+club.id,club.id)
    notify(db,user.id,'Convite aceito',f'Você agora participa de {club.name}.','/clubes/'+club.id,club.id,email=False)
    db.commit();return {'clubId':club.id,'user':user_json(db,record)}

def lock_members(db,user,club_id,target_id):
    list(db.scalars(select(User).where(User.id.in_({user.id,target_id})).order_by(User.id).with_for_update(key_share=True)))
    club=club_owner(db,user,club_id,lock=True)
    member=db.get(ClubMember,(club_id,target_id))
    if not member:raise HTTPException(404,'Membro não encontrado.')
    if member.role=='owner' or target_id==club.owner_id:raise HTTPException(409,'O responsável pelo clube não pode ser removido por este fluxo.')
    list(db.scalars(select(Team).where(Team.club_id==club_id).order_by(Team.id).with_for_update()))
    return club,member

@router.put('/clubs/{id}/members/{member_id}')
def edit_member(id:str,member_id:str,body:p.MemberTeam,user:User=Depends(require_user),db:Session=Depends(get_db)):
    club,member=lock_members(db,user,id,member_id)
    team,athlete=validate_assignment(db,id,member.role,body.teamId,body.athleteId)
    target=db.get(User,member_id)
    if member.role=='atleta' and member.athlete_id!=body.athleteId:
        previous=db.get(Athlete,member.athlete_id)
        if not previous or not previous.person_id or previous.person_id!=athlete.person_id:raise HTTPException(409,'O perfil individual mantém sua identidade. Vincule somente temporadas da mesma pessoa.')
    if member.role=='tecnico':
        db.execute(delete(CoachTeam).where(CoachTeam.user_id==member_id,CoachTeam.team_id.in_(select(Team.id).where(Team.club_id==id))))
        db.add(CoachTeam(user_id=member_id,team_id=team.id))
        for previous in db.scalars(select(Team).where(Team.club_id==id,Team.owner_id==member_id,Team.id!=team.id)):previous.owner_id=club.owner_id
    member.team_id=body.teamId;member.athlete_id=body.athleteId
    if target.active_club_id==id:target.team_id=body.teamId
    notify(db,target.id,'Vínculo atualizado',f'Sua equipe em {club.name} foi atualizada.','/clubes/'+id,id,email=False)
    db.commit();return {'ok':True}

@router.delete('/clubs/{id}/members/{member_id}')
def remove_member(id:str,member_id:str,user:User=Depends(require_user),db:Session=Depends(get_db)):
    club,member=lock_members(db,user,id,member_id);target=db.get(User,member_id)
    teams=list(db.scalars(select(Team).where(Team.club_id==id)))
    for team in teams:
        if team.owner_id==member_id:team.owner_id=club.owner_id
    db.execute(delete(CoachTeam).where(CoachTeam.user_id==member_id,CoachTeam.team_id.in_([t.id for t in teams])))
    if target.team_id in [t.id for t in teams]:target.team_id=None
    if target.active_club_id==id:target.active_club_id=None
    # Individual history remains associated with the athlete; only club/staff access ends.
    db.delete(member)
    notify(db,target.id,'Vínculo encerrado',f'Seu vínculo com {club.name} foi encerrado.','/clubes',email=False)
    db.commit();return {'ok':True}
