"""Consent, revocable coaching access, and deletion of unused local records."""
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session
from .auth import can_coach, coached_team_ids, manages_team, require_role, require_user
from .db import get_db
from . import management_schemas as p
from .management import athlete_has_records, athlete_in_boards, ensure_idle, get, locked_teams, require_owned, require_period
from .models import Athlete, Club, ClubMember, CoachTeam, Competition, Enrollment, Game, TacticalPlay, TacticsDraft, Team, TeamAuthorization, TeamSeason, TrainingChange, TrainingSlot, User
from .seasons import academic_season

router=APIRouter(prefix='/api/management',tags=['Autorizações e vínculos'])

def require_consent(db,team,user,season,kind,resource):
    # Imported/legacy opponents have no local owner whose calendar can be blocked.
    if not team.owner_id or can_coach(db,user,team.id):return
    if not db.scalar(select(TeamAuthorization.id).where(TeamAuthorization.team_id==team.id,TeamAuthorization.season==season,TeamAuthorization.kind==kind,TeamAuthorization.resource==resource)):
        raise HTTPException(403,'A equipe precisa autorizar este amistoso ou esta inscrição em Acessos e autorizações.')

def authorization_json(db,row):
    if row.kind=='friendly':
        day,opponent=row.resource.split(':',1);team=db.get(Team,opponent)
        club=db.get(Club,team.club_id) if team else None
        label=f"Amistoso · {day} · {club.name if club else 'Equipe removida'}"
    else:
        competition=db.get(Competition,row.resource)
        label=f"Inscrição · {competition.name if competition else 'Campeonato removido'}"
    return {'id':row.id,'season':row.season,'kind':row.kind,'label':label}

@router.get('/teams/{id}/access')
def access(id:str,user:User=Depends(require_user),db:Session=Depends(get_db)):
    require_role(user,'tecnico');team=get(db,Team,id)
    if not can_coach(db,user,id):raise HTTPException(403,'Equipe não autorizada.')
    owner=manages_team(db,user,team)
    coaches=[{'id':c.id,'name':c.name,'email':c.email,'owner':c.id in {team.owner_id,db.get(Club,team.club_id).owner_id}} for c in db.scalars(select(User).where(User.role=='tecnico',User.id.in_(coached_users(db,id))))] if owner else []
    return {'owner':owner,'coaches':coaches,'authorizations':[authorization_json(db,a) for a in db.scalars(select(TeamAuthorization).where(TeamAuthorization.team_id==id).order_by(TeamAuthorization.season,TeamAuthorization.resource))] if owner else []}

def coached_users(db,team_id):
    ids=set(db.scalars(select(CoachTeam.user_id).where(CoachTeam.team_id==team_id)))
    owner=db.get(Team,team_id).owner_id
    if owner:ids.add(owner)
    club_owner=db.get(Club,db.get(Team,team_id).club_id).owner_id
    if club_owner:ids.add(club_owner)
    return ids

def lock_access(db,actor,team_id,target_id):
    # Lock both account rows in the same order before the team, including self-revocation.
    require_role(actor,'tecnico')
    list(db.scalars(select(User).where(User.id.in_({actor.id,target_id})).order_by(User.id).with_for_update(key_share=True)))
    team=db.scalar(select(Team).where(Team.id==team_id).with_for_update())
    if not team:raise HTTPException(404,'Equipe não encontrada.')
    return team

@router.post('/teams/{id}/access')
def grant_access(id:str,body:p.CoachAccess,user:User=Depends(require_user),db:Session=Depends(get_db)):
    target=db.scalar(select(User).where(User.email==body.email.strip().lower(),User.role=='tecnico',User.active.is_(True)))
    if not target:raise HTTPException(422,'Informe o e-mail de uma conta de técnico ativa.')
    team=lock_access(db,user,id,target.id);require_owned(user,team,db)
    if user.is_demo!=target.is_demo:raise HTTPException(403,'Contas reais e de demonstração não compartilham acesso privado.')
    if not user.is_demo:
        member=db.get(ClubMember,(team.club_id,target.id))
        if not member or member.role not in ('owner','tecnico'):raise HTTPException(403,'Convide o técnico para este clube antes de conceder acesso à equipe.')
    if target.id==team.owner_id or db.get(CoachTeam,(target.id,id)):raise HTTPException(409,'Este técnico já tem acesso.')
    db.add(CoachTeam(user_id=target.id,team_id=id));db.commit();return {'ok':True}

