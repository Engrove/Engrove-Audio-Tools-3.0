<#
Engrove Audio Tools 3.0
Convert Engrove Audio Tools 2.0 public data into compact 3.0 runtime JSON.

Run from repo root:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\Convert-Eat2ToEat3Data.ps1

v3 fixes:
- File is saved as UTF-8 with BOM for Windows PowerShell.
- No literal en dash in regex source, avoiding mojibake parse errors.
- Safe OrderedDictionary key insertion.
#>

[CmdletBinding()]
param(
  [string]$RepoRoot
)

$ErrorActionPreference = "Stop"


function Get-EngroveScriptDirectory {
  if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    return $PSScriptRoot
  }

  if (-not [string]::IsNullOrWhiteSpace($PSCommandPath)) {
    return Split-Path -Parent $PSCommandPath
  }

  if ($MyInvocation -and $MyInvocation.MyCommand -and -not [string]::IsNullOrWhiteSpace($MyInvocation.MyCommand.Path)) {
    return Split-Path -Parent $MyInvocation.MyCommand.Path
  }

  $toolsCandidate = Join-Path (Get-Location).Path "tools"
  if (Test-Path $toolsCandidate) {
    return $toolsCandidate
  }

  return (Get-Location).Path
}

function Resolve-EngroveRepoRoot {
  param([string]$ExplicitRepoRoot)

  if (-not [string]::IsNullOrWhiteSpace($ExplicitRepoRoot)) {
    return (Resolve-Path $ExplicitRepoRoot).Path
  }

  $scriptDir = Get-EngroveScriptDirectory

  if ((Split-Path -Leaf $scriptDir) -ieq "tools") {
    return (Resolve-Path (Join-Path $scriptDir "..")).Path
  }

  if (Test-Path (Join-Path $scriptDir ".git")) {
    return (Resolve-Path $scriptDir).Path
  }

  if (Test-Path (Join-Path (Get-Location).Path ".git")) {
    return (Get-Location).Path
  }

  return (Resolve-Path (Join-Path $scriptDir "..")).Path
}


$RepoRoot = Resolve-EngroveRepoRoot -ExplicitRepoRoot $RepoRoot
$LegacyDir = Join-Path $RepoRoot "src\data\legacy\engrove-2.0\public\data"
$OutDir = Join-Path $RepoRoot "src\data\audio\v3"
$RuntimeDir = Join-Path $OutDir "runtime"

function Get-Sha256Text {
  param([string]$Text)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Read-JsonFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    throw "Missing required file: $Path"
  }
  return Get-Content -Raw -Encoding UTF8 -Path $Path | ConvertFrom-Json
}

function Convert-ToNullableNumber {
  param($Value)
  if ($null -eq $Value) { return $null }
  $text = [string]$Value
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  $text = $text.Trim().Replace(",", ".")
  $number = 0.0
  if ([double]::TryParse($text, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$number)) {
    return [double]$number
  }
  return $null
}

function Convert-ToNullableString {
  param($Value)
  if ($null -eq $Value) { return $null }
  $text = ([string]$Value).Trim()
  if ($text.Length -eq 0) { return $null }
  return $text
}

function Convert-ToNullableBool {
  param($Value)
  if ($null -eq $Value) { return $null }
  if ($Value -is [bool]) { return [bool]$Value }
  $text = ([string]$Value).Trim().ToLowerInvariant()
  if ($text -in @("true", "yes", "1")) { return $true }
  if ($text -in @("false", "no", "0")) { return $false }
  return $null
}

function Convert-ToSlugPart {
  param($Value)
  $text = Convert-ToNullableString $Value
  if ($null -eq $text) { return "" }
  $text = $text.Normalize([System.Text.NormalizationForm]::FormD)
  $text = [regex]::Replace($text, "\p{Mn}", "")
  $text = $text.ToLowerInvariant().Replace("&", " and ")
  $text = [regex]::Replace($text, "[^a-z0-9]+", "-")
  $text = $text.Trim("-")
  if ($text.Length -gt 80) { $text = $text.Substring(0, 80).Trim("-") }
  return $text
}

