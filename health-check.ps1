$ErrorActionPreference = "Stop"
$HealthUrl = "http://localhost:3000/api/health"
try {
  $Health = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 5
  Write-Host "Application .............. $($Health.app)" -ForegroundColor Green
  Write-Host "Database ................. $($Health.database)" -ForegroundColor Green
  Write-Host "Redis .................... $($Health.redis)" -ForegroundColor Green
} catch {
  Write-Host "Revenia o uno de sus servicios locales no está disponible en $HealthUrl" -ForegroundColor Red
  exit 1
}
