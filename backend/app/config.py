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
    secure_cookie: bool = os.getenv('APP_ENV')=='production' or os.getenv('SECURE_COOKIE', 'false').lower() == 'true'
    session_hours: int = 12
    data_dir: Path = Path(os.getenv('CAMPHOOP_DATA_DIR',str(ROOT / 'data')))
    environment: str = os.getenv('APP_ENV','development')
    app_url: str = os.getenv('APP_URL','http://localhost:5173').rstrip('/')
    mail_transport: str = os.getenv('MAIL_TRANSPORT','auto')
    mail_encryption_key: str = os.getenv('MAIL_ENCRYPTION_KEY','')
    smtp_host: str = os.getenv('SMTP_HOST','')
    smtp_port: int = int(os.getenv('SMTP_PORT','465'))
    smtp_user: str = os.getenv('SMTP_USER','')
    smtp_password: str = os.getenv('SMTP_PASSWORD','')

settings = Settings()
