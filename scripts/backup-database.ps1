param(
  [ValidateSet('pilot', 'production')]
  [string]$Environment = 'pilot'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = if ($Environment -eq 'pilot') { Join-Path $root '.env.cloud' } else { Join-Path $root '.env.production' }
$certificate = Join-Path $root '.certificates/supabase-ca.crt'
if (-not (Test-Path -LiteralPath $envFile)) { throw "No existe el archivo privado $envFile" }
if (-not (Test-Path -LiteralPath $certificate)) { throw "No existe el certificado $certificate" }
$pgDump = Get-ChildItem -LiteralPath 'C:\Program Files\PostgreSQL' -Filter pg_dump.exe -Recurse -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1
if (-not $pgDump) { throw 'No se encontro pg_dump.exe. Instale las herramientas de PostgreSQL.' }
$databaseLine = Get-Content -LiteralPath $envFile | Where-Object { $_ -like 'DATABASE_URL=*' } | Select-Object -First 1
if (-not $databaseLine) { throw 'El archivo privado no contiene DATABASE_URL.' }
$databaseUri = [Uri]($databaseLine.Substring('DATABASE_URL='.Length))
$userParts = $databaseUri.UserInfo.Split(':', 2)
$env:PGPASSWORD = [Uri]::UnescapeDataString($userParts[1])
$env:PGSSLMODE = 'verify-full'
$env:PGSSLROOTCERT = $certificate

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDirectory = Join-Path $root "backups/$Environment"
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
$fileName = "temo-$Environment-$timestamp.dump"
$backupPath = Join-Path $backupDirectory $fileName

try {
  & $pgDump.FullName -h $databaseUri.Host -p $databaseUri.Port -U ([Uri]::UnescapeDataString($userParts[0])) `
    -d $databaseUri.AbsolutePath.TrimStart('/') --format=custom --compress=9 --no-owner --no-acl `
    --schema=temo --file=$backupPath
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $backupPath)) { throw 'No fue posible crear el respaldo.' }
} finally {
  $env:PGPASSWORD = $null
  $env:PGSSLMODE = $null
  $env:PGSSLROOTCERT = $null
}

$hash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath "$backupPath.sha256" -Value "$hash  $fileName" -Encoding ASCII
@{
  environment = $Environment
  createdAt = (Get-Date).ToUniversalTime().ToString('o')
  file = $fileName
  bytes = (Get-Item -LiteralPath $backupPath).Length
  sha256 = $hash
} | ConvertTo-Json | Set-Content -LiteralPath "$backupPath.json" -Encoding UTF8

Write-Host "Respaldo creado: $backupPath" -ForegroundColor Green
Write-Host "SHA-256: $hash"
Write-Host 'Guarde una copia en almacenamiento cifrado y fuera de este equipo.' -ForegroundColor Yellow
