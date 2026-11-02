param([Parameter(Mandatory=$true)][string]$Executable)
$ErrorActionPreference='Stop'
# Test the pure policy method, without running the watcher or operating Codex.
$assembly=[Reflection.Assembly]::LoadFile((Resolve-Path -LiteralPath $Executable).Path)
$method=$assembly.GetType('AutoAssistant').GetMethod('Decision',[Reflection.BindingFlags]'NonPublic,Static')
$cases=@(
    @(9000,10000,$true,1,$false,$false,'handoff'),
    @(16585,17000,$true,1,$false,$false,'handoff'),
    @(30000,31000,$true,1,$false,$false,'handoff'),
    @(30001,31000,$true,1,$false,$false,'skip-old-session'),
    @(16585,203,$true,1,$false,$false,'handoff'),
    @(3502,1937,$true,1,$false,$false,'handoff'),
    @(16585,17000,$false,1,$false,$false,'skip-background'),
    @(16585,17000,$true,2,$false,$false,'skip-multiple-or-no-windows'),
    @(16585,17000,$true,1,$true,$false,'skip-cooldown')
)
foreach($case in $cases){
    # Historical idle values remain as regression data; the new policy has no input argument.
    $actual=$method.Invoke($null,@([double]$case[0],[bool]$case[2],[int]$case[3],[bool]$case[4],[bool]$case[5]))
    if($actual -ne $case[6]){throw "age=$($case[0]), idle=$($case[1]): expected $($case[6]), got $actual"}
}
Write-Output "PASS: $($cases.Count) cold-start and safety policy cases; no client operated."
