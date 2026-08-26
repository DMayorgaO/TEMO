@echo off
setlocal
title Crear esquema TEMO en Supabase
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\migrate-cloud-database.ps1"
if errorlevel 1 (
  echo.
  echo No se completo la creacion del esquema.
  pause
  exit /b 1
)
echo.
echo El esquema de TEMO fue creado y validado en Supabase.
pause
