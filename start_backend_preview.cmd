@echo off
cd /d "%~dp0backend"
set "PYTHONUTF8=1"
"C:\Users\AndyC\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m uvicorn server:app --host 127.0.0.1 --port 8000
