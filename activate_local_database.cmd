@echo off
cd /d "%~dp0"

if not exist "backend\.env.local.backup" (
  echo Fichier backend\.env.local.backup introuvable.
  exit /b 1
)

copy /Y "backend\.env.local.backup" "backend\.env" >nul

call "%~dp0rebuild_and_restart_desktop.cmd"
