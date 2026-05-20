param(
  [string]$OutputDir = "dist_hosted_release"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputPath = Join-Path $root $OutputDir
$frontendBuildDirName = "__hosted_release_build"
$frontendSource = Join-Path $root ("frontend\\" + $frontendBuildDirName)
$backendSource = Join-Path $root "backend"
$releaseBackend = Join-Path $outputPath "backend"
$releaseFrontend = Join-Path $outputPath "frontend\\dist_hosted"

if (Test-Path $outputPath) {
  Remove-Item -LiteralPath $outputPath -Recurse -Force
}

& powershell -ExecutionPolicy Bypass -File (Join-Path $root "build_frontend_web_hosted.ps1") -SameOrigin -OutputDir $frontendBuildDirName
if ($LASTEXITCODE -ne 0) {
  throw "Le build frontend heberge meme origine a echoue."
}

New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
New-Item -ItemType Directory -Path $releaseBackend -Force | Out-Null
New-Item -ItemType Directory -Path $releaseFrontend -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $backendSource "routers") -Destination $releaseBackend -Recurse -Force
Copy-Item -LiteralPath (Join-Path $backendSource "services") -Destination $releaseBackend -Recurse -Force
Copy-Item -LiteralPath (Join-Path $backendSource "utils") -Destination $releaseBackend -Recurse -Force
foreach ($file in @(
  "server.py",
  "models.py",
  "auth.py",
  "activities_seed.py",
  "requirements.txt",
  ".env.hosted.sample"
)) {
  Copy-Item -LiteralPath (Join-Path $backendSource $file) -Destination $releaseBackend -Force
}

Copy-Item -Path (Join-Path $frontendSource "*") -Destination $releaseFrontend -Recurse -Force

foreach ($file in @(
  "Dockerfile.backend",
  "Dockerfile.frontend.hosted",
  "Caddyfile.hosted",
  "docker-compose.hosted.yml",
  ".env.hosted.compose.sample",
  "WEB_DEPLOYMENT.md"
)) {
  Copy-Item -LiteralPath (Join-Path $root $file) -Destination $outputPath -Force
}

Get-ChildItem -Path $releaseBackend -Directory -Recurse -Filter "__pycache__" -ErrorAction SilentlyContinue |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Get-ChildItem -Path $outputPath -Directory -Recurse -Filter ".metro-cache" -ErrorAction SilentlyContinue |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

if (Test-Path $frontendSource) {
  Remove-Item -LiteralPath $frontendSource -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Pack de deploiement heberge genere dans: $outputPath"
Write-Host "Etapes suivantes:"
Write-Host "1. Copier ce dossier sur le serveur"
Write-Host "2. Renommer backend/.env.hosted.sample en backend/.env.hosted"
Write-Host "3. Renommer .env.hosted.compose.sample en .env"
Write-Host "4. Lancer: docker compose -f docker-compose.hosted.yml up -d --build"
