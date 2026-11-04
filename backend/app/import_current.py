"""Import the published 2026/27 calendars and available player box scores.

This is a provider snapshot, not a live ESPN connection. Refresh is explicit and
never touches the locked 2024/25 tournament or locally recorded games.
"""
import argparse
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from hashlib import sha256
import json
import math
from pathlib import Path
from urllib.request import urlopen
from zoneinfo import ZoneInfo
import pyarrow.parquet as pq
from sqlalchemy import insert, select
from .config import settings
from .db import SessionLocal
from .import_ncaa import BASE, integer, period_scores
from .models import Athlete, Club, Competition, Enrollment, Game, PlayerStat, SourceImport, Team

YEAR=2027
SEASON='2026/27'
LOCK=Path(__file__).resolve().parents[1]/'ncaa-2027.manifest.json'
SOURCES={g:{
    'schedule':f'{BASE}/espn_{label}_college_basketball_schedules/{g}bb_schedule_{YEAR}.parquet',
    'players':f'{BASE}/espn_{label}_college_basketball_player_boxscores/player_box_{YEAR}.parquet',
} for g,label in [('m','mens'),('w','womens')]}

def source(g,kind,download,refresh=False):
    path=settings.data_dir/f'{g}bb_{kind}_{YEAR}.parquet'
    path.parent.mkdir(parents=True,exist_ok=True)
    if refresh or not path.exists():
        if not download:raise FileNotFoundError(path)
        with urlopen(SOURCES[g][kind],timeout=120) as response:data=response.read(100_000_001)
        if len(data)>100_000_000:raise ValueError('Source exceeds size limit')
        temporary=path.with_suffix('.tmp')
        temporary.write_bytes(data)
        table=pq.read_table(temporary)
        if 'game_id' not in table.column_names or 'season' not in table.column_names:
            raise ValueError('Unexpected provider schema')
        if any(y!=YEAR for y in table['season'].unique().to_pylist()):raise ValueError('Incorrect provider season')
        temporary.replace(path)
    digest=sha256(path.read_bytes()).hexdigest()
    if LOCK.exists() and not refresh:
        expected=next(s['sha256'] for s in json.loads(LOCK.read_text(encoding='utf-8'))['sources'] if s['url']==SOURCES[g][kind])
        if expected!=digest:raise ValueError('Source changed. Review it, then use --refresh explicitly.')
    table=pq.read_table(path)
    if any(y!=YEAR for y in table['season'].unique().to_pylist()):raise ValueError('Incorrect provider season')
    return table.to_pylist(),{'url':SOURCES[g][kind],'sha256':digest,'rows':table.num_rows}

def bulk(db,model,rows):
    for offset in range(0,len(rows),400):db.execute(insert(model),rows[offset:offset+400])

def athlete_id(g,r):
    return f"ncaa-{g}-{YEAR}-athlete-{integer(r['athlete_id'])}-team-{integer(r['team_id'])}"

