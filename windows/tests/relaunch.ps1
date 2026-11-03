param([Parameter(Mandatory=$true)][string]$Executable)
$ErrorActionPreference='Stop'
# Fake time/process probes: never close, launch or inspect a real client.
$assembly=[Reflection.Assembly]::LoadFile((Resolve-Path -LiteralPath $Executable).Path)
$method=$assembly.GetType('AutoAssistant').GetMethod('WaitForRelaunch',[Reflection.BindingFlags]'NonPublic,Static')
$script:elapsed=0
$script:probes=0
$running=[Func[bool]]{ $script:probes++; return $false }
$wait=[Func[int,bool]]{param($ms) $script:elapsed+=$ms; return $false}
$result=$method.Invoke($null,@($running,$wait))
if($null -ne $result -or $script:elapsed -ne 3000 -or $script:probes -ne 12){throw 'Must wait a full cleanup interval before relaunch'}
$script:elapsed=0
$running=[Func[bool]]{ return $script:elapsed -ge 1000 }
$result=$method.Invoke($null,@($running,$wait))
if($result -notlike 'another-instance-started*' -or $script:elapsed -ne 1000){throw 'Manual launch must cancel the handoff, not cause a duplicate'}
$script:elapsed=0
$running=[Func[bool]]{throw 'Cancellation must be checked first'}
$stop=[Func[int,bool]]{param($ms) $script:elapsed+=$ms; return $true}
$result=$method.Invoke($null,@($running,$stop))
if($result -notlike 'handoff-canceled-after-quit*' -or $script:elapsed -ne 250){throw 'Stop signal must cancel promptly'}
Write-Output 'PASS: 3 exit-cleanup timing and cancellation cases; no client operated.'
