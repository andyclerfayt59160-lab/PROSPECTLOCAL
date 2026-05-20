param(
  [string]$FeedDir = (Join-Path $env:USERPROFILE "OneDrive\\Apps\\ProspectLocal\\stable"),
  [string]$UpdateManifestUrl = "%USERPROFILE%\\OneDrive\\Apps\\ProspectLocal\\stable\\manifest.json",
  [switch]$SeedSharedDatabase
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

& cmd /c (Join-Path $root "build_desktop_exe.cmd")
if ($LASTEXITCODE -ne 0) {
  throw "Le rebuild desktop a echoue."
}

$installerArgs = @(
  "-ExecutionPolicy", "Bypass",
  "-File", (Join-Path $root "build_desktop_installer.ps1"),
  "-UpdateManifestUrl", $UpdateManifestUrl
)
if ($SeedSharedDatabase.IsPresent) {
  $installerArgs += "-SeedSharedDatabase"
}

& powershell @installerArgs
if ($LASTEXITCODE -ne 0) {
  throw "La generation de l'installateur PC pro a echoue."
}

& powershell -ExecutionPolicy Bypass -File (Join-Path $root "publish_update_feed.ps1") -FeedDir $FeedDir
if ($LASTEXITCODE -ne 0) {
  throw "La publication du feed OneDrive a echoue."
}

Write-Host "Release PC pro prete."
Write-Host "Feed: $FeedDir"
Write-Host "Manifest attendu: $UpdateManifestUrl"
