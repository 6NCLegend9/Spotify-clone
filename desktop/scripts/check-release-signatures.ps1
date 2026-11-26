$ErrorActionPreference = 'Stop'
$workflow = Get-Content (Join-Path $PSScriptRoot '../../.github/workflows/desktop-release.yml') -Raw
$match = [regex]::Match($workflow, '(?s)- name: Verify Authenticode signature\s+shell: pwsh\s+run: \|\r?\n(.*?)\r?\n      - name:')
if (-not $match.Success) { throw 'Could not locate the actual release signature gate.' }
$gate = [scriptblock]::Create(($match.Groups[1].Value -replace '(?m)^          ', ''))

# Execute the workflow gate with controlled OS-signature results. No binary
# signing, installer execution or Windows trust-store modifications occur.
function Get-ChildItem { [pscustomobject]@{ FullName = 'fixture-installer.exe' } }
function Test-Path { param($LiteralPath) return $script:applicationExists }
function Get-AuthenticodeSignature {
    param($Path, $LiteralPath)
    if ($LiteralPath) { return $script:applicationSignature }
    return $script:installerSignature
}
function Signature($status, $subject) {
    return [pscustomobject]@{ Status = $status; SignerCertificate = [pscustomobject]@{ Subject = $subject } }
}
$cases = @(
    @{ Name='both trusted, same publisher'; Installer='Valid'; Application='Valid'; Subject='CN=HayKasa'; Exists=$true; Pass=$true },
    @{ Name='unsigned runtime rejected'; Installer='Valid'; Application='NotSigned'; Subject='CN=HayKasa'; Exists=$true; Pass=$false },
    @{ Name='unsigned installer rejected'; Installer='NotSigned'; Application='Valid'; Subject='CN=HayKasa'; Exists=$true; Pass=$false },
    @{ Name='different runtime publisher rejected'; Installer='Valid'; Application='Valid'; Subject='CN=Other'; Exists=$true; Pass=$false },
    @{ Name='missing runtime rejected'; Installer='Valid'; Application='Valid'; Subject='CN=HayKasa'; Exists=$false; Pass=$false },
    @{ Name='missing runtime identity rejected'; Installer='Valid'; Application='Valid'; Subject=''; Exists=$true; Pass=$false }
)
foreach ($case in $cases) {
    $script:applicationExists = $case.Exists
    $script:installerSignature = Signature $case.Installer 'CN=HayKasa'
    $script:applicationSignature = Signature $case.Application $case.Subject
    $passed = $true
    try { & $gate | Out-Null } catch { $passed = $false }
    if ($passed -ne $case.Pass) { throw "Signature gate regression: $($case.Name)" }
    Write-Output "PASS: $($case.Name)"
}
