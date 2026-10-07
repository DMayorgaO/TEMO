@echo off
cd /d "%~dp0"
call npm run build
if errorlevel 1 goto error
node scripts/start-preview.mjs
if errorlevel 1 goto error
node scripts/seed-preview.mjs
if errorlevel 1 goto error
start "" "http://127.0.0.1:3187"
exit /b 0
:error
echo No se pudo iniciar TEMO de pruebas. Produccion no se ha modificado.
pause
exit /b 1
