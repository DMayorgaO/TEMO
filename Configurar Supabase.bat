@echo off
setlocal
title Configurar Supabase para TEMO
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\configure-supabase.ps1"
if errorlevel 1 (
  echo.
  echo La configuracion no se completo. Revise el mensaje anterior.
  pause
  exit /b 1
)
echo.
echo Conexion configurada y verificada.
pause
