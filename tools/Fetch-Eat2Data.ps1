<#
Engrove Audio Tools 3.0
Fetch all Engrove Audio Tools 2.0 public data and schema files from GitHub.

Run from repo root:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\Fetch-Eat2Data.ps1
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
  param(
    [Parameter(Mandatory=$true)][string]$Url,
    [Parameter(Mandatory=$true)][string]$OutFile
  )

  $parent = Split-Path -Parent $OutFile
  if (-not (Test-Path $parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }

  Write-Host "Fetching $Url"
  Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
}

Write-Host ""
Write-Host "=== Fetch Engrove Audio Tools 2.0 data ==="
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
