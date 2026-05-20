@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0build_frontend_web_hosted.ps1" %*
