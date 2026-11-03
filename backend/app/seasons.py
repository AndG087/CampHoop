import re
from fastapi import HTTPException
from sqlalchemy import select
from .models import SourceImport

def available_seasons(db):
    return [s.manifest['season'] for s in db.scalars(select(SourceImport).order_by(SourceImport.season.desc()))]

def resolve_season(db,requested=None):
    seasons=available_seasons(db)
    if requested is not None:
        if not re.fullmatch(r'20\d{2}/\d{2}',requested) or (seasons and requested not in seasons):
            raise HTTPException(422,'Temporada não disponível. Escolha uma das temporadas publicadas.')
        return requested
    return seasons[0] if seasons else None

def academic_season(day):
    start=day.year if day.month>=7 else day.year-1
    return f'{start}/{str(start+1)[-2:]}'
