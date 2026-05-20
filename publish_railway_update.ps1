param(
    [string]$Message = "",
    [string]$SourcePath = $PSScriptRoot,
    [string]$RepoPath = (Join-Path $env:USERPROFILE "Documents\\GitHub\\PROSPECTLOCAL")
)

$ErrorActionPreference = "Stop"

function Get-GitExecutable {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "GitHubDesktop\\app-3.5.8\\resources\\app\\git\\cmd\\git.exe"),
        (Join-Path $env:LOCALAPPDATA "GitHubDesktop\\app-3.5.8\\resources\\app\\git\\mingw64\\bin\\git.exe"),
        "git"
    )

    foreach ($candidate in $candidates) {
        if ($candidate -eq "git") {
            $cmd = Get-Command git -ErrorAction SilentlyContinue
            if ($cmd) {
                return $cmd.Source
            }
            continue
        }

        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    throw "git.exe introuvable. Installe GitHub Desktop ou Git for Windows."
}

function Write-Step($message) {
    Write-Host "[PUBLISH] $message" -ForegroundColor Cyan
}

if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = "Update ProspectLocal hosted app - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
}

$syncScript = Join-Path $PSScriptRoot "sync_railway_repo.ps1"
& $syncScript -SourcePath $SourcePath -RepoPath $RepoPath

$gitExe = Get-GitExecutable
$repoResolved = (Resolve-Path -LiteralPath $RepoPath).Path

Write-Step "Verification des changements Git"
$status = & $gitExe -C $repoResolved status --porcelain

if (-not $status) {
    Write-Host "[PUBLISH] Aucun changement a publier." -ForegroundColor Yellow
    exit 0
}

Write-Step "Ajout des fichiers"
& $gitExe -C $repoResolved add -A

Write-Step "Commit"
& $gitExe -C $repoResolved commit -m $Message | Out-Host

Write-Step "Push vers GitHub"
& $gitExe -C $repoResolved push origin main | Out-Host

Write-Host "[PUBLISH] Publication terminee. Railway va redeployer automatiquement." -ForegroundColor Green
