function Read-InstalledRuntimeEvents([string]$Log, [DateTimeOffset]$Started) {
    Get-Content -LiteralPath $Log | ForEach-Object {
        try {
            $entry = $_ | ConvertFrom-Json
            # PowerShell 7.5 converts ISO JSON dates into DateTime. Parse() would
            # stringify that value, losing milliseconds and its UTC kind.
            if ($null -ne $entry.at -and [DateTimeOffset]$entry.at -ge $Started) { $entry }
        } catch { # An incomplete concurrent log append is retried by the caller.
        }
    }
}
