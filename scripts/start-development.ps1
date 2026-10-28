param([switch]$NoBrowser)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$version=(Get-Content -LiteralPath (Join-Path $root '.node-version') -Raw).Trim()
if($version -notmatch '^\d+\.\d+\.\d+$'){throw 'Version de Node invalida.'}
$portable=Join-Path $root "tmp/node-runtime-$version/node-v$version-win-x64/node.exe"
$node=if(Test-Path -LiteralPath $portable){$portable}else{(Get-Command node -ErrorAction Stop).Source}
$env:PATH="$(Split-Path -Parent $node);$env:PATH"
& $node (Join-Path $root 'scripts/check-runtime-security.mjs')
if($LASTEXITCODE -ne 0){throw 'Use el Node parcheado indicado en .node-version. No se iniciaron servicios.'}
& $node (Join-Path $root 'scripts/start-development.mjs')
if($LASTEXITCODE -ne 0){throw 'Revise el mensaje de inicio y tmp/development. No se borraron datos.'}
if(-not $NoBrowser){Start-Process 'http://127.0.0.1:3188/#/login'}
