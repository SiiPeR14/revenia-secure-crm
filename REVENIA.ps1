param([ValidateSet('Estado','Verificar','Preparar','Iniciar','Ayuda')][string]$Accion='Ayuda')
$ErrorActionPreference='Stop'
$ProjectRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location -LiteralPath $ProjectRoot
try {
  switch ($Accion) {
    'Estado' { node ops/revenia.mjs doctor }
    'Verificar' { npm run ops:verify }
    'Preparar' { node ops/revenia.mjs prepare }
    'Iniciar' { & (Join-Path $ProjectRoot 'start-dev.ps1') }
    default { Write-Host 'Revenia local: .\REVENIA.ps1 Estado | Verificar | Preparar | Iniciar'; exit 0 }
  }
  exit $LASTEXITCODE
} finally { Pop-Location }
