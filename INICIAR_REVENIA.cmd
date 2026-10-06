@echo off
title Revenia - Entorno local
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1"
if errorlevel 1 (
  echo.
  echo Revenia no ha podido iniciarse. Revisa el mensaje anterior.
  pause
)
