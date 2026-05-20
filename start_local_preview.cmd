@echo off
cd /d "%~dp0"
start "ProspectLocal Backend" "%~dp0start_backend_preview.cmd"
timeout /t 3 /nobreak >nul
start "ProspectLocal Preview" "%~dp0serve_frontend_export.cmd"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8085"
