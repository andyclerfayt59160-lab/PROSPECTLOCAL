@echo off
cd /d "%~dp0"
set "PYTHONUTF8=1"
"C:\Users\AndyC\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" "%~dp0serve_spa.py"
