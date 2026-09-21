$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $root 'logs/backups'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$log = Join-Path $logDirectory "backup-$(Get-Date -Format 'yyyyMMdd').log"
try {
  & (Join-Path $PSScriptRoot 'backup-database.ps1') -Environment production *>&1 |
    Tee-Object -FilePath $log -Append
  if ($LASTEXITCODE -ne 0) { throw 'El proceso de respaldo devolvio un error.' }
  $limit = (Get-Date).AddDays(-90)
  Get-ChildItem -LiteralPath (Join-Path $root 'backups/production') -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $limit } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }
} catch {
  "$(Get-Date -Format o) ERROR: $($_.Exception.Message)" | Add-Content -LiteralPath $log
  exit 1
}
