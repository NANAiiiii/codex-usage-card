# Codex 额度自动助手 — Windows 实验版

非官方 Windows 适配：从 Codex 原图标打开后，在严格条件下请求一次正常退出并重开，在侧栏显示五小时和每周剩余额度。不是上下文容量，不是 OpenAI 官方插件。

**状态：Windows Preview 0.1.0（实验版）。** 2026-11-02 在一台开发机上完成一次“原图标启动→正常退出→自动重开→圆环显示及额度刷新”的真实验收，不保证多设备兼容。[下载 ZIP 和 SHA256SUMS.txt](https://github.com/NANAiiiii/codex-usage-card/releases/tag/v0.1.0-windows-preview.1)。

**已知问题：** 同机此前两次启动触发了 `skip-user-input`；用户反馈未主动移动鼠标，原因仍未查明。此次增加时间差日志后成功，未修改输入保护规则，因此不能宣称误判已修复，也不保证每次自动接管。跳过时先看日志，不要关闭保护或连续重试。

## 要求与构建

- Windows x64，已安装并登录的 WindowsApps 打包版 Codex，以及可用的已登录 Codex CLI。
- Node.js 24 或更新版本，`node.exe` 在 PATH 中；更新环境变量后重新登录 Windows。
- Windows PowerShell 5.1、.NET Framework 4 编译器。源码无第三方 npm 依赖。

在 `windows` 目录执行：

```powershell
node --test tests/windows.test.cjs
./build-auto-helper.ps1
./package.ps1
```

输出为 `artifacts/portable/` 和 `artifacts/CodexUsageCard-Windows-preview.zip`，附 SHA256SUMS.txt。编译不修改开始菜单或登录启动，不覆盖运行中的程序；输出目录非空时拒绝覆盖。程序未签名，不要关闭 Windows 安全保护来运行。

开发机桌面环境可用新构建执行 `./tests/detached-start.ps1 -Executable ./artifacts/portable/Codex-Usage-AutoHelper.exe`，验证启动器进程组销毁后监听仍存活。此测试只操作测试进程组，不关闭 Codex；结束后用该构建的 `--stop` 停止监听。CI 不依赖交互桌面，不把此测试视为真实自动接管验收。

## 使用与管理

1. 把便携目录解压到固定的、当前用户可写的位置。**不要直接在 ZIP 内运行。**
2. 在解压目录用 PowerShell 执行 `./create-shortcuts.ps1`，五个入口只生成到“管理工具”目录，不添加开始菜单或登录启动项。脚本被组织策略阻止时不要绕过，可直接用下面的命令。
3. 双击主程序只监听本次会话；“管理工具/启用自动启动助手”会监听并设置本用户登录启动。也可执行 `./Codex-Usage-AutoHelper.exe --enable`，不依赖预先生成快捷方式。监听进程由 Windows 桌面外壳启动，不依附于发起操作的 Codex。
4. 启用前已打开的 Codex 不重启。保存工作、正常完全退出后，从官方图标打开并短暂停留，观察是否出现圆环。

命令参数：`--run` 本次运行、`--stop` 停止监听、`--status` 查看状态、`--disable` 取消登录启动并停止监听、`--self-test` 仅策略自检。它们都不需要管理员权限。

停用不会关闭 Codex、调试端口或已有额度后台组件。完整卸载、接管条件及风险见 [使用说明](docs/AUTO-ASSISTANT.md)。启用后不要移动目录；迁移前先停用旧目录。

## 安全与限制

- 通过本机 Codex CLI app-server 读取账户类型及额度，不直接读取 auth.json、Cookie 或聊天数据库，不调用模型。
- CDP 仅绑定本机 39222；连接前验证监听进程及地址。调试接口权限很高，本机不等于有身份认证，不要转发端口。
- 不修改 Codex 安装包、不提权、不强杀。用户输入、旧会话、多窗口、后台窗口和冷却条件会阻止接管。
- 正常退出请求可能被拒绝，内部接口或应用更新可能导致失效；跳过时不要放宽安全条件。退出后检测到输入会取消重开，可能需要手动打开 Codex。
- 日志与状态保存在本地 runtime/，不上传；分享前去除路径、进程及账户相关信息。

## 来源与许可

本 fork 来自 [Lorie7813/codex-usage-card](https://github.com/Lorie7813/codex-usage-card)，Windows 额度脚本基于其 [v0.9.4 Beta 发布包](https://github.com/Lorie7813/codex-usage-card/releases/tag/v0.9.4-beta.1)中的 agent.cjs 修改。
保留 [MIT 许可证及原版权](LICENSE)。新增 Windows 激活、受保护的自动助手、后台宿主与打包脚本；不是原作者维护或认可的 Windows 官方版本。

上游原始 ZIP SHA256：`e41cbb00fd01b785eb0cac73a946115a35dd2d9a2410c196ec7287ce4b1737f8`；原始 agent.cjs SHA256：`2727a6e47c71503bbc8d2171520bcd41aff851fa3b1efc7e8319974145977683`。
