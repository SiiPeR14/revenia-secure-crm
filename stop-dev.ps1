$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ProjectRoot
& (Join-Path $ProjectRoot 'stop-worker.ps1')

$docker = (Get-Command docker -ErrorAction SilentlyContinue).Source
if (-not $docker) {
  $candidates = @(
    "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe",
    "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe"
  )
  $docker = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $docker) { throw "No encuentro el comando docker." }

& $docker compose --env-file .env.local stop
if ($LASTEXITCODE -ne 0) { throw "No se han podido detener los servicios locales." }
Write-Host "Servicios de Revenia detenidos. Los datos permanecen guardados." -ForegroundColor Green
