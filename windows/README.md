# Codex 额度自动助手 — Windows 0.1.2 Preview

[下载 ZIP 和 SHA256SUMS.txt](https://github.com/NANAiiiii/codex-usage-card/releases/tag/v0.1.2-windows-preview.1)

非官方实验版，在 Codex 侧栏显示剩余额度，不是上下文容量。2026-11-03 已在一台 Windows 开发机验证本次修复后的原图标启动接管，用户确认正常，日志及额度刷新状态吻合。新退出方式尚未复测电脑重启，不代表多设备或未来客户端兼容。

**启用即接受启动期间的一次正常退出与重开，可能打断刚开始的输入、任务或切换焦点。** 不要求保持键鼠静止，但 Ctrl/Shift/Alt/Win/Q 按住时会取消本次接管。程序未签名，不要关闭 Windows 安全保护来运行。

助手通过 Ctrl+Q 请求应用退出；前台检查与发键无法原子完成，瞬间焦点切换可能影响其他应用。不能接受这一风险请勿启用，详见[工作原理与限制](docs/AUTO-ASSISTANT.md)。

## 安装与使用

要求 Windows x64、正常 Explorer 桌面、已安装并登录的 WindowsApps 版 Codex，以及可用的本机已登录 Codex CLI。安装 Node.js 24+ 并加入 PATH，环境变量变化后重新登录 Windows。

1. 下载 ZIP 与 SHA256SUMS.txt，用 `Get-FileHash -Algorithm SHA256` 核对后解压到固定、当前用户可写的位置，不要在 ZIP 中运行。
2. 在解压目录的 PowerShell 中执行 `./Codex-Usage-AutoHelper.exe --enable`：启用登录自启并立即监听，无需管理员权限。
3. 启用前已打开的 Codex 不会重启。保存工作、完全退出后，从原来的官方图标打开；符合条件时助手自动重开一次并加载圆环，不需要保持键鼠静止。

双击主 EXE 只运行本次监听，不设置登录自启。可选执行 `./create-shortcuts.ps1`，五个管理入口只放在“管理工具”子目录，不添加开始菜单。组织策略禁止脚本时不要绕过，可直接使用 EXE 命令。

| 参数 | 功能 |
|---|---|
| `--enable` | 注册当前用户登录启动并运行 |
| `--run` | 仅本次监听，也是双击默认行为 |
| `--stop` | 停止本次监听，保留登录启动 |
| `--disable` | 取消本目录的登录启动并停止监听 |
| `--status` | 查看助手及启动项状态 |

停用不会关闭 Codex、已有额度后台组件或调试端口。启用后不要移动目录；更新、迁移和卸载见[详细说明](docs/AUTO-ASSISTANT.md)。

## 开发与验证

要求 Node.js 24+、Windows PowerShell 5.1 和 .NET Framework 4 编译器，无第三方 npm 依赖。在克隆仓库的 `windows/` 源码目录执行；便携 ZIP 不包含源码和测试：

```powershell
node --test tests/windows.test.cjs
./build-auto-helper.ps1
./tests/cold-start.ps1 -Executable ./artifacts/portable/Codex-Usage-AutoHelper.exe
./tests/quit-shortcut.ps1 -Executable ./artifacts/portable/Codex-Usage-AutoHelper.exe
./tests/relaunch.ps1 -Executable ./artifacts/portable/Codex-Usage-AutoHelper.exe
./package.ps1
```

产物在 `artifacts/portable/`、`artifacts/CodexUsageCard-Windows-0.1.2-preview.1.zip` 及 SHA256SUMS.txt。构建不注册启动项或创建快捷方式，输出目录必须为空，不覆盖正在运行的程序。

原生纯策略自检：`./artifacts/portable/Codex-Usage-AutoHelper.exe --self-test`。桌面环境可运行 `./tests/detached-start.ps1 -Executable ./artifacts/portable/Codex-Usage-AutoHelper.exe` 验证启动器进程组退出后助手仍存活；测试不关闭 Codex，结束后用同一构建的 `--stop` 停止测试监听。CI 无交互桌面，不把策略测试当成真实启动验收。

## 来源、隐私与许可

来自 [Lorie7813/codex-usage-card](https://github.com/Lorie7813/codex-usage-card) 的 [v0.9.4 Beta 发布包](https://github.com/Lorie7813/codex-usage-card/releases/tag/v0.9.4-beta.1)，保留 [MIT 版权和许可](LICENSE)。新增 Windows 激活、自动助手、后台宿主、测试与打包，不代表 OpenAI 或上游作者认可。

上游 ZIP SHA256：`e41cbb00fd01b785eb0cac73a946115a35dd2d9a2410c196ec7287ce4b1737f8`；原 agent.cjs SHA256：`2727a6e47c71503bbc8d2171520bcd41aff851fa3b1efc7e8319974145977683`。

额度通过本机 Codex CLI app-server 读取；不直接读 auth.json、Cookie、聊天数据库，不调用模型。日志和状态只保存在本地 runtime/，分享前去除个人路径等信息。CDP 调试权限很高，本机不等于有身份认证，不要转发 39222 端口或同时运行不可信软件。

普通问题请到[本仓库 Issues](https://github.com/NANAiiiii/codex-usage-card/issues)，附版本、复现步骤和脱敏错误信息；安全漏洞请使用[私密报告](https://github.com/NANAiiiii/codex-usage-card/security/advisories/new)。不要公开登录信息、聊天内容或完整日志，见[安全说明](https://github.com/NANAiiiii/codex-usage-card/blob/windows/SECURITY.md)。
