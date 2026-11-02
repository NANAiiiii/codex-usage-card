param([string]$PortableDirectory=(Join-Path $PSScriptRoot 'artifacts\portable'))
$ErrorActionPreference='Stop'
$output=Join-Path $PSScriptRoot 'artifacts\CodexUsageCard-Windows-preview.zip'
# Explicit allowlist excludes runtime data, shortcuts and personal configuration.
$files=@('Codex-Usage-AutoHelper.exe','windows.cjs','LICENSE','README.md','create-shortcuts.ps1','lib','docs') | ForEach-Object {
    $item=Join-Path $PortableDirectory $_
    if(!(Test-Path -LiteralPath $item)){throw "Missing package input: $_"}
    $item
}
if(Test-Path -LiteralPath $output){throw 'ZIP already exists; use a fresh artifacts directory.'}
Compress-Archive -LiteralPath $files -DestinationPath $output
$hash=(Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
[System.IO.File]::WriteAllText((Join-Path (Split-Path $output) 'SHA256SUMS.txt'),"$hash  $(Split-Path $output -Leaf)`n",[System.Text.Encoding]::ASCII)
Write-Output $output
