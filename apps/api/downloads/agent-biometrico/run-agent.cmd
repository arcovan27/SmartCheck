@echo off
setlocal

set "ROOT=%~dp0"
set "JAR=%ROOT%dist\SmartCheckBiometricAgent.jar"
set "JAVA=C:\Program Files\Java\jre1.8.0_481\bin\javaw.exe"
set "SDK_JAR=C:\Program Files\DigitalPersona\U.are.U SDK\Windows\Lib\Java\dpuareu.jar"
set "SDK_NATIVE=C:\Program Files\DigitalPersona\U.are.U SDK\Windows\Lib\x64"

if not exist "%JAR%" (
  echo Jar do agente nao encontrado: %JAR%
  echo Rode build.ps1 uma vez para gerar o jar.
  exit /b 1
)

if not exist "%JAVA%" (
  echo Java nao encontrado: %JAVA%
  exit /b 1
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":4100 .*LISTENING"') do (
  taskkill /PID %%P /F >nul 2>&1
)

set "PATH=%SDK_NATIVE%;%PATH%"
start "" /min "%JAVA%" -Djava.library.path="%SDK_NATIVE%" -cp "%JAR%;%SDK_JAR%" com.smartcheck.biometric.SmartCheckBiometricAgent

exit /b 0

