"""Preview NCAA-only removal; --apply first saves and restores a private full backup."""
import argparse
import json
from pathlib import Path
from types import SimpleNamespace
from sqlalchemy import delete, func, or_, select, text, update
from .config import settings
from .db import Base, SessionLocal
from .database_backup import backup
from .models import Athlete, Club, ClubInvitation, ClubMember, CoachTeam, Competition, Enrollment, Game, MailMessage, MatchEvent, Notification, PlayerStat, SourceImport, TacticalPlay, TacticsDraft, Team, TeamAuthorization, TeamSeason, TrainingChange, TrainingSlot, User


def targets():
    return {
        'teams':select(Team.id).where(Team.source_id.startswith('ncaa-')),
        'athletes':select(Athlete.id).where(Athlete.source_id.startswith('ncaa-')),
        'games':select(Game.id).where(Game.imported.is_(True),Game.source_id.startswith('ncaa-')),
        'competitions':select(Competition.id).where(Competition.source_id.startswith('ncaa-')),
        'imports':select(SourceImport.id).where(SourceImport.id.in_(['ncaa-2025','ncaa-2027'])),
    }


def club_targets(t):
    return select(Club.id).where(Club.id.startswith('ncaa-club-'),Club.owner_id.is_(None),~Club.id.in_(select(Team.club_id).where(~Team.id.in_(t['teams']))))


def count(db,model,*conditions):return db.scalar(select(func.count()).select_from(model).where(*conditions))


def automatic_demo_drafts(db,t):
    from .main import initial_draft
    keys=[]
    for draft in db.scalars(select(TacticsDraft).where(TacticsDraft.team_id.in_(t['teams']),TacticsDraft.user_id.in_(select(User.id).where(User.is_demo.is_(True))))):
        roster={a.id:a for a in db.scalars(select(Athlete).where(Athlete.team_id==draft.team_id,Athlete.season==draft.season))}
        if draft.content==initial_draft(SimpleNamespace(athletes=roster),draft.team_id):
            keys.append((draft.season,draft.user_id,draft.team_id))
    return keys


def plan(db):
    t=targets();clubs=club_targets(t)
    counts={name:db.scalar(select(func.count()).select_from(query.subquery())) for name,query in t.items()}
    automatic=automatic_demo_drafts(db,t)
    counts.update(clubs=db.scalar(select(func.count()).select_from(clubs.subquery())),player_stats=count(db,PlayerStat,PlayerStat.game_id.in_(t['games'])),enrollments=count(db,Enrollment,Enrollment.competition_id.in_(t['competitions'])),automatic_demo_drafts=len(automatic))
    blockers={
        'owned_imported_teams':count(db,Team,Team.id.in_(t['teams']),Team.owner_id.is_not(None)),
        'local_athletes_on_imported_teams':count(db,Athlete,Athlete.team_id.in_(t['teams']),~Athlete.id.in_(t['athletes'])),
        'local_games_using_imported_records':count(db,Game,~Game.id.in_(t['games']),or_(Game.home_id.in_(t['teams']),Game.away_id.in_(t['teams']),Game.competition_id.in_(t['competitions']))),
        'local_stats_using_imported_records':count(db,PlayerStat,~PlayerStat.game_id.in_(t['games']),or_(PlayerStat.athlete_id.in_(t['athletes']),PlayerStat.team_id.in_(t['teams']))),
        'match_events_using_imported_records':count(db,MatchEvent,or_(MatchEvent.game_id.in_(t['games']),MatchEvent.team_id.in_(t['teams']),MatchEvent.athlete_id.in_(t['athletes']),MatchEvent.out_athlete_id.in_(t['athletes']))),
        'mixed_enrollments':count(db,Enrollment,or_(Enrollment.competition_id.in_(t['competitions']) & ~Enrollment.team_id.in_(t['teams']),~Enrollment.competition_id.in_(t['competitions']) & Enrollment.team_id.in_(t['teams']))),
        'real_account_links':count(db,User,User.is_demo.is_(False),or_(User.team_id.in_(t['teams']),User.athlete_id.in_(t['athletes']),User.active_club_id.in_(clubs))),
        'real_coach_links':count(db,CoachTeam,CoachTeam.team_id.in_(t['teams']),CoachTeam.user_id.in_(select(User.id).where(User.is_demo.is_(False)))),
        'club_memberships':count(db,ClubMember,or_(ClubMember.team_id.in_(t['teams']),ClubMember.athlete_id.in_(t['athletes']),ClubMember.club_id.in_(clubs))),
        'club_invitations':count(db,ClubInvitation,or_(ClubInvitation.team_id.in_(t['teams']),ClubInvitation.athlete_id.in_(t['athletes']),ClubInvitation.club_id.in_(clubs))),
        'local_competitions_on_imported_clubs':count(db,Competition,Competition.club_id.in_(clubs),~Competition.id.in_(t['competitions'])),
    }
    for model in [TeamSeason,TrainingSlot,TrainingChange,TacticalPlay,TeamAuthorization]:
        blockers[model.__tablename__]=count(db,model,model.team_id.in_(t['teams']))
    blockers['edited_tactics_drafts']=count(db,TacticsDraft,TacticsDraft.team_id.in_(t['teams']))-len(automatic)
    preserved={model.__tablename__:count(db,model,~model.id.in_(t[name])) for model,name in [(Team,'teams'),(Athlete,'athletes'),(Game,'games'),(Competition,'competitions')]}
    preserved['clubs']=count(db,Club,~Club.id.in_(clubs))
    preserved.update({model.__tablename__:count(db,model) for model in [User,ClubMember,ClubInvitation,Notification,MailMessage]})
    return {'remove':counts,'preserve':preserved,'blockers':{name:value for name,value in blockers.items() if value}}