function Convert-ToCleanText {
  param($Value)
  $text = Convert-ToNullableString $Value
  if ($null -eq $text) { return $null }
  return $text.Replace("`r`n", "`n").Replace("`r", "`n").Trim()
}

function Convert-ToRange {
  param($Value)

  if ($null -eq $Value) { return $null }

  if ($Value -is [int] -or $Value -is [long] -or $Value -is [double] -or $Value -is [decimal] -or $Value -is [float]) {
    $directNumber = Convert-ToNullableNumber $Value
    if ($null -ne $directNumber) {
      return [ordered]@{ min = $directNumber; max = $directNumber }
    }
  }

  $text = ([string]$Value).Trim().Replace(",", ".")
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }

  $enDash = [char]0x2013
  $emDash = [char]0x2014
  $dashChars = "-" + $enDash + $emDash
  $dashPattern = "[" + [regex]::Escape($dashChars) + "]"
  $pattern = "(-?\d+(?:\.\d+)?)\s*(?:" + $dashPattern + "|\bto\b)\s*(-?\d+(?:\.\d+)?)"

  $match = [regex]::Match($text, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($match.Success) {
    $a = [double]::Parse($match.Groups[1].Value, [System.Globalization.CultureInfo]::InvariantCulture)
    $b = [double]::Parse($match.Groups[2].Value, [System.Globalization.CultureInfo]::InvariantCulture)
    return [ordered]@{ min = [Math]::Min($a, $b); max = [Math]::Max($a, $b) }
  }

  $singleText = [regex]::Replace($text, "[^\d\.\-]", "")
  $single = Convert-ToNullableNumber $singleText
  if ($null -ne $single) {
    return [ordered]@{ min = $single; max = $single }
  }

  return $null
}

function Remove-EmptyValues {
  param($Value)

  if ($null -eq $Value) { return $null }

  if ($Value -is [System.Collections.IDictionary]) {
    $result = [ordered]@{}
    foreach ($key in $Value.Keys) {
      $child = Remove-EmptyValues $Value[$key]
      if ($null -eq $child) { continue }
      if ($child -is [System.Collections.ICollection] -and $child.Count -eq 0) { continue }
      if ($child -is [System.Collections.IDictionary] -and $child.Count -eq 0) { continue }
      $result[$key] = $child
    }
    return $result
  }

  if ($Value -is [System.Array]) {
    $list = @()
    foreach ($item in $Value) {
      $child = Remove-EmptyValues $item
      if ($null -ne $child) { $list += $child }
    }
    return $list
  }

  if ($Value -is [pscustomobject]) {
    $hash = [ordered]@{}
    foreach ($prop in $Value.PSObject.Properties) {
      $hash[$prop.Name] = $prop.Value
    }
    return Remove-EmptyValues $hash
  }

  return $Value
}

