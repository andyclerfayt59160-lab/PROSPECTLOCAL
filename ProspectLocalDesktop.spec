# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules

# Keep the build portable: derive paths from the spec file itself so the
# build remains stable even when helper scripts temporarily change cwd.
root = Path(SPEC).resolve().parent
backend_root = root / "backend"

backend_hiddenimports = (
    collect_submodules("routers")
    + collect_submodules("services")
    + collect_submodules("utils")
    + collect_submodules("passlib.handlers")
)

datas = [
    (str(root / "backend"), "backend"),
    (str(root / "frontend" / "dist_live"), "frontend/dist_live"),
    (str(root / "desktop_app_metadata.json"), "."),
    (str(root / "desktop-config.sample.json"), "."),
]

a = Analysis(
    [str(root / "desktop_launcher.py")],
    pathex=[str(root), str(backend_root)],
    binaries=[],
    datas=datas,
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops.auto",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan.on",
        "server",
        "models",
        "auth",
        "activities_seed",
    ] + backend_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="ProspectLocalDesktop",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="ProspectLocalDesktop",
)
