<#
Engrove Audio Tools 3.0 - verified EAT2 -> EAT3 data build v5

Run full:
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\Build-AudioDataV3.ps1

Use existing downloaded data:
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\Build-AudioDataV3.ps1 -SkipFetch
#>

[CmdletBinding()]
param([switch]$SkipFetch)

$ErrorActionPreference = "Stop"

$RepoRoot = if (Test-Path (Join-Path (Get-Location).Path ".git")) { (Get-Location).Path } else { (Resolve-Path (Join-Path $PSScriptRoot "..")).Path }

Write-Host ""
Write-Host "=== Engrove Audio Tools 3.0 audio data build v5 ==="
Write-Host "Repo root: $RepoRoot"
Write-Host ""

if (-not $SkipFetch) {
  & (Join-Path $PSScriptRoot "Fetch-Eat2Data.ps1") -RepoRoot $RepoRoot
} else {
  Write-Host "Skipping fetch because -SkipFetch was supplied."
}

& (Join-Path $PSScriptRoot "Inspect-Eat2DataStructure.ps1") -RepoRoot $RepoRoot
& (Join-Path $PSScriptRoot "Convert-Eat2ToEat3Data.ps1") -RepoRoot $RepoRoot

Write-Host ""
Write-Host "Done."
