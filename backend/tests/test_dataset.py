import os
import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from app.db import Base
from app.import_ncaa import import_dataset, period_scores, read_source
from app.models import Athlete, Game, PlayerStat, Team
from app.read import Snapshot

def test_source_parser_never_evaluates_input():
    assert period_scores("[{'value': 31.0}, {'value': 34.0}]")==[31,34]
    assert period_scores("__import__('os').system('exit 1')")==[]

@pytest.mark.skipif(os.getenv('RUN_DATASET_TESTS')!='1',reason='Requires the four downloaded NCAA parquet files')
def test_real_dataset_coverage_idempotency_and_anomaly(tmp_path):
    engine=create_engine(f'sqlite:///{tmp_path / "ncaa.sqlite"}')
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        first=import_dataset(db,download=False)
        second=import_dataset(db,download=False)
        assert first==second
        assert db.scalar(select(func.count()).select_from(Game))==134
        assert db.scalar(select(func.count()).select_from(Team))==136
        assert db.scalar(select(func.count()).select_from(Athlete))==2039
        assert db.scalar(select(func.count()).select_from(PlayerStat))==3995
        assert len(first['warnings'])==1
        bad=db.get(Game,'ncaa-m-game-401746044')
        assert (bad.home_score,bad.away_score,bad.stats_complete)==(67,58,False)
        men=db.get(Game,'ncaa-m-game-401746082')
        assert (men.home_score,men.away_score,men.regulation_periods,men.period_seconds)==(63,65,2,1200)
        women=db.get(Game,'ncaa-w-game-401746075')
        assert (women.home_score,women.away_score,women.regulation_periods)==(59,82,4)
        s=Snapshot(db)
        for g in s.games.values():
            assert sum(q['home'] for q in g.quarters)==g.home_score
            assert sum(q['away'] for q in g.quarters)==g.away_score
        assert all(a.birth_date is None and a.height_cm is None for a in s.athletes.values())

def test_checksum_prevents_changed_source(monkeypatch,tmp_path):
    from app import import_ncaa
    from types import SimpleNamespace
    (tmp_path/'mbb_schedule_2025.parquet').write_bytes(b'changed upstream data')
    monkeypatch.setattr(import_ncaa,'settings',SimpleNamespace(data_dir=tmp_path))
    with pytest.raises(ValueError,match='checksum changed'):read_source('m','schedule',False)

@pytest.mark.skipif(os.getenv('RUN_DATASET_TESTS')!='1',reason='Requires both seasons of downloaded NCAA data')
def test_current_snapshot_import_is_idempotent_and_preserves_history(tmp_path):
    from app.import_current import import_current
    from app.models import SourceImport
    from datetime import timezone
    engine=create_engine(f'sqlite:///{tmp_path / "seasons.sqlite"}')
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        import_dataset(db,download=False)
        original_names={a.id:(a.name,a.team_id) for a in db.scalars(select(Athlete))}
        first=import_current(db,download=False)
        timestamp=db.get(SourceImport,'ncaa-2027').imported_at.replace(tzinfo=timezone.utc)
        second=import_current(db,download=False)
        assert first==second
        assert db.get(SourceImport,'ncaa-2027').imported_at.replace(tzinfo=timezone.utc)==timestamp
        assert first['counts']['completed']==348
        assert first['counts']['games']==11779
        assert first['counts']['athletes']==10452
        assert first['counts']['excludedGamesWithTbdTeams']==95
        assert first['counts']['excludedPlayerRowsWithoutId']==35
        assert len(first['warnings'])==12
        assert len(Snapshot(db,'2024/25').games)==134
        assert len(Snapshot(db,'2024/25').athletes)==2039
        current=Snapshot(db,'2026/27')
        assert len(current.games)==11779 and len(current.athletes)==10452
        assert not set(original_names).intersection(current.athletes)
        assert all((db.get(Athlete,id).name,db.get(Athlete,id).team_id)==fields for id,fields in original_names.items())
        assert all(g.home_score is None and g.away_score is None for g in current.games.values() if g.status in ('agendado','adiado'))
        assert all(a.season=='2026/27' and a.birth_date is None for a in current.athletes.values())
        assert len([g for g in current.games.values() if g.status=='adiado'])==1
        assert db.scalar(select(func.count()).select_from(Game))==11913
