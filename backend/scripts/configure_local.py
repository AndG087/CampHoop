from pathlib import Path
import secrets

root=Path(__file__).resolve().parents[1]
target=root/'.env'
if not target.exists():
    template=(root/'.env.example').read_text(encoding='utf-8')
    target.write_text(template.replace('DEMO_PASSWORD=','DEMO_PASSWORD='+secrets.token_urlsafe(24)),encoding='utf-8')
    print('backend/.env created with a random local test password. Do not commit this file.')
else:
    print('Existing backend/.env preserved.')
