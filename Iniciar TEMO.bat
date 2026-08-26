@echo off
setlocal
title Iniciar TEMO
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\start-temo.ps1"
if errorlevel 1 (
  echo.
  echo No fue posible iniciar TEMO. Revise el mensaje anterior.
  pause
  exit /b 1
)
echo.
echo TEMO se inicio correctamente. Puede cerrar esta ventana.
timeout /t 4 /nobreak >nul
