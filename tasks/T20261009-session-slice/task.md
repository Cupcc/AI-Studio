---
id: T20261009-session-slice
status: draft
fr: [FR-NAV-003, FR-CHAT-001, FR-CHAT-002, FR-CHAT-003, FR-SESSION-001, FR-SESSION-002, FR-SESSION-003, FR-STATE-001, FR-STATE-002, FR-STATE-003, FR-STATE-004, FR-STATE-005, FR-STATE-006, FR-STATE-007, FR-INPUT-001, FR-INPUT-002]
ac: [AC-02, AC-03, AC-04, AC-05]
specs: [specs/session/spec.md, specs/chat/spec.md, specs/input/spec.md]
created: 2026-10-09
---

# Session 对话切片

## 目标

在 Project 壳层与 CLI Adapter 之上实现 Session 的创建、对话、并行执行与注意力状态，使 AC-02～AC-05 所涉行为可在应用中完成。

## 范围

- 做：
  - Session Manager（主进程）：App Session 与 CLI Conversation 1:1 映射、持久化、恢复、并行、Stop、关闭 Project 时停止当前一轮（FR-SESSION-002、FR-SESSION-003、FR-CHAT-003、FR-PROJ-002 关闭部分）。
  - 状态：Running、Needs Input、Error、Completed Unread、无状态；查看与答复的清除规则；Project 注意力汇总供 Tab 与折叠按钮使用（FR-STATE-001～007；UX 第 7 节、D-03、D-04、D-05、D-07、D-14）。
  - New Chat：草稿、首条消息创建 Session、Default CLI、CLI 下拉菜单、设为默认、不可用 CLI 禁用并说明原因（FR-CHAT-001、FR-CHAT-002；UX 第 6 节 New Chat；D-01、D-11）。
  - Session History：日期分组、按最近用户消息排序、滚动、CLI 标识与状态点、Rename（FR-NAV-003；D-12；P-D）。
  - Conversation：打开即在底部、流式追加与跟随、工具活动行、轮次完成行、Needs Input 卡片、Error 卡片（FR-SESSION-001、FR-STATE-007；Shell Spec v01 第 5 节）。
  - 输入区：多行输入、Context / Attachment 入口（本轮只放入口与当前 View 标签位）、Model Selector、Send / Stop（FR-INPUT-001、FR-INPUT-002；Shell Spec v01 第 6 节）。
- 不做：Project View Mode 中的 Conversation 列与 View 上下文注入（见 [T20261009-project-view](../T20261009-project-view/task.md)）；轮次完成行中“修改了 N 个文件”与 Diff 联动（依赖 [T20261009-context-tools](../T20261009-context-tools/task.md) 与 04 第 7 节第 13 项）；从 Files 添加文件到上下文。

## 依据

- 功能：[02. Functional Requirements](<../../docs/02. Functional Requirements.md>) 第 2 节对应 FR。
- 界面：[03. UX Specification](<../../docs/03. UX Specification.md>) 第 6、7、8 节及第 10 节；[Shell Spec v01](../../design/components/shell-spec-v01.md) 第 3～6、9 节；线框图 v02。
- 技术：[04. Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 4、5、6 节；Adapter 接口见 `specs/agent-adapter/spec.md`（[T20261009-agent-adapter](../T20261009-agent-adapter/task.md) 产出）；[06. CLI Integration Preflight](<../../docs/06. CLI Integration Preflight.md>) 第 5 节。
- 验收：[05. Acceptance Criteria](<../../docs/05. Acceptance Criteria.md>) AC-02～AC-05；第 4 节列出的专项测试中与本 task 相关的部分（Resume、Rename、Model Selector、错误恢复、大量 Session 性能、New Chat 草稿、Needs Input / Error 清除规则、Tab 注意力点、关闭确认、Stop）。

## 验收标准

由 spec 草稿完成后细化，至少包括 AC-02～AC-05 全部要求：

- [ ] 在 Project 中创建 Codex New Chat，输入需求后 Codex 开始执行，Session 出现在左侧并显示 Running，Conversation 流式输出（AC-02）。
- [ ] 同一 Project 中一个 Codex Session 与一个 Claude Code Session 同时执行，切换 Session 不打断后台执行（AC-03）。
- [ ] 用户在 Session B 时 Session A 后台完成，A 出现绿色圆点；点击 A 直接显示最新 Conversation，圆点消失（AC-04）。
- [ ] 后台 Agent 等待用户决定时 Session History 出现 Needs Input 状态；点击后直接看到等待内容（AC-05）。

## 未决问题

| 问题 | 回答（确认日期） |
|---|---|
| spec 草稿（`specs/session/`、`specs/chat/`、`specs/input/`）完成后补充 |  |
