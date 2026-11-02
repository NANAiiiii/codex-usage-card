param([string]$OutputDirectory=(Join-Path $PSScriptRoot 'artifacts\portable'))
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(!(Test-Path -LiteralPath $compiler)){throw '.NET Framework 4 compiler not found'}
if((Test-Path -LiteralPath $OutputDirectory) -and @(Get-ChildItem -LiteralPath $OutputDirectory -Force).Count){throw 'Output directory must be empty; choose a new output directory.'}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$output=(Resolve-Path -LiteralPath $OutputDirectory).Path
New-Item -ItemType Directory -Path (Join-Path $output 'lib') | Out-Null
# Only build a portable folder. Never change Startup or the Start menu here.
& $compiler /nologo /target:winexe /optimize+ "/out:$(Join-Path $output 'lib\UsageAgent.exe')" /reference:System.Windows.Forms.dll (Join-Path $root 'src\UsageAgentHost.cs')
if($LASTEXITCODE -ne 0){throw 'Internal agent build failed'}
& $compiler /nologo /target:winexe /optimize+ "/out:$(Join-Path $output 'Codex-Usage-AutoHelper.exe')" /reference:System.Windows.Forms.dll /reference:System.Core.dll /reference:Microsoft.CSharp.dll (Join-Path $root 'src\AutoAssistant.cs')
if($LASTEXITCODE -ne 0){throw 'Auto helper build failed'}
foreach($name in @('windows.cjs','LICENSE','README.md','create-shortcuts.ps1')){Copy-Item -LiteralPath (Join-Path $root $name) -Destination $output}
foreach($name in @('agent.cjs','activate-client.ps1')){Copy-Item -LiteralPath (Join-Path $root "lib\$name") -Destination (Join-Path $output 'lib')}
Copy-Item -LiteralPath (Join-Path $root 'docs') -Destination $output -Recurse
Write-Output $output
