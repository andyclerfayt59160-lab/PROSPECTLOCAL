@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0publish_update_feed.ps1" %*
exit /b %errorlevel%
