@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0prepare_github_web_publish.ps1" %*
