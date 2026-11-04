from collections import defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from types import SimpleNamespace
from sqlalchemy import select
from sqlalchemy.orm import Session
from .models import Athlete, Club, ClubMember, Competition, Enrollment, Game, MatchEvent, PlayerStat, Team, TeamSeason, TrainingChange, TrainingSlot, User
from .seasons import resolve_season
from .auth import can_coach, coached_team_ids, own_athlete_ids, work_team_id
from .account_utils import active_club_id

def today():
    return datetime.now(ZoneInfo('America/Sao_Paulo')).date()

def seconds_left(game: Game):
    elapsed = max(0, int(datetime.now().timestamp() - game.running_since / 1000)) if game.running_since is not None else 0
    return max(0, game.remaining_seconds - elapsed)

def period_label(game: Game):
    if game.period > game.regulation_periods:
        return f'{game.period - game.regulation_periods}ª prorrogação'
    return f'{game.period}º tempo' if game.regulation_periods == 2 else f'{game.period}º período'

def clock_label(game: Game):
    remaining = seconds_left(game)
    return f'{period_label(game)} · {remaining // 60:02}:{remaining % 60:02}'

class Snapshot:
    """Season-scoped reads; live projections load only one game and its two rosters."""
    def __init__(self, db: Session, season: str | None = None, game: Game | None = None):
        self.db=db
        self.season = resolve_season(db, season)
        team_ids=[game.home_id,game.away_id] if game else None
        club_query=select(Club).join(Team).where(Team.id.in_(team_ids)) if game else select(Club)
        team_query=select(Team).where(Team.id.in_(team_ids)) if game else select(Team)
        athlete_query=select(Athlete).where(Athlete.season==self.season) if self.season else select(Athlete)
        if game:athlete_query=athlete_query.where(Athlete.team_id.in_(team_ids))
        competition_query=select(Competition).where(Competition.season==self.season) if self.season else select(Competition)
        if game:competition_query=competition_query.where(Competition.id==game.competition_id)
        self.clubs = {r.id: r for r in db.scalars(club_query)}
        self.teams = {r.id: r for r in db.scalars(team_query)}
        periods_query=select(TeamSeason).where(TeamSeason.season==self.season) if self.season else select(TeamSeason).where(False)
        if game:periods_query=periods_query.where(TeamSeason.team_id.in_(team_ids))
        self.periods={p.team_id:p for p in db.scalars(periods_query)}
        for id,p in self.periods.items():
            if id in self.teams:
                t=self.teams[id]
                self.teams[id]=SimpleNamespace(id=id,club_id=t.club_id,source_id=t.source_id,owner_id=t.owner_id,name=p.name,category=p.category,gender=p.gender,coach=p.coach,revision=p.revision)
        self.athletes = {r.id: r for r in db.scalars(athlete_query)}
        self.competitions = {r.id: r for r in db.scalars(competition_query)}
        self.games = {game.id:game} if game else {r.id: r for r in db.scalars(select(Game).where(Game.season == self.season) if self.season else select(Game))}
        self.enrolled = defaultdict(list)
        enrollment_query=select(Enrollment).where(Enrollment.competition_id==game.competition_id) if game else select(Enrollment)
        for r in db.scalars(enrollment_query):
            if r.competition_id in self.competitions:
                self.enrolled[r.competition_id].append(r.team_id)
        line_query=select(PlayerStat).where(PlayerStat.game_id==game.id) if game else select(PlayerStat).join(Game).where(Game.season==self.season) if self.season else select(PlayerStat)
        self.lines = list(db.scalars(line_query))
        self.roster = defaultdict(list)
        for a in self.athletes.values(): self.roster[a.team_id].append(a)
        self.completed_by_team = defaultdict(list)
        for g in self.games.values():
            if g.status == 'encerrado':
                self.completed_by_team[g.home_id].append(g)
                self.completed_by_team[g.away_id].append(g)
        if self.season:
            visible = set(self.periods) | set(self.roster) | {t for ids in self.enrolled.values() for t in ids} | {t for g in self.games.values() for t in (g.home_id,g.away_id)}
            self.teams = {id:t for id,t in self.teams.items() if id in visible}
        self.by_athlete = defaultdict(list)
        for r in self.lines:
            if self.games[r.game_id].status == 'encerrado' and r.played:
                self.by_athlete[r.athlete_id].append(r)

    def team(self, id: str):
        t = self.teams[id]
        c = self.clubs[t.club_id]
        return {'id': t.id, 'club': {'id': c.id, 'name': c.name, 'shortName': c.short_name, 'city': c.city}, 'category': t.category, 'gender': t.gender, 'name': t.name or f'{t.category} {t.gender}', 'season':self.season,'revision':getattr(t,'revision',0),'imported':bool(t.source_id)}

    def competition(self, id: str):
        c = self.competitions[id]
        return {'id': c.id, 'name': c.name, 'status': c.status, 'phase': c.phase, 'categories': ' · '.join(f"{d['category']} {d['gender']}" for d in c.divisions), 'teams': len(self.enrolled[id]), 'note': c.note, 'divisions': c.divisions, 'organizerId': c.organizer_id, 'season': c.season, 'ruleset': c.ruleset, 'standingsMode': c.standings_mode, 'sourceUrl': c.source_url}

    def game(self, id: str):
        g = self.games[id]
        return {'id': g.id, 'season': g.season, 'sourceStatus': g.source_status, 'imported': g.imported, 'date': g.date.isoformat(), 'time': g.time, 'status': g.status, 'home': self.team(g.home_id), 'away': self.team(g.away_id), 'homeScore': g.home_score, 'awayScore': g.away_score, 'period': clock_label(g) if g.status == 'ao-vivo' else None, 'venue': g.venue, 'competition': self.competitions[g.competition_id].name if g.competition_id else 'Amistoso'}

    def athlete(self, id: str):
        a = self.athletes[id]
        lines = self.by_athlete[id]
        age = None
        if a.birth_date:
            d = today()
            age = d.year - a.birth_date.year - ((d.month, d.day) < (a.birth_date.month, a.birth_date.day))
        return {'id': a.id, 'season': a.season, 'revision':a.revision,'imported':bool(a.source_id),'name': a.name, 'number': a.number, 'position': a.position, 'photoUrl': a.photo_url, 'age': age, 'heightCm': a.height_cm, 'memberSince': a.member_since, 'status': a.status, 'team': self.team(a.team_id), 'games': len(lines), 'pointsPerGame': round(sum(r.points for r in lines) / len(lines), 1) if lines else 0}

    def athlete_profile(self, id: str, viewer: User | None):
        a = self.athletes[id]
        lines = sorted(self.by_athlete[id], key=lambda s: (self.games[s.game_id].date, s.game_id), reverse=True)
        private = None
        if viewer and (can_coach(self.db,viewer,a.team_id) or a.id in own_athlete_ids(self.db,viewer)):
            private = {'birthDate': a.birth_date.isoformat() if a.birth_date else None, 'development': a.development}
        games = []
        for line in lines[:5]:
            g = self.games[line.game_id]
            home = g.home_id == a.team_id
            games.append({'matchId': g.id, 'date': g.date.isoformat(), 'opponent': self.team(g.away_id if home else g.home_id)['club'], 'home': home, 'points': line.points, 'rebounds': line.offensive_rebounds + line.defensive_rebounds, 'assists': line.assists, 'minutes': line.minutes})
        return {**self.athlete(id), 'reboundsPerGame': round(sum(r.offensive_rebounds + r.defensive_rebounds for r in lines) / len(lines), 1) if lines else 0, 'assistsPerGame': round(sum(r.assists for r in lines) / len(lines), 1) if lines else 0, 'recentGames': games, 'private': private}

    def played(self, team_id: str):
        return self.completed_by_team[team_id]

    def team_summary(self, id: str):
        t = self.teams[id]
        games = self.played(id)
        wins = sum((g.home_score > g.away_score) == (g.home_id == id) for g in games)
        return {'team': self.team(id), 'coach': t.coach or 'Não informado na fonte', 'athletes': len(self.roster[id]), 'games': len(games), 'wins': wins, 'losses': len(games) - wins, 'competitions': [{k: self.competition(c.id)[k] for k in ('id', 'name', 'status')} for c in self.competitions.values() if id in self.enrolled[c.id]]}

    def team_profile(self, id: str):
        summary = self.team_summary(id)
        games = self.played(id)
        scores = [(g.home_score, g.away_score) if g.home_id == id else (g.away_score, g.home_score) for g in games]
        next_games = sorted((g for g in self.games.values() if g.status != 'encerrado' and id in (g.home_id, g.away_id)), key=lambda g: (g.date, g.time or ''))
        return {**summary, 'pointsFor': round(sum(s[0] for s in scores) / len(scores), 1) if scores else 0, 'pointsAgainst': round(sum(s[1] for s in scores) / len(scores), 1) if scores else 0, 'pointDiff': round(sum(s[0] - s[1] for s in scores) / len(scores), 1) if scores else 0, 'winRate': round(summary['wins'] / len(games) * 100) if games else 0, 'roster': [self.athlete(a.id) for a in sorted(self.roster[id], key=lambda a: (a.number is None, a.number or 0, a.name))], 'recentGames': [self.game(g.id) for g in sorted(games, key=lambda g: (g.date, g.id), reverse=True)[:5]], 'nextGame': self.game(next_games[0].id) if next_games else None}

    def competition_profile(self, id: str):
        c = self.competitions[id]
        games = sorted((g for g in self.games.values() if g.competition_id == id), key=lambda g: (g.date, g.time or '', g.id))
        standings = []
        for division in c.divisions:
            teams = [self.teams[t] for t in self.enrolled[id] if self.teams[t].category == division['category'] and self.teams[t].gender == division['gender']]
            rows = []
            for t in teams:
                played = [g for g in games if g.status == 'encerrado' and t.id in (g.home_id, g.away_id)]
                scores = [(g.home_score, g.away_score) if g.home_id == t.id else (g.away_score, g.home_score) for g in played]
                wins = sum(a > b for a, b in scores)
                rows.append({'team': self.team(t.id), 'played': len(played), 'wins': wins, 'losses': len(played) - wins, 'points': wins * 2 + len(played) - wins if c.standings_mode == 'points' else wins, 'pointsFor': sum(a for a, _ in scores), 'pointsAgainst': sum(b for _, b in scores), 'difference': sum(a - b for a, b in scores), 'winRate': round(wins / len(played) * 100, 1) if played else 0, 'form': ['V' if a > b else 'D' for a, b in scores[-5:]]})
            rows.sort(key=lambda r: (-(r['winRate'] if c.standings_mode == 'win-rate' else r['points']), -r['wins'], -r['difference'], -r['pointsFor'], r['team']['club']['name']))
            standings.append({'division': division, 'rows': rows})
        return {**self.competition(id), 'enrolled': [self.team(t) for t in sorted(self.enrolled[id])], 'games': [self.game(g.id) for g in games], 'standings': standings}

