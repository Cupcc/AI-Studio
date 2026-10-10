---
id: T20261009-agent-adapter
status: verifying
fr: [FR-CHAT-002, FR-CHAT-003, FR-SESSION-002, FR-SESSION-003, FR-STATE-001, FR-STATE-002, FR-STATE-003, FR-STATE-007, FR-INPUT-001, FR-INPUT-002]
ac: [AC-02, AC-03, AC-05]
specs: [specs/agent-adapter/spec.md]
created: 2026-10-09
---

# CLI Adapter 首阶段

## 目标

实现与 Electron 无关的 CLI Adapter 包，把 Codex App Server 与 Claude Agent SDK 两条已验证的接入路径统一为一套 Provider 接口和事件模型，并按 [04. Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 4 节实现 Stop 与进程管理。产出 `specs/agent-adapter/spec.md` 草稿，供 Session 管理（[T20261009-session-slice](../T20261009-session-slice/task.md)）使用。

## 范围

- 做：
  - 独立 workspace 包（不依赖 Electron），可在纯 Node 中测试。
  - Provider 接口与统一事件模型；架构上允许新增其他 CLI（04 第 6 节“可扩展性”），V1 只实现 Codex 与 Claude Code。
  - 可用性检测：可执行文件发现（接受外部传入的 PATH / 可执行路径）、版本、登录状态、模型目录，四者分开报告（[CLI 校验报告](../T20261008-cli-preflight/report.md) 第 5 节最后一条）。
  - Codex：`codex app-server --listen stdio://` JSON-RPC；创建 / 恢复 Thread、流式文本、工具活动、授权请求与 `requestUserInput`、模型目录与切换、回合终态、错误；协议类型由本机 CLI 生成并锁定版本（[CLI 校验报告](../T20261008-cli-preflight/report.md) 第 3 节）。
  - Claude Code：官方 Agent SDK Streaming Input，`pathToClaudeCodeExecutable` 指向本机 CLI；`includePartialMessages`、`resume`、`canUseTool`（权限与 AskUserQuestion）、interrupt、模型目录与切换。
  - 原生配置复用：默认不覆盖 CLI 自身的模型、权限、Rule、Skill 与 Context 配置（[01. Product Definition](<../../docs/01. Product Definition.md>) 第 8 节原则 19、20；04 第 3 节）；需要覆盖的项作为可选参数暴露。
  - Stop：按 04 第 4 节七条约束实现；主动取消与原生终态关联，不误报 Error（[CLI 校验报告](../T20261008-cli-preflight/report.md) 第 5 节状态映射表）。
  - Runtime 隔离：首阶段每个活动 Session 使用独立 Runtime；单个 Runtime 崩溃不影响其他 Session（04 第 2、6 节）。
  - 单元测试使用模拟传输；真实 CLI 集成测试需显式开启，限量运行（2026-10-09 确认）。
- 不做：产品 Session 状态机（Completed Unread、查看清除、排序）、SQLite 持久化、IPC、UI；文件变更归因与 Diff（04 第 7 节第 13 项）；Project View Context 注入（04 第 7 节第 10 项）。

## 依据

- 集成接口、实测矩阵、状态映射与 Adapter 约束：[CLI Integration Preflight](../T20261008-cli-preflight/report.md) 第 3、4、5 节；剩余校验：第 6 节。
- Stop 约束：04 第 4 节“Codex Stop 实现约束”1～7。
- 预检脚本（协议用法参考，非产品代码）：[scripts/cli-preflight.mjs](../../scripts/cli-preflight.mjs)、[codex-native-stop-check.mjs](../T20261008-cli-preflight/evidence/codex-native-stop-check.mjs)。
- Session 与 CLI 1:1、CLI 锁定、模型切换：FR-CHAT-003；[02. Functional Requirements](<../../docs/02. Functional Requirements.md>) 第 2 节 Session 状态。

## 验收标准

- [ ] 同一 Provider 接口下，两个 Provider 都能创建 Session、流式输出、在 Runtime 重启后以原生 ID 恢复并保留上下文；恢复失败时报告错误，不静默创建新原生 Session（[CLI 校验报告](../T20261008-cli-preflight/report.md) 第 4、5 节；04 第 4 节第 7 条）。
- [ ] 提交消息后立即产生 Running 事件，不等待首个文本片段（[CLI 校验报告](../T20261008-cli-preflight/report.md) 第 5 节；FR-STATE-001）。
- [ ] 区分文本增量与完整消息，正文不重复（[CLI 校验报告](../T20261008-cli-preflight/report.md) 第 5 节）。
- [ ] 授权与提问以统一的“等待输入”事件发出，携带请求 ID 与 CLI 原生选项；答复后解除；同时存在多个请求时各自独立答复（FR-STATE-002；[CLI 校验报告](../T20261008-cli-preflight/report.md) 第 6 节“授权接受、取消等待请求、多请求竞态”）。
- [ ] 回合终态区分 completed / interrupted / failed；只有成功终态标为 completed；用户主动取消不报 Error（[CLI 校验报告](../T20261008-cli-preflight/report.md) 第 5 节；FR-STATE-003）。回合事件包含耗时，供“Worked for … · Done”使用（FR-STATE-007）。
- [ ] Codex Stop：`turn/interrupt` 后精确终止本轮命令，并以系统进程退出作为完成证据；清理有限时等待；超时或接口不可用时走独立 Runtime 兜底并以原 `thread.id` 恢复；重复 Stop 与迟到事件不破坏状态（04 第 4 节第 1～7 条）。
- [ ] Claude Stop：interrupt 后本轮子进程退出，同一 Session 可继续对话（[CLI 校验报告](../T20261008-cli-preflight/report.md) 第 4 节）。
- [ ] 一个 Session 的 Stop、崩溃或兜底不影响同时运行的其他 Session（FR-SESSION-003；04 第 4 节第 7 条）；两个 Provider 的 Session 可并发运行（AC-03 的 Adapter 部分）。
- [ ] 模型目录可读取；同一 Session 内切换模型后下一轮使用新模型（FR-INPUT-002；[CLI 校验报告](../T20261008-cli-preflight/report.md) 第 6 节“同 Session 模型切换”）。
- [ ] 可用性检测分别报告未安装、未登录、可用三种情况及原因（UX Specification 第 6 节 New Chat 第 4 条）。
- [ ] 单元测试覆盖上述状态映射与 Stop 分支；真实集成测试结果以筛选后的证据保存，不含认证信息、邮件地址或完整配置（`tasks/README.md` 证据规则）。
- [ ] `specs/agent-adapter/spec.md` 草稿描述接口、事件、状态映射、Stop 流程与已知边界。

## 未决问题

| 问题 | 回答（确认日期） |
|---|---|
