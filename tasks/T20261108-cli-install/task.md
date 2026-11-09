---
id: T20261108-cli-install
status: verifying
fr: [FR-SET-001, FR-CHAT-002]
ac: [AC-08]
specs: [specs/settings/spec.md, specs/chat/spec.md]
created: 2026-11-08
---

# 支持的 CLI 列表与一键安装

## 目标与依据

用户 2026-11-08 请求：app 支持的 CLI 都显示；检测到未安装 Codex / Claude Code 时可选择一键安装。沿用 [CLI 管理规则](../../specs/settings/spec.md#cli-管理与默认-cli2026-10-25-确认) 的添加 / 移除、默认选择与可用性检测。

## 范围

设置中显示支持项；主进程执行官方原生安装器；安装状态、失败重试、安装后环境刷新与可用性重检。安装不等于登录或人工验收。

## 已确认事项

- 用户 2026-11-08 回答「同时启用 Claude Code 会话（推荐）」：解除正式版 Provider 开关限制，发布范围相应更新；不等于真实验收已通过。
- 同日新增：应用维护独立 CLI 配置，配置 base URL / API key，优先不替换本机文件。用户随后在机制研究后回复「apply,实现上述方案」（2026-11-08 确认）：使用本机 / 应用两种模式，独立配置、加密密钥、原文件不替换，新会话使用新配置、已有会话保留配置快照。

## 验收场景

| 来源 | 场景与操作 | 预期 | 验证 |
|---|---|---|---|
| 本次请求、FR-SET-001 | 打开设置 → CLI | 所有支持项可见，包括未安装项 | 实际 Electron + agent-browser 截图 |
| 本次请求 | 点击未安装 CLI 的一键安装 | 官方安装器运行，状态反馈，重复点击不重复启动 | 服务测试、隔离环境真实安装、UI |
| 本次请求 | 安装结束 | 刷新环境与 CLI 状态；未登录显示登录提示 | 服务 / UI 测试、真实检测 |
| 本次请求 | 网络失败、非零退出、超时、关闭设置后重开 | 清晰错误，可重试；状态保留；进程正确清理 | 定向测试、UI |
| 既有 CLI 管理规则 | 添加、移除、默认选择 | 原行为不回退，不改运行中的会话 | 设置及 Session 定向回归 |

## 执行记录

- 2026-11-08：主工作区有大量既有未提交变更。`main` 与 `origin/main` 同为 `9846eea`，在独立 worktree `../AI Stduio.worktrees/cli-install`、分支 `feat/cli-install` 开发，不覆盖主工作区。
- 官方来源：[Codex CLI](https://learn.chatgpt.com/docs/codex/cli)、[Claude setup](https://code.claude.com/docs/en/setup)，2026-11-08 检索。两者支持原生安装，不依赖 npm / brew。

## 收尾

实现已完成并提交于 `a50ec2e`（独立 worktree `../AI Stduio.worktrees/cli-install`）；任务进入 verifying。安装服务、双 CLI Provider、独立连接配置和配置修订快照已接入。用户随后要求先核实配置机制并参考 CC Switch；研究结果与实现边界见 [机制研究](research.md)。

本轮收尾复核：已核对 settings spec 的 CLI 管理与连接配置、agent-adapter spec 的 ProviderEnvironment、DEC-19 历史边界与 DEC-27 新确认、路线图下一步 / 模块状态 / 验收进度；已更新负责文档。保留项：未执行 Electron agent-browser 交互验收、真实网关请求、打包应用验证与人工产品验收；一键安装真实网络流程仅完成实现与进程单测，未在本轮重复执行。
