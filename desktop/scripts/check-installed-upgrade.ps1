param(
    [Parameter(Mandatory = $true)][string]$BeforeInstaller,
    [Parameter(Mandatory = $true)][string]$AfterInstaller,
    [switch]$HistoricalBaseline
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/installed-runtime-events.ps1"
# This test installs real NSIS packages and changes installer registry entries.
# It must never run on a developer's machine or a persistent self-hosted runner.
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or -not $env:RUNNER_TEMP) {
    throw 'Installed upgrade qualification requires a disposable GitHub-hosted Windows runner.'
}
if ($HistoricalBaseline -and (Get-FileHash -LiteralPath $BeforeInstaller -Algorithm SHA256).Hash -ne '5f163cdf097b30ecc5a83e48602ed301890f8df66f04751dae034f90e7c9f36b') {
    throw 'Historical baseline must match the inspected published 1.0.0 installer.'
}
$output = Join-Path $env:GITHUB_WORKSPACE 'artifacts/installed-upgrade'
$scratch = Join-Path $env:RUNNER_TEMP ('haykasa-upgrade-' + [guid]::NewGuid().ToString('N'))
$install = Join-Path $scratch 'Installed HayKasa'
$profile = Join-Path $scratch 'Test Profile'
$executable = Join-Path $install 'HayKasa.exe'
New-Item -ItemType Directory -Force -Path $output, $profile | Out-Null
$report = [ordered]@{
    scope = $(if ($HistoricalBaseline) { 'Published 1.0.0 to unsigned internal NSIS replacement on disposable Windows runner' } else { 'Unsigned internal NSIS old-to-new replacement on disposable Windows runner' })
    signedAutoUpdateVerified = $false
    audiblePlaybackVerified = $false
    passed = $false
}

