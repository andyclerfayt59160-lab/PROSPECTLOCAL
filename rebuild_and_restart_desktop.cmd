@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0rebuild_and_restart_desktop.ps1"
exit /b %errorlevel%
