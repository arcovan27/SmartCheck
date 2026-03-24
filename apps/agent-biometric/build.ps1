$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$srcDir = Join-Path $root "src\main\java"
$buildDir = Join-Path $root "build"
$classesDir = Join-Path $buildDir "classes"
$distDir = Join-Path $root "dist"
$jarPath = Join-Path $distDir "SmartCheckBiometricAgent.jar"

$javac = "C:\Program Files\Android\Android Studio\jbr\bin\javac.exe"
$jar = "C:\Program Files\Android\Android Studio\jbr\bin\jar.exe"
$sdkJavaLib = "C:\Program Files\DigitalPersona\U.are.U SDK\Windows\Lib\Java\dpuareu.jar"
$agentPort = 4100

if (!(Test-Path $javac)) {
  throw "Nao encontrei o javac em $javac"
}

if (!(Test-Path $sdkJavaLib)) {
  throw "Nao encontrei dpuareu.jar em $sdkJavaLib"
}

$listeningProcess = Get-NetTCPConnection -LocalPort $agentPort -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty OwningProcess
if ($listeningProcess) {
  $process = Get-Process -Id $listeningProcess -ErrorAction SilentlyContinue
  $processLabel = if ($process) { "$($process.ProcessName) (PID $($process.Id))" } else { "PID $listeningProcess" }
  throw "A porta $agentPort esta em uso por $processLabel. Feche o agente antes de recompilar ou rode .\run-agent.ps1 -Restart."
}

New-Item -ItemType Directory -Force -Path $classesDir | Out-Null
New-Item -ItemType Directory -Force -Path $distDir | Out-Null

Get-ChildItem $classesDir -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

$sources = Get-ChildItem $srcDir -Recurse -Filter *.java | ForEach-Object { $_.FullName }
if ($sources.Count -eq 0) {
  throw "Nenhum arquivo Java encontrado em $srcDir"
}

& $javac --release 8 -cp $sdkJavaLib -d $classesDir $sources
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao compilar o agente Java"
}

& $jar --create --file $jarPath --main-class com.smartcheck.biometric.SmartCheckBiometricAgent -C $classesDir .
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao empacotar o jar do agente"
}

Write-Host "Jar gerado em $jarPath"
