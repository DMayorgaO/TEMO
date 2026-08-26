@echo off
setlocal
title Direcciones disponibles de TEMO
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\show-temo-addresses.ps1"
echo.
echo Esta informacion tambien se guardo en "Direcciones TEMO.txt".
pause
