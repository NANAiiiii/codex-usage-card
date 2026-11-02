# Standard Windows packaged-app activation; no elevation, registry edits or package patching.
$ErrorActionPreference = 'Stop'
trap { [Console]::Error.WriteLine('Package activation failed: ' + $_.Exception.Message); exit 1 }
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$appPath = $env:CODEX_USAGE_APP_PATH
$package = Get-AppxPackage -Name OpenAI.Codex | Where-Object {
    [IO.Path]::GetFullPath((Join-Path $_.InstallLocation 'app\ChatGPT.exe')) -eq [IO.Path]::GetFullPath($appPath)
} | Select-Object -First 1
if (!$package) { throw 'The requested executable is not the currently registered OpenAI.Codex package.' }
[xml]$manifest = Get-Content -LiteralPath (Join-Path $package.InstallLocation 'AppxManifest.xml') -Raw
$application = $manifest.Package.Applications.Application | Where-Object {
    $_.Id -eq 'App' -and ($_.Executable -replace '\\','/') -eq 'app/ChatGPT.exe'
} | Select-Object -First 1
if (!$application) { throw 'The package application entry does not match the verified Codex desktop app.' }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
class CodexActivationManager {}
[ComImport, Guid("2E941141-7F97-4756-BA1D-9DECDE894A3D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ICodexApplicationActivationManager {
    [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string appId,
        [MarshalAs(UnmanagedType.LPWStr)] string arguments, uint options, out uint processId);
}
public static class CodexPackageActivation {
    public static uint Run(string appId, bool dryRun, bool focusOnly) {
        object manager = new CodexActivationManager();
        try {
            var api = (ICodexApplicationActivationManager)manager;
            if (dryRun) return 0;
            uint pid;
            int hr = api.ActivateApplication(appId,
                focusOnly ? "" : "--remote-debugging-address=127.0.0.1 --remote-debugging-port=39222", 0, out pid);
            Marshal.ThrowExceptionForHR(hr);
            return pid;
        } finally { Marshal.FinalReleaseComObject(manager); }
    }
}
'@
$dryRun = $env:CODEX_USAGE_ACTIVATE_DRYRUN -eq '1'
$appId = $package.PackageFamilyName + '!App'
$launchedPid = [CodexPackageActivation]::Run($appId, $dryRun, ($env:CODEX_USAGE_FOCUS_ONLY -eq '1'))
[pscustomobject]@{ mode='WindowsPackageActivation'; appId=$appId; dryRun=$dryRun; processId=$launchedPid } | ConvertTo-Json -Compress
