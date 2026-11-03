from dataclasses import dataclass
from pathlib import Path
import os
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env')

@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv('DATABASE_URL', 'postgresql+psycopg://postgres@127.0.0.1:54329/postgres')
    origins: tuple[str, ...] = tuple(os.getenv('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(','))
    secure_cookie: bool = os.getenv('SECURE_COOKIE', 'false').lower() == 'true'
    session_hours: int = 12
    data_dir: Path = ROOT / 'data'

settings = Settings()
