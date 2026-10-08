---
id: T20261009-context-tools
status: draft
fr: [FR-TOOL-001, FR-TOOL-002, FR-TOOL-003, FR-TOOL-004]
ac: [AC-07]
specs: [specs/tools/spec.md]
created: 2026-10-09
---

# Context 工具：Files、Diff、Browser、Terminal

## 目标

在右侧边栏容器（[T20261009-project-shell](../T20261009-project-shell/task.md)）中实现四类工程工具（FR-TOOL-001～004；AC-07）。不在本轮（[T20261009-v1-foundation-slice](../T20261009-v1-foundation-slice/task.md)）范围内，先登记以保证拆分无遗漏。

## 范围

- 做：Files 目录树与“添加到对话”；Diff（相对 Git HEAD 的全部未提交变更，含未跟踪文件；M / A / D；单文件 Diff；非 Git 目录空状态）；Browser（WebContentsView、地址栏、刷新、记忆上次地址）；Terminal（xterm.js + node-pty，工作目录为 Project 目录，与 Agent Runtime 隔离）；轮次完成行“修改了 N 个文件”与 Diff 定位。
- 不做：完整 Source Control 工作台（[01. Product Definition](<../../docs/01. Product Definition.md>) 第 4 节非目标）。

## 依据

- 功能：[02. Functional Requirements](<../../docs/02. Functional Requirements.md>) 第 5 节。
- 界面：[03. UX Specification](<../../docs/03. UX Specification.md>) 第 5 节、D-08、D-13、P-B、P-C；[Shell Spec v01](../../design/components/shell-spec-v01.md) 第 8 节。
- 技术：[04. Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 2 节（xterm.js、node-pty、Monaco、Git CLI、WebContentsView）、第 4 节、第 7 节第 13 项。
- 验收：[05. Acceptance Criteria](<../../docs/05. Acceptance Criteria.md>) AC-07。

## 验收标准

- [ ] 用户可以分别打开 Files、Diff、Browser、Terminal；关闭后 Main Canvas 恢复空间；Agent 不自行打开这些工具（AC-07）。
- 其余标准在启动本 task 时依据 spec 细化。

## 未决问题

| 问题 | 回答（确认日期） |
|---|---|
| Git Staged / Unstaged 等高级能力是否进入 MVP（FR-TOOL-002 末段） |  |
| 每轮修改文件的识别方式；非 Git 目录是否需要 Diff 基线（04 第 7 节第 13 项） |  |
| Terminal 是否支持多实例（Shell Spec v01 第 11 节：规格未定义，v01 按单实例设计） |  |