@router.delete('/teams/{id}/access/{user_id}')
def revoke_access(id:str,user_id:str,user:User=Depends(require_user),db:Session=Depends(get_db)):
    team=lock_access(db,user,id,user_id)
    if user.id!=user_id and not manages_team(db,user,team):raise HTTPException(403,'Só o responsável pode revogar o acesso de outro técnico.')
    if user_id in {team.owner_id,db.get(Club,team.club_id).owner_id}:raise HTTPException(409,'O proprietário mantém acesso enquanto for dono da equipe.')
    link=db.get(CoachTeam,(user_id,id))
    if not link:raise HTTPException(404,'Vínculo de técnico não encontrado.')
    db.delete(link);db.flush()
    target=db.get(User,user_id)
    if target and target.team_id==id:
        target.team_id=next(iter(sorted(coached_team_ids(db,target))),None)
    db.commit();return {'ok':True}

@router.post('/teams/{id}/authorizations')
def authorize(id:str,body:p.Authorization,user:User=Depends(require_user),db:Session=Depends(get_db)):
    team=locked_teams(db,user,[id])[id];period=require_period(db,id,body.season)
    if body.kind=='friendly':
        if not body.opponentId or not body.date or body.competitionId or body.opponentId==id:raise HTTPException(422,'Escolha o adversário e a data do amistoso.')
        if academic_season(body.date)!=body.season:raise HTTPException(422,'A data deve pertencer à temporada escolhida.')
        opponent=get(db,Team,body.opponentId)
        from .management import team_period
        other=team_period(db,opponent,body.season)
        if (period.category,period.gender)!=(other.category,other.gender):raise HTTPException(409,'Escolha um adversário da mesma categoria e gênero.')
        if opponent.owner_id and not opponent.source_id:require_period(db,opponent.id,body.season)
        resource=f'{body.date.isoformat()}:{opponent.id}'
    else:
        if not body.competitionId or body.opponentId or body.date:raise HTTPException(422,'Escolha o campeonato que deseja autorizar.')
        c=get(db,Competition,body.competitionId)
        if c.source_id or c.status!='inscricoes' or c.season!=body.season:raise HTTPException(409,'Escolha um campeonato com inscrições abertas nesta temporada.')
        if not any(d['category']==period.category and d['gender']==period.gender for d in c.divisions):raise HTTPException(409,'A equipe não pertence a uma divisão deste campeonato.')
        resource=c.id
    row=TeamAuthorization(id=uuid4().hex,team_id=id,season=body.season,kind=body.kind,resource=resource)
    db.add(row);db.commit();return authorization_json(db,row)

@router.delete('/teams/{id}/authorizations/{authorization_id}')
def revoke_authorization(id:str,authorization_id:str,user:User=Depends(require_user),db:Session=Depends(get_db)):
    locked_teams(db,user,[id]);row=get(db,TeamAuthorization,authorization_id)
    if row.team_id!=id:raise HTTPException(404,'Autorização não encontrada nesta equipe.')
    db.delete(row);db.commit();return {'ok':True}

def check_revision(row,revision):
    if row.revision!=revision:raise HTTPException(409,'O cadastro mudou em outra tela. Reabra a exclusão.')

@router.delete('/athletes/{id}')
def delete_athlete(id:str,body:p.DeleteRecord,user:User=Depends(require_user),db:Session=Depends(get_db)):
    athlete=get(db,Athlete,id);old_team=athlete.team_id;locked_teams(db,user,[old_team])
    athlete=db.scalar(select(Athlete).where(Athlete.id==id).with_for_update().execution_options(populate_existing=True))
    if not athlete or athlete.team_id!=old_team:raise HTTPException(409,'O vínculo foi alterado em outra tela. Reabra a exclusão.')
    if athlete.source_id:raise HTTPException(403,'Cadastros NCAA são somente leitura.')
    check_revision(athlete,body.revision);ensure_idle(db,[athlete.team_id],athlete.season)
    if athlete_has_records(db,id) or athlete_in_boards(db,id,athlete.team_id,athlete.season) or db.scalar(select(User.id).where(User.athlete_id==id).limit(1)):
        raise HTTPException(409,'Este vínculo tem histórico, jogadas ou uma conta associada e não pode ser excluído.')
    db.delete(athlete);db.commit();return {'ok':True}