def user_json(db: Session, user: User):
    selected_team=work_team_id(db,user)
    team = db.get(Team, selected_team) if selected_team else None
    club = db.get(Club, team.club_id) if team else None
    memberships=[{'id':c.id,'name':c.name,'role':m.role} for c,m in db.execute(select(Club,ClubMember).join(ClubMember).where(ClubMember.user_id==user.id).order_by(Club.name))]
    active_club=active_club_id(db,user)
    context=f'Conta de teste · {club.name}' if user.is_demo and club else 'Conta de teste CampHoop' if user.is_demo else club.name if club else next((m['name'] for m in memberships if m['id']==active_club),'Sua conta CampHoop')
    managed=list(db.scalars(select(Team.id).join(Club).where(Team.source_id.is_(None),(Team.owner_id==user.id)|(Club.owner_id==user.id)))) if user.role=='tecnico' else []
    return {'id':user.id,'email':user.email,'name':user.name,'initials':''.join(p[0] for p in user.name.split()[:2]),'role':user.role,'context':context,'isDemo':user.is_demo,'operatorTeamIds':list(db.scalars(select(ClubMember.team_id).where(ClubMember.user_id==user.id,ClubMember.role=='estatistico',ClubMember.team_id.is_not(None)))),'emailVerified':user.email_verified,'hasPassword':user.has_password,'emailNotifications':user.email_notifications,'activeClubId':active_club,'clubs':memberships,'teamId':selected_team,'teamIds':sorted(coached_team_ids(db,user)),'managedTeamIds':managed,'athleteId':user.athlete_id,'athleteIds':sorted(own_athlete_ids(db,user)),'competitionIds':list(db.scalars(select(Competition.id).where(Competition.organizer_id==user.id,True if user.is_demo else Competition.club_id.in_(select(ClubMember.club_id).where(ClubMember.user_id==user.id,ClubMember.role=='organizador')))))}

