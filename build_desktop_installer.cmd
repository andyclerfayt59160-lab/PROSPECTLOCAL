@echo off
cd /d "%~dp0"
call "%~dp0build_desktop_exe.cmd"
if errorlevel 1 exit /b %errorlevel%
powershell -ExecutionPolicy Bypass -File "%~dp0build_desktop_installer.ps1" %*
exit /b %errorlevel%
