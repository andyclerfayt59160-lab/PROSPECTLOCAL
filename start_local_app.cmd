@echo off
cd /d "%~dp0"
start "ProspectLocal Backend" "%~dp0start_backend_preview.cmd"
timeout /t 4 /nobreak >nul
call "%~dp0build_frontend_web.cmd"
start "ProspectLocal App Web" "%~dp0serve_frontend_export.cmd"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:8085"
