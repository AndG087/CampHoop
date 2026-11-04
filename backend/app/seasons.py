import re
from datetime import datetime
from zoneinfo import ZoneInfo
from fastapi import HTTPException
from sqlalchemy import select
from .models import Athlete, Game, SourceImport, TeamSeason

def available_seasons(db,viewer=None,public=False):
    imported={s.manifest['season'] for s in db.scalars(select(SourceImport))}
    local=set(db.scalars(select(TeamSeason.season).distinct()))
    if public:
        current=int(academic_season(datetime.now(ZoneInfo('America/Sao_Paulo')).date())[:4])
        played=set(db.scalars(select(Game.season).distinct()))
        visible={label for label in local & played if int(label[:4])<=current+2}
        if viewer and viewer.role=='tecnico':
            from .auth import coached_team_ids
            visible.update(db.scalars(select(TeamSeason.season).where(TeamSeason.team_id.in_(coached_team_ids(db,viewer)))))
        elif viewer and viewer.role=='atleta' and viewer.athlete_id:
            from .auth import own_athlete_ids
            visible.update(db.scalars(select(Athlete.season).where(Athlete.id.in_(own_athlete_ids(db,viewer)))))
        local &= visible
    return sorted(imported | local,reverse=True)

def validate_new_season(value,day=None):
    validate_season(value)
    current=int(academic_season(day or datetime.now(ZoneInfo('America/Sao_Paulo')).date())[:4])
    if not current-1<=int(value[:4])<=current+2:
        raise HTTPException(422,f'Cadastre temporadas entre {current-1}/{str(current)[-2:]} e {current+2}/{str(current+3)[-2:]}.')
    return value

def is_historical(value,day=None):
    day=day or datetime.now(ZoneInfo('America/Sao_Paulo')).date()
    return bool(value and int(value[:4])+1<=day.year and f'{int(value[:4])+1}-07-01'<=day.isoformat())

def validate_season(value):
    if not isinstance(value,str) or not re.fullmatch(r'20\d{2}/\d{2}',value) or int(value[-2:])!=(int(value[:4])+1)%100:
        raise HTTPException(422,'Use uma temporada válida, por exemplo 2026/27 (anos consecutivos).')
    return value

def resolve_season(db,requested=None):
    seasons=available_seasons(db)
    if requested is not None:
        validate_season(requested)
        if seasons and requested not in seasons:
            raise HTTPException(422,'Temporada não disponível. Escolha uma das temporadas publicadas.')
        return requested
    latest=db.scalar(select(SourceImport).order_by(SourceImport.season.desc()).limit(1))
    return latest.manifest['season'] if latest else seasons[0] if seasons else None

def academic_season(day):
    start=day.year if day.month>=7 else day.year-1
    return f'{start}/{str(start+1)[-2:]}'
