"""Clean only resources owned by the exact UUID-prefixed browser test runs."""
from pathlib import Path
import json
import re
from sqlalchemy import delete, or_, select
from app.db import SessionLocal
from app.models import Athlete, Club, ClubInvitation, ClubMember, CoachTeam, MailMessage, Notification, Enrollment, Game, MatchEvent, PlayerStat, TacticalPlay, TacticsDraft, Team, TeamAuthorization, TeamSeason, TrainingChange, TrainingSlot, User

path=Path(__file__).resolve().parents[1]/'data/e2e-rosters.json'
if path.exists():
    runs=json.loads(path.read_text())
    with SessionLocal() as db:
        removed=0
        for run in runs:
            prefix=run.get('prefix','')
            if not re.fullmatch(r'CampHoop E2E [a-f0-9]{12}',prefix):raise ValueError('Invalid test prefix')
            user=db.get(User,run['userId'])
            if not user or user.role!='tecnico':raise ValueError('Test owner not found')
            clubs=list(db.scalars(select(Club.id).where(Club.name==prefix,Club.owner_id==user.id)))
            teams=list(db.scalars(select(Team.id).where(Team.club_id.in_(clubs),Team.owner_id==user.id,Team.source_id.is_(None))))
            athletes=list(db.scalars(select(Athlete.id).where(Athlete.team_id.in_(teams),Athlete.source_id.is_(None))))
            if user.active_club_id in clubs:user.active_club_id=None
            if db.scalar(select(ClubMember.user_id).where(ClubMember.club_id.in_(clubs),ClubMember.user_id!=user.id).limit(1)):raise ValueError('Another member references this test club')
            if run.get('originalTeamId'):
                if not db.get(Team,run['originalTeamId']):raise ValueError('Original work team no longer exists')
                user.team_id=run['originalTeamId'];db.flush()
            if db.scalar(select(User.id).where(or_(User.team_id.in_(teams),User.athlete_id.in_(athletes))).limit(1)):raise ValueError('A user still references a test resource')
            games=list(db.scalars(select(Game.id).where(or_(Game.home_id.in_(teams),Game.away_id.in_(teams)),Game.imported.is_(False))))
            db.execute(delete(MatchEvent).where(MatchEvent.game_id.in_(games)))
            db.execute(delete(PlayerStat).where(or_(PlayerStat.game_id.in_(games),PlayerStat.athlete_id.in_(athletes))))
            db.execute(delete(Game).where(Game.id.in_(games)))
            db.execute(delete(TacticsDraft).where(TacticsDraft.team_id.in_(teams)))
            db.execute(delete(TacticalPlay).where(TacticalPlay.team_id.in_(teams)))
            db.execute(delete(TrainingChange).where(TrainingChange.team_id.in_(teams)))
            db.execute(delete(TrainingSlot).where(TrainingSlot.team_id.in_(teams)))
            db.execute(delete(Enrollment).where(Enrollment.team_id.in_(teams)))
            db.execute(delete(ClubInvitation).where(ClubInvitation.club_id.in_(clubs)))
            db.execute(delete(ClubMember).where(ClubMember.club_id.in_(clubs)))
            db.execute(delete(Notification).where(Notification.club_id.in_(clubs)))
            db.execute(delete(MailMessage).where(MailMessage.club_id.in_(clubs)))
            db.execute(delete(CoachTeam).where(CoachTeam.team_id.in_(teams)))
            db.execute(delete(TeamAuthorization).where(TeamAuthorization.team_id.in_(teams)))
            db.execute(delete(Athlete).where(Athlete.id.in_(athletes)))
            db.execute(delete(TeamSeason).where(TeamSeason.team_id.in_(teams)))
            db.execute(delete(Team).where(Team.id.in_(teams)))
            db.execute(delete(Club).where(Club.id.in_(clubs)))
            removed+=len(teams)
        db.commit()
    path.unlink()
    print(f'Removed {removed} test-owned teams and their test roster snapshots. NCAA records preserved.')
