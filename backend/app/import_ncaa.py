"""Reproducible import of SportsDataverse's existing 2025 NCAA tournament dataset."""
import argparse
from collections import defaultdict
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
from urllib.request import urlopen
from zoneinfo import ZoneInfo
import pyarrow.parquet as pq
import pyarrow as pa
import pyarrow.compute as pc
from sqlalchemy import select
from .config import settings
from .db import SessionLocal
from .models import Athlete, Club, Competition, Enrollment, Game, PlayerStat, SourceImport, Team

BASE = 'https://github.com/sportsdataverse/sportsdataverse-data/releases/download'
SOURCES = {gender: {
    'schedule': f'{BASE}/espn_{label}_college_basketball_schedules/{gender}bb_schedule_2025.parquet',
    'players': f'{BASE}/espn_{label}_college_basketball_player_boxscores/player_box_2025.parquet',
} for gender, label in [('m', 'mens'), ('w', 'womens')]}

def read_source(gender, kind, download=True, game_ids=None):
    path = settings.data_dir / f'{gender}bb_{kind}_2025.parquet'
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        if not download:
            raise FileNotFoundError(path)
        # Fixed provider URL, never accepts arbitrary user-controlled URLs.
        with urlopen(SOURCES[gender][kind], timeout=120) as response:
            data = response.read(100_000_001)
        if len(data) > 100_000_000:
            raise ValueError('Source exceeds size limit')
        temporary = path.with_suffix('.tmp')
        temporary.write_bytes(data)
        pq.read_schema(temporary)
        temporary.replace(path)
    digest = sha256(path.read_bytes()).hexdigest()
    lock = Path(__file__).resolve().parents[1] / 'ncaa-2025.manifest.json'
    if lock.exists():
        expected = next(s['sha256'] for s in json.loads(lock.read_text(encoding='utf-8'))['sources'] if s['url'] == SOURCES[gender][kind])
        if digest != expected:
            raise ValueError(f'Source checksum changed: {path.name}. Review before updating the manifest.')
    table = pq.read_table(path)
    if kind == 'schedule':
        table = table.filter(pc.and_(pc.equal(table['tournament_id'],22),table['status_type_completed']))
    elif game_ids is not None:
        table = table.filter(pc.is_in(table['game_id'], value_set=pa.array(sorted(game_ids), type=table['game_id'].type)))
    return table.to_pylist(), {'url': SOURCES[gender][kind], 'sha256': digest}

def integer(value, default=0):
    return int(float(value)) if value is not None and str(value).strip() not in ('', '--', 'nan') else default

def period_scores(value):
    # Parquet stores a Python-like textual array. Extract numeric values only; never eval.
    return [int(float(n)) for n in re.findall(r"'value':\s*([0-9]+(?:\.[0-9]+)?)", str(value))]

