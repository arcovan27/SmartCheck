@echo off
setlocal

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
del /Q "%STARTUP%\SmartCheckBiometricAgent.cmd" >nul 2>&1
del /Q "%STARTUP%\SmartCheckBiometricAgent.vbs" >nul 2>&1

echo Auto start removido.
exit /b 0

