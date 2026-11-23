$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/installed-runtime-events.ps1"
$fixture = [System.IO.Path]::GetTempFileName()
try {
    @'
{"at":"2026-11-23T09:01:05.110Z","event":"old_start"}
{"at":"2026-11-23T09:01:05.130Z","event":"desktop_start"}
{"at":"2026-11-23T03:01:05.150-06:00","event":"desktop_ready"}
{"at":"2026-11-23T09:01:05.160Z"
'@ | Set-Content -LiteralPath $fixture -Encoding utf8
    $events = @(Read-InstalledRuntimeEvents -Log $fixture -Started ([DateTimeOffset]'2026-11-23T09:01:05.120Z'))
    if ($events.Count -ne 2 -or $events[0].event -ne 'desktop_start' -or $events[1].event -ne 'desktop_ready') {
        throw 'Startup evidence must preserve subsecond precision and UTC offsets, exclude old events, and tolerate partial writes.'
    }
    Write-Output 'PASS: installed runtime timestamps retain precision and timezone.'
} finally {
    Remove-Item -LiteralPath $fixture -Force
}
