$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$exe=Join-Path $root 'Codex-Usage-AutoHelper.exe'
if(!(Test-Path -LiteralPath $exe)){throw 'Build or extract the portable package first.'}
$directory=Join-Path $root '管理工具'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$shell=New-Object -ComObject WScript.Shell
foreach($entry in @(@('自动启动助手.lnk','--run'),@('启用自动启动助手.lnk','--enable'),@('停用自动启动助手.lnk','--disable'),@('退出自动启动助手.lnk','--stop'),@('自动助手状态.lnk','--status'))){
    $shortcut=$shell.CreateShortcut((Join-Path $directory $entry[0]))
    $shortcut.TargetPath=$exe
    $shortcut.Arguments=$entry[1]
    $shortcut.WorkingDirectory=$root
    $shortcut.IconLocation=$exe+',0'
    $shortcut.Description='Experimental Windows usage-card assistant'
    $shortcut.Save()
}
