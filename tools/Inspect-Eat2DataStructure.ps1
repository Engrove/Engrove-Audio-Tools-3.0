<#
Inspect Engrove Audio Tools 2.0 database structure before conversion.
This script is intentionally defensive: it fails if the main data files are not multi-record arrays.
#>

[CmdletBinding()]
param([string]$RepoRoot)

$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
  param([string]$Explicit)
  if (-not [string]::IsNullOrWhiteSpace($Explicit)) { return (Resolve-Path $Explicit).Path }
  if (Test-Path (Join-Path (Get-Location).Path ".git")) { return (Get-Location).Path }
  if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) { return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path }
  return (Get-Location).Path
}

function Test-ArrayLike {
  param($Value)
  return ($null -ne $Value -and $Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string]) -and -not ($Value -is [System.Collections.IDictionary]))
}

function Get-JsonDatasetInspection {
  param([string]$Path, [string]$Name, [int]$ExpectedMinimumRecords)

  if (-not (Test-Path $Path)) {
    throw "Missing required file: $Path"
  }

  $text = Get-Content -Raw -Encoding UTF8 -Path $Path
  $trimmed = $text.TrimStart()
  $firstChar = if ($trimmed.Length -gt 0) { $trimmed.Substring(0, 1) } else { "" }
  $parsed = $text | ConvertFrom-Json

  $rows = New-Object System.Collections.Generic.List[object]
  $shape = "unknown"

  if ($firstChar -eq "[") {
    $shape = "row_array"
    foreach ($item in $parsed) { $rows.Add($item) | Out-Null }
  } elseif ($firstChar -eq "{") {
    $props = @($parsed.PSObject.Properties)
    $arrayProps = @($props | Where-Object { Test-ArrayLike $_.Value })

    if ($arrayProps.Count -gt 0) {
      $maxCount = 0
      foreach ($prop in $arrayProps) {
        $count = @($prop.Value).Count
        if ($count -gt $maxCount) { $maxCount = $count }
      }

      if ($maxCount -gt 1) {
        $shape = "columnar_object"
        for ($i = 0; $i -lt $maxCount; $i++) {
          $row = [ordered]@{}
          foreach ($prop in $props) {
            if (Test-ArrayLike $prop.Value) {
              $items = @($prop.Value)
              $row[$prop.Name] = if ($i -lt $items.Count) { $items[$i] } else { $null }
            } else {
              $row[$prop.Name] = $prop.Value
            }
          }
          $rows.Add([pscustomobject]$row) | Out-Null
        }
      } else {
        $shape = "single_object"
        $rows.Add($parsed) | Out-Null
      }
    } else {
      $shape = "single_object"
      $rows.Add($parsed) | Out-Null
    }
  }

  if ($rows.Count -lt $ExpectedMinimumRecords) {
    throw "$Name inspection failed: only $($rows.Count) record(s), expected at least $ExpectedMinimumRecords. Shape=$shape FirstChar=$firstChar"
  }

  $first = $rows[0]
  $last = $rows[$rows.Count - 1]
  $firstProps = @($first.PSObject.Properties.Name)

  return [pscustomobject]@{
    name = $Name
    path = $Path
    shape = $shape
    first_char = $firstChar
    records = $rows.Count
    first_id = $first.id
    first_manufacturer = $first.manufacturer
    first_model = $first.model
    last_id = $last.id
    last_manufacturer = $last.manufacturer
    last_model = $last.model
    field_count = $firstProps.Count
    first_fields = ($firstProps -join ", ")
  }
}

$RepoRoot = Resolve-RepoRoot $RepoRoot
$DataRoot = Join-Path $RepoRoot "src\data\legacy\engrove-2.0\public\data"

Write-Host ""
Write-Host "=== Inspect EAT2 database structure ==="
Write-Host "Data root: $DataRoot"
Write-Host ""

$cartridges = Get-JsonDatasetInspection -Path (Join-Path $DataRoot "cartridges-data.json") -Name "cartridges-data.json" -ExpectedMinimumRecords 100
$tonearms = Get-JsonDatasetInspection -Path (Join-Path $DataRoot "tonearms-data.json") -Name "tonearms-data.json" -ExpectedMinimumRecords 50

$report = [ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  datasets = @($cartridges, $tonearms)
}

$reportPath = Join-Path $DataRoot "eat2-structure-inspection.json"
($report | ConvertTo-Json -Depth 8) + "`n" | Set-Content -Encoding UTF8 -Path $reportPath

$cartridges | Format-List
$tonearms | Format-List

Write-Host "Inspection report written:"
Write-Host $reportPath
