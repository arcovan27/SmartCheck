param(
  [string]$Version = "",
  [string]$Configuration = "Release",
  [switch]$NoInstaller
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-IsccPath {
  $command = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Path
  }

  $commonPaths = @(
    "$env:ProgramFiles(x86)\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
  )

  foreach ($path in $commonPaths) {
    if (Test-Path $path) {
      return $path
    }
  }

  return $null
}

function Normalize-Version([string]$rawVersion) {
  if ([string]::IsNullOrWhiteSpace($rawVersion)) {
    return "1.0.0"
  }

  if ($rawVersion -match "^\d+\.\d+\.\d+(\.\d+)?$") {
    if ($rawVersion -match "^\d+\.\d+\.\d+$") {
      return $rawVersion
    }

    $parts = $rawVersion.Split(".")
    return "$($parts[0]).$($parts[1]).$($parts[2])"
  }

  throw "Versao invalida '$rawVersion'. Use formato semver, por exemplo: 1.0.0"
}

function To-AssemblyVersion([string]$semver) {
  $parts = $semver.Split(".")
  return "$($parts[0]).$($parts[1]).$($parts[2]).0"
}

$agentRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$projectPath = Join-Path $agentRoot "windows-agent\SmartCheck.BiometricAgent\SmartCheck.BiometricAgent.csproj"
$issPath = Join-Path $agentRoot "installer\SmartCheckBiometricAgent.iss"
$publishDir = Join-Path $agentRoot "dist\win-x64"
$installerOutputDir = Join-Path $agentRoot "dist\installer"

if (-not (Test-Path $projectPath)) {
  throw "Projeto .NET nao encontrado: $projectPath"
}

if (-not (Test-Path $issPath)) {
  throw "Script Inno Setup nao encontrado: $issPath"
}

if ([string]::IsNullOrWhiteSpace($Version)) {
  $packageJsonPath = Join-Path $agentRoot "package.json"
  if (Test-Path $packageJsonPath) {
    $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
    $Version = [string]$packageJson.version
  }
}

$Version = Normalize-Version $Version
$assemblyVersion = To-AssemblyVersion $Version

Write-Host "Publicando agente .NET ($Version)..." -ForegroundColor Cyan

dotnet publish $projectPath `
  -c $Configuration `
  -r win-x64 `
  --self-contained true `
  /p:PublishSingleFile=true `
  /p:IncludeNativeLibrariesForSelfExtract=true `
  /p:Version=$Version `
  /p:FileVersion=$assemblyVersion `
  /p:AssemblyVersion=$assemblyVersion `
  -o $publishDir

if ($LASTEXITCODE -ne 0) {
  throw "Falha no dotnet publish"
}

if ($NoInstaller) {
  Write-Host "Publicacao concluida em: $publishDir" -ForegroundColor Green
  exit 0
}

$isccPath = Get-IsccPath
if (-not $isccPath) {
  throw "Inno Setup (ISCC.exe) nao encontrado. Instale o Inno Setup 6 para gerar o instalador."
}

New-Item -ItemType Directory -Force -Path $installerOutputDir | Out-Null

Write-Host "Gerando instalador com Inno Setup..." -ForegroundColor Cyan

& $isccPath `
  "/DMyAppVersion=$Version" `
  "/DPublishDir=$publishDir" `
  "/DInstallerOutputDir=$installerOutputDir" `
  $issPath

if ($LASTEXITCODE -ne 0) {
  throw "Falha ao gerar instalador com Inno Setup"
}

Write-Host "Instalador gerado em: $installerOutputDir" -ForegroundColor Green
