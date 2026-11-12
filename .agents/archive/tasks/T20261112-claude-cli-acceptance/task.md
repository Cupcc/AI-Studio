---
id: T20261112-claude-cli-acceptance
status: done
fr: [FR-CHAT-001, FR-CHAT-002, FR-CHAT-003, FR-SESSION-001, FR-SESSION-002, FR-SESSION-003, FR-STATE-001, FR-STATE-002, FR-STATE-003, FR-STATE-004, FR-STATE-005, FR-INPUT-002, FR-TOOL-002]
ac: [AC-02, AC-03, AC-04, AC-05]
specs: [specs/session/spec.md, specs/agent-adapter/spec.md, specs/chat/spec.md, specs/tools/spec.md]
created: 2026-11-12
---

# Claude Code CLI 真实链路验收

## 收尾

- 2026-11-12：Main Agent 在独立 worktree 的开发构建上，用真实 Claude Code 完成本轮场景，结论与证据见 [验收记录](acceptance.md)。Main Agent 未参与 Claude Provider 的实现，本轮没有修改产品代码。
- 2026-11-12：用户回复“可以了，并入，没测的不需要你测了。测试通过”。人工验收结果与接受范围记录在[验收记录](acceptance.md#人工功能验收)；未覆盖项不作为本轮前置，也不记为通过。交付物完整，无阻塞发现，任务完成并归档。
- 文档同步：DEC-16 增加本次后续说明；AC 文档 §1 与 AC-03、路线图（§1.1、§3.4、§4、§5）、input spec 中 Claude 审批 / 提问语义的状态改为引用本记录；CLI 安装任务增加关联说明。保留项：安装、自定义连接、打包等仍由 CLI 安装任务维护；Claude 运行中排队、同一 Session 内切换模型、文件引用接收和输入框回复 Needs Input 未在本轮验证，相关 spec 原文不变。

## 目标

用户 2026-11-12 要求"实测，做 claude code cli 的验收"：在实际 Electron 应用中，用真实 Claude Code CLI 验证 Claude Session 的核心链路。

## 范围

- 做：AC-02 / AC-03 / AC-04 / AC-05 的 Claude 路径，以及 Stop、Stop 后继续、正常退出后恢复、异常退出恢复、显式模型选择、审批型与问答型 Needs Input、本轮 Diff 降级。
- 不做：修改产品代码；打包应用；一键安装真实网络流程；应用自定义连接（URL / Key）的 Claude 远端请求；Project View（AC-06）与工具面板的 Claude 专项。

## 依据

- [V1 核心验收场景](<../../../../docs/05. Acceptance Criteria.md>) AC-02～AC-05；[Task Protocol 的模拟环境与真实 CLI](../../../../tasks/README.md#模拟环境与真实-cli)。
- [DEC-16](<../../../../docs/07. Decisions.md#dec-16-v1-真实-cli-验收范围>) 曾暂缓 Claude Code 真实验收；本次由用户请求重新启动，结论单独记录，不改写 Codex 的验收基线。
- [CLI 安装任务](../../../../tasks/T20261108-cli-install/task.md) 中仍保留的 Claude 真实连接 / 打包边界。

## 验收标准

| 场景与来源 | 前置条件与用户操作 | 预期结果 | 验证方式与环境 |
|---|---|---|---|
| AC-02 | 选择 Claude Code 新建对话并发送 | Session 出现在列表，显示 Running，流式输出与工具记录，完成行 | agent-browser + 真实 CLI |
| AC-03 | 同一 Project 中 Claude 与 Codex、两个 Claude 同时运行，并来回切换 | 互不打断，切回仍在流式 | 同上 |
| AC-04、FR-STATE-004/005 | 查看其他 Session 时 Claude 完成；之后在前台点击 | 出现绿点，点击后清除 | 同上；点击清除需窗口在前台 |
| AC-05、FR-INPUT-002 | AskUserQuestion；原生审批（拒绝 / 允许一次） | Needs Input 状态与等待卡片；回答 / 决定传回 CLI | 同上；审批使用测试项目本地设置 |
| session spec §3.9、Adapter §3.6 | Stop、Stop 后继续 | 已停止行，无 Error / 绿点；继续时保留上下文 | 同上 |
| session spec S-Q5 / S-Q7 | 正常退出后重启继续；运行中 kill -9 后重启 | 原 ID 恢复；中断轮显示 Error 文案与重试，孤儿进程清理 | 同上 + 进程检查 |
| Adapter §3.6 第 6 条 | 显式选择 Sonnet / Haiku | CLI 实际使用所选模型 | CLI 原生会话记录（只读） |

## 已确认事项

| 问题 | 回答（确认日期） |
|---|---|
| 是否对 Claude Code 做真实链路验收 | 用户要求"实测，做 claude code cli 的验收"（2026-11-12） |

## 技术决定

- 应用以 `--studio-user-data-dir` 使用隔离数据目录，避免影响用户正在运行的 `pnpm dev`；测试项目位于 `/tmp/ai-studio-claude-live/project`，不继承本仓库 AGENTS.md。（Main Agent，2026-11-12）
- 打开目录的系统原生对话框替换为固定路径（与 e2e 的 `dialog.showOpenDialog` 替换方式相同），除此之外的操作都从可见入口执行；正常退出通过主进程 `app.quit()` 触发。原因：原生按键会发往用户的前台窗口。（Main Agent，2026-11-12）
- 本机 Claude 用户配置为 `bypassPermissions`，应用按规则继承。审批场景在测试项目的 `.claude/settings.local.json` 中将 `defaultMode` 设为 `default`，不修改用户配置。（Main Agent，2026-11-12）
