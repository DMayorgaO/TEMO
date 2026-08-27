param([Parameter(Mandatory = $true)][string]$BackupPath)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path
$resolvedBackup = (Resolve-Path -LiteralPath $BackupPath).Path
$allowedRoot = [IO.Path]::GetFullPath((Join-Path $root 'backups'))
if (-not $resolvedBackup.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'La prueba solo admite archivos dentro de backups.'
}
$checksumPath = "$resolvedBackup.sha256"
if (-not (Test-Path -LiteralPath $checksumPath)) { throw 'No se encontro el checksum.' }
$expected = ((Get-Content -LiteralPath $checksumPath -Raw).Trim() -split '\s+')[0]
$actual = (Get-FileHash -LiteralPath $resolvedBackup -Algorithm SHA256).Hash.ToLowerInvariant()
if ($expected -ne $actual) { throw 'El checksum no coincide.' }

$pgBin = Get-ChildItem -LiteralPath 'C:\Program Files\PostgreSQL' -Filter initdb.exe -Recurse -ErrorAction SilentlyContinue |
  Where-Object { Test-Path -LiteralPath (Join-Path $_.DirectoryName 'pg_restore.exe') } |
  Sort-Object FullName -Descending | Select-Object -First 1 | ForEach-Object DirectoryName
if (-not $pgBin) { throw 'No se encontraron las herramientas PostgreSQL.' }
$runId = "pg-restore-test-$PID"
$cluster = Join-Path $root "tmp/$runId"
$log = Join-Path $root "tmp/$runId.log"
$port = 55439
$initdb = Join-Path $pgBin 'initdb.exe'
$pgCtl = Join-Path $pgBin 'pg_ctl.exe'
$psql = Join-Path $pgBin 'psql.exe'
$restore = Join-Path $pgBin 'pg_restore.exe'
$processOutput = Join-Path $root 'tmp/pg-process.out.log'
$processError = Join-Path $root 'tmp/pg-process.err.log'

New-Item -ItemType Directory -Path (Split-Path $cluster -Parent) -Force | Out-Null

try {
  & $initdb -D $cluster -A trust -U temo_restore --encoding=UTF8 --no-locale *> $null
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el servidor PostgreSQL temporal.' }
  $start = Start-Process -FilePath $pgCtl -ArgumentList @('-D', "`"$cluster`"", '-l', "`"$log`"", '-o', "`"-p $port -h 127.0.0.1`"", '-w', 'start') `
    -WindowStyle Hidden -PassThru -RedirectStandardOutput $processOutput -RedirectStandardError $processError
  $deadline = (Get-Date).AddSeconds(30)
  do {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($listener) { break }
    if ($start.HasExited -and $start.ExitCode -ne 0) { throw "No se pudo iniciar PostgreSQL: $(Get-Content $processError -Raw)" }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)
  if (-not $listener) { throw 'PostgreSQL temporal no abrio el puerto dentro del tiempo esperado.' }
  & $psql -h 127.0.0.1 -p $port -U temo_restore -d postgres -v ON_ERROR_STOP=1 -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto;' *> $null
  & $restore -h 127.0.0.1 -p $port -U temo_restore -d postgres --no-owner --no-acl --exit-on-error $resolvedBackup *> $null
  if ($LASTEXITCODE -ne 0) { throw 'pg_restore detecto un error.' }
  $result = & $psql -h 127.0.0.1 -p $port -U temo_restore -d postgres -At -v ON_ERROR_STOP=1 `
    -c "select count(*) || ' tablas; ' || (select count(*) from temo.usuarios) || ' usuarios' from information_schema.tables where table_schema = 'temo';"
  Write-Host "Restauracion verificada: $result" -ForegroundColor Green
} finally {
  if (Test-Path -LiteralPath (Join-Path $cluster 'postmaster.pid')) {
    Start-Process -FilePath $pgCtl -ArgumentList @('-D', "`"$cluster`"", '-m', 'fast', '-w', 'stop') `
      -WindowStyle Hidden -RedirectStandardOutput $processOutput -RedirectStandardError $processError | Out-Null
    $stopDeadline = (Get-Date).AddSeconds(30)
    do {
      Start-Sleep -Milliseconds 250
    } while ((Test-Path -LiteralPath (Join-Path $cluster 'postmaster.pid')) -and (Get-Date) -lt $stopDeadline)
  }
  if (Test-Path -LiteralPath $cluster) { Remove-Item -LiteralPath $cluster -Recurse -Force }
}
