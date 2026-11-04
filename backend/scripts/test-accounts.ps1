param([switch]$KeepData, [string]$ChromiumExecutable = '')
$ErrorActionPreference = 'Stop'
$backendPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$frontendPath = (Resolve-Path (Join-Path $backendPath '../frontend')).Path
$pythonPath = Join-Path $backendPath '.venv/Scripts/python.exe'
$nodePath = (Get-Command node -ErrorAction Stop).Source
$names = @('DATABASE_URL','CAMPHOOP_DATA_DIR','PYTHONPATH','APP_ENV','SECURE_COOKIE','VITE_API_MODE','APP_URL','CORS_ORIGINS','MAIL_TRANSPORT','MAIL_ENCRYPTION_KEY','CAMPHOOP_BACKEND_URL','CAMPHOOP_URL','CAMPHOOP_MAILBOX_DIR','PLAYWRIGHT_CHROMIUM_EXECUTABLE')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$processes = @()
$runInfo = $null
$exitStatus = 1
try {
    foreach ($port in @(8001,5174)) {
        if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { throw "Port $port is in use. Stop that service or use the main environment." }
    }
    $env:PYTHONPATH = $backendPath
    $runInfo = (& $pythonPath (Join-Path $backendPath 'scripts/prepare_account_e2e.py') | ConvertFrom-Json)
    if ($LASTEXITCODE -ne 0 -or -not $runInfo.directory) { throw 'Could not prepare isolated test database.' }
    $env:DATABASE_URL = $runInfo.databaseUrl
    $env:CAMPHOOP_DATA_DIR = $runInfo.directory
    $env:APP_ENV = 'development'
    $env:SECURE_COOKIE = 'false'
    $env:VITE_API_MODE = 'remote'
    $env:APP_URL = 'http://localhost:5174'
    $env:CORS_ORIGINS = 'http://localhost:5174,http://127.0.0.1:5174'
    $env:MAIL_TRANSPORT = 'capture'
    $env:MAIL_ENCRYPTION_KEY = ''
    $env:CAMPHOOP_BACKEND_URL = 'http://127.0.0.1:8001'
    $env:CAMPHOOP_URL = $env:APP_URL
    $env:CAMPHOOP_MAILBOX_DIR = $runInfo.mailbox
    if ($ChromiumExecutable) { $env:PLAYWRIGHT_CHROMIUM_EXECUTABLE = $ChromiumExecutable }
    $processes += Start-Process -FilePath $pythonPath -ArgumentList @('-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8001') -WorkingDirectory $backendPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runInfo.directory 'api.log') -RedirectStandardError (Join-Path $runInfo.directory 'api-error.log')
    $vitePath = Join-Path $frontendPath 'node_modules/vite/bin/vite.js'
    $processes += Start-Process -FilePath $nodePath -ArgumentList @(('"'+$vitePath+'"'),'--port','5174','--strictPort') -WorkingDirectory $frontendPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runInfo.directory 'frontend.log') -RedirectStandardError (Join-Path $runInfo.directory 'frontend-error.log')
    $ready = $false
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        try {
            $health = Invoke-RestMethod 'http://127.0.0.1:8001/api/health' -TimeoutSec 2
            $page = Invoke-WebRequest 'http://localhost:5174/' -UseBasicParsing -TimeoutSec 2
            if ($health.status -eq 'ok' -and $page.StatusCode -eq 200) { $ready = $true; break }
        } catch { Start-Sleep -Milliseconds 400 }
    }
    if (-not $ready) { throw 'Isolated services did not become ready.' }
    Push-Location $frontendPath
    try {
        & $nodePath (Join-Path $frontendPath 'node_modules/@playwright/test/cli.js') test accounts.spec.ts
        $exitStatus = $LASTEXITCODE
    } finally { Pop-Location }
} finally {
    foreach ($process in $processes) {
        if (-not $process.HasExited) { try { & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null } catch {} }
    }
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name,$previous[$name],'Process') }
    if ($runInfo -and (Test-Path -LiteralPath $runInfo.directory)) {
        $target = (Resolve-Path -LiteralPath $runInfo.directory).Path
        $allowed = (Resolve-Path -LiteralPath (Join-Path $backendPath 'data')).Path
        $parent = Split-Path -Parent $target
        $leaf = Split-Path -Leaf $target
        if (-not $parent.Equals($allowed,[StringComparison]::OrdinalIgnoreCase) -or $leaf -notmatch '^e2e-accounts-[a-f0-9]{32}$') { throw 'Refusing cleanup outside the isolated test directory.' }
        if ($KeepData) { Write-Output "Test data kept at $target" }
        else { Remove-Item -LiteralPath $target -Recurse -Force }
    }
}
exit $exitStatus
