$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$target = Join-Path $repoRoot "public\images"
New-Item -ItemType Directory -Force -Path $target | Out-Null

Invoke-WebRequest `
  -Uri "https://raw.githubusercontent.com/Engrove/Engrove-Audio-Tools-2.0/main/public/images/bg_black.webp" `
  -OutFile (Join-Path $target "bg_black.webp")

Invoke-WebRequest `
  -Uri "https://raw.githubusercontent.com/Engrove/Engrove-Audio-Tools-2.0/main/public/images/bg_white.webp" `
  -OutFile (Join-Path $target "bg_white.webp")

Write-Host "Downloaded bg_black.webp and bg_white.webp to public/images"