def schedule_json(db: Session, snapshot: Snapshot, start: date, end: date, viewer: User | None):
    events = [{'kind': 'jogo', 'id': g.id, 'date': g.date.isoformat(), 'time': g.time, 'game': snapshot.game(g.id)} for g in snapshot.games.values() if start <= g.date <= end]
    if viewer and work_team_id(db,viewer):
        team_id = work_team_id(db,viewer)
        slots = list(db.scalars(select(TrainingSlot).where(TrainingSlot.team_id == team_id)))
        changes = list(db.scalars(select(TrainingChange).where(TrainingChange.team_id == team_id, TrainingChange.date.between(start, end))))
        d = start
        while d <= end:
            has_game = any(g.date == d and team_id in (g.home_id, g.away_id) for g in snapshot.games.values())
            for s in slots:
                if (d.weekday() + 1) % 7 != s.weekday or has_game:
                    continue
                cancelled = any(c.kind == 'cancelado' and c.slot_id == s.id and c.date == d for c in changes)
                events.append({'kind': 'treino', 'id': f't-{s.id}-{d}', 'date': d.isoformat(), 'time': s.time, 'team': snapshot.team(team_id), 'venue': s.venue, 'slotId': s.id, 'cancelled': cancelled, 'note': None})
            d += timedelta(days=1)
        for c in changes:
            if c.kind == 'avulso':
                events.append({'kind': 'treino', 'id': c.id, 'date': c.date.isoformat(), 'time': c.time, 'team': snapshot.team(team_id), 'venue': c.venue, 'slotId': None, 'cancelled': False, 'note': c.note})
    return sorted(events, key=lambda e: (e['date'], e['time'] or '', e['id']))

