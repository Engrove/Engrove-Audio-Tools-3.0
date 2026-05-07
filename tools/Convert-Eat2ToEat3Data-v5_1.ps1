<#
Engrove Audio Tools 3.0 - EAT2 -> EAT3 converter v5

Verified assumptions:
- cartridges-data.json is a JSON row array, beginning with "[".
- tonearms-data.json is a JSON row array, beginning with "[".
- The converter still supports columnar objects defensively, but fails if record count is implausibly low.

Run from repo root:
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\Convert-Eat2ToEat3Data.ps1
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

$RepoRoot = Resolve-RepoRoot $RepoRoot
$LegacyDir = Join-Path $RepoRoot "src\data\legacy\engrove-2.0\public\data"
$OutDir = Join-Path $RepoRoot "src\data\audio\v3"
$RuntimeDir = Join-Path $OutDir "runtime"

function Hash-Text([string]$Text) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
  } finally { $sha.Dispose() }
}

function Test-ArrayLike($Value) {
  return ($null -ne $Value -and $Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string]) -and -not ($Value -is [System.Collections.IDictionary]))
}

function Read-JsonRows([string]$Path, [string]$Name, [int]$ExpectedMinimumRecords) {
  if (-not (Test-Path $Path)) { throw "Missing required file: $Path" }

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
    throw "$Name conversion stopped: only $($rows.Count) record(s), expected at least $ExpectedMinimumRecords. Shape=$shape FirstChar=$firstChar"
  }

  Write-Host ("{0}: shape={1} records={2}" -f $Name, $shape, $rows.Count)
  return [pscustomobject]@{ Shape = $shape; Rows = $rows; Count = $rows.Count }
}

function N($v) {
  if ($null -eq $v) { return $null }
  $t = ([string]$v).Trim().Replace(",", ".")
  if ($t.Length -eq 0) { return $null }
  $x = 0.0
  if ([double]::TryParse($t, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$x)) { return [double]$x }
  return $null
}

function S($v) {
  if ($null -eq $v) { return $null }
  $t = ([string]$v).Trim()
  if ($t.Length -eq 0) { return $null }
  return $t
}

function B($v) {
  if ($null -eq $v) { return $null }
  if ($v -is [bool]) { return [bool]$v }
  $t = ([string]$v).Trim().ToLowerInvariant()
  if ($t -in @("true","yes","1")) { return $true }
  if ($t -in @("false","no","0")) { return $false }
  return $null
}

function Slug($v) {
  $t = S $v
  if ($null -eq $t) { return "" }
  $t = $t.Normalize([System.Text.NormalizationForm]::FormD)
  $t = [regex]::Replace($t, "\p{Mn}", "")
  $t = $t.ToLowerInvariant().Replace("&", " and ")
  $t = [regex]::Replace($t, "[^a-z0-9]+", "-").Trim("-")
  if ($t.Length -gt 80) { $t = $t.Substring(0, 80).Trim("-") }
  return $t
}

