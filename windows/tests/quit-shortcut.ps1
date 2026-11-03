param([Parameter(Mandatory=$true)][string]$Executable)
$ErrorActionPreference='Stop'
# Reflection tests build input records only; NEVER call SendInput or operate the actual client.
$assembly=[Reflection.Assembly]::LoadFile((Resolve-Path -LiteralPath $Executable).Path)
$type=$assembly.GetType('AutoAssistant')
$flags=[Reflection.BindingFlags]'NonPublic,Static'
$guard=$type.GetMethod('CanSendQuitShortcut',$flags)
foreach($case in @(@($true,$false,$true),@($false,$false,$false),@($true,$true,$false),@($false,$true,$false))){
    if($guard.Invoke($null,@($case[0],$case[1])) -ne $case[2]){throw 'Shortcut foreground/held-key guard failed'}
}
$inputs=$type.GetMethod('QuitInputs',$flags).Invoke($null,@())
$keys=@(0x11,0x51,0x51,0x11)
$states=@(0,0,2,2)
for($i=0;$i -lt 4;$i++){
    if($inputs[$i].type -ne 1 -or $inputs[$i].data.keyboard.key -ne $keys[$i] -or $inputs[$i].data.keyboard.flags -ne $states[$i]){throw 'Quit must be one ordered Ctrl+Q batch including key releases'}
}
$size=[Runtime.InteropServices.Marshal]::SizeOf($inputs[0])
if($size -ne $(if([IntPtr]::Size -eq 8){40}else{28})){throw "Wrong native INPUT size: $size"}
$release=$type.GetMethod('ReleaseQuitInputs',$flags)
foreach($count in 0..4){
    $cleanup=$release.Invoke($null,@([uint32]$count))
    $expected=@(0,1,2,1,0)[$count]
    if($cleanup.Length -ne $expected){throw "Wrong cleanup for partial input count $count"}
    foreach($item in $cleanup){if($item.data.keyboard.flags -ne 2){throw 'Cleanup must only release keys, never send another quit command'}}
}
Write-Output 'PASS: shortcut guards, native layout, key order and all 5 partial-batch cleanup cases; no input sent.'
