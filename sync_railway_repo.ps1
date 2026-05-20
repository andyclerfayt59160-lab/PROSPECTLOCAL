param(
    [string]$SourcePath = $PSScriptRoot,
    [string]$RepoPath = (Join-Path $env:USERPROFILE "Documents\\GitHub\\PROSPECTLOCAL")
)

$ErrorActionPreference = "Stop"

function Write-Step($message) {
    Write-Host "[SYNC] $message" -ForegroundColor Cyan
}

if (-not (Test-Path -LiteralPath $SourcePath)) {
    throw "Source introuvable: $SourcePath"
}

if (-not (Test-Path -LiteralPath $RepoPath)) {
    throw "Repo GitHub introuvable: $RepoPath"
}

$sourceResolved = (Resolve-Path -LiteralPath $SourcePath).Path
$repoResolved = (Resolve-Path -LiteralPath $RepoPath).Path

if ($sourceResolved -eq $repoResolved) {
    throw "Le dossier source et le repo GitHub sont identiques, sync annulee."
}

Write-Step "Synchronisation de $sourceResolved vers $repoResolved"

$excludeDirs = @(
    ".git",
    ".venv",
    ".emergent",
    "__pycache__",
    "build",
    "dist",
    "dist_installer",
    "dist_hosted_release",
    "github_web_publish_ready",
    "frontend\\node_modules",
    "frontend\\.expo",
    "frontend\\.metro-cache",
    "frontend\\dist",
    "frontend\\dist_hosted",
    "frontend\\dist_live",
    "frontend\\__hosted_release_build",
    "backend\\__pycache__",
    "tests\\__pycache__"
)

$excludeFiles = @(
    "*.log",
    "*.err",
    "*.pyc",
    "*.pyo",
    "*.pyd",
    "*.zip",
    "tmp_pappers_*.json",
    "test_result.md",
    "model.patch",
    ".gitconfig"
)

$robocopyArgs = @(
    $sourceResolved,
    $repoResolved,
    "/MIR",
    "/R:1",
    "/W:1",
    "/FFT",
    "/NFL",
    "/NDL",
    "/NJH",
    "/NJS",
    "/NP",
    "/XD"
) + $excludeDirs + @("/XF") + $excludeFiles

& robocopy @robocopyArgs | Out-Host
$exitCode = $LASTEXITCODE

if ($exitCode -ge 8) {
    throw "Robocopy a echoue (code $exitCode)."
}

Write-Step "Repo GitHub local synchronise."
