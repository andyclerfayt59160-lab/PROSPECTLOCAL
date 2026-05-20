@echo off
cd /d "%~dp0frontend"
set "PATH=C:\Program Files\nodejs;%PATH%"
"C:\Program Files\nodejs\npm.cmd" run web -- --port 8081