def ensure_empty_period(db,id,season):
    if (db.scalar(select(Athlete.id).where(Athlete.team_id==id,Athlete.season==season).limit(1)) or
        db.scalar(select(Game.id).where(Game.season==season,or_(Game.home_id==id,Game.away_id==id)).limit(1)) or
        db.scalar(select(Enrollment.team_id).join(Competition).where(Enrollment.team_id==id,Competition.season==season).limit(1)) or
        db.scalar(select(TacticalPlay.id).where(TacticalPlay.team_id==id,TacticalPlay.season==season).limit(1)) or
        db.scalar(select(TacticsDraft.team_id).where(TacticsDraft.team_id==id,TacticsDraft.season==season).limit(1))):
        raise HTTPException(409,'Remova apenas temporadas vazias, sem atletas, inscrições, jogos ou jogadas.')

@router.delete('/teams/{id}/seasons/{season_start}/{season_end}')
def delete_period(id:str,season_start:str,season_end:str,body:p.DeleteRecord,user:User=Depends(require_user),db:Session=Depends(get_db)):
    locked_teams(db,user,[id]);season=f'{season_start}/{season_end}';row=require_period(db,id,season)
    check_revision(row,body.revision);ensure_empty_period(db,id,season)
    if db.scalar(select(TeamSeason.season).where(TeamSeason.team_id==id,TeamSeason.season!=season).limit(1)) is None:raise HTTPException(409,'Esta é a última temporada da equipe. Use Excluir equipe vazia.')
    db.execute(delete(TeamAuthorization).where(TeamAuthorization.team_id==id,TeamAuthorization.season==season));db.delete(row);db.commit();return {'ok':True}

@router.delete('/teams/{id}')
def delete_team(id:str,season:str,body:p.DeleteRecord,user:User=Depends(require_user),db:Session=Depends(get_db)):
    # Empty-team deletion can clear coach work contexts; lock their accounts first.
    ids=coached_users(db,id) if db.get(Team,id) else {user.id}
    list(db.scalars(select(User).where(User.id.in_(ids|{user.id})).order_by(User.id).with_for_update(key_share=True)))
    team=locked_teams(db,user,[id])[id];check_revision(require_period(db,id,season),body.revision)
    for period in db.scalars(select(TeamSeason).where(TeamSeason.team_id==id)):ensure_empty_period(db,id,period.season)
    if db.scalar(select(Game.id).where(or_(Game.home_id==id,Game.away_id==id)).limit(1)) or db.scalar(select(Athlete.id).where(Athlete.team_id==id).limit(1)) or db.scalar(select(TrainingSlot.id).where(TrainingSlot.team_id==id).limit(1)) or db.scalar(select(TrainingChange.id).where(TrainingChange.team_id==id).limit(1)):
        raise HTTPException(409,'A equipe tem elenco, jogos ou treinos e não pode ser excluída.')
    accounts=list(db.scalars(select(User).where(User.team_id==id)))
    if any(a.role!='tecnico' for a in accounts):raise HTTPException(409,'A equipe tem contas de atletas associadas.')
    db.execute(delete(CoachTeam).where(CoachTeam.team_id==id));db.execute(delete(TeamAuthorization).where(TeamAuthorization.team_id==id));db.flush()
    for account in accounts:account.team_id=next(iter(sorted(coached_team_ids(db,account)-{id})),None)
    db.flush();db.execute(delete(TeamSeason).where(TeamSeason.team_id==id));db.delete(team);db.flush()
    club=db.get(Club,team.club_id)
    if user.is_demo and club.owner_id==user.id and not db.scalar(select(Team.id).where(Team.club_id==club.id).limit(1)):
        for account in db.scalars(select(User).where(User.active_club_id==club.id)):account.active_club_id=None
        db.flush();db.delete(club)
    db.commit();return {'ok':True}
