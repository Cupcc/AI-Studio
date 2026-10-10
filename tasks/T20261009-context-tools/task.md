---
id: T20261009-context-tools
status: ready
fr: [FR-TOOL-001, FR-TOOL-002, FR-TOOL-003, FR-TOOL-004]
ac: [AC-07]
specs: [specs/tools/spec.md]
created: 2026-10-09
---

# Context 工具：Files、Diff、Browser、Terminal

## 目标

在右侧边栏容器（[T20261009-project-shell](../T20261009-project-shell/task.md)）中实现四类工程工具（FR-TOOL-001～004；AC-07）。不在本轮（[T20261009-v1-foundation-slice](../T20261009-v1-foundation-slice/task.md)）范围内，先登记以保证拆分无遗漏。

## 范围

- 做：Files 目录树与“添加到对话”；Diff 的项目 / 本轮范围及不可用降级（FR-TOOL-002）；Browser（WebContentsView、地址栏、刷新、记忆上次地址）；Project 内轻量 Terminal Tabs（FR-TOOL-004）；轮次原生补丁的持久化与 Conversation 入口（04 第 1 节第 13 项）。
- 不做：完整 Source Control 工作台（[01. Product Definition](<../../docs/01. Product Definition.md>) 第 4 节非目标）。

## 依据

- 功能：[02. Functional Requirements](<../../docs/02. Functional Requirements.md>) 第 5 节。
- 界面：[03. UX Specification](<../../docs/03. UX Specification.md>) 第 5 节、D-08、D-13、P-B、P-C；[Shell Spec v02](../../design/components/shell-spec-v02.md) 第 6、9 节（组件修订 diff 待审阅）。
- 技术：[04. Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 3 节（xterm.js、node-pty、Monaco、Git CLI、WebContentsView）、第 5 节、第 1 节第 13 项。
- 验收：[05. Acceptance Criteria](<../../docs/05. Acceptance Criteria.md>) AC-07。
- 决定：[DEC-08、DEC-09](<../../docs/07. Decisions.md>)；2026-10-10 用户在参考 ChatGPT Desktop 的建议后回复“agree your advice, update doc”。[调研记录](research.md) 区分官方公开行为和待验证能力。

## 验收标准

- [ ] 用户可以分别打开 Files、Diff、Browser、Terminal；关闭后 Main Canvas 恢复空间；Agent 不自行打开这些工具（AC-07）。
- [ ] 按 AC-07 的补充标准验证项目 / 本轮 Diff 的范围、原生补丁保存、并行轮次隔离及不可用降级。
- [ ] 按 AC-07 的补充标准验证多 Terminal 实例运行、新建 / 切换 / 关闭、隐藏面板及 Session Stop 隔离。
- Files、Browser 及具体异常路径在实现前依据 spec 继续细化。

## 已确认事项

| 问题 | 回答（确认日期） |
|---|---|
| Git Staged / Unstaged 等高级能力是否进入 MVP | 按 FR-TOOL-002 的基础只读范围执行，取舍见 DEC-08（2026-10-10 确认） |
| 每轮修改文件的识别方式；非 Git 目录是否需要 Diff 基线 | 按 FR-TOOL-002 和 04 第 1 节第 13 项采用原生轮次记录；非 Git 不自建项目基线，能力验证见下节（2026-10-10 确认） |
| Terminal 是否支持多实例 | 按 FR-TOOL-004 采用 Project 内轻量 Terminal Tabs，取舍见 DEC-09（2026-10-10 确认） |

## 待验证与实施准备

- 按 04 第 1 节第 13 项验证 CLI 事件、覆盖范围、Claude Code 同等数据、非 Git 原生补丁与历史恢复；资料见 [research.md](research.md)。真实模型调用的授权和预算另行确定，本次仅更新文档。
- 创建 `specs/tools/spec.md`，细化 Files / Browser、Terminal 关闭及应用退出生命周期、轮次补丁存储和 Adapter 接口。现有 Adapter 实现任务不因此视为已覆盖本轮 Diff。
- 现有交互原型 v01 / v02 尚未覆盖本次工具行为；Shell Spec v02 diff 待审阅，v01 保留作历史依据。

## 执行记录

- 2026-10-10：依据本次对话确认更新 02～07、Session 的 Diff 依赖和设计索引；新增 Shell Spec v02，保留 v01。任务转为 `ready` 表示三项范围问题已答复，不代表已开始代码实现或通过验收。本次文档 diff 待人工审阅。
- 文档自查：检查本次 13 份文档的标题与表格，170 个本地链接（含锚点）和 55 张 Markdown 表格结构检查通过，`git diff --check` 通过；复核 FR-TOOL-002 / 004、AC-07 与进度引用的一致性。旧的单实例说明仅保留在历史 Shell Spec v01，原型仍明确标注未实现。未运行应用测试，未改动应用代码；这不是独立验收。
