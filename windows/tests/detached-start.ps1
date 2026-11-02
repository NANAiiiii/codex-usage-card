param([Parameter(Mandatory=$true)][string]$Executable)
$ErrorActionPreference='Stop'
$exe=(Resolve-Path -LiteralPath $Executable).Path
if(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -eq $exe}){throw 'Use a fresh, non-running test build.'}
# Simulate a launcher whose entire child process group is destroyed on exit.
# Only the test launcher and its descendants are assigned, never the current Codex.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LifetimeJob {
    [StructLayout(LayoutKind.Sequential)] struct Basic {
        public long a,b; public uint flags; public UIntPtr min,max;
        public uint count; public UIntPtr affinity; public uint priority,scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct Io { public ulong a,b,c,d,e,f; }
    [StructLayout(LayoutKind.Sequential)] struct Extended {
        public Basic basic; public Io io; public UIntPtr a,b,c,d;
    }
    [DllImport("kernel32.dll")] static extern IntPtr CreateJobObject(IntPtr security,string name);
    [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job,int kind,ref Extended value,uint size);
    [DllImport("kernel32.dll")] public static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
    [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
    public static IntPtr Create() {
        IntPtr job=CreateJobObject(IntPtr.Zero,null);
        var value=new Extended(); value.basic.flags=0x2000;
        if(job==IntPtr.Zero || !SetInformationJobObject(job,9,ref value,(uint)Marshal.SizeOf(value)))
            throw new Exception("Cannot create lifecycle test job");
        return job;
    }
}
'@
$job=[LifetimeJob]::Create()
try {
    $escaped=$exe.Replace("'","''")
    $script="Start-Sleep -Seconds 2; `$p=Start-Process -FilePath '$escaped' -ArgumentList '--run' -PassThru -WindowStyle Hidden; `$p.WaitForExit(); exit `$p.ExitCode"
    $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
    $parent=Start-Process -FilePath "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',$encoded) -PassThru -WindowStyle Hidden
    if(![LifetimeJob]::AssignProcessToJobObject($job,$parent.Handle)){throw 'Cannot assign test launcher'}
    if(!$parent.WaitForExit(15000) -or $parent.ExitCode -ne 0){throw 'Test launcher failed'}
} finally {[void][LifetimeJob]::CloseHandle($job)}
Start-Sleep -Seconds 6
$watchers=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -eq $exe -and $_.CommandLine -match '--watch'})
if($watchers.Count -ne 1){throw 'Watcher did not survive launcher job destruction'}
$parent=Get-Process -Id $watchers[0].ParentProcessId
if($parent.ProcessName -ne 'explorer'){throw 'Watcher is not owned by Explorer'}
$status=Get-Content -LiteralPath (Join-Path (Split-Path $exe) 'runtime\auto-status.txt') -Raw
if($status -notmatch 'watching; existing sessions excluded'){throw 'Watcher preflight failed'}
Write-Output 'PASS: watcher survived launcher-group destruction and is owned by Explorer; current Codex not operated.'
# The tested watcher stays running; use this build's --stop to end the test.
