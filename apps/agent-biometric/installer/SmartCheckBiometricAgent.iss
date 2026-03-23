#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif

#ifndef PublishDir
  #define PublishDir "..\dist\win-x64"
#endif

#ifndef InstallerOutputDir
  #define InstallerOutputDir "..\dist\installer"
#endif

#define MyAppId "{{3D5235A8-2806-40A6-9D2B-8590BA55D5EE}"
#define MyAppName "SmartCheck Biometric Agent"
#define MyAppPublisher "SmartCheck"
#define MyAppExeName "SmartCheck.BiometricAgent.exe"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\SmartCheck\Biometric Agent
DefaultGroupName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
OutputDir={#InstallerOutputDir}
OutputBaseFilename=SmartCheck-Biometric-Agent-Setup-{#MyAppVersion}
PrivilegesRequired=admin

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na area de trabalho"; GroupDescription: "Atalhos:"

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "SmartCheckBiometricAgent"; ValueData: """{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Executar {#MyAppName} agora"; Flags: nowait postinstall skipifsilent