function Stop-TestApp {
    # Exact owned executable match; never stop another installation by name.
    Get-CimInstance Win32_Process -Filter "Name = 'HayKasa.exe'" |
        Where-Object { $_.ExecutablePath -eq $executable } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Install-TestBuild([string]$installer) {
    $resolved = (Resolve-Path -LiteralPath $installer).Path
    Stop-TestApp
    $setup = Start-Process -FilePath $resolved -ArgumentList @('/S', "/D=$install") -WindowStyle Hidden -PassThru
    if (-not $setup.WaitForExit(120000)) { $setup.Kill(); throw 'Silent installation exceeded two minutes.' }
    if ($setup.ExitCode -ne 0) { throw "Installer exited with $($setup.ExitCode)." }
    if (-not (Test-Path -LiteralPath $executable)) { throw 'Installer did not write the expected isolated executable.' }
    Stop-TestApp
}

function Inspect-InstalledBuild([string]$directory = $install) {
    $inspect = @'
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const requireDesktop = createRequire(path.resolve('desktop/package.json'));
const asar = requireDesktop('@electron/asar');
const archive = path.join(process.argv[1], 'resources', 'app.asar');
const metadata = JSON.parse(asar.extractFile(archive, 'package.json'));
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const entries = new Set(asar.listPackage(archive).map(file => file.replaceAll('\\', '/').replace(/^\//, '')));
const files = Object.fromEntries(['src/main.mjs', 'src/preload.cjs', 'src/localPages.mjs', 'src/miniPlayer.html'].map(file => [file, entries.has(file) ? digest(asar.extractFile(archive, file)) : null]));
if (!files['src/main.mjs'] || !files['src/preload.cjs']) throw new Error('Missing required runtime entry points');
console.log(JSON.stringify({version: metadata.version, channel: metadata.heykasaReleaseChannel || 'stable', archiveSha256: digest(fs.readFileSync(archive)), files}));
'@
    $json = & node -e $inspect $directory
    if ($LASTEXITCODE -ne 0) { throw 'Installed archive inspection failed.' }
    return ($json | ConvertFrom-Json)
}

function Start-And-Verify([string]$version) {
    $started = [DateTimeOffset]::UtcNow
    $app = Start-Process -FilePath $executable -ArgumentList ('"--user-data-dir={0}"' -f $profile) -WindowStyle Hidden -PassThru
    $log = Join-Path $profile 'logs/desktop.log'
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(90)
    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        if ($app.HasExited) { throw "Installed executable exited before readiness ($($app.ExitCode))." }
        if (Test-Path -LiteralPath $log) {
            $events = @(Read-InstalledRuntimeEvents -Log $log -Started $started)
            $startup = @($events | Where-Object { $_.event -eq 'desktop_start' })
            $ready = @($events | Where-Object { $_.event -eq 'desktop_ready' })
            if ($startup.Count -gt 0 -and $ready.Count -gt 0) {
                if ($startup[-1].version -ne $version -or $startup[-1].packaged -ne $true) { throw 'Installed runtime version differs from installed archive.' }
                return @{ version = $startup[-1].version; packaged = $true; ready = $true }
            }
        }
        Start-Sleep -Milliseconds 500
    }
    throw 'Installed app did not reach native readiness within 90 seconds.'
}

try {
    $identity = [guid]::NewGuid().ToString()
    @{ version = 2; installationId = $identity; autoUpdate = $false; closeToTray = $false; updateChannel = 'internal' } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $profile 'desktop-settings.json') -Encoding utf8
    $marker = Join-Path $profile 'retained-data.txt'
    Set-Content -LiteralPath $marker -Value 'Isolated upgrade retention fixture' -Encoding utf8
    $markerHash = (Get-FileHash -LiteralPath $marker -Algorithm SHA256).Hash

    Install-TestBuild $BeforeInstaller
    $before = Inspect-InstalledBuild
    if ($HistoricalBaseline) {
        if ($before.version -ne '1.0.0' -or $before.channel -ne 'stable') { throw 'Unexpected historical baseline metadata.' }
    } elseif ($before.channel -ne 'internal') { throw 'Baseline installer must be internal.' }
    $report.before = $before
    $report.beforeRuntime = Start-And-Verify $before.version
    Stop-TestApp

    Install-TestBuild $AfterInstaller
    $after = Inspect-InstalledBuild
    $expected = Inspect-InstalledBuild (Join-Path $env:GITHUB_WORKSPACE 'desktop/dist/win-unpacked')
    if ($after.archiveSha256 -ne $expected.archiveSha256) { throw 'Installed files do not match the newly built application archive.' }
    if ($after.channel -ne 'internal') { throw 'Replacement installer must be internal.' }
    $compare = "import('./desktop/src/version.mjs').then(m => { if (m.compareReleaseVersions(process.argv[1], process.argv[2]) !== 1) process.exitCode = 1; });"
    & node -e $compare $after.version $before.version
    if ($LASTEXITCODE -ne 0) { throw 'Replacement version must be strictly newer.' }
    if ($after.archiveSha256 -eq $before.archiveSha256) { throw 'Installer did not replace the application archive.' }
    $report.after = $after
    $shortcutShell = New-Object -ComObject WScript.Shell
    foreach ($folder in @('DesktopDirectory', 'Programs')) {
        $link = Join-Path ([Environment]::GetFolderPath($folder)) 'HayKasa.lnk'
        if (-not (Test-Path -LiteralPath $link -PathType Leaf)) { throw "Missing installed shortcut in $folder." }
        if ($shortcutShell.CreateShortcut($link).TargetPath -ne $executable) { throw "Shortcut in $folder points to the wrong executable." }
    }
    $report.shortcutTargetsVerified = $true
    $report.afterRuntime = Start-And-Verify $after.version
    Stop-TestApp

    $settings = Get-Content -LiteralPath (Join-Path $profile 'desktop-settings.json') -Raw | ConvertFrom-Json
    if ($settings.installationId -ne $identity -or $settings.autoUpdate -ne $false -or $settings.closeToTray -ne $false) {
        throw 'Upgrade failed to preserve desktop identity/preferences.'
    }
    if ((Get-FileHash -LiteralPath $marker -Algorithm SHA256).Hash -ne $markerHash) { throw 'Upgrade changed existing profile data.' }
    $report.profilePreserved = $true
    $report.passed = $true
} catch {
    $report.error = $_.Exception.Message
    throw
} finally {
    Stop-TestApp
    # Keep bounded, application-redacted diagnostics even when readiness fails.
    $nativeLog = Join-Path $profile 'logs/desktop.log'
    if (Test-Path -LiteralPath $nativeLog) {
        Get-Content -LiteralPath $nativeLog -Tail 100 | Set-Content -LiteralPath (Join-Path $output 'native-startup.jsonl') -Encoding utf8
    }
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $output 'results.json') -Encoding utf8
}
