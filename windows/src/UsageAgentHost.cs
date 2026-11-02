using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;
using System.Reflection;

[assembly: AssemblyTitle("Codex Usage Agent")]
[assembly: AssemblyDescription("Internal background worker for the automatic usage-card assistant")]
[assembly: AssemblyVersion("0.3.0.0")]

internal static class UsageAgentHost {
    // Resolve a real executable using PATH, not the developer's installation.
    private static string ResolveNode() {
        foreach (string entry in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator)) {
            string directory = entry.Trim().Trim('"');
            if (directory.Length == 0 || !Path.IsPathRooted(directory)) continue;
            string candidate = Path.Combine(directory, "node.exe");
            if (!File.Exists(candidate)) continue;
            var info = new ProcessStartInfo(candidate, "--version") {
                UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true
            };
            using (var check = Process.Start(info)) {
                if (!check.WaitForExit(5000)) throw new Exception("Node.js 版本检查超时。");
                string version = check.StandardOutput.ReadToEnd().Trim();
                int major;
                if (check.ExitCode != 0 || !Int32.TryParse(version.TrimStart('v').Split('.')[0], out major) || major < 24)
                    throw new Exception("需要 Node.js 24 或更高版本；请更新 PATH 中的 Node.js。");
            }
            return candidate;
        }
        throw new Exception("找不到 Node.js，请安装 Node.js 24 或更高版本并添加到 PATH，然后重新登录 Windows。");
    }
    private static readonly string Root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,".."));
    private static readonly string Log = Path.Combine(Root, "runtime", "agent-host.log");
    [STAThread]
    private static int Main(string[] args) {
        try {
            string mode = args.Length == 0 ? "background" :
                args[0] == "--stop" ? "stop" :
                args[0] == "--check" ? "check-launcher" : null;
            if (mode == null) throw new Exception("不支持的启动参数。");
            string node = ResolveNode();
            var output = new StringBuilder();
            var errors = new StringBuilder();
            var info = new ProcessStartInfo(node, "\"" + Path.Combine(Root, "windows.cjs") + "\" " + mode) {
                WorkingDirectory = Root,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };
            Directory.CreateDirectory(Path.GetDirectoryName(Log));
            File.AppendAllText(Log, DateTime.Now.ToString("s") + " mode=" + mode + Environment.NewLine, Encoding.UTF8);
            using (var child = new Process()) {
                child.StartInfo = info;
                child.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) {
                    if (e.Data != null) lock (output) { if (output.Length < 32768) output.AppendLine(e.Data); }
                };
                child.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) {
                    if (e.Data != null) lock (errors) { if (errors.Length < 32768) errors.AppendLine(e.Data); }
                };
                child.Start();
                child.BeginOutputReadLine();
                child.BeginErrorReadLine();
                child.WaitForExit();
                File.AppendAllText(Log, DateTime.Now.ToString("s") + " exit=" + child.ExitCode + Environment.NewLine + errors, Encoding.UTF8);
                if (child.ExitCode != 0) {
                    string reason = errors.ToString().Trim();
                    if (reason.Length == 0) reason = "启动失败，请查看 runtime\\assistant-start.log。";
                    MessageBox.Show(reason, "自动助手后台组件", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
                return child.ExitCode;
            }
        } catch (Exception e) {
            MessageBox.Show(e.Message, "自动助手后台组件启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
