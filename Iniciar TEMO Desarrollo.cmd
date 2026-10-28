@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\start-development.ps1"
if errorlevel 1 (
  echo.
  echo No se pudo iniciar el desarrollo. Produccion no se ha modificado.
  pause
  exit /b 1
)
echo.
pause
