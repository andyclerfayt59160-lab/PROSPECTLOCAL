@echo off
setlocal
pushd "%~dp0frontend"
set "PATH=C:\Program Files\nodejs;%PATH%"
"C:\Program Files\nodejs\npx.cmd" expo export --platform web --output-dir dist_live --max-workers 1 --clear
set "EXIT_CODE=%ERRORLEVEL%"
popd
if "%EXIT_CODE%"=="0" (
  powershell -ExecutionPolicy Bypass -File "%~dp0write_frontend_runtime_config.ps1" -OutputDir "dist_live"
  set "EXIT_CODE=%ERRORLEVEL%"
)
endlocal & exit /b %EXIT_CODE%
