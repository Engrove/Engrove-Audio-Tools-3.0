<#
Engrove Audio Tools 3.0
Fas 17.0.1 - Audio Data Validator array handling fix

This replaces tools\Validate-AudioDataV3.ps1.

Fix:
- Reads JSON arrays from raw text and explicitly materializes rows into Generic.List.
- Avoids PowerShell array wrapping/flattening mistakes that can report a large JSON array as 1 record.
- Validates runtime indexes against summary counts and match-ready requirements.

Run from repo root:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\Validate-AudioDataV3.ps1
#>

[CmdletBinding()]
param(
  [string]$RepoRoot
)

$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
  param([string]$Explicit)

  if (-not [string]::IsNullOrWhiteSpace($Explicit)) {
    return (Resolve-Path $Explicit).Path
  }

  if (Test-Path (Join-Path (Get-Location).Path ".git")) {
    return (Get-Location).Path
  }

  if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
  }

  return (Get-Location).Path
}

function Test-ArrayLike {
  param($Value)
  return ($null -ne $Value -and $Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string]) -and -not ($Value -is [System.Collections.IDictionary]))
}

function Read-JsonRows {
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter(Mandatory=$true)][string]$Label
  )

  if (-not (Test-Path $Path)) {
    throw "Missing required JSON file: $Path"
  }

  $text = Get-Content -Raw -Encoding UTF8 -Path $Path
  $trimmed = $text.TrimStart()
  $firstChar = if ($trimmed.Length -gt 0) { $trimmed.Substring(0, 1) } else { "" }
  $parsed = $text | ConvertFrom-Json

  $rows = New-Object System.Collections.Generic.List[object]
  $shape = "unknown"

  if ($firstChar -eq "[") {
    $shape = "row_array"
    foreach ($item in $parsed) {
      $rows.Add($item) | Out-Null
    }
  } elseif ($firstChar -eq "{") {
    $shape = "object"

    # Defensive support for object maps or one object. Runtime files should not use this.
    if ($parsed -is [pscustomobject]) {
      $rows.Add($parsed) | Out-Null
    } else {
      foreach ($item in $parsed) {
        $rows.Add($item) | Out-Null
      }
    }
  } else {
    throw "$Label has unsupported JSON shape. First character: '$firstChar'"
  }

  return [pscustomobject]@{
    Label = $Label
    Path = $Path
    Shape = $shape
    Count = $rows.Count
    Rows = $rows
  }
}

function Read-JsonObject {
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter(Mandatory=$true)][string]$Label
  )

  if (-not (Test-Path $Path)) {
    throw "Missing required JSON file: $Path"
  }

  $text = Get-Content -Raw -Encoding UTF8 -Path $Path
  return $text | ConvertFrom-Json
}

function Get-Prop {
  param($Object, [string]$Name)

  if ($null -eq $Object) {
    return $null
  }

  if ($Object -is [System.Collections.IDictionary] -and $Object.Contains($Name)) {
    return $Object[$Name]
  }

  $prop = $Object.PSObject.Properties[$Name]
  if ($null -ne $prop) {
    return $prop.Value
  }

  return $null
}