function Range($v) {
  if ($null -eq $v) { return $null }
  $text = ([string]$v).Trim().Replace(",", ".")
  if ($text.Length -eq 0) { return $null }

  $en = [char]0x2013
  $em = [char]0x2014
  $dashPattern = "[" + [regex]::Escape("-" + $en + $em) + "]"
  $pattern = "(-?\d+(?:\.\d+)?)\s*(?:" + $dashPattern + "|\bto\b)\s*(-?\d+(?:\.\d+)?)"
  $m = [regex]::Match($text, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

  if ($m.Success) {
    $a = [double]::Parse($m.Groups[1].Value, [System.Globalization.CultureInfo]::InvariantCulture)
    $b = [double]::Parse($m.Groups[2].Value, [System.Globalization.CultureInfo]::InvariantCulture)
    return [ordered]@{ min = [Math]::Min($a, $b); max = [Math]::Max($a, $b) }
  }

  $one = N ([regex]::Replace($text, "[^\d\.\-]", ""))
  if ($null -ne $one) { return [ordered]@{ min = $one; max = $one } }

  return $null
}

function Clean($v) {
  $t = S $v
  if ($null -eq $t) { return $null }
  return $t.Replace("`r`n","`n").Replace("`r","`n").Trim()
}

function Compact($v) {
  if ($null -eq $v) { return $null }

  if ($v -is [System.Collections.IDictionary]) {
    $r = [ordered]@{}
    foreach ($k in $v.Keys) {
      $c = Compact $v[$k]
      if ($null -eq $c) { continue }
      if ($c -is [System.Collections.ICollection] -and $c.Count -eq 0) { continue }
      if ($c -is [System.Collections.IDictionary] -and $c.Count -eq 0) { continue }
      $r[$k] = $c
    }
    return $r
  }

  if ($v -is [System.Array]) {
    $a = @()
    foreach ($x in $v) {
      $c = Compact $x
      if ($null -ne $c) { $a += $c }
    }
    return $a
  }

  if ($v -is [pscustomobject]) {
    $h = [ordered]@{}
    foreach ($p in $v.PSObject.Properties) { $h[$p.Name] = $p.Value }
    return Compact $h
  }

  return $v
}

function D($o, [string]$k) {
  if ($o -is [System.Collections.IDictionary] -and $o.Contains($k)) { return $o[$k] }
  return $null
}

function Convert-Cartridge($r) {
  $mfg = S $r.manufacturer
  $model = S $r.model
  $tfMin = N $r.tracking_force_min_g
  $tfMax = N $r.tracking_force_max_g
  $tfRec = $null
  if ($null -ne $tfMin -and $null -ne $tfMax) { $tfRec = [Math]::Round(($tfMin + $tfMax) / 2, 3) } elseif ($null -ne $tfMin) { $tfRec = $tfMin } elseif ($null -ne $tfMax) { $tfRec = $tfMax }
  $c10 = N $r.cu_dynamic_10hz
  $src = if ($null -eq $c10) { "missing" } elseif ($r.is_estimated_10hz -eq $true) { "estimated" } else { "provided" }

  $tags = @()
  if ($r.tags -is [System.Array]) { $tags = @($r.tags | ForEach-Object { S $_ } | Where-Object { $null -ne $_ }) } elseif ($null -ne (S $r.tags)) { $tags = @(S $r.tags) }

  $legacy = if ($null -ne $r.id) { $r.id } else { "$mfg-$model" }

  $rec = [ordered]@{
    id = ("cartridge:{0}:{1}-{2}" -f $legacy, (Slug $mfg), (Slug $model))
    legacy_id = $r.id
    manufacturer = $mfg
    model = $model
    display_name = (@($mfg,$model) | Where-Object { $_ }) -join " "
    type = S $r.type
    mass_g = N $r.weight_g
    tracking_force_g = [ordered]@{ min = $tfMin; max = $tfMax; recommended = $tfRec }
    compliance = [ordered]@{ static_cu = N $r.cu_static; dynamic_10hz_cu = $c10; dynamic_100hz_cu = N $r.cu_dynamic_100hz; ten_hz_source = $src; level = S $r.compliance_level }
    stylus = [ordered]@{ type = S $r.stylus_type; family = S $r.stylus_family; cantilever_material = S $r.cantilever_material; cantilever_class = S $r.cantilever_class }
    electrical = [ordered]@{ output_mv = N $r.output_voltage_mv; load_impedance_ohm = N $r.load_impedance_ohm; load_capacitance_pf = [ordered]@{ min = N $r.load_capacitance_min_pf; max = N $r.load_capacitance_max_pf } }
    frequency_response_hz = [ordered]@{ min = N $r.frequency_response_min_hz; max = N $r.frequency_response_max_hz }
    channel_separation_db = N $r.channel_separation_db
    sonic_profile = [ordered]@{ character_en = Clean $r.sonic_character_en; review_summary_en = Clean $r.review_summary_en; notes_en = Clean $r.notes_en }
    image_url = S $r.image_url
    tags = $tags
  }

  $missing = @()
  if ($null -eq $rec["mass_g"]) { $missing += "mass_g" }
  if ($null -eq $rec["compliance"]["dynamic_10hz_cu"]) { $missing += "compliance.dynamic_10hz_cu" }
  $rec["data_quality"] = [ordered]@{ match_ready = ($missing.Count -eq 0); missing = $missing; estimated = [ordered]@{ compliance_10hz = ($src -eq "estimated") } }

  return Compact $rec
}

function Convert-Tonearm($r) {
  $mfg = S $r.manufacturer
  $model = S $r.model
  $legacy = if ($null -ne $r.id) { $r.id } else { "$mfg-$model" }

  $nullPoints = @()
  if ($r.null_points_mm -is [System.Array]) { $nullPoints = @($r.null_points_mm | ForEach-Object { N $_ } | Where-Object { $null -ne $_ }) } elseif ($null -ne (N $r.null_points_mm)) { $nullPoints = @(N $r.null_points_mm) }

  $example = $null
  if ($null -ne $r.example_params_for_calculator) {
    $example = [ordered]@{ m_headshell_g = N $r.example_params_for_calculator.m_headshell; m_rear_assembly_g = N $r.example_params_for_calculator.m_rear_assembly; m_tube_percentage = N $r.example_params_for_calculator.m_tube_percentage; l2_mm = N $r.example_params_for_calculator.L2; l3_fixed_cw_mm = N $r.example_params_for_calculator.L3_fixed_cw }
  }

  $rec = [ordered]@{
    id = ("tonearm:{0}:{1}-{2}" -f $legacy, (Slug $mfg), (Slug $model))
    legacy_id = $r.id
    manufacturer = $mfg
    model = $model
    display_name = (@($mfg,$model) | Where-Object { $_ }) -join " "
    effective_mass_g = N $r.effective_mass_g
    geometry = [ordered]@{ effective_length_mm = N $r.effective_length_mm; pivot_to_spindle_mm = N $r.pivot_to_spindle_mm; overhang_mm = N $r.overhang_mm; offset_angle_deg = N $r.offset_angle_deg; alignment_geometry = S $r.alignment_geometry; null_points_mm = $nullPoints }
    construction = [ordered]@{ arm_shape = S $r.arm_shape; arm_material = S $r.arm_material; bearing_type = S $r.bearing_type; headshell_connector = S $r.headshell_connector; tracking_method = S $r.tracking_method; internal_wiring_material = S $r.internal_wiring_material; detachable_cable = B $r.detachable_cable; external_cable_capacitance_pf = N $r.external_cable_capacitance_pf }
    adjustment = [ordered]@{ vta = B $r.vta_adjustment; azimuth = B $r.azimuth_adjustment }
    compatibility = [ordered]@{ cartridge_weight_range_g = Range $r.cartridge_weight_range_g; tracking_force_range_g = Range $r.stylus_pressure_range_g }
    notes = Clean $r.notes
    calculator_example = $example
  }

  $missing = @()
  if ($null -eq $rec["effective_mass_g"]) { $missing += "effective_mass_g" }
  $rec["data_quality"] = [ordered]@{ match_ready = ($missing.Count -eq 0); missing = $missing }

  return Compact $rec
}

function Write-Json($rel, $data) {
  $file = Join-Path $OutDir $rel
  $parent = Split-Path -Parent $file
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  $json = ($data | ConvertTo-Json -Depth 50) + "`n"
  Set-Content -Path $file -Value $json -Encoding UTF8
  return [ordered]@{ path = ($file.Substring($RepoRoot.Length + 1)).Replace("\","/"); records = if ($data -is [array]) { $data.Count } else { $null }; size_bytes = [System.Text.Encoding]::UTF8.GetByteCount($json); sha256 = Hash-Text $json }
}

function Count-By($items, [scriptblock]$getter) {
  $h = [ordered]@{}
  foreach ($item in $items) {
    $k = & $getter $item
    if ($null -eq $k -or "$k" -eq "") { $k = "unknown" }
    if (-not $h.Contains($k)) { $h[$k] = 0 }
    $h[$k] += 1
  }
  return $h
}

Write-Host ""
Write-Host "=== Convert EAT2 audio data to EAT3 runtime data ==="
Write-Host "Input:  $LegacyDir"
Write-Host "Output: $OutDir"
Write-Host ""

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

$cDataset = Read-JsonRows -Path (Join-Path $LegacyDir "cartridges-data.json") -Name "cartridges-data.json" -ExpectedMinimumRecords 100
$tDataset = Read-JsonRows -Path (Join-Path $LegacyDir "tonearms-data.json") -Name "tonearms-data.json" -ExpectedMinimumRecords 50

$cRows = $cDataset.Rows
$tRows = $tDataset.Rows

$cartridges = @($cRows | ForEach-Object { Convert-Cartridge $_ })
$tonearms = @($tRows | ForEach-Object { Convert-Tonearm $_ })

$cIndex = @($cartridges | ForEach-Object {
  $comp = D $_ "compliance"; $q = D $_ "data_quality"
  Compact ([ordered]@{ id = D $_ "id"; display_name = D $_ "display_name"; manufacturer = D $_ "manufacturer"; model = D $_ "model"; type = D $_ "type"; mass_g = D $_ "mass_g"; compliance_10hz_cu = D $comp "dynamic_10hz_cu"; compliance_10hz_source = D $comp "ten_hz_source"; tracking_force_g = D $_ "tracking_force_g"; match_ready = D $q "match_ready"; tags = D $_ "tags" })
})

$tIndex = @($tonearms | ForEach-Object {
  $geo = D $_ "geometry"; $con = D $_ "construction"; $com = D $_ "compatibility"; $q = D $_ "data_quality"
  Compact ([ordered]@{ id = D $_ "id"; display_name = D $_ "display_name"; manufacturer = D $_ "manufacturer"; model = D $_ "model"; effective_mass_g = D $_ "effective_mass_g"; effective_length_mm = D $geo "effective_length_mm"; headshell_connector = D $con "headshell_connector"; cartridge_weight_range_g = D $com "cartridge_weight_range_g"; match_ready = D $q "match_ready" })
})

$outputs = @()
$outputs += Write-Json "cartridges.v3.json" $cartridges
$outputs += Write-Json "tonearms.v3.json" $tonearms
$outputs += Write-Json "runtime/cartridges.index.json" $cIndex
$outputs += Write-Json "runtime/tonearms.index.json" $tIndex

$summary = [ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  source = [ordered]@{ repo = "Engrove/Engrove-Audio-Tools-2.0"; ref = "main"; legacy_dir = ($LegacyDir.Substring($RepoRoot.Length + 1)).Replace("\","/") }
  note = "3.0 schemas are intentionally deferred until after converted data review."
  inspected_structure = [ordered]@{ cartridges_shape = $cDataset.Shape; tonearms_shape = $tDataset.Shape }
  cartridges = [ordered]@{ input_records = $cDataset.Count; output_records = $cartridges.Count; match_ready_records = @($cartridges | Where-Object { (D (D $_ "data_quality") "match_ready") -eq $true }).Count; by_type = Count-By $cartridges { param($x) D $x "type" }; compliance_10hz_source = Count-By $cartridges { param($x) D (D $x "compliance") "ten_hz_source" } }
  tonearms = [ordered]@{ input_records = $tDataset.Count; output_records = $tonearms.Count; match_ready_records = @($tonearms | Where-Object { (D (D $_ "data_quality") "match_ready") -eq $true }).Count; by_headshell_connector = Count-By $tonearms { param($x) D (D $x "construction") "headshell_connector" } }
  outputs = $outputs
}

$outputs += Write-Json "audio-data-v3-summary.json" $summary
$outputs += Write-Json "runtime/audio-index.manifest.json" ([ordered]@{ generated_at = (Get-Date).ToUniversalTime().ToString("o"); outputs = $outputs })

Write-Host "Conversion complete."
Write-Host "Cartridges: $($summary["cartridges"]["output_records"]) / match-ready $($summary["cartridges"]["match_ready_records"])"
Write-Host "Tonearms:   $($summary["tonearms"]["output_records"]) / match-ready $($summary["tonearms"]["match_ready_records"])"
Write-Host ""
foreach ($o in $outputs) { Write-Host "$($o["path"])  $($o["size_bytes"]) bytes  $($o["sha256"])" }
