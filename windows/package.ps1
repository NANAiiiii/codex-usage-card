param([string]$PortableDirectory=(Join-Path $PSScriptRoot 'artifacts\portable'))
$ErrorActionPreference='Stop'
$output=Join-Path $PSScriptRoot 'artifacts\CodexUsageCard-Windows-0.1.3-preview.1.zip'
# Reject unexpected files under the two recursively packaged folders.
foreach($folder in @('lib','docs')){
    $expected=if($folder -eq 'lib'){@('activate-client.ps1','agent.cjs','UsageAgent.exe')}else{@('AUTO-ASSISTANT.md')}
    $items=@(Get-ChildItem -LiteralPath (Join-Path $PortableDirectory $folder) -Force -Recurse)
    if((Get-Item -LiteralPath (Join-Path $PortableDirectory $folder)).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Package folder is a reparse point.'}
    if($items | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}){throw 'Package input contains a reparse point.'}
    if($items | Where-Object {$_.PSIsContainer}){throw "Unexpected nested directory in $folder"}
    if(Compare-Object ($expected|Sort-Object) (@($items|Where-Object {!$_.PSIsContainer}|ForEach-Object {$_.Name})|Sort-Object)){throw "Unexpected files in $folder"}
}
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
