param([Parameter(Mandatory = $true)][string[]]$ExecutablePaths)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconPath = (Resolve-Path (Join-Path $PSScriptRoot '../build/icon.ico')).Path
$output = Join-Path $PSScriptRoot '../dist/icon-verification'
New-Item -ItemType Directory -Path $output -Force | Out-Null

function Get-PixelHash([System.Drawing.Bitmap]$bitmap) {
    $pixels = [System.Text.StringBuilder]::new()
    for ($y = 0; $y -lt $bitmap.Height; $y++) {
        for ($x = 0; $x -lt $bitmap.Width; $x++) {
            [void]$pixels.Append($bitmap.GetPixel($x, $y).ToArgb().ToString('X8'))
        }
    }
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return [Convert]::ToHexString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($pixels.ToString()))) }
    finally { $sha.Dispose() }
}

$results = foreach ($file in $ExecutablePaths) {
    $resolved = (Resolve-Path $file).Path
    $actual = [System.Drawing.Icon]::ExtractAssociatedIcon($resolved)
    if (-not $actual) { throw "No executable icon: $resolved" }
    $expected = [System.Drawing.Icon]::new($iconPath, $actual.Size)
    $actualBitmap = $null
    $expectedBitmap = $null
    try {
        $actualBitmap = $actual.ToBitmap()
        $expectedBitmap = $expected.ToBitmap()
        $actualHash = Get-PixelHash $actualBitmap
        $expectedHash = Get-PixelHash $expectedBitmap
        if ($actualHash -ne $expectedHash) { throw "Executable does not contain the HayKasa icon: $resolved" }
        $name = [IO.Path]::GetFileNameWithoutExtension($resolved)
        $actualBitmap.Save((Join-Path $output "$name.png"), [Drawing.Imaging.ImageFormat]::Png)
        [PSCustomObject]@{ executable = [IO.Path]::GetFileName($resolved); width = $actual.Width; height = $actual.Height; pixelSha256 = $actualHash; matchesHayKasaIcon = $true }
        Write-Host "PASS: HayKasa branding embedded in $name"
    } finally {
        if ($actualBitmap) { $actualBitmap.Dispose() }
        if ($expectedBitmap) { $expectedBitmap.Dispose() }
        $actual.Dispose()
        $expected.Dispose()
    }
}
$results | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $output 'results.json')
