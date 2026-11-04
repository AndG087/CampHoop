from datetime import date, datetime
from sqlalchemy import JSON, Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, Index, text
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

class Club(Base):
    __tablename__ = 'clubs'
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    short_name: Mapped[str] = mapped_column(String(20))
    city: Mapped[str] = mapped_column(String(100), default='Não informada')
    owner_id: Mapped[str | None] = mapped_column(ForeignKey('users.id', use_alter=True, name='club_owner_fk'), index=True)

class Team(Base):
    __tablename__ = 'teams'
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    club_id: Mapped[str] = mapped_column(ForeignKey('clubs.id'), index=True)
    category: Mapped[str] = mapped_column(String(30))
    gender: Mapped[str] = mapped_column(String(20))
    coach: Mapped[str | None] = mapped_column(String(120))
    source_id: Mapped[str | None] = mapped_column(String(100), unique=True)
    name: Mapped[str | None] = mapped_column(String(100))
    owner_id: Mapped[str | None] = mapped_column(ForeignKey('users.id', use_alter=True, name='team_owner_fk'), index=True)

class TeamSeason(Base):
    __tablename__ = 'team_seasons'
    team_id: Mapped[str] = mapped_column(ForeignKey('teams.id'), primary_key=True)
    season: Mapped[str] = mapped_column(String(12), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    category: Mapped[str] = mapped_column(String(30))
    gender: Mapped[str] = mapped_column(String(20))
    coach: Mapped[str] = mapped_column(String(120))
    revision: Mapped[int] = mapped_column(Integer, default=1)

class CoachTeam(Base):
    __tablename__ = 'coach_teams'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), primary_key=True)
    team_id: Mapped[str] = mapped_column(ForeignKey('teams.id'), primary_key=True)

class TeamAuthorization(Base):
    __tablename__ = 'team_authorizations'
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    team_id: Mapped[str] = mapped_column(ForeignKey('teams.id'), index=True)
    season: Mapped[str] = mapped_column(String(12))
    kind: Mapped[str] = mapped_column(String(20))
    resource: Mapped[str] = mapped_column(String(220))
    __table_args__ = (UniqueConstraint('team_id','season','kind','resource',name='team_authorization_unique'),)

class Athlete(Base):
    __tablename__ = 'athletes'
    season: Mapped[str | None] = mapped_column(String(12), index=True)
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    team_id: Mapped[str] = mapped_column(ForeignKey('teams.id'), index=True)
    name: Mapped[str] = mapped_column(String(150), index=True)
    number: Mapped[int | None] = mapped_column(Integer)
    position: Mapped[str] = mapped_column(String(80), default='Não informada')
    photo_url: Mapped[str | None] = mapped_column(Text)
    birth_date: Mapped[date | None] = mapped_column(Date)
    height_cm: Mapped[int | None] = mapped_column(Integer)
    member_since: Mapped[str | None] = mapped_column(String(7))
    status: Mapped[str] = mapped_column(String(20), default='historico')
    development: Mapped[dict | None] = mapped_column(JSON)
    source_id: Mapped[str | None] = mapped_column(String(100), unique=True)
    person_id: Mapped[str | None] = mapped_column(String(100), index=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    __table_args__ = (
        UniqueConstraint('person_id','season',name='athlete_person_season_unique'),
        Index('manual_jersey_unique','team_id','season','number',unique=True,postgresql_where=text('source_id IS NULL AND number IS NOT NULL'),sqlite_where=text('source_id IS NULL AND number IS NOT NULL')),
    )

class User(Base):
    __tablename__ = 'users'
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20))
    team_id: Mapped[str | None] = mapped_column(ForeignKey('teams.id'))
    athlete_id: Mapped[str | None] = mapped_column(ForeignKey('athletes.id'))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    has_password: Mapped[bool] = mapped_column(Boolean, default=True)
    email_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    active_club_id: Mapped[str | None] = mapped_column(ForeignKey('clubs.id',use_alter=True,name='user_active_club_fk'))

