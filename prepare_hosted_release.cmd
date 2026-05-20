@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0prepare_hosted_release.ps1" %*
