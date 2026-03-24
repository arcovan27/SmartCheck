@echo off
setlocal

set "ROOT=%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET_CMD=%STARTUP%\SmartCheckBiometricAgent.cmd"
set "TARGET_VBS=%STARTUP%\SmartCheckBiometricAgent.vbs"

copy /Y "%ROOT%run-agent.cmd" "%TARGET_CMD%" >nul
copy /Y "%ROOT%run-agent-hidden.vbs" "%TARGET_VBS%" >nul

echo Auto start instalado.
echo Arquivos:
echo   %TARGET_CMD%
echo   %TARGET_VBS%
echo.
echo Na proxima inicializacao do Windows o agente sobe automaticamente.

exit /b 0

