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
| Q1 `.ai-studio/`（Project 内隐藏目录）作为存放位置与名称是否合适？推荐：是，避开 CLI 保护的目录名（[D20261009-project-knowledge-storage](../../docs/decisions/D20261009-project-knowledge-storage.md)） |  |
| Q2 `.ai-studio/` 默认被 git 忽略（客户端写入内容为 `*` 的 `.gitignore`）还是默认跟踪？推荐：默认忽略 |  |
| Q3 V1 是否接受 Agent 只在受信组件词汇内声明式设计 View，自由的沙箱 HTML 推迟到 P1 / 自定义 View？推荐：接受；这与 01 第 7 节、04 第 7 节“AI Generated UI / HTML”的措辞不同，需明确确认（[D20261009-project-view-rendering](../../docs/decisions/D20261009-project-view-rendering.md)） |  |
| Q4 应用是否内置默认 View Definition，Agent 的 `views/*.view.json` 只作覆盖？推荐：是 |  |
| Q5 Overview 的 Recent Sessions / Needs Input / Recently Completed 是否为客户端固定渲染区域，Agent 不能读取或摆放？推荐：是 |  |
| Q6 何时标注“示例数据”（Shell Spec v01 第 7 节）？推荐：数据属性 `example`，默认 false，仅 Agent 写占位内容时设为 true |  |
| Q7 View Context 是否作为首条消息的独立前置文本块，并折叠为可移除的“当前 View”标签；移除则不注入但仍记录 `origin_view_id`；是否在 04 第 5 节 Session 增加 `view_context_attached`？推荐：均为是（[D20261009-project-view-context](../../docs/decisions/D20261009-project-view-context.md)） |  |
| Q8 客户端可否在用户发送带 View Context 的消息前，向 `.ai-studio/` 写入自己的指南、Schema 与 `.gitignore`（打开 View 本身不写文件）？推荐：可以 |  |
| Q9 确认 V1 客户端不自动生成、不提示“知识已过期”、不提供自动修复入口（任何一项都是新增 FR）？推荐：确认 V1 都没有（[D20261009-project-view-refresh](../../docs/decisions/D20261009-project-view-refresh.md)） |  |
| Q10 View Context 文本是否用英文（面向模型，界面中折叠）？推荐：是 |  |
| Q11 暂定单文件 256 KB、500 个节点的上限，待渲染原型校准？推荐：接受 |  |
| Q12 后续选项（内置 Skill、Claude hooks 写后校验反馈、`developerInstructions` / `append`）何时评估？推荐：`specs/agent-adapter` 确定配置加载边界后，或指南文本过长时 |  |
