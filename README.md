# Codex Usage Card — Windows fork

在 Codex 侧栏显示五小时和每周剩余额度。非官方实验性 Windows 移植，不是 OpenAI 官方插件，也不是原作者维护或认可的 Windows 版本。

## Windows 0.1.1 Preview

[下载 ZIP 和 SHA256 校验值](https://github.com/NANAiiiii/codex-usage-card/releases/tag/v0.1.1-windows-preview.1) · [安装与构建](windows/README.md) · [工作原理、限制及卸载](windows/docs/AUTO-ASSISTANT.md)

- 登录 Windows 后助手独立运行；从 Codex 原图标打开时，尝试自动加载额度圆环。
- 支持新进程最长 30 秒的冷启动等待，不需要停手等待；键鼠输入不再阻止接管。
- **首次接管需要正常退出并重开 Codex，可能打断刚开始的输入或任务、切换焦点。** 不能接受该行为请勿启用。
- 不修改客户端安装包、不提权、不强杀。仅本机调试接口仍有较高权限，不要转发端口。

2026-11-02 已在一台 Windows 开发机验证原图标接管、电脑重启后的登录自启、圆环显示和额度刷新。其他设备及未来客户端版本仍未验证，不是稳定版。

## 开发与目录

Windows 源码、测试和构建脚本位于 `windows/`；发布程序只放在 Releases，日志、个人配置和本机快捷方式不提交。
默认分支 `windows` 维护 Windows 移植；保留原项目提交历史，没有向上游提交 PR。

## 来源与许可

Fork 自 [Lorie7813/codex-usage-card](https://github.com/Lorie7813/codex-usage-card)。Windows 额度脚本基于其 [v0.9.4 Beta macOS 发布包](https://github.com/Lorie7813/codex-usage-card/releases/tag/v0.9.4-beta.1)修改，新增 Windows 应用激活、后台宿主和自动启动助手。

保留原作者版权及 [MIT 许可证](LICENSE)。原项目的 macOS 文件和历史发布资料保持原有归属；macOS 用户请使用[上游项目](https://github.com/Lorie7813/codex-usage-card)，不要运行 Windows 助手。

## 问题反馈

Windows 版问题请到[本仓库 Issues](https://github.com/NANAiiiii/codex-usage-card/issues)，提供版本、复现步骤和脱敏错误信息。安全漏洞请走[私密报告](https://github.com/NANAiiiii/codex-usage-card/security/advisories/new)，不要公开登录信息或完整日志。详情见[安全与隐私说明](SECURITY.md)。
