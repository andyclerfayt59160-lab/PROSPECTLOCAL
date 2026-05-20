param(
  [string]$FeedDir = "C:\Users\AndyC\Documents\Codex\PROSPECTLOCAL.UPDATES\stable"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$metadataPath = Join-Path $root "desktop_app_metadata.json"
$metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
$version = [string]$metadata.version
$installerName = "ProspectLocalSetup-$version.exe"
$installerPath = Join-Path $root "dist_installer\$installerName"

if (-not (Test-Path $installerPath)) {
  throw "Installateur introuvable : $installerPath"
}

if (-not (Test-Path $FeedDir)) {
  New-Item -ItemType Directory -Path $FeedDir | Out-Null
}

$targetInstaller = Join-Path $FeedDir $installerName
Copy-Item -LiteralPath $installerPath -Destination $targetInstaller -Force

$hash = (Get-FileHash -LiteralPath $targetInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest = @{
  app_name = "ProspectLocal Desktop"
  channel = [string]$metadata.release_channel
  version = $version
  published_at = (Get-Date).ToString("o")
  notes = "ProspectLocal $version"
  windows = @{
    installer = $installerName
    sha256 = $hash
  }
}

$manifestPath = Join-Path $FeedDir "manifest.json"
[System.IO.File]::WriteAllText(
  $manifestPath,
  ($manifest | ConvertTo-Json -Depth 5),
  (New-Object System.Text.UTF8Encoding($false))
)
Write-Host "Feed publie : $manifestPath"
