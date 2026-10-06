$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ProjectRoot

Write-Host "REVENIA LOCAL DEVELOPMENT ENVIRONMENT" -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js no está instalado." }
if (-not (Test-Path -LiteralPath "node_modules")) { Write-Host "Instalando dependencias..."; npm install }
if (-not (Test-Path -LiteralPath ".env.local")) { Copy-Item -LiteralPath ".env.example" -Destination ".env.local"; Write-Host "Configuración local creada." }

function Find-DockerCommand {
  $command = Get-Command docker -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
  $command = Get-Command docker -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $candidates = @(
    "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe",
    "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe",
    "$env:LOCALAPPDATA\Docker\resources\bin\docker.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  return $null
}

$docker = Find-DockerCommand
if (-not $docker) {
  throw "No encuentro Docker Desktop ni el comando docker. Instala o abre Docker Desktop y vuelve a ejecutar este archivo. Docker Sandboxes por sí solo no incluye el motor necesario."
}

& $docker info *> $null
if ($LASTEXITCODE -ne 0) {
  $desktopCandidates = @(
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
    "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe"
  )
  $desktop = $desktopCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if ($desktop) {
    Write-Host "Iniciando Docker Desktop..." -ForegroundColor Yellow
    Start-Process -FilePath $desktop -WindowStyle Hidden
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
      Start-Sleep -Seconds 2
      & $docker info *> $null
      if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    }
    if (-not $ready) { throw "Docker Desktop no ha terminado de arrancar. Ábrelo y espera a que indique que está listo." }
  } else {
    throw "El comando Docker existe, pero el motor no está activo. Abre Docker Desktop y vuelve a intentarlo."
  }
}

Write-Host "Iniciando servicios locales seguros..." -ForegroundColor Cyan
& $docker compose --env-file .env.local up -d --wait database redis mailpit
if ($LASTEXITCODE -ne 0) { throw "No se han podido iniciar PostgreSQL, Redis y Mailpit." }

npm run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'No se han podido aplicar las migraciones.' }
npm run db:seed
if ($LASTEXITCODE -ne 0) { throw 'No se han podido preparar los datos locales.' }
npm run test:integration
if ($LASTEXITCODE -ne 0) { throw 'La comprobación de servicios ha fallado.' }
& (Join-Path $ProjectRoot 'start-worker.ps1')

Write-Host "Frontend ................. READY" -ForegroundColor Green
Write-Host "PostgreSQL + RLS ......... READY" -ForegroundColor Green
Write-Host "Redis rate limiting ...... READY" -ForegroundColor Green
Write-Host "Correo de pruebas ........ http://localhost:8025" -ForegroundColor Green
Write-Host "URL: http://localhost:3000" -ForegroundColor Cyan
npm run dev
