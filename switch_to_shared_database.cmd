@echo off
cd /d "%~dp0"

if not exist "backend\.env.local.backup" (
  copy /Y "backend\.env" "backend\.env.local.backup" >nul
)

if not exist "backend\.env.shared" (
  echo Fichier backend\.env.shared introuvable.
  exit /b 1
)

echo Migration locale vers base partagee...
"C:\Users\AndyC\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" "%~dp0migrate_shared_database.py" --source-env "%~dp0backend\.env.local.backup" --target-env "%~dp0backend\.env.shared"
if errorlevel 1 exit /b %errorlevel%

copy /Y "backend\.env.shared" "backend\.env" >nul

call "%~dp0rebuild_and_restart_desktop.cmd"
