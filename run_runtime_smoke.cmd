@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PYTHON_EXE=%SCRIPT_DIR%.venv\Scripts\python.exe"
set "SMOKE_SCRIPT=%SCRIPT_DIR%tests\runtime_smoke.py"

if not exist "%PYTHON_EXE%" (
  echo Python runtime not found: %PYTHON_EXE%
  exit /b 1
)

if "%PL_EMAIL%"=="" (
  echo Missing PL_EMAIL environment variable.
  exit /b 2
)

if "%PL_PASSWORD%"=="" (
  echo Missing PL_PASSWORD environment variable.
  exit /b 2
)

"%PYTHON_EXE%" "%SMOKE_SCRIPT%" %*
exit /b %ERRORLEVEL%