function Convert-Cartridge {
  param($Row)

  $manufacturer = Convert-ToNullableString $Row.manufacturer
  $model = Convert-ToNullableString $Row.model
  $trackingMin = Convert-ToNullableNumber $Row.tracking_force_min_g
  $trackingMax = Convert-ToNullableNumber $Row.tracking_force_max_g
  $recommended = $null

  if ($null -ne $trackingMin -and $null -ne $trackingMax) {
    $recommended = [Math]::Round(($trackingMin + $trackingMax) / 2, 3)
  } elseif ($null -ne $trackingMin) {
    $recommended = $trackingMin
  } elseif ($null -ne $trackingMax) {
    $recommended = $trackingMax
  }

  $compliance10 = Convert-ToNullableNumber $Row.cu_dynamic_10hz
  $tenHzSource = if ($null -eq $compliance10) { "missing" } elseif ($Row.is_estimated_10hz -eq $true) { "estimated" } else { "provided" }

  $tags = @()
  if ($Row.tags -is [System.Array]) {
    $tags = @($Row.tags | ForEach-Object { Convert-ToNullableString $_ } | Where-Object { $null -ne $_ })
  }

  $record = [ordered]@{
    id = "cartridge:$($Row.id):$(Convert-ToSlugPart $manufacturer)-$(Convert-ToSlugPart $model)"
    legacy_id = $Row.id
    manufacturer = $manufacturer
    model = $model
    display_name = (@($manufacturer, $model) | Where-Object { $_ }) -join " "
    type = Convert-ToNullableString $Row.type
    mass_g = Convert-ToNullableNumber $Row.weight_g
    tracking_force_g = [ordered]@{ min = $trackingMin; max = $trackingMax; recommended = $recommended }
    compliance = [ordered]@{
      static_cu = Convert-ToNullableNumber $Row.cu_static
      dynamic_10hz_cu = $compliance10
      dynamic_100hz_cu = Convert-ToNullableNumber $Row.cu_dynamic_100hz
      ten_hz_source = $tenHzSource
      level = Convert-ToNullableString $Row.compliance_level
    }
    stylus = [ordered]@{
      type = Convert-ToNullableString $Row.stylus_type
      family = Convert-ToNullableString $Row.stylus_family
      cantilever_material = Convert-ToNullableString $Row.cantilever_material
      cantilever_class = Convert-ToNullableString $Row.cantilever_class
    }
    electrical = [ordered]@{
      output_mv = Convert-ToNullableNumber $Row.output_voltage_mv
      load_impedance_ohm = Convert-ToNullableNumber $Row.load_impedance_ohm
      load_capacitance_pf = [ordered]@{
        min = Convert-ToNullableNumber $Row.load_capacitance_min_pf
        max = Convert-ToNullableNumber $Row.load_capacitance_max_pf
      }
    }
    frequency_response_hz = [ordered]@{
      min = Convert-ToNullableNumber $Row.frequency_response_min_hz
      max = Convert-ToNullableNumber $Row.frequency_response_max_hz
    }
    channel_separation_db = Convert-ToNullableNumber $Row.channel_separation_db
    sonic_profile = [ordered]@{
      character_en = Convert-ToCleanText $Row.sonic_character_en
      review_summary_en = Convert-ToCleanText $Row.review_summary_en
      notes_en = Convert-ToCleanText $Row.notes_en
    }
    image_url = Convert-ToNullableString $Row.image_url
    tags = $tags
  }

  $missing = @()
  if ($null -eq $record["mass_g"]) { $missing += "mass_g" }
  if ($null -eq $record["compliance"]["dynamic_10hz_cu"]) { $missing += "compliance.dynamic_10hz_cu" }

  $record["data_quality"] = [ordered]@{
    match_ready = ($missing.Count -eq 0)
    missing = $missing
    estimated = [ordered]@{ compliance_10hz = ($record["compliance"]["ten_hz_source"] -eq "estimated") }
  }

  return Remove-EmptyValues $record
}

