param(
  [string]$UpdateManifestUrl = "",
  [switch]$SeedSharedDatabase
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$metadataPath = Join-Path $root "desktop_app_metadata.json"
$metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
$version = [string]$metadata.version

$iscc = (Get-Command ISCC -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)
if (-not $iscc) {
  $candidates = @(
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe",
    (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe")
  )
  $iscc = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if (-not $iscc) {
  throw "Inno Setup n'est pas installe. Installe ISCC.exe pour generer l'installateur."
}

$assetsDir = "C:\PLA"
if (Test-Path $assetsDir) {
  Remove-Item -LiteralPath $assetsDir -Recurse -Force
}
New-Item -ItemType Directory -Path $assetsDir | Out-Null

$payloadDir = "C:\PLI"
if (Test-Path $payloadDir) {
  Remove-Item -LiteralPath $payloadDir -Recurse -Force
}
New-Item -ItemType Directory -Path $payloadDir | Out-Null

$distDir = Join-Path $root "dist\ProspectLocalDesktop"
if (-not (Test-Path $distDir)) {
  throw "Build desktop introuvable : $distDir"
}

& robocopy $distDir $payloadDir /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) {
  throw "Impossible de preparer le payload de l'installateur."
}

$config = @{}
if ($UpdateManifestUrl) {
  $config.update_manifest_url = $UpdateManifestUrl
}
if ($SeedSharedDatabase.IsPresent) {
  $config.seed_shared_backend_on_first_run = $true
}

$defines = @(
  "/DAppVersion=$version",
  "/DAppSourceRoot=$root",
  "/DPayloadDir=$payloadDir"
)

if ($config.Count -gt 0) {
  $configPath = Join-Path $assetsDir "desktop-config.json"
  $config | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $configPath -Encoding UTF8
  $defines += "/DIncludeDesktopConfig=1"
  $defines += "/DInstallerAssetsDir=$assetsDir"
}

& $iscc @defines (Join-Path $root "ProspectLocalInstaller.iss")
if ($LASTEXITCODE -ne 0) {
  throw "La generation de l'installateur a echoue."
}
