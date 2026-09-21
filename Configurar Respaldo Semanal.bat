@echo off
setlocal
set "TASK_NAME=TEMO Respaldo Supabase Produccion"
set "SCRIPT=%~dp0scripts\scheduled-backup.ps1"
schtasks /Create /F /TN "%TASK_NAME%" /SC WEEKLY /D SUN /ST 20:00 /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ^"%SCRIPT%^"" /RL LIMITED
if errorlevel 1 (
  echo No fue posible crear la tarea programada.
  pause
  exit /b 1
)
echo Respaldo semanal configurado para los domingos a las 8:00 p. m.
pause
