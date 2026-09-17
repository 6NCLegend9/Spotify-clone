$ErrorActionPreference = "Stop"

$node = (Get-Command node -ErrorAction Stop).Source
$bridge = (Resolve-Path (Join-Path $PSScriptRoot "discord-bridge.mjs")).Path
$startup = [Environment]::GetFolderPath("Startup")
$launcher = Join-Path $startup "HeyKasa Discord Bridge.cmd"

$lines = @(
  "@echo off",
  "start \"\" /min \"$node\" \"$bridge\""
)
Set-Content -Path $launcher -Value $lines -Encoding ASCII

Write-Host "Installed HeyKasa Discord Bridge startup launcher:"
Write-Host $launcher
Write-Host "It will start automatically the next time you sign in to Windows."
