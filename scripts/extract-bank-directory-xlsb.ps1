param(
  [string]$Source = '',
  [string]$Output = 'logs\bank-directory-inspection.ndjson'
)

$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $Source) {
  $Source = Join-Path (Split-Path -Parent $projectRoot) 'DOUMENTO Cuentas Bancarias 2026.xlsb'
}
if (-not [System.IO.Path]::IsPathRooted($Output)) {
  $Output = Join-Path $projectRoot $Output
}
if (-not (Test-Path -LiteralPath $Source)) {
  throw "No se encontro el libro de origen: $Source"
}

$rows = [System.Collections.Generic.List[string]]::new()
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
  $book = $excel.Workbooks.Open($Source, 0, $true)
  foreach ($sheet in $book.Worksheets) {
    $used = $sheet.UsedRange
    $rows.Add(([pscustomobject]@{
      kind = 'sheet'
      sheet = $sheet.Name
      rows = $used.Rows.Count
      columns = $used.Columns.Count
    } | ConvertTo-Json -Compress))

    for ($rowNumber = 1; $rowNumber -le $used.Rows.Count; $rowNumber++) {
      $values = [System.Collections.Generic.List[string]]::new()
      $hasValue = $false
      for ($columnNumber = 1; $columnNumber -le $used.Columns.Count; $columnNumber++) {
        $value = [string]$used.Cells.Item($rowNumber, $columnNumber).Text
        if (-not [string]::IsNullOrWhiteSpace($value)) {
          $hasValue = $true
        }
        $values.Add($value)
      }

      if ($hasValue) {
        $rows.Add(([pscustomobject]@{
          kind = 'row'
          sheet = $sheet.Name
          row = $rowNumber
          values = $values
        } | ConvertTo-Json -Compress))
      }
    }
  }
}
finally {
  if ($null -ne $book) {
    $book.Close($false)
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($book) | Out-Null
  }
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

$outputPath = if ([System.IO.Path]::IsPathRooted($Output)) { $Output } else { Join-Path (Get-Location) $Output }
[System.IO.File]::WriteAllLines($outputPath, $rows, [System.Text.UTF8Encoding]::new($false))
Write-Output "Extraidas $($rows.Count) lineas en $outputPath"