class ClubMember(Base):
    __tablename__ = 'club_members'
    club_id: Mapped[str] = mapped_column(ForeignKey('clubs.id',ondelete='CASCADE'),primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id',ondelete='CASCADE'),primary_key=True)
    role: Mapped[str] = mapped_column(String(20))
    team_id: Mapped[str | None] = mapped_column(ForeignKey('teams.id'))
    athlete_id: Mapped[str | None] = mapped_column(ForeignKey('athletes.id'))
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

class ClubInvitation(Base):
    __tablename__ = 'club_invitations'
    id: Mapped[str] = mapped_column(String(100),primary_key=True)
    club_id: Mapped[str] = mapped_column(ForeignKey('clubs.id',ondelete='CASCADE'),index=True)
    email: Mapped[str] = mapped_column(String(254),index=True)
    role: Mapped[str] = mapped_column(String(20))
    team_id: Mapped[str | None] = mapped_column(ForeignKey('teams.id'))
    athlete_id: Mapped[str | None] = mapped_column(ForeignKey('athletes.id'))
    token_hash: Mapped[str] = mapped_column(String(64),unique=True)
    created_by: Mapped[str] = mapped_column(ForeignKey('users.id'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_by: Mapped[str | None] = mapped_column(ForeignKey('users.id'))

class AccountToken(Base):
    __tablename__ = 'account_tokens'
    token_hash: Mapped[str] = mapped_column(String(64),primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id',ondelete='CASCADE'),index=True)
    purpose: Mapped[str] = mapped_column(String(20))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

class Notification(Base):
    __tablename__ = 'notifications'
    id: Mapped[str] = mapped_column(String(100),primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id',ondelete='CASCADE'),index=True)
    club_id: Mapped[str | None] = mapped_column(ForeignKey('clubs.id',ondelete='CASCADE'))
    title: Mapped[str] = mapped_column(String(150))
    body: Mapped[str] = mapped_column(String(700))
    href: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

class MailMessage(Base):
    __tablename__ = 'mail_messages'
    id: Mapped[str] = mapped_column(String(100),primary_key=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey('users.id',ondelete='CASCADE'))
    club_id: Mapped[str | None] = mapped_column(ForeignKey('clubs.id',ondelete='CASCADE'))
    recipient: Mapped[str] = mapped_column(String(254))
    subject: Mapped[str] = mapped_column(String(150))
    encrypted_body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20),default='pending',index=True)
    attempts: Mapped[int] = mapped_column(Integer,default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_code: Mapped[str | None] = mapped_column(String(40))

class GoogleIdentity(Base):
    __tablename__ = 'google_identities'
    subject: Mapped[str] = mapped_column(String(255),primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id',ondelete='CASCADE'),unique=True)

class OAuthAttempt(Base):
    __tablename__ = 'oauth_attempts'
    state_hash: Mapped[str] = mapped_column(String(64),primary_key=True)
    nonce_hash: Mapped[str] = mapped_column(String(64))
    verifier: Mapped[str] = mapped_column(String(150))
    mode: Mapped[str] = mapped_column(String(15))
    user_id: Mapped[str | None] = mapped_column(ForeignKey('users.id',ondelete='CASCADE'))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

class MailIntegration(Base):
    __tablename__ = 'mail_integrations'
    id: Mapped[str] = mapped_column(String(20),primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    email: Mapped[str] = mapped_column(String(254))
    encrypted_refresh: Mapped[str] = mapped_column(Text)

class RateLimit(Base):
    __tablename__ = 'rate_limits'
    key: Mapped[str] = mapped_column(String(100),primary_key=True)
    count: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

class AuthSession(Base):
    __tablename__ = 'auth_sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

class Competition(Base):
    __tablename__ = 'competitions'
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(150), unique=True)
    status: Mapped[str] = mapped_column(String(25), default='inscricoes')
    phase: Mapped[str] = mapped_column(String(100), default='Inscrições abertas')
    note: Mapped[str] = mapped_column(Text, default='')
    season: Mapped[str] = mapped_column(String(12), default='2025/26')
    divisions: Mapped[list] = mapped_column(JSON)
    organizer_id: Mapped[str | None] = mapped_column(ForeignKey('users.id'))
    club_id: Mapped[str | None] = mapped_column(ForeignKey('clubs.id',name='competition_club_fk'))
    ruleset: Mapped[str] = mapped_column(String(30), default='fiba')
    standings_mode: Mapped[str] = mapped_column(String(30), default='points')
    source_id: Mapped[str | None] = mapped_column(String(100), unique=True)
    source_url: Mapped[str | None] = mapped_column(Text)

class Enrollment(Base):
    __tablename__ = 'enrollments'
    competition_id: Mapped[str] = mapped_column(ForeignKey('competitions.id', ondelete='CASCADE'), primary_key=True)
    team_id: Mapped[str] = mapped_column(ForeignKey('teams.id'), primary_key=True)

class Game(Base):
    __tablename__ = 'games'
    season: Mapped[str | None] = mapped_column(String(12), index=True)
    source_status: Mapped[str | None] = mapped_column(String(40))
    __table_args__ = (CheckConstraint('home_id <> away_id', name='different_teams'), CheckConstraint('home_score IS NULL OR home_score >= 0', name='home_score_nonnegative'), CheckConstraint('away_score IS NULL OR away_score >= 0', name='away_score_nonnegative'))
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    competition_id: Mapped[str | None] = mapped_column(ForeignKey('competitions.id'), index=True)
    home_id: Mapped[str] = mapped_column(ForeignKey('teams.id'), index=True)
    away_id: Mapped[str] = mapped_column(ForeignKey('teams.id'), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    time: Mapped[str | None] = mapped_column(String(5))
    venue: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), index=True)
    home_score: Mapped[int | None] = mapped_column(Integer)
    away_score: Mapped[int | None] = mapped_column(Integer)
    regulation_periods: Mapped[int] = mapped_column(Integer, default=4)
    period_seconds: Mapped[int] = mapped_column(Integer, default=600)
    period: Mapped[int] = mapped_column(Integer, default=1)
    remaining_seconds: Mapped[int] = mapped_column(Integer, default=600)
    running_since: Mapped[float | None] = mapped_column(Float)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    quarters: Mapped[list] = mapped_column(JSON, default=list)
    lineups: Mapped[dict] = mapped_column(JSON, default=dict)
    imported: Mapped[bool] = mapped_column(Boolean, default=False)
    stats_complete: Mapped[bool] = mapped_column(Boolean, default=True)
    source_id: Mapped[str | None] = mapped_column(String(100), unique=True)
    source_url: Mapped[str | None] = mapped_column(Text)

class PlayerStat(Base):
    __tablename__ = 'player_stats'
    game_id: Mapped[str] = mapped_column(ForeignKey('games.id', ondelete='CASCADE'), primary_key=True)
    athlete_id: Mapped[str] = mapped_column(ForeignKey('athletes.id'), primary_key=True)
    team_id: Mapped[str] = mapped_column(ForeignKey('teams.id'), index=True)
    points: Mapped[int] = mapped_column(Integer, default=0)
    offensive_rebounds: Mapped[int] = mapped_column(Integer, default=0)
    defensive_rebounds: Mapped[int] = mapped_column(Integer, default=0)
    assists: Mapped[int] = mapped_column(Integer, default=0)
    steals: Mapped[int] = mapped_column(Integer, default=0)
    blocks: Mapped[int] = mapped_column(Integer, default=0)
    turnovers: Mapped[int] = mapped_column(Integer, default=0)
    fouls: Mapped[int] = mapped_column(Integer, default=0)
    field_made: Mapped[int] = mapped_column(Integer, default=0)
    field_attempts: Mapped[int] = mapped_column(Integer, default=0)
    free_made: Mapped[int] = mapped_column(Integer, default=0)
    free_attempts: Mapped[int] = mapped_column(Integer, default=0)
    minutes: Mapped[float | None] = mapped_column(Float)
    played: Mapped[bool] = mapped_column(Boolean, default=True)
    starter: Mapped[bool] = mapped_column(Boolean, default=False)

class MatchEvent(Base):
    __tablename__ = 'match_events'
    __table_args__ = (UniqueConstraint('game_id', 'sequence', name='game_sequence_unique'),)
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    game_id: Mapped[str] = mapped_column(ForeignKey('games.id', ondelete='CASCADE'), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(30))
    team_id: Mapped[str] = mapped_column(ForeignKey('teams.id'))
    athlete_id: Mapped[str] = mapped_column(ForeignKey('athletes.id'))
    out_athlete_id: Mapped[str | None] = mapped_column(ForeignKey('athletes.id'))
    period: Mapped[int] = mapped_column(Integer)
    seconds: Mapped[int] = mapped_column(Integer)

class TrainingSlot(Base):
    __tablename__ = 'training_slots'
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    team_id: Mapped[str] = mapped_column(ForeignKey('teams.id'), index=True)
    weekday: Mapped[int] = mapped_column(Integer)
    time: Mapped[str] = mapped_column(String(5))
    venue: Mapped[str] = mapped_column(String(200))
    __table_args__ = (UniqueConstraint('team_id', 'weekday', 'time', name='training_slot_unique'), CheckConstraint('weekday >= 0 AND weekday <= 6', name='weekday_valid'))

class TrainingChange(Base):
    __tablename__ = 'training_changes'
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    team_id: Mapped[str] = mapped_column(ForeignKey('teams.id'), index=True)
    kind: Mapped[str] = mapped_column(String(15))
    slot_id: Mapped[str | None] = mapped_column(ForeignKey('training_slots.id', ondelete='CASCADE'))
    date: Mapped[date] = mapped_column(Date)
    time: Mapped[str | None] = mapped_column(String(5))
    venue: Mapped[str | None] = mapped_column(String(200))
    note: Mapped[str | None] = mapped_column(String(300))
    __table_args__ = (UniqueConstraint('slot_id', 'date', name='training_cancel_unique'),)

class TacticalPlay(Base):
    __tablename__ = 'tactical_plays'
    season: Mapped[str] = mapped_column(String(12), default='local', index=True)
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    team_id: Mapped[str] = mapped_column(ForeignKey('teams.id'), index=True)
    name: Mapped[str] = mapped_column(String(80))
    normalized_name: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(20))
    notes: Mapped[str] = mapped_column(Text)
    board: Mapped[dict] = mapped_column(JSON)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (UniqueConstraint('team_id', 'season', 'normalized_name', name='play_name_unique'),)

class TacticsDraft(Base):
    __tablename__ = 'tactics_drafts'
    season: Mapped[str] = mapped_column(String(12), primary_key=True, default='local')
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    team_id: Mapped[str] = mapped_column(ForeignKey('teams.id'), primary_key=True)
    content: Mapped[dict] = mapped_column(JSON)

class SourceImport(Base):
    __tablename__ = 'source_imports'
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    provider: Mapped[str] = mapped_column(String(100))
    season: Mapped[int] = mapped_column(Integer)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    manifest: Mapped[dict] = mapped_column(JSON)