def import_current(db,download=True,refresh=False,write_manifest=False):
    manifest={'provider':'SportsDataverse / ESPN','season':SEASON,'scope':'Published NCAA calendars (including non-Division-I opponents) and available box scores, men and women','sources':[],'warnings':[],
        'transforms':['Season end year 2027 means academic season 2026/27','Roster snapshots namespaced by season and team; no 2024/25 roster overwritten','Scheduled scores are null, never fabricated 0-0 results','Games with postponed status retained as postponed','Missing athlete identifiers excluded and counted','Official scores retained independently of available individual statistics','Times converted to America/Sao_Paulo; unspecified times remain null']}
    prepared=[]
    # Validate all four sources before making database changes.
    for g in ('m','w'):
        schedules,meta=source(g,'schedule',download,refresh);manifest['sources'].append(meta)
        boxes,meta=source(g,'players',download,refresh);manifest['sources'].append(meta)
        if not schedules:raise ValueError(f'No {g} calendar published')
        if len({integer(r['game_id']) for r in schedules})!=len(schedules):raise ValueError('Duplicate source games')
        prepared.append((g,schedules,boxes))
    known_clubs=set(db.scalars(select(Club.id)))
    known_teams=set(db.scalars(select(Team.id)))
    known_athletes={a.id:a for a in db.scalars(select(Athlete).where(Athlete.season==SEASON))}
    known_games={g.id:g for g in db.scalars(select(Game).where(Game.season==SEASON,Game.imported.is_(True)))}
    enrolled=set(db.execute(select(Enrollment.competition_id,Enrollment.team_id)).tuples())
    existing_stats={(s.game_id,s.athlete_id):s for s in db.scalars(select(PlayerStat).join(Game).where(Game.season==SEASON,Game.imported.is_(True)))}
    all_teams=set();all_athletes=set();all_games=set();statuses=Counter();missing_ids=0;finished_with_boxes=0;missing_box=0;excluded_tbd=0
    for g,schedules,boxes in prepared:
        unresolved=[r for r in schedules if integer(r.get('home_id'))<=0 or integer(r.get('away_id'))<=0]
        if any(r['status_type_completed'] for r in unresolved):raise ValueError('Completed game has unresolved teams')
        excluded_tbd+=len(unresolved)
        schedules=[r for r in schedules if integer(r.get('home_id'))>0 and integer(r.get('away_id'))>0]
        cid=f'ncaa-{g}-{YEAR}'
        gender='Masculino' if g=='m' else 'Feminino'
        competition=db.get(Competition,cid)
        if not competition:
            competition=Competition(id=cid,name=f'NCAA {SEASON} · {gender}',season=SEASON,divisions=[{'category':'Universitário','gender':gender}],ruleset=f'ncaa-{g}',standings_mode='win-rate',source_id=cid,source_url='https://github.com/sportsdataverse/sportsdataverse-data')
            db.add(competition)
        competition.status='em-andamento'
        competition.phase='Temporada regular · cobertura parcial'
        competition.note='Calendário publicado e box scores disponíveis em 2026/27. Inclui adversários de outras divisões. Campanha calculada dos jogos importados; não é ranking oficial da NCAA.'
        club_rows=[];team_rows=[];registrations=[]
        schedule_by_id={integer(r['game_id']):r for r in schedules}
        for r in schedules:
            for side in ('home','away'):
                tid=integer(r[f'{side}_id']);club_id=f'ncaa-club-{tid}';team_id=f'ncaa-{g}-team-{tid}'
                if tid<=0:raise ValueError('Missing team identifier')
                all_teams.add(team_id)
                if club_id not in known_clubs:
                    club_rows.append({'id':club_id,'name':r[f'{side}_location'],'short_name':r.get(f'{side}_abbreviation') or r[f'{side}_location'][:10],'city':'Estados Unidos'})
                    known_clubs.add(club_id)
                if team_id not in known_teams:
                    team_rows.append({'id':team_id,'club_id':club_id,'category':'Universitário','gender':gender,'source_id':team_id})
                    known_teams.add(team_id)
                if (cid,team_id) not in enrolled:
                    registrations.append({'competition_id':cid,'team_id':team_id});enrolled.add((cid,team_id))
        bulk(db,Club,club_rows);bulk(db,Team,team_rows);db.flush();bulk(db,Enrollment,registrations)
        valid=[];roster={};by_game=defaultdict(list)
        for r in boxes:
            if r.get('athlete_id') is None or integer(r['athlete_id'])<=0:
                missing_ids+=1;continue
            match=schedule_by_id.get(integer(r['game_id']))
            if not match or not match['status_type_completed']:raise ValueError('Box score without a completed calendar game')
            if integer(r['team_id']) not in (integer(match['home_id']),integer(match['away_id'])):raise ValueError('Box score team differs from game')
            aid=athlete_id(g,r);all_athletes.add(aid)
            jersey=str(r.get('athlete_jersey') or '')
            roster[aid]={'id':aid,'season':SEASON,'team_id':f"ncaa-{g}-team-{integer(r['team_id'])}",'name':r['athlete_display_name'],'number':int(jersey) if jersey.isdigit() else None,'position':r.get('athlete_position_name') or r.get('athlete_position_abbreviation') or 'Não informada','photo_url':r.get('athlete_headshot_href'),'status':'registrado','source_id':aid}
            valid.append(r);by_game[integer(r['game_id'])].append(r)
        bulk(db,Athlete,[r for id,r in roster.items() if id not in known_athletes])
        for aid,row in roster.items():
            if aid in known_athletes:
                for key,value in row.items():setattr(known_athletes[aid],key,value)
        db.flush()
        games=[]
        for r in schedules:
            gid=f"ncaa-{g}-{YEAR}-game-{integer(r['game_id'])}";all_games.add(gid)
            instant=datetime.fromisoformat(str(r['date']).replace('Z','+00:00')).astimezone(ZoneInfo('America/Sao_Paulo'))
            if not date(2026,7,1)<=instant.date()<=date(2027,7,1):raise ValueError('Game date outside 2026/27')
            final=bool(r['status_type_completed'])
            if final and instant>datetime.now(timezone.utc):raise ValueError('Source marks a future game as final')
            status='encerrado' if final else 'adiado' if r['status_type_name']=='STATUS_POSTPONED' else 'agendado'
            statuses[status]+=1
            source_rows=by_game[integer(r['game_id'])]
            complete=False
            if final:
                complete=bool(source_rows) and all(sum(integer(p.get('points')) for p in source_rows if integer(p['team_id'])==integer(r[f'{side}_id']))==integer(r[f'{side}_score']) for side in ('home','away'))
                if source_rows:finished_with_boxes+=1
                else:missing_box+=1
                if not complete:manifest['warnings'].append({'gameId':gid,'reason':'Official final score retained; individual statistics are missing or differ from that score.'})
            h,a=period_scores(r.get('home_linescores')),period_scores(r.get('away_linescores'))
            row={'id':gid,'season':SEASON,'source_status':r['status_type_name'],'competition_id':cid,'home_id':f"ncaa-{g}-team-{integer(r['home_id'])}",'away_id':f"ncaa-{g}-team-{integer(r['away_id'])}",'date':instant.date(),'time':instant.strftime('%H:%M') if r.get('time_valid') else None,'venue':r.get('venue_full_name'),'status':status,'home_score':integer(r['home_score']) if final else None,'away_score':integer(r['away_score']) if final else None,'regulation_periods':2 if g=='m' else 4,'period_seconds':1200 if g=='m' else 600,'period':integer(r.get('status_period'),2 if g=='m' else 4) if final else 1,'remaining_seconds':0 if final else 1200 if g=='m' else 600,'running_since':None,'quarters':[{'home':x,'away':y} for x,y in zip(h,a)] if final else [],'imported':True,'stats_complete':complete,'source_id':gid,'source_url':f"https://www.espn.com/{'mens' if g=='m' else 'womens'}-college-basketball/game/_/gameId/{integer(r['game_id'])}"}
            old=known_games.get(gid)
            if old:
                changed=any(getattr(old,key)!=value for key,value in row.items())
                if changed:
                    for key,value in row.items():setattr(old,key,value)
                    old.revision+=1
            else:games.append(row)
        bulk(db,Game,games);db.flush()
        mapping={'points':'points','offensive_rebounds':'offensive_rebounds','defensive_rebounds':'defensive_rebounds','assists':'assists','steals':'steals','blocks':'blocks','turnovers':'turnovers','fouls':'fouls','field_made':'field_goals_made','field_attempts':'field_goals_attempted','free_made':'free_throws_made','free_attempts':'free_throws_attempted'}
        lines=[]
        for r in valid:
            gid=f"ncaa-{g}-{YEAR}-game-{integer(r['game_id'])}";aid=athlete_id(g,r)
            minutes=float(r['minutes']) if r.get('minutes') is not None else None
            row={'game_id':gid,'athlete_id':aid,'team_id':f"ncaa-{g}-team-{integer(r['team_id'])}",'minutes':minutes if minutes is not None and math.isfinite(minutes) else None,'played':not bool(r.get('did_not_play')),'starter':bool(r.get('starter')),**{target:integer(r.get(source)) for target,source in mapping.items()}}
            old=existing_stats.get((gid,aid))
            if old:
                for key,value in row.items():setattr(old,key,value)
            else:lines.append(row)
        bulk(db,PlayerStat,lines);db.flush()
    manifest['counts']={'teams':len(all_teams),'games':len(all_games),'athletes':len(all_athletes),'completed':statuses['encerrado'],'scheduled':statuses['agendado'],'postponed':statuses['adiado'],'completedWithBoxScores':finished_with_boxes,'completedWithoutBoxScores':missing_box,'excludedPlayerRowsWithoutId':missing_ids,'excludedGamesWithTbdTeams':excluded_tbd}
    record=db.get(SourceImport,'ncaa-2027')
    if not record:
        record=SourceImport(id='ncaa-2027',provider='SportsDataverse / ESPN',season=YEAR)
        db.add(record)
    changed=record.manifest!=manifest
    record.manifest=manifest
    if changed:record.imported_at=datetime.now(timezone.utc)
    db.commit()
    if write_manifest:
        LOCK.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return manifest

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offline',action='store_true')
    parser.add_argument('--refresh',action='store_true',help='Explicitly download and validate the latest provider snapshot')
    args=parser.parse_args()
    if args.offline and args.refresh:parser.error('--offline and --refresh cannot be combined')
    with SessionLocal() as db:manifest=import_current(db,download=not args.offline,refresh=args.refresh,write_manifest=True)
    print(json.dumps({'season':SEASON,'counts':manifest['counts'],'warnings':len(manifest['warnings'])},ensure_ascii=False,indent=2))
