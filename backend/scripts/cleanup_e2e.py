"""Remove only game IDs recorded by our local browser tests. Stop the local API first."""
from pathlib import Path
import json
import re
from sqlalchemy import delete, select
from app.db import SessionLocal
from app.models import Game

path=Path(__file__).resolve().parents[1]/'data/e2e-games.json'
if path.exists():
    ids=json.loads(path.read_text())
    if not isinstance(ids,list) or any(not isinstance(id,str) or not re.fullmatch('[a-f0-9]{32}',id) for id in ids):
        raise ValueError('Invalid test-owned game ID list')
    with SessionLocal() as db:
        owned=list(db.scalars(select(Game.id).where(Game.id.in_(ids),Game.venue=='CampHoop E2E',Game.imported.is_(False))))
        db.execute(delete(Game).where(Game.id.in_(owned)))
        db.commit()
    path.unlink()
    print(f'Removed {len(owned)} test-owned games; imported NCAA data preserved.')
