@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0publish_desktop_release.ps1"
exit /b %errorlevel%
