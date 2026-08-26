$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $projectRoot
$outputFile = Join-Path $workspaceRoot 'Direcciones TEMO.txt'
$computerName = [System.Net.Dns]::GetHostName()

$addresses = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
  Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
  ForEach-Object { $_.IPv4Address.IPAddress } |
  Where-Object { $_ -and $_ -notlike '169.254.*' } |
  Sort-Object -Unique

$frontendActive = [bool](Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue)
$backendActive = [bool](Get-NetTCPConnection -State Listen -LocalPort 4000 -ErrorAction SilentlyContinue)
$databaseActive = [bool](Get-NetTCPConnection -State Listen -LocalPort 55432 -ErrorAction SilentlyContinue)

$lines = @(
  'DIRECCIONES DE TEMO'
  "Actualizado: $(Get-Date -Format 'dd/MM/yyyy hh:mm:ss tt')"
  ''
  'Acceso en este equipo:'
  '  http://localhost:3000'
  ''
  'Acceso recomendado desde otros equipos de la red:'
  "  http://${computerName}:3000"
  ''
  'Acceso alternativo por direccion IP:'
)

if ($addresses) {
  $lines += $addresses | ForEach-Object { "  http://${_}:3000" }
} else {
  $lines += '  No se detecto una direccion IPv4 de red local.'
}

$lines += @(
  ''
  'Estado de servicios:'
  "  Frontend 3000: $(if ($frontendActive) { 'ACTIVO' } else { 'DETENIDO' })"
  "  Backend  4000: $(if ($backendActive) { 'ACTIVO' } else { 'DETENIDO' })"
  "  PostgreSQL 55432: $(if ($databaseActive) { 'ACTIVO' } else { 'DETENIDO' })"
  ''
  'Los puertos son fijos. Si cambia la red, use nuevamente este archivo para'
  'consultar la IP actual o utilice la direccion basada en el nombre del equipo.'
)

$lines | Set-Content -LiteralPath $outputFile -Encoding UTF8
$lines | ForEach-Object { Write-Host $_ }

