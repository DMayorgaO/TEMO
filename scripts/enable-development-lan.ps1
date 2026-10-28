$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$result=Join-Path $root 'tmp/development/firewall-result.json'
New-Item -ItemType Directory -Path (Split-Path -Parent $result) -Force | Out-Null
try {
  $administrator=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if(-not $administrator){throw 'Se requieren permisos de Administrador de Windows.'}
  $wifi=@(Get-NetConnectionProfile -InterfaceAlias 'Wi-Fi')
  if($wifi.Count -ne 1){throw 'No hay un perfil Wi-Fi unico; no se cambiaron otros perfiles.'}
  $version=(Get-Content -LiteralPath (Join-Path $root '.node-version') -Raw).Trim()
  if($version -notmatch '^\d+\.\d+\.\d+$'){throw 'Version de Node invalida.'}
  $node=Join-Path $root "tmp/node-runtime-$version/node-v$version-win-x64/node.exe"
  if(-not(Test-Path -LiteralPath $node)){throw 'No se encontro el Node portable del desarrollo.'}
  $name='TEMO-Development-LAN-3188'
  $rule=Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue
  if($rule -and $rule.Group -ne 'TEMO Desarrollo'){throw 'Existe una regla ajena con el mismo identificador.'}
  Set-NetConnectionProfile -InterfaceIndex $wifi[0].InterfaceIndex -NetworkCategory Private
  if($rule){
    Set-NetFirewallRule -Name $name -Direction Inbound -Action Allow -Enabled True -Profile Private -RemoteAddress LocalSubnet -Program $node -EdgeTraversalPolicy Block | Out-Null
    Get-NetFirewallRule -Name $name | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort 3188 | Out-Null
  } else {
    New-NetFirewallRule -Name $name -DisplayName 'TEMO Desarrollo LAN 3188' -Group 'TEMO Desarrollo' -Direction Inbound -Action Allow -Enabled True -Protocol TCP -LocalPort 3188 -Profile Private -RemoteAddress LocalSubnet -Program $node -EdgeTraversalPolicy Block | Out-Null
  }
  @{success=$true;port=3188;profile='Private';remoteAddress='LocalSubnet';interfaceIndex=$wifi[0].InterfaceIndex}|ConvertTo-Json|Set-Content -LiteralPath $result -Encoding UTF8
} catch {
  @{success=$false;message=$_.Exception.Message}|ConvertTo-Json|Set-Content -LiteralPath $result -Encoding UTF8
  exit 1
}
