param(
  [string]$OutputDir = "github_web_publish_ready"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputPath = Join-Path $root $OutputDir

if (Test-Path $outputPath) {
  Remove-Item -LiteralPath $outputPath -Recurse -Force
}

New-Item -ItemType Directory -Path $outputPath -Force | Out-Null

function Copy-TreeFiltered {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Source,
    [Parameter(Mandatory = $true)]
    [string]$Destination
  )

  $sourcePath = Join-Path $root $Source
  $destinationPath = Join-Path $outputPath $Destination

  New-Item -ItemType Directory -Path $destinationPath -Force | Out-Null

  robocopy $sourcePath $destinationPath /E /NFL /NDL /NJH /NJS /NP `
    /XD "__pycache__" ".expo" ".metro-cache" "node_modules" "dist" "dist_hosted" "dist_live" "__hosted_release_build" `
    /XF ".env" ".env.shared" ".env.local.backup" "desktop-config.json" "backend.override.env" "desktop.log"

  if ($LASTEXITCODE -gt 7) {
    throw "Echec de copie de $Source vers $Destination"
  }
}

Copy-TreeFiltered -Source "backend" -Destination "backend"
Copy-TreeFiltered -Source "frontend" -Destination "frontend"
Copy-TreeFiltered -Source "tests" -Destination "tests"

foreach ($file in @(
  ".gitignore",
  ".dockerignore",
  "README.md",
  "README_LOCAL.md",
  "README_UTILISATEUR.md",
  "WEB_DEPLOYMENT.md",
  "Dockerfile",
  "Dockerfile.backend",
  "Dockerfile.frontend.hosted",
  "Caddyfile.hosted",
  "docker-compose.hosted.yml",
  ".env.hosted.compose.sample",
  "build_frontend_web_hosted.cmd",
  "build_frontend_web_hosted.ps1",
  "write_frontend_runtime_config.ps1",
  "prepare_hosted_release.cmd",
  "prepare_hosted_release.ps1",
  "desktop_app_metadata.json",
  "GUIDE_CONFIGURATION.md"
)) {
  $sourceFile = Join-Path $root $file
  if (Test-Path $sourceFile) {
    Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $outputPath $file) -Force
  }
}

Write-Host "Dossier GitHub web pret genere dans: $outputPath"
Write-Host "Tu peux glisser-deposer le contenu de ce dossier dans le repo GitHub via le navigateur."
