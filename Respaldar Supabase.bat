@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\backup-database.ps1" -Environment pilot
if errorlevel 1 (
  echo.
  echo No fue posible completar el respaldo.
  pause
  exit /b 1
)
pause
