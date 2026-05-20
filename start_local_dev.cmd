@echo off
cd /d "%~dp0"
start "ProspectLocal Backend" "%~dp0start_backend_local.cmd"
timeout /t 2 /nobreak >nul
start "ProspectLocal Frontend Dev" "%~dp0start_frontend_web.cmd"