def import_dataset(db, download=True):
    known_clubs = set(db.scalars(select(Club.id)))
    known_teams = set(db.scalars(select(Team.id)))
    known_athletes = set(db.scalars(select(Athlete.id)))
    known_games = set(db.scalars(select(Game.id)))
    known_enrollments = set(db.execute(select(Enrollment.competition_id, Enrollment.team_id)).tuples())
    known_stats = set(db.execute(select(PlayerStat.game_id, PlayerStat.athlete_id)).tuples())
    manifest = {'provider': 'SportsDataverse / ESPN', 'season': '2024/25', 'scope': 'NCAA Division I national tournaments, men and women', 'sources': [], 'warnings': [], 'transforms': ['Tournament 22, completed games only', 'IDs namespaced by gender', 'Times converted to America/Sao_Paulo', 'Absent demographic data kept null', 'Official score retained when box score differs']}
    total_games = set()
    total_athletes = set()
    for gender in ('m', 'w'):
        schedules, source = read_source(gender, 'schedule', download)
        manifest['sources'].append(source)
        games = [r for r in schedules if r.get('tournament_id') == 22 and r.get('status_type_completed')]
        game_ids = {int(r['game_id']) for r in games}
        players, source = read_source(gender, 'players', download, game_ids)
        manifest['sources'].append(source)
        boxes = [r for r in players if int(r['game_id']) in game_ids]
        if len(games) != 67 or not boxes:
            raise ValueError(f'Unexpected {gender} tournament coverage: {len(games)} games')
        cid = f'ncaa-{gender}-2025'
        division = {'category': 'Universitário', 'gender': 'Masculino' if gender == 'm' else 'Feminino'}
        existing = db.get(Competition, cid)
        if not existing:
            db.add(Competition(id=cid, name=f"NCAA 2025 · {division['gender']}", status='finalizado', phase='Torneio nacional encerrado', note='Base histórica 2024/25. Campanha calculada apenas dos jogos importados; não é ranking oficial da NCAA.', season='2024/25', divisions=[division], ruleset=f'ncaa-{gender}', standings_mode='win-rate', source_id=cid, source_url='https://github.com/sportsdataverse/sportsdataverse-data'))
        team_rows = {}
        for r in games:
            for side in ('home', 'away'):
                tid = integer(r[f'{side}_id'])
                team_rows[tid] = (r[f'{side}_location'], r[f'{side}_abbreviation'])
        for tid, (name, short) in team_rows.items():
            club_id, team_id = f'ncaa-club-{tid}', f'ncaa-{gender}-team-{tid}'
            if club_id not in known_clubs:
                db.add(Club(id=club_id, name=name, short_name=short or name[:10], city='Estados Unidos'))
                db.flush()
                known_clubs.add(club_id)
            if team_id not in known_teams:
                db.add(Team(id=team_id, club_id=club_id, category=division['category'], gender=division['gender'], source_id=team_id))
                db.flush()
                known_teams.add(team_id)
            if (cid, team_id) not in known_enrollments:
                db.add(Enrollment(competition_id=cid, team_id=team_id))
                known_enrollments.add((cid, team_id))
        db.flush()
        for r in boxes:
            aid = f"ncaa-{gender}-athlete-{integer(r['athlete_id'])}"
            total_athletes.add(aid)
            if aid not in known_athletes:
                jersey = str(r.get('athlete_jersey') or '')
                db.add(Athlete(id=aid, season='2024/25', team_id=f"ncaa-{gender}-team-{integer(r['team_id'])}", name=r['athlete_display_name'], number=int(jersey) if jersey.isdigit() else None, position=r.get('athlete_position_name') or r.get('athlete_position_abbreviation') or 'Não informada', photo_url=r.get('athlete_headshot_href'), status='historico', source_id=aid))
                known_athletes.add(aid)
        db.flush()
        by_game = defaultdict(list)
        for r in boxes:
            by_game[integer(r['game_id'])].append(r)
        for r in games:
            gid = f"ncaa-{gender}-game-{integer(r['game_id'])}"
            total_games.add(gid)
            sums = {side: sum(integer(p['points']) for p in by_game[integer(r['game_id'])] if integer(p['team_id']) == integer(r[f'{side}_id'])) for side in ('home', 'away')}
            complete = all(sums[side] == integer(r[f'{side}_score']) for side in sums)
            if not complete:
                manifest['warnings'].append({'gameId': gid, 'officialScore': [integer(r['home_score']), integer(r['away_score'])], 'boxScoreSum': [sums['home'], sums['away']], 'reason': 'Individual points differ from official score; official score preserved.'})
            instant = datetime.fromisoformat(str(r['date']).replace('Z', '+00:00')).astimezone(ZoneInfo('America/Sao_Paulo'))
            home_periods, away_periods = period_scores(r.get('home_linescores')), period_scores(r.get('away_linescores'))
            quarters = [{'home': h, 'away': a} for h, a in zip(home_periods, away_periods)]
            if gid not in known_games:
                db.add(Game(id=gid, season='2024/25', competition_id=cid, home_id=f"ncaa-{gender}-team-{integer(r['home_id'])}", away_id=f"ncaa-{gender}-team-{integer(r['away_id'])}", date=instant.date(), time=instant.strftime('%H:%M'), venue=r.get('venue_full_name'), status='encerrado', home_score=integer(r['home_score']), away_score=integer(r['away_score']), regulation_periods=2 if gender == 'm' else 4, period_seconds=1200 if gender == 'm' else 600, period=integer(r.get('status_period'), 2 if gender == 'm' else 4), remaining_seconds=0, quarters=quarters, imported=True, stats_complete=complete, source_id=gid, source_url=f"https://www.espn.com/{'mens' if gender == 'm' else 'womens'}-college-basketball/boxscore/_/gameId/{integer(r['game_id'])}"))
        db.flush()
        mapping = {'offensive_rebounds': 'offensive_rebounds', 'defensive_rebounds': 'defensive_rebounds', 'points': 'points', 'assists': 'assists', 'steals': 'steals', 'blocks': 'blocks', 'turnovers': 'turnovers', 'fouls': 'fouls', 'field_made': 'field_goals_made', 'field_attempts': 'field_goals_attempted', 'free_made': 'free_throws_made', 'free_attempts': 'free_throws_attempted'}
        for r in boxes:
            gid, aid = f"ncaa-{gender}-game-{integer(r['game_id'])}", f"ncaa-{gender}-athlete-{integer(r['athlete_id'])}"
            if (gid, aid) not in known_stats:
                db.add(PlayerStat(game_id=gid, athlete_id=aid, team_id=f"ncaa-{gender}-team-{integer(r['team_id'])}", played=not bool(r.get('did_not_play')), starter=bool(r.get('starter')), minutes=float(r['minutes']) if r.get('minutes') is not None else None, **{target: integer(r.get(source)) for target, source in mapping.items()}))
                known_stats.add((gid, aid))
        db.flush()
    manifest['counts'] = {'teams': 136, 'games': len(total_games), 'athletes': len(total_athletes)}
    old = db.get(SourceImport, 'ncaa-2025')
    if old and old.manifest['sources'] != manifest['sources']:
        raise ValueError('Source checksums changed. Review upstream changes before reimporting.')
    if not old:
        db.add(SourceImport(id='ncaa-2025', provider='SportsDataverse / ESPN', season=2025, imported_at=datetime.now(timezone.utc), manifest=manifest))
    db.commit()
    return manifest

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    with SessionLocal() as db:
        manifest = import_dataset(db, download=not args.offline)
    print(json.dumps({'counts': manifest['counts'], 'warnings': manifest['warnings']}, ensure_ascii=False, indent=2))
