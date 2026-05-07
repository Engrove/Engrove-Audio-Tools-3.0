<#
Engrove Audio Tools 3.0
PowerShell-only EAT2 -> EAT3 data build, v3.

Fixes:
- Does not use $PSScriptRoot in param default values.
- Cleans previously delivered .cmd/.bat/Node-based converter leftovers.
- Runs fetch + conversion using PowerShell only.
- v3 scripts are saved UTF-8 with BOM for Windows PowerShell.
- Convert script avoids literal en dash characters in regex source.

Run from repo root:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\Build-AudioDataV3.ps1

If data download already succeeded:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\Build-AudioDataV3.ps1 -SkipFetch
#>

[CmdletBinding()]
param(
  [string]$RepoRoot,
  [switch]$SkipCleanup,
  [switch]$SkipFetch
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
$scriptDir = Get-EngroveScriptDirectory

function Remove-LegacyConverterFiles {
  param([string]$Root)

  $relativePaths = @(
    "tools\fetch-eat2-data.cmd",
    "tools\build-audio-data-v3.cmd",
    "tools\convert-eat2-to-eat3-data.mjs",
    "README-EAT2-DATA-CONVERTER.md",
    "docs\data\EAT2_TO_EAT3_DATA_CONVERSION.md"
  )

  Write-Host ""
  Write-Host "=== Cleanup old cmd/bat/Node converter files ==="

  foreach ($relative in $relativePaths) {
    $full = Join-Path $Root $relative
    if (Test-Path $full) {
      Remove-Item -Path $full -Force
      Write-Host "Removed $relative"
    } else {
      Write-Host "Not present $relative"
    }
  }
}

Write-Host ""
Write-Host "=== Engrove Audio Tools 3.0 audio data build ==="
Write-Host "Repo root:  $RepoRoot"
Write-Host "Script dir: $scriptDir"
Write-Host ""

if (-not $SkipCleanup) {
  Remove-LegacyConverterFiles -Root $RepoRoot
}

if (-not $SkipFetch) {
  & (Join-Path $scriptDir "Fetch-Eat2Data.ps1") -RepoRoot $RepoRoot
} else {
  Write-Host "Skipping fetch because -SkipFetch was supplied."
}

& (Join-Path $scriptDir "Convert-Eat2ToEat3Data.ps1") -RepoRoot $RepoRoot

Write-Host ""
Write-Host "Done."
