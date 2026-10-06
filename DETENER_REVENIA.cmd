@echo off
title Revenia - Detener servicios
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-dev.ps1"
pause
