$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$projectRef = 'vdtngdafzlzxlumlhtpb'
$cloudEnvPath = Join-Path $projectRoot '.env.cloud'
$certificateDirectory = Join-Path $projectRoot '.certificates'
$localCertificatePath = Join-Path $certificateDirectory 'supabase-ca.crt'

Write-Host 'Configuracion segura de Supabase para TEMO' -ForegroundColor Cyan
Write-Host 'En Supabase abra Connect > Session pooler > Connection parameters.'
Write-Host 'El host suele tener la forma aws-0-us-west-2.pooler.supabase.com.'
Write-Host ''

$poolerHost = Read-Host 'Host de Session pooler'
if ($poolerHost -notmatch '^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$') {
  throw 'El host no tiene el formato esperado de Supabase Session pooler.'
}

$downloadDirectory = Join-Path $env:USERPROFILE 'Downloads'
$detectedCertificate = Get-ChildItem -LiteralPath $downloadDirectory -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Extension -in '.cer', '.crt', '.pem' -and $_.Name -match 'supabase|prod-ca' } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
$certificatePrompt = if ($detectedCertificate) { "Ruta del certificado SSL [$($detectedCertificate.FullName)]" } else { 'Ruta del certificado SSL descargado desde Supabase' }
$certificateInput = Read-Host $certificatePrompt
$sourceCertificatePath = if ($certificateInput) { $certificateInput.Trim('"') } elseif ($detectedCertificate) { $detectedCertificate.FullName } else { '' }
if (-not $sourceCertificatePath -or -not (Test-Path -LiteralPath $sourceCertificatePath)) {
  throw 'No se encontro el certificado SSL. Descarguelo desde Database Settings > SSL Configuration.'
}
$certificateContent = Get-Content -LiteralPath $sourceCertificatePath -Raw
if ($certificateContent -notmatch '-----BEGIN CERTIFICATE-----') {
  throw 'El archivo seleccionado no contiene un certificado PEM valido.'
}
New-Item -ItemType Directory -Path $certificateDirectory -Force | Out-Null
Set-Content -LiteralPath $localCertificatePath -Value $certificateContent -Encoding ASCII

$securePassword = Read-Host 'Database password (se mantendra oculta)' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $encodedPassword = [Uri]::EscapeDataString($plainPassword)
  $databaseUrl = "postgresql://postgres.${projectRef}:${encodedPassword}@${poolerHost}:5432/postgres"

  $authSecretBytes = New-Object byte[] 48
  $randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $randomGenerator.GetBytes($authSecretBytes)
  } finally {
    $randomGenerator.Dispose()
  }
  $authSecret = [Convert]::ToBase64String($authSecretBytes)

  @(
    '# Archivo local generado. No subir a Git.'
    "DATABASE_URL=${databaseUrl}"
    'DATABASE_SSL=true'
    "DATABASE_SSL_CA_PATH=${localCertificatePath}"
    'DATABASE_POOL_MAX=5'
    'BACKEND_PORT=4000'
    "AUTH_SECRET=${authSecret}"
    'CORS_ORIGINS=http://localhost:3000'
  ) | Set-Content -LiteralPath $cloudEnvPath -Encoding UTF8

  $env:DATABASE_URL = $databaseUrl
  $env:DATABASE_SSL_CA_PATH = $localCertificatePath
  Write-Host ''
  Write-Host 'Probando conexion SSL...' -ForegroundColor Cyan
  & node (Join-Path $PSScriptRoot 'test-cloud-database.mjs')
  if ($LASTEXITCODE -ne 0) {
    throw 'No fue posible conectar. Verifique el host y la contrasena.'
  }

  Write-Host ''
  Write-Host "Configuracion guardada en $cloudEnvPath" -ForegroundColor Green
  Write-Host 'La base local no fue modificada.' -ForegroundColor Yellow
} finally {
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  $plainPassword = $null
  $encodedPassword = $null
  $env:DATABASE_URL = $null
  $env:DATABASE_SSL_CA_PATH = $null
}
