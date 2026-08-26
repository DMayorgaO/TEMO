$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $projectRoot 'logs'

if (-not (Test-Path -LiteralPath $logDirectory)) {
  New-Item -ItemType Directory -Path $logDirectory | Out-Null
}

function Test-DockerReady {
  & docker info *> $null
  return $LASTEXITCODE -eq 0
}

function Start-DockerDesktop {
  if (Test-DockerReady) {
    Write-Host 'Docker ya esta activo.' -ForegroundColor Yellow
    return
  }

  $dockerDesktopCandidates = @(
    (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
    (Join-Path $env:LOCALAPPDATA 'Docker\Docker Desktop.exe')
  )
  $dockerDesktop = $dockerDesktopCandidates |
    Where-Object { Test-Path -LiteralPath $_ } |
    Select-Object -First 1

  if (-not $dockerDesktop) {
    throw 'Docker Desktop no esta iniciado y no se encontro su instalacion.'
  }

  Write-Host 'Iniciando Docker Desktop...' -ForegroundColor Cyan
  Start-Process -FilePath $dockerDesktop -WindowStyle Hidden

  $deadline = (Get-Date).AddMinutes(2)
  do {
    Start-Sleep -Seconds 2
  } until ((Test-DockerReady) -or (Get-Date) -ge $deadline)

  if (-not (Test-DockerReady)) {
    throw 'Docker Desktop no termino de iniciar en el tiempo esperado.'
  }

  Write-Host 'Docker Desktop esta listo.' -ForegroundColor Green
}

function Start-TemoDatabase {
  Write-Host 'Iniciando PostgreSQL de TEMO...' -ForegroundColor Cyan
  & docker compose --project-directory $projectRoot up -d postgres
  if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo iniciar PostgreSQL con Docker Compose.'
  }

  $deadline = (Get-Date).AddSeconds(60)
  do {
    Start-Sleep -Seconds 1
    $health = & docker inspect --format '{{.State.Health.Status}}' temo-postgres 2>$null
  } until ($health -eq 'healthy' -or (Get-Date) -ge $deadline)

  if ($health -ne 'healthy') {
    throw 'PostgreSQL no alcanzo el estado saludable. Revise Docker Desktop.'
  }

  Write-Host 'PostgreSQL esta listo.' -ForegroundColor Green
}

function Get-ListeningProcessId([int]$Port) {
  return Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty OwningProcess
}

function Start-TemoService([string]$Name, [int]$Port, [string]$NpmScript, [string]$LogFile) {
  $processId = Get-ListeningProcessId $Port
  if ($processId) {
    Write-Host "$Name ya esta activo en el puerto $Port (PID $processId)." -ForegroundColor Yellow
    return
  }

  $logPath = Join-Path $projectRoot $LogFile
  Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/d', '/c', "npm run $NpmScript >> `"$logPath`" 2>&1" `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden

  $deadline = (Get-Date).AddSeconds(20)
  do {
    Start-Sleep -Milliseconds 500
    $processId = Get-ListeningProcessId $Port
  } until ($processId -or (Get-Date) -ge $deadline)

  if (-not $processId) {
    throw "$Name no pudo iniciar. Revise $logPath."
  }

  Write-Host "$Name iniciado en el puerto $Port (PID $processId)." -ForegroundColor Green
}

$wifiAddress = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
  Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
  ForEach-Object { $_.IPv4Address.IPAddress } |
  Where-Object { $_ -and $_ -notlike '169.254.*' } |
  Select-Object -First 1

Start-DockerDesktop
Start-TemoDatabase
Start-TemoService 'Backend TEMO' 4000 'dev:backend' 'logs\backend-runtime.log'
Start-TemoService 'Frontend TEMO' 3000 'dev:frontend' 'logs\frontend-runtime.log'

Write-Host ''
Write-Host 'TEMO esta listo:' -ForegroundColor Cyan
Write-Host '  Este equipo: http://localhost:3000'
if ($wifiAddress) {
  Write-Host "  Otros dispositivos: http://${wifiAddress}:3000" -ForegroundColor Cyan
} else {
  Write-Host '  No se encontro una direccion IPv4 de red local.' -ForegroundColor Yellow
}

Write-Host "  Nombre estable: http://$([System.Net.Dns]::GetHostName()):3000" -ForegroundColor Cyan
Write-Host ''
& (Join-Path $PSScriptRoot 'show-temo-addresses.ps1') | Out-Null
Write-Host "Las direcciones se guardaron en 'Direcciones TEMO.txt'." -ForegroundColor DarkGray

Start-Process 'http://localhost:3000'
