---
id: T20261009-project-view
status: draft
fr: [FR-VIEW-001, FR-VIEW-002, FR-VIEW-003, FR-VIEW-004, FR-VIEW-005, FR-VIEW-006, FR-VIEW-007, FR-VIEW-008]
ac: [AC-06]
specs: [specs/project-view/spec.md]
created: 2026-10-09
---

# Project View

## 目标

实现 Project Knowledge → Structured Data → Rendering → Generated Project View 的链路，以及 Project View Mode 的左 Conversation、右 Preview 工作方式（FR-VIEW-001～FR-VIEW-008，AC-06）。

本轮（[T20261009-v1-foundation-slice](../T20261009-v1-foundation-slice/task.md)）只做调研：把 [04. Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 7 节中阻塞本 task 的待决事项整理为决定草稿，交人确认。实现放到后续轮次。

## 范围

- 本轮做：调研并起草以下决定，每项给出推荐方案、备选方案与放弃原因：
  - 04 第 7 节第 1 项：Project Knowledge 存储格式；
  - 第 2 项：是否存储在 Project 内部隐藏目录；
  - 第 3 项：AI Generated View 的 HTML 渲染与安全沙箱（04 第 2 节：AI 生成的 HTML / JavaScript 不得获得 Node.js、文件系统或完整 IPC 权限）；
  - 第 10 项：Project View Context 如何注入两种 CLI；
  - 第 11 项：Project View 数据自动更新时机与权限边界。
- 后续轮次做：Knowledge 存储与 Schema 校验、View Renderer、Preview 容器（空状态、只读、缩放、自动刷新、渲染失败保留上一版）、Project View Mode 布局与 New Chat、默认五个 View 的生成指令。
- 不做：自定义 View 的创建入口（FR-VIEW-002，P1）留待 P0 完成后评估。

## 依据

- 功能：[02. Functional Requirements](<../../docs/02. Functional Requirements.md>) 第 2 节 FR-VIEW-001～004、第 3 节默认 View 定义、第 4 节 FR-VIEW-005～008。
- 界面：[03. UX Specification](<../../docs/03. UX Specification.md>) 第 4、6 节及第 10 节 D-05、D-06、P-A、P-B；[Shell Spec v01](../../design/components/shell-spec-v01.md) 第 7 节。
- 技术：04 第 2 节分层边界、第 3 节 CLI 原生能力复用、第 5 节 Project View 概念模型、第 7 节待决事项。
- 验收：[05. Acceptance Criteria](<../../docs/05. Acceptance Criteria.md>) AC-06。

## 验收标准

本轮（调研）：

- [ ] 上述五项各有一份 `docs/decisions/` 决定草稿或在同一草稿中分节说明，引用依据，不新增产品需求。
- [ ] 推荐方案满足 FR-VIEW-004 数据与展示分离、FR-VIEW-006 不创建特殊 Project Chat、04 第 2 节渲染隔离。
- [ ] 无法由文档推导的产品取舍列入本 task 的未决问题。

实现阶段（后续轮次，届时细化）：AC-06 全部要求。

## 未决问题

| 问题 | 回答（确认日期） |
|---|---|
| 04 第 7 节第 1、2、3、10、11 项的决定（调研完成后以决定草稿形式提交确认） |  |