function Convert-Tonearm {
  param($Row)

  $manufacturer = Convert-ToNullableString $Row.manufacturer
  $model = Convert-ToNullableString $Row.model
  $nullPoints = @()
  if ($Row.null_points_mm -is [System.Array]) {
    $nullPoints = @($Row.null_points_mm | ForEach-Object { Convert-ToNullableNumber $_ } | Where-Object { $null -ne $_ })
  }

  $example = $null
  if ($null -ne $Row.example_params_for_calculator) {
    $example = [ordered]@{
      m_headshell_g = Convert-ToNullableNumber $Row.example_params_for_calculator.m_headshell
      m_rear_assembly_g = Convert-ToNullableNumber $Row.example_params_for_calculator.m_rear_assembly
      m_tube_percentage = Convert-ToNullableNumber $Row.example_params_for_calculator.m_tube_percentage
      l2_mm = Convert-ToNullableNumber $Row.example_params_for_calculator.L2
      l3_fixed_cw_mm = Convert-ToNullableNumber $Row.example_params_for_calculator.L3_fixed_cw
    }
  }

  $record = [ordered]@{
    id = "tonearm:$($Row.id):$(Convert-ToSlugPart $manufacturer)-$(Convert-ToSlugPart $model)"
    legacy_id = $Row.id
    manufacturer = $manufacturer
    model = $model
    display_name = (@($manufacturer, $model) | Where-Object { $_ }) -join " "
    effective_mass_g = Convert-ToNullableNumber $Row.effective_mass_g
    geometry = [ordered]@{
      effective_length_mm = Convert-ToNullableNumber $Row.effective_length_mm
      pivot_to_spindle_mm = Convert-ToNullableNumber $Row.pivot_to_spindle_mm
      overhang_mm = Convert-ToNullableNumber $Row.overhang_mm
      offset_angle_deg = Convert-ToNullableNumber $Row.offset_angle_deg
      alignment_geometry = Convert-ToNullableString $Row.alignment_geometry
      null_points_mm = $nullPoints
    }
    construction = [ordered]@{
      arm_shape = Convert-ToNullableString $Row.arm_shape
      arm_material = Convert-ToNullableString $Row.arm_material
      bearing_type = Convert-ToNullableString $Row.bearing_type
      headshell_connector = Convert-ToNullableString $Row.headshell_connector
      tracking_method = Convert-ToNullableString $Row.tracking_method
      internal_wiring_material = Convert-ToNullableString $Row.internal_wiring_material
      detachable_cable = Convert-ToNullableBool $Row.detachable_cable
      external_cable_capacitance_pf = Convert-ToNullableNumber $Row.external_cable_capacitance_pf
    }
    adjustment = [ordered]@{
      vta = Convert-ToNullableBool $Row.vta_adjustment
      azimuth = Convert-ToNullableBool $Row.azimuth_adjustment
    }
    compatibility = [ordered]@{
      cartridge_weight_range_g = Convert-ToRange $Row.cartridge_weight_range_g
      tracking_force_range_g = Convert-ToRange $Row.stylus_pressure_range_g
    }
    notes = Convert-ToCleanText $Row.notes
    calculator_example = $example
  }

  $missing = @()
  if ($null -eq $record["effective_mass_g"]) { $missing += "effective_mass_g" }

  $record["data_quality"] = [ordered]@{
    match_ready = ($missing.Count -eq 0)
    missing = $missing
  }

  return Remove-EmptyValues $record
}

function Write-JsonFile {
  param([string]$RelativePath, $Data)

  $fullPath = Join-Path $OutDir $RelativePath
  $parent = Split-Path -Parent $fullPath
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }

  $json = $Data | ConvertTo-Json -Depth 40
  $json = $json + "`n"
  Set-Content -Path $fullPath -Value $json -Encoding UTF8

  return [ordered]@{
    path = ($fullPath.Substring($RepoRoot.Length + 1)).Replace("\", "/")
    records = if ($Data -is [System.Array]) { $Data.Count } else { $null }
    size_bytes = ([System.Text.Encoding]::UTF8.GetByteCount($json))
    sha256 = Get-Sha256Text $json
  }
}

function Get-DictValue {
  param($Object, [string]$Key)
  if ($Object -is [System.Collections.IDictionary] -and $Object.Contains($Key)) { return $Object[$Key] }
  return $null
}

function Count-By {
  param([array]$Items, [scriptblock]$Getter)
  $counts = [ordered]@{}
  foreach ($item in $Items) {
    $key = & $Getter $item
    if ($null -eq $key -or "$key" -eq "") { $key = "unknown" }
    if (-not $counts.Contains($key)) { $counts[$key] = 0 }
    $counts[$key] += 1
  }
  return $counts
}

Write-Host ""
Write-Host "=== Convert EAT2 audio data to EAT3 runtime data ==="
Write-Host "Input:  $LegacyDir"
Write-Host "Output: $OutDir"
Write-Host ""

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

$cartridgeRows = @(Read-JsonFile (Join-Path $LegacyDir "cartridges-data.json"))
$tonearmRows = @(Read-JsonFile (Join-Path $LegacyDir "tonearms-data.json"))

$cartridges = @($cartridgeRows | ForEach-Object { Convert-Cartridge $_ })
$tonearms = @($tonearmRows | ForEach-Object { Convert-Tonearm $_ })

