param(
  [Parameter(Mandatory = $true)]
  [string]$OutputDir,
  [string]$BackendUrl = "",
  [switch]$SameOrigin
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Join-Path $root "frontend"
$templatePath = Join-Path $frontendDir "runtime-config.template.js"
$outputPath = Join-Path $frontendDir $OutputDir
$runtimeConfigPath = Join-Path $outputPath "runtime-config.js"

if (-not (Test-Path $templatePath)) {
  throw "Template runtime-config introuvable: $templatePath"
}

if (-not (Test-Path $outputPath)) {
  throw "Dossier frontend de sortie introuvable: $outputPath"
}

if ($SameOrigin) {
  $resolvedBackendUrl = "__SAME_ORIGIN__"
}
else {
  $resolvedBackendUrl = ""
  if ($null -ne $BackendUrl) {
    $resolvedBackendUrl = [string]$BackendUrl
  }
  $resolvedBackendUrl = $resolvedBackendUrl.Trim()
  if (-not $resolvedBackendUrl) {
    foreach ($candidate in @($env:EXPO_PUBLIC_API_URL, $env:EXPO_PUBLIC_BACKEND_URL, $env:REACT_APP_BACKEND_URL)) {
      if ($null -eq $candidate) {
        continue
      }
      $candidateText = [string]$candidate
      if ($candidateText.Trim()) {
        $resolvedBackendUrl = $candidateText.Trim()
        break
      }
    }
  }

  $resolvedBackendUrl = [string]$resolvedBackendUrl
  $resolvedBackendUrl = $resolvedBackendUrl.Trim().TrimEnd('/')
  if (-not $resolvedBackendUrl) {
    $resolvedBackendUrl = "http://127.0.0.1:8011"
  }
}

$runtimeConfig = (Get-Content -LiteralPath $templatePath -Raw).Replace("__API_URL__", $resolvedBackendUrl)
[System.IO.File]::WriteAllText(
  $runtimeConfigPath,
  $runtimeConfig,
  (New-Object System.Text.UTF8Encoding($false))
)

Write-Host "runtime-config.js ecrit dans: $runtimeConfigPath"
Write-Host "Runtime API URL: $resolvedBackendUrl"