def clean(db):
    before=plan(db)
    if before['blockers']:raise RuntimeError('Local records depend on NCAA data; cleanup refused: '+json.dumps(before['blockers']))
    t=targets();clubs=club_targets(t)
    for season,user_id,team_id in automatic_demo_drafts(db,t):
        db.execute(delete(TacticsDraft).where(TacticsDraft.season==season,TacticsDraft.user_id==user_id,TacticsDraft.team_id==team_id))
    # Clear only imported references on fictional accounts, preserving their other fields.
    for column,ids in [(User.team_id,t['teams']),(User.athlete_id,t['athletes']),(User.active_club_id,clubs)]:
        db.execute(update(User).where(User.is_demo.is_(True),column.in_(ids)).values({column.key:None}))
    db.execute(delete(CoachTeam).where(CoachTeam.team_id.in_(t['teams'])))
    # Notices and mail history survive the removal of their optional source-club link.
    for model in [Notification,MailMessage]:db.execute(update(model).where(model.club_id.in_(clubs)).values(club_id=None))
    db.execute(delete(PlayerStat).where(PlayerStat.game_id.in_(t['games'])))
    db.execute(delete(Enrollment).where(Enrollment.competition_id.in_(t['competitions'])))
    for model,name in [(Game,'games'),(Athlete,'athletes'),(Team,'teams'),(Competition,'competitions')]:
        db.execute(delete(model).where(model.id.in_(t[name])))
    db.execute(delete(Club).where(Club.id.in_(clubs)))
    db.execute(delete(SourceImport).where(SourceImport.id.in_(t['imports'])))
    db.flush()
    after=plan(db)
    if any(after['remove'].values()) or after['preserve']!=before['preserve']:raise RuntimeError('Cleanup invariant failed; transaction must be rolled back.')
    return {'removed':before['remove'],'preserved':after['preserve']}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true',help='Back up, verify restoration, and remove NCAA records in one transaction.')
    parser.add_argument('--backup-dir',type=Path,default=settings.data_dir/'backups')
    args=parser.parse_args()
    with SessionLocal() as db:
        if args.apply and db.bind.dialect.name=='postgresql':
            # The API must be stopped. Keep concurrent writers out of the backup/cleanup window.
            names=','.join('"'+table.name+'"' for table in Base.metadata.sorted_tables)
            db.execute(text('LOCK TABLE '+names+' IN SHARE ROW EXCLUSIVE MODE'))
        preview=plan(db);print(json.dumps({'mode':'apply' if args.apply else 'preview',**preview},indent=2))
        if not args.apply:return
        if preview['blockers']:raise RuntimeError('Cleanup refused: local dependencies were found.')
        if not any(preview['remove'].values()):print('Nothing to remove.');return
        archive=backup(db,args.backup_dir,settings.data_dir)
        print('Backup restored and verified: '+str(archive))
        try:
            result=clean(db)
            db.commit()
        except Exception:
            db.rollback();raise
        (archive/'cleanup-result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
        print(json.dumps(result,indent=2))


if __name__=='__main__':main()
