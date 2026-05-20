@echo off
cd /d "%~dp0backend"
set "PYTHONUTF8=1"
set "PYTHON_EXE=%~dp0.venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=C:\Users\AndyC\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
"%PYTHON_EXE%" -m uvicorn server:app --host 127.0.0.1 --port 8011 --reload
