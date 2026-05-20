@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0prepare_work_pc_release.ps1" %*
