<#
Engrove Audio Tools 3.0
Fetch Engrove Audio Tools 2.0 public data + schemas from GitHub.

Run from repo root:
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\Fetch-Eat2Data.ps1
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
$TargetRoot = Join-Path $RepoRoot "src\data\legacy\engrove-2.0\public\data"
$SchemaRoot = Join-Path $TargetRoot "schemas"
$BaseUrl = "https://raw.githubusercontent.com/Engrove/Engrove-Audio-Tools-2.0/main/public/data"

$DataFiles = @(
  "ai_audit_instruction.txt",
  "cartridges-classifications.json",
  "cartridges-confidence-levels.json",
  "cartridges-data.json",
  "cartridges-estimation-rules.json",
  "cartridges-static-estimation-rules.json",
  "data-aliases.json",
  "data-filters-map.json",
  "data-translation-map.json",
  "pickups-confidence-levels.json",
  "pickups-estimation-rules.json",
  "pickups-static-estimation-rules.json",
  "tonearms-classifications.json",
  "tonearms-data.json"
)

$SchemaFiles = @(
  "cartridges-classifications.schema.json",
  "cartridges-confidence-levels.schema.json",
  "cartridges-data.schema.json",
  "cartridges-estimation-rules.schema.json",
  "cartridges-static-estimation-rules.schema.json",
  "data-aliases.schema.json",
  "data-filters-map.schema.json",
  "data-translation-map.schema.json",
  "heuristics_maintenance.schema.json",
  "pickups-confidence-levels.schema.json",
  "pickups-estimation-rules.schema.json",
  "pickups-static-estimation-rules.schema.json",
  "tonearms-classifications.schema.json",
  "tonearms-data.schema.json"
)

function Save-RemoteFile {
  param([string]$Url, [string]$OutFile)

  $parent = Split-Path -Parent $OutFile
  if (-not (Test-Path $parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }

  Write-Host "Fetching $Url"
  Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
}

Write-Host ""
Write-Host "=== Fetch EAT2 data ==="
Write-Host "Repo root: $RepoRoot"
Write-Host "Target:    $TargetRoot"
Write-Host ""

New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null
New-Item -ItemType Directory -Force -Path $SchemaRoot | Out-Null

foreach ($file in $DataFiles) {
  Save-RemoteFile -Url "$BaseUrl/$file" -OutFile (Join-Path $TargetRoot $file)
}

foreach ($file in $SchemaFiles) {
  Save-RemoteFile -Url "$BaseUrl/schemas/$file" -OutFile (Join-Path $SchemaRoot $file)
}

Write-Host ""
Write-Host "Download complete."
Write-Host "Data files:   $($DataFiles.Count)"
Write-Host "Schema files: $($SchemaFiles.Count)"
