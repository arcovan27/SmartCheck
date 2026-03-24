@echo off
setlocal

set "ROOT=%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET_VBS=%STARTUP%\SmartCheckBiometricAgent.vbs"
set "RUN_VBS=%ROOT%run-agent-hidden.vbs"

if not exist "%RUN_VBS%" (
  echo Arquivo nao encontrado: %RUN_VBS%
  exit /b 1
)

> "%TARGET_VBS%" (
  echo Set shell = CreateObject("WScript.Shell"^)
  echo shell.Run Chr(34^) ^& "%RUN_VBS%" ^& Chr(34^), 0, False
)

echo Auto start instalado.
echo Arquivo:
echo   %TARGET_VBS%
echo.
echo Na proxima inicializacao do Windows o agente sobe automaticamente.
pause
exit /b 0
