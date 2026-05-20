@echo off
set MESSAGE=%*
if "%MESSAGE%"=="" (
  powershell -ExecutionPolicy Bypass -File "%~dp0publish_railway_update.ps1"
) else (
  powershell -ExecutionPolicy Bypass -File "%~dp0publish_railway_update.ps1" -Message "%MESSAGE%"
)
