param(
  [string]$BackendUrl = "",
  [string]$OutputDir = "dist_hosted",
  [switch]$SameOrigin
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Join-Path $root "frontend"
$outputPath = Join-Path $frontendDir $OutputDir

if (-not $SameOrigin -and -not ($BackendUrl.Trim())) {
  throw "BackendUrl est requis, sauf si -SameOrigin est utilise."
}

$normalizedBackendUrl = $BackendUrl.Trim().TrimEnd('/')

Push-Location $frontendDir
try {
  if ($SameOrigin) {
    Remove-Item Env:EXPO_PUBLIC_API_URL -ErrorAction SilentlyContinue
    Remove-Item Env:EXPO_PUBLIC_BACKEND_URL -ErrorAction SilentlyContinue
    Remove-Item Env:REACT_APP_BACKEND_URL -ErrorAction SilentlyContinue
  }
  else {
    $env:EXPO_PUBLIC_API_URL = $normalizedBackendUrl
    $env:EXPO_PUBLIC_BACKEND_URL = $normalizedBackendUrl
    $env:REACT_APP_BACKEND_URL = $normalizedBackendUrl
  }
  $env:PATH = "C:\Program Files\nodejs;$env:PATH"

  & "C:\Program Files\nodejs\npx.cmd" expo export --platform web --output-dir $OutputDir --max-workers 1
  if ($LASTEXITCODE -ne 0) {
    throw "Le build frontend web heberge a echoue."
  }
}
finally {
  Pop-Location
}

if ($SameOrigin) {
  & powershell -ExecutionPolicy Bypass -File (Join-Path $root "write_frontend_runtime_config.ps1") -OutputDir $OutputDir -SameOrigin
}
else {
  & powershell -ExecutionPolicy Bypass -File (Join-Path $root "write_frontend_runtime_config.ps1") -OutputDir $OutputDir -BackendUrl $normalizedBackendUrl
}
if ($LASTEXITCODE -ne 0) {
  throw "Impossible d'ecrire runtime-config.js pour la build hebergee."
}

Write-Host "Frontend web heberge genere dans: $outputPath"
if ($SameOrigin) {
  Write-Host "Runtime API URL: meme origine (/api)"
}
else {
  Write-Host "Runtime API URL: $normalizedBackendUrl"
}
