#ifndef AppVersion
  #define AppVersion "1.1.0"
#endif

#ifndef AppSourceRoot
  #define AppSourceRoot "."
#endif

#ifndef PayloadDir
  #define PayloadDir AddBackslash(AppSourceRoot) + "build\\installer_payload"
#endif

[Setup]
AppId={{5F2E45C4-A1AC-4C6D-A4EF-6E5765B57FA8}
AppName=ProspectLocal
AppVersion={#AppVersion}
AppVerName=ProspectLocal {#AppVersion}
DefaultDirName={autopf}\ProspectLocal
DefaultGroupName=ProspectLocal
DisableProgramGroupPage=yes
OutputDir={#AppSourceRoot}\dist_installer
OutputBaseFilename=ProspectLocalSetup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\PROSPECTLOCAL.exe

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "Creer un raccourci sur le Bureau"; GroupDescription: "Raccourcis :"; Flags: unchecked

[Files]
Source: "{#PayloadDir}\ProspectLocalDesktop.exe"; DestDir: "{app}"; DestName: "PROSPECTLOCAL.exe"; Flags: ignoreversion
Source: "{#PayloadDir}\_internal\*"; DestDir: "{app}\_internal"; Flags: ignoreversion recursesubdirs createallsubdirs
#ifdef IncludeDesktopConfig
Source: "{#InstallerAssetsDir}\desktop-config.json"; DestDir: "{app}"; Flags: ignoreversion onlyifdoesntexist
#endif

[Icons]
Name: "{autoprograms}\ProspectLocal"; Filename: "{app}\PROSPECTLOCAL.exe"
Name: "{autodesktop}\ProspectLocal"; Filename: "{app}\PROSPECTLOCAL.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\PROSPECTLOCAL.exe"; Description: "Lancer ProspectLocal"; Flags: nowait postinstall skipifsilent
