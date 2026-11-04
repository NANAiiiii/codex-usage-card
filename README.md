# Codex Usage Card — Windows fork

在 Codex 侧栏显示五小时和每周剩余额度。非官方实验性 Windows 移植，不是 OpenAI 官方插件，也不是原作者维护或认可的 Windows 版本。

## Windows 0.1.4 Preview

[下载 ZIP 和 SHA256 校验值](https://github.com/NANAiiiii/codex-usage-card/releases/tag/v0.1.4-windows-preview.1) · [安装与构建](windows/README.md) · [工作原理、限制及卸载](windows/docs/AUTO-ASSISTANT.md)

0.1.4 增加重置时间：五小时额度显示本地时分，周额度显示月日；百分比位于圆环下方并居中，时间使用淡底标签。读取失败或数据过期时不保留旧时间。2026-11-04 用户已确认本机样式，其他设备仍未全面验证。

0.1.3 修复本机查询超时或额度读取失败导致后台退出的问题：保留双圆环并显示暂不可用，自动重试，恢复后刷新。2026-11-04 用户在同一台电脑确认本地修复可用；模拟故障测试通过，不代表所有断网、休眠或系统异常均已验证。

- 登录 Windows 后助手独立运行；从 Codex 原图标打开时，尝试自动加载额度圆环。
- 支持新进程最长 30 秒的冷启动等待，无需保持键鼠静止；发送退出快捷键时若组合键或 Q 正按住则取消本次接管。
- **首次接管需要正常退出并重开 Codex，可能打断刚开始的输入或任务、切换焦点。** 不能接受该行为请勿启用。
- 不修改客户端安装包、不提权、不强杀。仅本机调试接口仍有较高权限，不要转发端口。
- 使用 Ctrl+Q 退出应用后再重开，不改变原图标。瞬间焦点切换可能让快捷键落入其他应用，详见[限制说明](windows/docs/AUTO-ASSISTANT.md#风险与适用范围)。

2026-11-03 已在一台 Windows 开发机验证本次修复后的原图标启动接管，用户确认正常，日志及额度刷新状态吻合。旧版曾验证电脑重启后的登录自启，本次退出方式改动后尚未重新验证电脑重启；其他设备及未来客户端版本仍未验证，不是稳定版。

## 开发与目录

Windows 源码、测试和构建脚本位于 `windows/`；发布程序只放在 Releases，日志、个人配置和本机快捷方式不提交。
默认分支 `windows` 维护 Windows 移植；保留原项目提交历史，没有向上游提交 PR。

## 来源与许可

Fork 自 [Lorie7813/codex-usage-card](https://github.com/Lorie7813/codex-usage-card)。Windows 额度脚本基于其 [v0.9.4 Beta macOS 发布包](https://github.com/Lorie7813/codex-usage-card/releases/tag/v0.9.4-beta.1)修改，新增 Windows 应用激活、后台宿主和自动启动助手。

保留原作者版权及 [MIT 许可证](LICENSE)。原项目的 macOS 文件和历史发布资料保持原有归属；macOS 用户请使用[上游项目](https://github.com/Lorie7813/codex-usage-card)，不要运行 Windows 助手。

## 问题反馈

Windows 版问题请到[本仓库 Issues](https://github.com/NANAiiiii/codex-usage-card/issues)，提供版本、复现步骤和脱敏错误信息。安全漏洞请走[私密报告](https://github.com/NANAiiiii/codex-usage-card/security/advisories/new)，不要公开登录信息或完整日志。详情见[安全与隐私说明](SECURITY.md)。