$cartridgeIndex = @($cartridges | ForEach-Object {
  $compliance = Get-DictValue $_ "compliance"
  $trackingForce = Get-DictValue $_ "tracking_force_g"
  $quality = Get-DictValue $_ "data_quality"
  Remove-EmptyValues ([ordered]@{
    id = Get-DictValue $_ "id"
    display_name = Get-DictValue $_ "display_name"
    manufacturer = Get-DictValue $_ "manufacturer"
    model = Get-DictValue $_ "model"
    type = Get-DictValue $_ "type"
    mass_g = Get-DictValue $_ "mass_g"
    compliance_10hz_cu = Get-DictValue $compliance "dynamic_10hz_cu"
    compliance_10hz_source = Get-DictValue $compliance "ten_hz_source"
    tracking_force_g = $trackingForce
    match_ready = Get-DictValue $quality "match_ready"
    tags = Get-DictValue $_ "tags"
  })
})

$tonearmIndex = @($tonearms | ForEach-Object {
  $geometry = Get-DictValue $_ "geometry"
  $construction = Get-DictValue $_ "construction"
  $compatibility = Get-DictValue $_ "compatibility"
  $quality = Get-DictValue $_ "data_quality"
  Remove-EmptyValues ([ordered]@{
    id = Get-DictValue $_ "id"
    display_name = Get-DictValue $_ "display_name"
    manufacturer = Get-DictValue $_ "manufacturer"
    model = Get-DictValue $_ "model"
    effective_mass_g = Get-DictValue $_ "effective_mass_g"
    effective_length_mm = Get-DictValue $geometry "effective_length_mm"
    headshell_connector = Get-DictValue $construction "headshell_connector"
    cartridge_weight_range_g = Get-DictValue $compatibility "cartridge_weight_range_g"
    match_ready = Get-DictValue $quality "match_ready"
  })
})

$outputs = @()
$outputs += Write-JsonFile "cartridges.v3.json" $cartridges
$outputs += Write-JsonFile "tonearms.v3.json" $tonearms
$outputs += Write-JsonFile "runtime/cartridges.index.json" $cartridgeIndex
$outputs += Write-JsonFile "runtime/tonearms.index.json" $tonearmIndex

$summary = [ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  source = [ordered]@{
    repo = "Engrove/Engrove-Audio-Tools-2.0"
    ref = "main"
    legacy_dir = ($LegacyDir.Substring($RepoRoot.Length + 1)).Replace("\", "/")
  }
  note = "3.0 schemas are intentionally deferred until after converted data review."
  cartridges = [ordered]@{
    input_records = $cartridgeRows.Count
    output_records = $cartridges.Count
    match_ready_records = @($cartridges | Where-Object { (Get-DictValue (Get-DictValue $_ "data_quality") "match_ready") -eq $true }).Count
    by_type = Count-By $cartridges { param($x) Get-DictValue $x "type" }
    compliance_10hz_source = Count-By $cartridges { param($x) Get-DictValue (Get-DictValue $x "compliance") "ten_hz_source" }
  }
  tonearms = [ordered]@{
    input_records = $tonearmRows.Count
    output_records = $tonearms.Count
    match_ready_records = @($tonearms | Where-Object { (Get-DictValue (Get-DictValue $_ "data_quality") "match_ready") -eq $true }).Count
    by_headshell_connector = Count-By $tonearms { param($x) Get-DictValue (Get-DictValue $x "construction") "headshell_connector" }
  }
  outputs = $outputs
}

$outputs += Write-JsonFile "audio-data-v3-summary.json" $summary
$outputs += Write-JsonFile "runtime/audio-index.manifest.json" ([ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  outputs = $outputs
})

Write-Host "Conversion complete."
Write-Host "Cartridges: $($summary["cartridges"]["output_records"]) / match-ready $($summary["cartridges"]["match_ready_records"])"
Write-Host "Tonearms:   $($summary["tonearms"]["output_records"]) / match-ready $($summary["tonearms"]["match_ready_records"])"
Write-Host ""
foreach ($output in $outputs) {
  Write-Host "$($output["path"])  $($output["size_bytes"]) bytes  $($output["sha256"])"
}
