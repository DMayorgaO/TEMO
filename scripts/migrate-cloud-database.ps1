$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$cloudEnvPath = Join-Path $projectRoot '.env.cloud'
if (-not (Test-Path -LiteralPath $cloudEnvPath)) {
  throw 'No existe .env.cloud. Ejecute primero Configurar Supabase.bat.'
}

Get-Content -LiteralPath $cloudEnvPath | ForEach-Object {
  if ($_ -match '^(?<key>[A-Z0-9_]+)=(?<value>.*)$') {
    [Environment]::SetEnvironmentVariable($Matches.key, $Matches.value, 'Process')
  }
}
$env:ALLOW_CLOUD_MIGRATIONS = 'TEMO'

try {
  & node (Join-Path $PSScriptRoot 'migrate-cloud-database.mjs')
  if ($LASTEXITCODE -ne 0) {
    throw 'La migracion no se completo.'
  }
} finally {
  $env:DATABASE_URL = $null
  $env:DATABASE_SSL_CA_PATH = $null
  $env:AUTH_SECRET = $null
  $env:ALLOW_CLOUD_MIGRATIONS = $null
}