def home_json(db: Session, s: Snapshot, viewer: User, scope: str):
    team_id = work_team_id(db,viewer) if scope == 'minha' else None
    teams = [t for t in s.teams.values() if not team_id or t.id == team_id]
    roster = [a for a in s.athletes.values() if not team_id or a.team_id == team_id]
    games = sorted((g for g in s.games.values() if g.status == 'encerrado' and (not team_id or team_id in (g.home_id, g.away_id))), key=lambda g: (g.date, g.id))
    leaders = []
    for a in roster:
        lines = s.by_athlete[a.id]
        if lines:
            leaders.append({'id': a.id, 'name': a.name, 'number': a.number, 'position': a.position, 'team': s.team(a.team_id), 'games': len(lines), 'points': round(sum(l.points for l in lines) / len(lines), 1), 'rebounds': round(sum(l.offensive_rebounds + l.defensive_rebounds for l in lines) / len(lines), 1), 'assists': round(sum(l.assists for l in lines) / len(lines), 1)})
    performance = []
    for g in games:
        home = not team_id or g.home_id == team_id
        performance.append({'id': g.id, 'date': g.date.isoformat(), 'scored': g.home_score if home else g.away_score, 'allowed': g.away_score if home else g.home_score, 'label': s.team(g.away_id if home else g.home_id)['club']['name'] if team_id else f"{s.team(g.home_id)['club']['shortName']} × {s.team(g.away_id)['club']['shortName']}"})
    events = [e for e in schedule_json(db, s, today(), today() + timedelta(days=30), viewer) if not (e['kind'] == 'treino' and e['cancelled']) and (not team_id or e['kind'] == 'treino' or team_id in (e['game']['home']['id'], e['game']['away']['id']))]
    comps = [c for c in s.competitions.values() if any(t.id in s.enrolled[c.id] for t in teams)]
    week = [e for e in events if e['date'] < (today() + timedelta(days=7)).isoformat()]
    return {'teams': [s.team_summary(t.id) for t in teams], 'athletes': len(roster), 'activeAthletes': len([a for a in roster if a.status in ('ativo', 'historico', 'registrado')]), 'games': len(games), 'activeCompetitions': sum(c.status == 'em-andamento' for c in comps), 'live': [e['game'] for e in events if e['kind'] == 'jogo' and e['game']['status'] == 'ao-vivo'], 'upcoming': [e for e in events if e['kind'] == 'treino' or e['game']['status'] == 'agendado'][:5], 'results': [s.game(g.id) for g in reversed(games[-5:])], 'leaders': leaders, 'competitions': [s.competition(c.id) for c in comps], 'performance': performance[-6:], 'pointsPerGame': round(sum(p['scored'] if team_id else (p['scored'] + p['allowed']) / 2 for p in performance) / len(games), 1) if games else 0, 'pointsAgainst': round(sum(p['allowed'] for p in performance) / len(games), 1) if games else 0, 'weekGames': sum(e['kind'] == 'jogo' and e['game']['status'] == 'agendado' for e in week), 'weekTrainings': sum(e['kind'] == 'treino' for e in week)}
