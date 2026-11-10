$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
& ./.venv/Scripts/python.exe -m alembic upgrade head
if ($LASTEXITCODE -ne 0) { throw 'Migration failed. Start the database first.' }
& ./.venv/Scripts/python.exe -m app.seed_users
if ($LASTEXITCODE -ne 0) { throw 'Local account setup failed.' }
& ./.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
