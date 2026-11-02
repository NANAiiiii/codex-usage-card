using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Diagnostics;
using System.Threading;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Windows.Forms;
using System.Reflection;

// Experimental Windows original-icon helper. Never edits or force-kills Codex.
internal static class AutoAssistant {
    const double MaxStartupAgeMs=30000;
    static readonly string Root=AppDomain.CurrentDomain.BaseDirectory;
    static readonly string Run=Path.Combine(Root,"runtime");
    static readonly string Exe=Path.Combine(Root,"Codex-Usage-AutoHelper.exe");
    static readonly string LoginLink=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup),"Codex Usage AutoHelper.lnk");
    static readonly int CurrentSession=Process.GetCurrentProcess().SessionId;
    static string Name {
        get { using(var hash=SHA256.Create()) return "Local\\CodexUsageAuto."+BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(Root.ToLowerInvariant()))).Replace("-","").Substring(0,16); }
    }
    [StructLayout(LayoutKind.Sequential)] struct FileTime { public uint low,high; }
    [StructLayout(LayoutKind.Sequential)] struct UniqueProcess { public uint pid; public FileTime started; }
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
    delegate bool EnumWindow(IntPtr window,IntPtr data);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindow callback,IntPtr data);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr window,uint command);
    [DllImport("user32.dll",EntryPoint="GetWindowLongW")] static extern int GetWindowLong(IntPtr window,int index);
    [DllImport("rstrtmgr.dll",CharSet=CharSet.Unicode)] static extern int RmStartSession(out uint session,uint flags,StringBuilder key);
    [DllImport("rstrtmgr.dll")] static extern int RmRegisterResources(uint session,uint files,IntPtr names,uint count,[In] UniqueProcess[] apps,uint services,IntPtr serviceNames);
    [DllImport("rstrtmgr.dll")] static extern int RmShutdown(uint session,uint flags,IntPtr callback);
    [DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint session);

    static void Log(string state) {
        Directory.CreateDirectory(Run);
        string line=DateTime.Now.ToString("s")+" "+state;
        File.AppendAllText(Path.Combine(Run,"auto-assistant.log"),line+Environment.NewLine,Encoding.UTF8);
        File.WriteAllText(Path.Combine(Run,"auto-status.txt"),line,Encoding.UTF8);
    }
    static string PowerShell(string script) {
        var info=new ProcessStartInfo(Path.Combine(Environment.SystemDirectory,"WindowsPowerShell\\v1.0\\powershell.exe"),
            "-NoProfile -NonInteractive -EncodedCommand "+Convert.ToBase64String(Encoding.Unicode.GetBytes("$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.Encoding]::UTF8;"+script))) {
            UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true
        };
        using(var p=Process.Start(info)) {
            var readOutput=p.StandardOutput.ReadToEndAsync();
            var readError=p.StandardError.ReadToEndAsync();
            if(!p.WaitForExit(20000)) throw new Exception("应用注册查询超时；助手不会操作客户端。");
            string text=readOutput.Result,error=readError.Result;
            if(p.ExitCode!=0) throw new Exception("无法读取当前用户的 Codex 注册信息："+error);
            return text.Trim();
        }
    }
    static string RegisteredApp() {
        string root=PowerShell("$p=Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1;if(!$p){throw 'Codex package not found'};Join-Path $p.InstallLocation 'app\\ChatGPT.exe'");
        if(!File.Exists(root)) throw new Exception("已注册 Codex 路径不存在。");
        return Path.GetFullPath(root);
    }
    static Process[] Apps(string app) {
        return Process.GetProcessesByName("ChatGPT").Where(p=>{
            try { return p.SessionId==CurrentSession && String.Equals(p.MainModule.FileName,app,StringComparison.OrdinalIgnoreCase); }
            catch { p.Dispose();return false; }
        }).ToArray();
    }
    static uint Foreground() { uint pid;GetWindowThreadProcessId(GetForegroundWindow(),out pid);return pid; }
    static int WindowCount(int pid) {
        int count=0;
        EnumWindows(delegate(IntPtr w,IntPtr unused) {
            uint owner;GetWindowThreadProcessId(w,out owner);
            if(owner==pid && IsWindowVisible(w) && GetWindow(w,4)==IntPtr.Zero && (GetWindowLong(w,-20)&0x80)==0) count++;
            return true;
        },IntPtr.Zero);
        return count;
    }
    internal static string Decision(double age,bool foreground,int windows,bool cooling,bool portBusy) {
        if(age<0 || age>MaxStartupAgeMs) return "skip-old-session";
        if(!foreground) return "skip-background";
        if(windows!=1) return "skip-multiple-or-no-windows";
        if(portBusy) return "port-already-present";
        if(cooling) return "skip-cooldown";
        return "handoff";
    }
    static bool PortBusy() { return IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners().Any(e=>e.Port==39222); }
    static void StartAgent() {
        Process.Start(new ProcessStartInfo(Path.Combine(Root,"lib","UsageAgent.exe")) {
            UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Root
        }).Dispose();
    }
    static void RestoreNormal(string app) {
        // Normal Windows activation, no debugger settings or client patching.
        var script=File.ReadAllText(Path.Combine(Root,"lib","activate-client.ps1")).TrimStart('\uFEFF');
        var info=new ProcessStartInfo(Path.Combine(Environment.SystemDirectory,"WindowsPowerShell\\v1.0\\powershell.exe"),
            "-NoProfile -NonInteractive -EncodedCommand "+Convert.ToBase64String(Encoding.Unicode.GetBytes(script))) {
            UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Root
        };
        info.EnvironmentVariables["CODEX_USAGE_APP_PATH"]=app;
        info.EnvironmentVariables["CODEX_USAGE_FOCUS_ONLY"]="1";
        info.EnvironmentVariables["CODEX_USAGE_ACTIVATE_DRYRUN"]="0";
        Process.Start(info).Dispose();
    }
    static int RequestQuit(Process candidate) {
        uint session;
        int result=RmStartSession(out session,0,new StringBuilder(33));
        if(result!=0) return result;
        try {
            long time=candidate.StartTime.ToUniversalTime().ToFileTimeUtc();
            var target=new UniqueProcess {pid=(uint)candidate.Id,started=new FileTime {low=(uint)time,high=(uint)(time>>32)}};
            result=RmRegisterResources(session,0,IntPtr.Zero,1,new[]{target},0,IntPtr.Zero);
            // Register this PID + creation time only. NEVER request RmForceShutdown.
            if(result==0) result=RmShutdown(session,0,IntPtr.Zero);
            return result;
        } finally { RmEndSession(session); }
    }
    static DateTime LastAttempt() {
        long ticks;
        string file=Path.Combine(Run,"auto-last-attempt.txt");
        if(!File.Exists(file)) return DateTime.MinValue;
        if(!long.TryParse(File.ReadAllText(file),out ticks)) throw new Exception("冷却记录异常，停止自动接管。");
        return new DateTime(ticks,DateTimeKind.Utc);
    }
    static void SaveAttempt(DateTime time) {
        string file=Path.Combine(Run,"auto-last-attempt.txt"),temp=file+".tmp";
        File.WriteAllText(temp,time.Ticks.ToString());
        if(File.Exists(file)) File.Replace(temp,file,null);else File.Move(temp,file);
    }
    static int Watch() {
        bool first;
        using(var mutex=new Mutex(true,Name+".Mutex",out first)) {
            if(!first) return 0;
            using(var stop=new EventWaitHandle(false,EventResetMode.ManualReset,Name+".Stop")) {
                stop.Reset();
                // Validate Node, CLI discovery and package activation before any quit request.
                using(var preflight=Process.Start(new ProcessStartInfo(Path.Combine(Root,"lib","UsageAgent.exe"),"--check") {
                    UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Root
                })) {
                    if(!preflight.WaitForExit(45000) || preflight.ExitCode!=0)
                        throw new Exception("运行环境检查未通过，未操作 Codex；请检查 Node.js、CLI 和应用安装。");
                }
                string app=RegisteredApp();
                DateTime baseline=DateTime.UtcNow,lastAttempt=LastAttempt(),suppressUntil=DateTime.MinValue;
                var seen=new System.Collections.Generic.HashSet<string>();
                Log("watching; existing sessions excluded; keyboard/mouse allowed; pid="+Process.GetCurrentProcess().Id);
                while(!stop.WaitOne(1000)) {
                    try {
                        var all=Apps(app);
                        try {
                            foreach(var p in all) {
                                if(p.MainWindowHandle==IntPtr.Zero) continue;
                                DateTime started=p.StartTime.ToUniversalTime();
                                string key=p.Id+":"+started.Ticks;
                                if(seen.Contains(key)) continue;
                                if((DateTime.UtcNow-started).TotalMilliseconds<1500) continue;
                                seen.Add(key);
                                if(started<=baseline || DateTime.UtcNow<suppressUntil) continue;
                                double age=(DateTime.UtcNow-started).TotalMilliseconds;
                                string decision=Decision(age,Foreground()==p.Id,WindowCount(p.Id),
                                    (DateTime.UtcNow-lastAttempt).TotalSeconds<120,PortBusy());
                                if(decision=="port-already-present") { Log("attach-existing-port; pid="+p.Id);StartAgent();continue; }
                                if(decision!="handoff") {
                                    Log(decision+"; pid="+p.Id+"; ageMs="+age.ToString("F1",System.Globalization.CultureInfo.InvariantCulture));
                                    continue;
                                }
                                lastAttempt=DateTime.UtcNow;SaveAttempt(lastAttempt); // receipt before any quit request
                                if(stop.WaitOne(0) || Foreground()!=p.Id) {Log("canceled-before-quit");continue;}
                                Log("request-graceful-quit; pid="+p.Id);
                                int result=RequestQuit(p);
                                bool absent=false;
                                for(int i=0;i<40;i++) {
                                    var remaining=Apps(app);
                                    bool any=remaining.Length>0;
                                    foreach(var r in remaining) r.Dispose();
                                    if(!any){absent=true;break;}
                                    if(stop.WaitOne(250))break;
                                }
                                if(!absent) {
                                    Log("quit-refused-or-timeout; code="+result+"; no force used");
                                    if(!stop.WaitOne(0) && Foreground()==p.Id) RestoreNormal(app);
                                    continue;
                                }
                                // User authorized one startup handoff even while using keyboard/mouse.
                                if(stop.WaitOne(0)) { Log("handoff-canceled-after-quit; reopen Codex manually");continue; }
                                var raced=Apps(app);
                                bool another=raced.Length>0;foreach(var r in raced)r.Dispose();
                                if(another){Log("another-instance-started; handoff skipped");continue;}
                                suppressUntil=DateTime.UtcNow.AddSeconds(45);
                                Log("reopening-with-card");StartAgent();
                            }
                        } finally {foreach(var p in all)p.Dispose();}
                    } catch(Exception e) {Log("skipped-error: "+e.Message);}
                }
                Log("stopped");
            }
            mutex.ReleaseMutex();
        }
        return 0;
    }
    static void Stop() {try{using(var signal=EventWaitHandle.OpenExisting(Name+".Stop"))signal.Set();}catch(WaitHandleCannotBeOpenedException){}}
    static void StartDetached() {
        // Resolve the real Explorer desktop; a new Shell.Application alone can run in-process.
        dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application"));
        dynamic windows=null,desktop=null,document=null,application=null;
        try {
            windows=shell.Windows();
            int handle;
            desktop=windows.FindWindowSW(0,0,8,out handle,1);
            if(desktop==null) throw new Exception("找不到 Windows 桌面外壳，未启动监听；请从正常桌面登录后重试。");
            document=desktop.Document;
            application=document.Application;
            application.ShellExecute(Exe,"--watch",Root,"open",0);
        } finally {
            foreach(object value in new object[]{application,document,desktop,windows,shell})
                if(value!=null)Marshal.FinalReleaseComObject(value);
        }
    }
    static void CreateLoginLink() {
        Type type=Type.GetTypeFromProgID("WScript.Shell");
        object shell=Activator.CreateInstance(type),shortcut=null;
        try {
            shortcut=type.InvokeMember("CreateShortcut",BindingFlags.InvokeMethod,null,shell,new object[]{LoginLink});
            Type linkType=shortcut.GetType();
            linkType.InvokeMember("TargetPath",BindingFlags.SetProperty,null,shortcut,new object[]{Exe});
            linkType.InvokeMember("Arguments",BindingFlags.SetProperty,null,shortcut,new object[]{"--run"});
            linkType.InvokeMember("WorkingDirectory",BindingFlags.SetProperty,null,shortcut,new object[]{Root});
            linkType.InvokeMember("Save",BindingFlags.InvokeMethod,null,shortcut,null);
        } finally {
            if(shortcut!=null)Marshal.FinalReleaseComObject(shortcut);
            Marshal.FinalReleaseComObject(shell);
        }
    }
    static bool OwnedLoginLink() {
        Type shellType=Type.GetTypeFromProgID("WScript.Shell");
        object shell=Activator.CreateInstance(shellType),shortcut=null;
        try {
            shortcut=shellType.InvokeMember("CreateShortcut",BindingFlags.InvokeMethod,null,shell,new object[]{LoginLink});
            string target=(string)shortcut.GetType().InvokeMember("TargetPath",BindingFlags.GetProperty,null,shortcut,null);
            string arguments=(string)shortcut.GetType().InvokeMember("Arguments",BindingFlags.GetProperty,null,shortcut,null);
            return String.Equals(Path.GetFullPath(target),Path.GetFullPath(Exe),StringComparison.OrdinalIgnoreCase) && arguments=="--run";
        } finally {
            if(shortcut!=null)Marshal.FinalReleaseComObject(shortcut);
            Marshal.FinalReleaseComObject(shell);
        }
    }
    static int Tests() {
        int passed=0;
        Action<bool> check=delegate(bool ok){if(!ok)throw new Exception("Auto helper policy test failed at "+passed);passed++;};
        check(Decision(1000,true,1,false,false)=="handoff");
        check(Decision(30001,true,1,false,false)=="skip-old-session");
        check(Decision(-1,true,1,false,false)=="skip-old-session");
        check(Decision(3502,true,1,false,false)=="handoff");
        check(Decision(1000,false,1,false,false)=="skip-background");
        check(Decision(1000,true,2,false,false)=="skip-multiple-or-no-windows");
        check(Decision(1000,true,0,false,false)=="skip-multiple-or-no-windows");
        check(Decision(1000,true,1,true,false)=="skip-cooldown");
        check(Decision(1000,true,1,false,true)=="port-already-present");
        check(Decision(30001,true,1,false,true)=="skip-old-session");
        check(Decision(1000,false,1,false,true)=="skip-background");
        check(Decision(16585,true,1,false,false)=="handoff");
        check(Decision(30000,true,1,false,false)=="handoff");
        check(Decision(4865,true,1,false,false)=="handoff");
        check(Decision(16585,false,1,false,false)=="skip-background");
        check(Decision(16585,true,2,false,false)=="skip-multiple-or-no-windows");
        check(Decision(16585,true,1,true,false)=="skip-cooldown");
        Log("self-test: "+passed+" policy cases passed; no client operated");
        return 0;
    }
    [STAThread] static int Main(string[] args) {
        try {
            string mode=args.Length==0?"--run":args[0];
            if(mode=="--self-test")return Tests();
            if(mode=="--stop"){Stop();return 0;}
            if(mode=="--disable") {
                if(File.Exists(LoginLink)) {
                    if(!OwnedLoginLink()) throw new Exception("登录快捷方式与本目录不匹配，未删除任何文件。");
                    File.Delete(LoginLink);
                }
                Stop();Log("disabled; login shortcut removed");return 0;
            }
            if(mode=="--enable") {
                if(File.Exists(LoginLink) && !OwnedLoginLink())throw new Exception("登录位置已有不同的快捷方式，未覆盖。");
                CreateLoginLink();
                Log("enabled; per-user login startup registered");
                StartDetached();return 0;
            }
            if(mode=="--status") {
                string file=Path.Combine(Run,"auto-status.txt");
                MessageBox.Show((File.Exists(file)?File.ReadAllText(file):"助手尚未运行")+"\n随登录启动："+File.Exists(LoginLink),"自动助手状态");return 0;
            }
            if(mode=="--run"){StartDetached();return 0;}
            if(mode!="--watch")throw new Exception("未知参数。");
            return Watch();
        } catch(Exception e) {try{Log("fatal: "+e.Message);}catch{} MessageBox.Show(e.Message,"额度卡片自动助手",MessageBoxButtons.OK,MessageBoxIcon.Warning);return 1;}
    }
}
