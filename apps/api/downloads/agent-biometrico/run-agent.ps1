param(
  [switch]$Restart
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$jarPath = Join-Path $root "dist\SmartCheckBiometricAgent.jar"
$java = "C:\Program Files\Java\jre1.8.0_481\bin\java.exe"
$sdkJavaLib = "C:\Program Files\DigitalPersona\U.are.U SDK\Windows\Lib\Java\dpuareu.jar"
$sdkNativeLib = "C:\Program Files\DigitalPersona\U.are.U SDK\Windows\Lib\x64"
$agentPort = 4100

if (!(Test-Path $jarPath)) {
  throw "Jar do agente nao encontrado em $jarPath. Rode .\build.ps1 primeiro."
}

if (!(Test-Path $java)) {
  throw "Java nao encontrado em $java"
}

$listeningProcess = Get-NetTCPConnection -LocalPort $agentPort -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty OwningProcess

if ($listeningProcess) {
  if ($Restart) {
    Stop-Process -Id $listeningProcess -Force -ErrorAction Stop
    Start-Sleep -Milliseconds 800
  } else {
    $process = Get-Process -Id $listeningProcess -ErrorAction SilentlyContinue
    $processLabel = if ($process) { "$($process.ProcessName) (PID $($process.Id))" } else { "PID $listeningProcess" }
    Write-Host "O agente ja esta rodando na porta $agentPort via $processLabel."
    Write-Host "Use .\run-agent.ps1 -Restart para reiniciar o processo."
    exit 0
  }
}

$env:PATH = "$sdkNativeLib;$env:PATH"

& $java "-Djava.library.path=$sdkNativeLib" -cp "$jarPath;$sdkJavaLib" com.smartcheck.biometric.SmartCheckBiometricAgent
