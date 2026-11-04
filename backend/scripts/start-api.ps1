param([switch]$ImportNcaa)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
& ./.venv/Scripts/python.exe -m alembic upgrade head
if ($LASTEXITCODE -ne 0) { throw 'Migration failed. Start the database first.' }
if ($ImportNcaa) {
    & ./.venv/Scripts/python.exe -m app.import_ncaa
    if ($LASTEXITCODE -ne 0) { throw 'NCAA import failed.' }
    $seasonFiles = @('data/mbb_schedule_2027.parquet', 'data/wbb_schedule_2027.parquet', 'data/mbb_players_2027.parquet', 'data/wbb_players_2027.parquet')
    $hasSeasonCapture = ($seasonFiles | Where-Object { -not (Test-Path -LiteralPath $_) }).Count -eq 0
    if ($hasSeasonCapture) { & ./.venv/Scripts/python.exe -m app.import_current --offline }
    else { & ./.venv/Scripts/python.exe -m app.import_current --refresh }
    if ($LASTEXITCODE -ne 0) { throw 'NCAA 2026/27 import failed.' }
}
& ./.venv/Scripts/python.exe -m app.seed_users
if ($LASTEXITCODE -ne 0) { throw 'Local account setup failed.' }
& ./.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
