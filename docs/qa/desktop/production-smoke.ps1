$ErrorActionPreference = 'Stop'
$output = Join-Path $env:GITHUB_WORKSPACE 'artifacts/production-desktop'
$scratch = Join-Path $env:RUNNER_TEMP 'haykasa-public-desktop'
$install = Join-Path $scratch 'installed'
$env:HAYKASA_DESKTOP_EVIDENCE = $output
$env:HAYKASA_DESKTOP_SCRATCH = $scratch
New-Item -ItemType Directory -Force -Path $output, $scratch | Out-Null
$env:APPDATA = Join-Path $scratch 'roaming'
$env:LOCALAPPDATA = Join-Path $scratch 'local'
New-Item -ItemType Directory -Force -Path $env:APPDATA, $env:LOCALAPPDATA | Out-Null
$started = Get-Date
$exit = 1
try {
    node docs/qa/desktop/production-smoke.cjs preflight
    if ($LASTEXITCODE -ne 0) { throw 'Public installer preflight failed.' }
    $installer = Join-Path $scratch 'HayKasa-public-setup.exe'
    $signature = Get-AuthenticodeSignature -FilePath $installer
    @{ status = "$($signature.Status)"; statusMessage = $signature.StatusMessage;
       signer = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null } } |
        ConvertTo-Json | Set-Content (Join-Path $output 'authenticode.json')
    $setup = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$install") -PassThru
    if (-not $setup.WaitForExit(120000)) { $setup.Kill(); throw 'Silent installation exceeded two minutes.' }
    if ($setup.ExitCode -ne 0) { throw "Installer exited with $($setup.ExitCode)." }
    $executable = Join-Path $install 'HayKasa.exe'
    if (-not (Test-Path $executable)) { throw 'The public installer did not create HayKasa.exe at the isolated installation path.' }
    $version = (Get-Item $executable).VersionInfo
    @{ productVersion = $version.ProductVersion; fileVersion = $version.FileVersion;
       executableSha256 = (Get-FileHash $executable -Algorithm SHA256).Hash.ToLowerInvariant() } |
        ConvertTo-Json | Set-Content (Join-Path $output 'installed-version.json')
    Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $executable } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    $profile = Join-Path $scratch 'fresh-profile'
    $app = Start-Process -FilePath $executable -ArgumentList @("--user-data-dir=$profile", '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9222') -PassThru
    Start-Sleep -Seconds 10
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bitmap.Size)
        $bitmap.Save((Join-Path $output 'windows-screen.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
    Get-Process | Where-Object { $_.Path -eq $executable } | Select-Object Id, ProcessName, MainWindowTitle, Responding, HasExited |
        ConvertTo-Json | Set-Content (Join-Path $output 'windows-processes.json')
    node docs/qa/desktop/production-smoke.cjs browser
    $exit = $LASTEXITCODE
} catch {
    @{ error = $_.Exception.Message; checkedAt = (Get-Date).ToUniversalTime().ToString('o') } |
        ConvertTo-Json | Set-Content (Join-Path $output 'windows-error.json')
} finally {
    Get-WinEvent -FilterHashtable @{ LogName = 'Application'; StartTime = $started; Level = @(1,2) } -ErrorAction SilentlyContinue |
        Where-Object { $_.Message -match 'HayKasa|Electron' } | Select-Object TimeCreated, Id, ProviderName, Message |
        ConvertTo-Json -Depth 5 | Set-Content (Join-Path $output 'windows-crashes.json')
    Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($install, [StringComparison]::OrdinalIgnoreCase) } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
exit $exit
