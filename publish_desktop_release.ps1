$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$releaseDir = "C:\Users\AndyC\Documents\Codex\PROSPECTLOCAL.EXE"
$buildDir = Join-Path $root "dist\ProspectLocalDesktop"
$sourceExe = Join-Path $buildDir "ProspectLocalDesktop.exe"
$sourceInternalDir = Join-Path $buildDir "_internal"
$targetExe = Join-Path $releaseDir "PROSPECTLOCAL.exe"
$targetBuildExe = Join-Path $releaseDir "ProspectLocalDesktop.exe"
$targetInternalDir = Join-Path $releaseDir "_internal"

if (-not (Test-Path $sourceExe)) {
    throw "Build desktop introuvable : $sourceExe"
}

if (-not (Test-Path $sourceInternalDir)) {
    throw "Ressources desktop introuvables : $sourceInternalDir"
}

if (-not (Test-Path $releaseDir)) {
    New-Item -ItemType Directory -Path $releaseDir | Out-Null
}

Get-Process PROSPECTLOCAL, ProspectLocalDesktop -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# On publie d'abord _internal, qui contient le backend et le front réellement mis à jour.
# Les .exe Windows peuvent rester verrouillés quelques secondes, donc on les traite ensuite
# en best effort pour ne pas bloquer toute la release.
$robocopyInternalArgs = @(
    $sourceInternalDir,
    $targetInternalDir,
    "/MIR",
    "/R:2",
    "/W:1",
    "/NFL",
    "/NDL",
    "/NJH",
    "/NJS",
    "/NP",
    "/XF",
    "QtWebEngineProcess.exe"
)

& robocopy @robocopyInternalArgs | Out-Null
if ($LASTEXITCODE -ge 8) {
    throw "Echec de publication des ressources internes vers $targetInternalDir"
}

if (-not (Test-Path $targetExe)) {
    Copy-Item -LiteralPath $sourceExe -Destination $targetExe -Force
}

if (-not (Test-Path $targetBuildExe)) {
    Copy-Item -LiteralPath $sourceExe -Destination $targetBuildExe -Force
}

try {
    Copy-Item -LiteralPath $sourceExe -Destination $targetBuildExe -Force
} catch {
    Write-Warning "Impossible de remplacer $targetBuildExe pour cette passe. Le binaire existant sera conservé."
}

try {
    Copy-Item -LiteralPath $sourceExe -Destination $targetExe -Force
} catch {
    Write-Warning "Impossible de remplacer $targetExe pour cette passe. Les ressources internes sont bien mises a jour."
}

Start-Process -FilePath $targetExe