function Test-HasNumber {
  param($Value)
  if ($null -eq $Value) { return $false }
  if ($Value -is [int] -or $Value -is [long] -or $Value -is [double] -or $Value -is [decimal] -or $Value -is [float]) {
    return [double]$Value -eq [double]$Value
  }
  $parsed = 0.0
  return [double]::TryParse(([string]$Value).Replace(",", "."), [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)
}

function Add-Issue {
  param(
    [System.Collections.Generic.List[object]]$Issues,
    [string]$Severity,
    [string]$Code,
    [string]$Path,
    [string]$Message
  )

  $Issues.Add([pscustomobject]@{
    severity = $Severity
    code = $Code
    path = $Path
    message = $Message
  }) | Out-Null
}

function Count-MatchReady {
  param($Rows)

  $count = 0
  foreach ($row in $Rows) {
    if ((Get-Prop $row "match_ready") -eq $true) {
      $count += 1
    }
  }

  return $count
}

$RepoRoot = Resolve-RepoRoot $RepoRoot
$DataRoot = Join-Path $RepoRoot "src\data\audio\v3"
$RuntimeRoot = Join-Path $DataRoot "runtime"

$CartridgeIndexPath = Join-Path $RuntimeRoot "cartridges.index.json"
$TonearmIndexPath = Join-Path $RuntimeRoot "tonearms.index.json"
$SummaryPath = Join-Path $DataRoot "audio-data-v3-summary.json"

Write-Host ""
Write-Host "=== Validate Engrove Audio Tools 3.0 audio data ==="
Write-Host "Repo root: $RepoRoot"
Write-Host ""

$cartridgeDataset = Read-JsonRows -Path $CartridgeIndexPath -Label "cartridges.index"
$tonearmDataset = Read-JsonRows -Path $TonearmIndexPath -Label "tonearms.index"
$summary = Read-JsonObject -Path $SummaryPath -Label "audio-data-v3-summary"

$cartridges = $cartridgeDataset.Rows
$tonearms = $tonearmDataset.Rows

$cartridgeMatchReady = Count-MatchReady $cartridges
$tonearmMatchReady = Count-MatchReady $tonearms

$issues = New-Object System.Collections.Generic.List[object]

if ($cartridgeDataset.Shape -ne "row_array") {
  Add-Issue $issues "error" "cartridges.invalid_shape" "cartridges.index" "Expected runtime cartridge index to be a JSON array."
}

if ($tonearmDataset.Shape -ne "row_array") {
  Add-Issue $issues "error" "tonearms.invalid_shape" "tonearms.index" "Expected runtime tonearm index to be a JSON array."
}

if ($cartridgeDataset.Count -lt 1000) {
  Add-Issue $issues "error" "cartridges.too_few_records" "cartridges.index" "Expected at least 1000 cartridge records; got $($cartridgeDataset.Count)."
}

if ($tonearmDataset.Count -lt 500) {
  Add-Issue $issues "error" "tonearms.too_few_records" "tonearms.index" "Expected at least 500 tonearm records; got $($tonearmDataset.Count)."
}

if ($cartridgeMatchReady -lt 500) {
  Add-Issue $issues "error" "cartridges.too_few_match_ready" "cartridges.index" "Expected at least 500 match-ready cartridges; got $cartridgeMatchReady."
}

if ($tonearmMatchReady -lt 250) {
  Add-Issue $issues "error" "tonearms.too_few_match_ready" "tonearms.index" "Expected at least 250 match-ready tonearms; got $tonearmMatchReady."
}

$sampleLimit = [Math]::Min(200, $cartridgeDataset.Count)
for ($i = 0; $i -lt $sampleLimit; $i++) {
  $item = $cartridges[$i]
  $matchReady = Get-Prop $item "match_ready"

  if ($matchReady -eq $true) {
    if (-not (Test-HasNumber (Get-Prop $item "mass_g"))) {
      Add-Issue $issues "error" "cartridge.match_ready_without_mass" "cartridges.index[$i].mass_g" "Match-ready cartridge must have mass_g."
    }
    if (-not (Test-HasNumber (Get-Prop $item "compliance_10hz_cu"))) {
      Add-Issue $issues "error" "cartridge.match_ready_without_compliance" "cartridges.index[$i].compliance_10hz_cu" "Match-ready cartridge must have compliance_10hz_cu."
    }
  }

  if ([string]::IsNullOrWhiteSpace([string](Get-Prop $item "id"))) {
    Add-Issue $issues "error" "cartridge.missing_id" "cartridges.index[$i].id" "Cartridge index item must have id."
  }
}

$sampleLimit = [Math]::Min(200, $tonearmDataset.Count)
for ($i = 0; $i -lt $sampleLimit; $i++) {
  $item = $tonearms[$i]
  $matchReady = Get-Prop $item "match_ready"

  if ($matchReady -eq $true) {
    if (-not (Test-HasNumber (Get-Prop $item "effective_mass_g"))) {
      Add-Issue $issues "error" "tonearm.match_ready_without_effective_mass" "tonearms.index[$i].effective_mass_g" "Match-ready tonearm must have effective_mass_g."
    }
  }

  if ([string]::IsNullOrWhiteSpace([string](Get-Prop $item "id"))) {
    Add-Issue $issues "error" "tonearm.missing_id" "tonearms.index[$i].id" "Tonearm index item must have id."
  }
}

$summaryCartridgeCount = Get-Prop (Get-Prop $summary "cartridges") "output_records"
$summaryTonearmCount = Get-Prop (Get-Prop $summary "tonearms") "output_records"
$summaryCartridgeReady = Get-Prop (Get-Prop $summary "cartridges") "match_ready_records"
$summaryTonearmReady = Get-Prop (Get-Prop $summary "tonearms") "match_ready_records"

if ($summaryCartridgeCount -ne $cartridgeDataset.Count) {
  Add-Issue $issues "error" "summary.cartridge_count_mismatch" "summary.cartridges.output_records" "Summary says $summaryCartridgeCount; index has $($cartridgeDataset.Count)."
}

if ($summaryTonearmCount -ne $tonearmDataset.Count) {
  Add-Issue $issues "error" "summary.tonearm_count_mismatch" "summary.tonearms.output_records" "Summary says $summaryTonearmCount; index has $($tonearmDataset.Count)."
}

if ($summaryCartridgeReady -ne $cartridgeMatchReady) {
  Add-Issue $issues "error" "summary.cartridge_match_ready_mismatch" "summary.cartridges.match_ready_records" "Summary says $summaryCartridgeReady; index has $cartridgeMatchReady."
}

if ($summaryTonearmReady -ne $tonearmMatchReady) {
  Add-Issue $issues "error" "summary.tonearm_match_ready_mismatch" "summary.tonearms.match_ready_records" "Summary says $summaryTonearmReady; index has $tonearmMatchReady."
}

$errors = @($issues | Where-Object { $_.severity -eq "error" })
$warnings = @($issues | Where-Object { $_.severity -eq "warning" })

Write-Host "Validation result:"
Write-Host "- cartridges: $($cartridgeDataset.Count)"
Write-Host "- cartridges match-ready: $cartridgeMatchReady"
Write-Host "- tonearms: $($tonearmDataset.Count)"
Write-Host "- tonearms match-ready: $tonearmMatchReady"
Write-Host "- errors: $($errors.Count)"
Write-Host "- warnings: $($warnings.Count)"

foreach ($issue in $issues) {
  $prefix = if ($issue.severity -eq "error") { "[ERROR]" } else { "[WARNING]" }
  Write-Host "$prefix $($issue.code) $($issue.path): $($issue.message)"
}

if ($errors.Count -gt 0) {
  exit 1
}

Write-Host ""
Write-Host "PASS: Audio data validation succeeded."
