$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $ProjectRoot '.revenia/worker.json'
if (Test-Path -LiteralPath $pidFile) {
  $state = Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json
  $worker = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
  if ($worker -and $worker.StartTime.ToUniversalTime().Ticks.ToString() -eq $state.started) {
    $stopFile = Join-Path $ProjectRoot '.revenia/worker.stop'
    Set-Content -LiteralPath $stopFile -Value 'stop'
    if (-not $worker.WaitForExit(45000)) { throw 'El motor está terminando una operación. Espera y vuelve a detenerlo para no interrumpirla.' }
    Remove-Item -LiteralPath $stopFile -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $pidFile
}
Write-Host 'Motor detenido. Los trabajos permanecen guardados.'
