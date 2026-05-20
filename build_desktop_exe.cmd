@echo off
cd /d "%~dp0"
call "%~dp0build_frontend_web.cmd"
if errorlevel 1 exit /b %errorlevel%
cd /d "%~dp0"
set "PYTHON_EXE=%~dp0.venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=C:\Users\AndyC\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
"%PYTHON_EXE%" -m PyInstaller --noconfirm "%~dp0ProspectLocalDesktop.spec"
