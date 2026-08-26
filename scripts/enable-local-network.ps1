$ErrorActionPreference = 'Stop'

$isAdministrator = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)

if (-not $isAdministrator) {
  Start-Process -FilePath 'powershell.exe' `
    -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"" `
    -Verb RunAs
  exit
}

$rules = @(
  @{ Name = 'TEMO Frontend LAN'; Port = 3000 },
  @{ Name = 'TEMO Backend LAN'; Port = 4000 }
)

foreach ($rule in $rules) {
  Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule `
    -DisplayName $rule.Name `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $rule.Port `
    -Profile Any `
    -RemoteAddress LocalSubnet | Out-Null
}

Write-Host 'Acceso de TEMO habilitado para dispositivos de la red local.' -ForegroundColor Green
Write-Host 'Puede cerrar esta ventana.'
Read-Host
