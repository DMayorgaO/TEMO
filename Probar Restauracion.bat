@echo off
setlocal
cd /d "%~dp0"
set /p BACKUP=Pegue la ruta completa del archivo .dump: 
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\test-backup-restore.ps1" -BackupPath "%BACKUP%"
if errorlevel 1 (
  echo.
  echo La restauracion de prueba no se completo.
  pause
  exit /b 1
)
pause
