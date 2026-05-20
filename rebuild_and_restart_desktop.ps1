$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

cmd /c (Join-Path $root "build_desktop_exe.cmd")
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

powershell -ExecutionPolicy Bypass -File (Join-Path $root "publish_desktop_release.ps1")
exit $LASTEXITCODE
