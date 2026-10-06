$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ProjectRoot
if (-not (Test-Path -LiteralPath '.env.local')) { throw 'Primero inicia Revenia para preparar la configuración local.' }
$stateDir = Join-Path $ProjectRoot '.revenia'
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
$pidFile = Join-Path $stateDir 'worker.json'
if (Test-Path -LiteralPath $pidFile) {
  $previous = Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json
  $existing = Get-Process -Id $previous.pid -ErrorAction SilentlyContinue
  if ($existing -and $existing.StartTime.ToUniversalTime().Ticks.ToString() -eq $previous.started) { Write-Host 'El motor ya está activo.'; exit 0 }
}
if (-not $env:WORKER_TENANT_IDS -and -not (Select-String -LiteralPath '.env.local' -Pattern '^\s*WORKER_TENANT_IDS\s*=' -Quiet)) { $env:WORKER_TENANT_IDS = '11111111-1111-4111-8111-111111111111' }
$node = (Get-Command node -ErrorAction Stop).Source
$env:WORKER_STOP_FILE = Join-Path $stateDir 'worker.stop'
if (Test-Path -LiteralPath $env:WORKER_STOP_FILE) { Remove-Item -LiteralPath $env:WORKER_STOP_FILE }
$worker = Start-Process -FilePath $node -ArgumentList @('--env-file=.env.local','--experimental-transform-types','src/scripts/worker.ts') -WorkingDirectory $ProjectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $stateDir 'worker.log') -RedirectStandardError (Join-Path $stateDir 'worker-error.log') -PassThru
@{pid=$worker.Id;started=$worker.StartTime.ToUniversalTime().Ticks.ToString()} | ConvertTo-Json | Set-Content -LiteralPath $pidFile
Start-Sleep -Milliseconds 700
$worker.Refresh()
if ($worker.HasExited) { Remove-Item -LiteralPath $pidFile; throw 'El motor no pudo arrancar. Revisa su configuración y el registro local.' }
Write-Host 'Motor de Revenia iniciado. Los servicios externos respetan la configuración del servidor.'
