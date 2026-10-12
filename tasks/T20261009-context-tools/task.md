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
- 界面：[03. UX Specification](<../../docs/03. UX Specification.md>) 第 5 节、D-08、D-13、P-B、P-C；[Shell Spec v02](../../design/components/shell-spec-v02.md) 第 6、9 节（已确认，2026-10-11，见其文档信息）。
- 技术：[04. Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 3 节（xterm.js、node-pty、Monaco、Git CLI、WebContentsView）、第 5 节、第 1 节第 13 项。
- 验收：[05. Acceptance Criteria](<../../docs/05. Acceptance Criteria.md>) AC-07。
- 决定：[DEC-08、DEC-09](<../../docs/07. Decisions.md>)；2026-10-10 用户在参考 ChatGPT Desktop 的建议后回复“agree your advice, update doc”。[调研记录](research.md) 区分官方公开行为和待验证能力。
- 本轮实现原则：[DEC-10](<../../docs/07. Decisions.md#dec-10-工程工具实现原则>)；用户 2026-10-12 对话「accept above suggetions, update all related docs」。[工具规格草稿](../../specs/tools/spec.md) 承接已确认原则、技术细节与未决范围。

## 验收标准

- [ ] 用户可以分别打开 Files、Diff、Browser、Terminal；关闭后 Main Canvas 恢复空间；Agent 不自行打开这些工具（AC-07）。
- [ ] 按 AC-07 的补充标准验证项目 / 本轮 Diff 的范围、原生补丁保存、并行轮次隔离及不可用降级。
- [ ] 按 AC-07 的补充标准验证多 Terminal 实例运行、新建 / 切换 / 关闭、隐藏面板及 Session Stop 隔离。
- [ ] 按 AC-07 的 2026-10-12 补充标准验证 Files 按需加载、文件刷新 / 上下文分离、Browser 本地页面和隔离、历史 patch 显示、终端重新附着与输出恢复；场景见 [工具规格 §5](../../specs/tools/spec.md#5-验证与实施边界)。

## 已确认事项

| 问题 | 回答（确认日期） |
|---|---|
| Git Staged / Unstaged 等高级能力是否进入 MVP | 按 FR-TOOL-002 的基础只读范围执行，取舍见 DEC-08（2026-10-10 确认） |
| 每轮修改文件的识别方式；非 Git 目录是否需要 Diff 基线 | 按 FR-TOOL-002 和 04 第 1 节第 13 项采用原生轮次记录；非 Git 不自建项目基线，能力验证见下节（2026-10-10 确认） |
| Terminal 是否支持多实例 | 按 FR-TOOL-004 采用 Project 内轻量 Terminal Tabs，取舍见 DEC-09（2026-10-10 确认） |
| 关闭仍在运行进程的 Terminal Tab 时是否确认？ | 按 [工具规格 TOOLS-Q4](../../specs/tools/spec.md#12-已确认原则)；依据原型 v03 Q4（2026-10-11 确认） |
| 关闭最后一个 Terminal Tab 后显示什么？ | 按 [工具规格 TOOLS-Q4](../../specs/tools/spec.md#12-已确认原则)；依据原型 v03 Q5（2026-10-11 确认） |
| 本轮调研建议是否采用？ | 按 DEC-10 与工具规格 TOOLS-Q2、Q3；用户回复「accept above suggetions, update all related docs」（2026-10-12 确认） |

## 待验证与实施准备

- 按 04 第 1 节第 13 项验证 CLI 事件、覆盖范围、Claude Code 同等数据、非 Git 原生补丁与历史恢复；资料见 [research.md](research.md)。真实模型调用的授权和预算另行确定，本次仅更新文档。
- 工具规格草稿已创建；工具代码、轮次补丁存储与 Adapter 接口仍待实现和验证。Browser 扩展的人工未决项集中在 TOOLS-Q1，不阻塞 localhost 原有范围；现有 Adapter 任务不因此视为覆盖本轮 Diff。
- 交互原型 v01 / v02 尚未覆盖本次工具行为；[v03](../../design/prototypes/README.md#studio-灰度交互原型-v03)（探索中，[T20261011-prototype-v03](../T20261011-prototype-v03/task.md)）已做出项目 / 本轮 Diff 与 Terminal Tabs 供评审。Shell Spec v02 已确认（2026-10-11），v01 保留作历史依据。

## 执行记录

- 2026-10-12：依据本轮确认补充四工具调研、起草工具规格，更新 FR / UX / 技术要求 / AC / 决策 / 路线图 / 架构入口及模块依赖。仅执行文档更新，任务保持 `ready`；工具内容未实现，AC-07 未通过。新规格整体仍为草稿，确认原则与未决问题分别登记，本次 diff 待审阅。
- 本轮文档自查（Main Agent，2026-10-12）：在 `docs/context-tools` worktree、基线 `0c86b4e` 上检查 18 份 Markdown 的 384 个标题与 101 张表格，表格列数一致；架构 HTML 脚本语法及 26 组依据链接目标有效；`git diff --check` 与 `pnpm check:docs` 通过（0 新增、4 个基线问题保持原状）。通过 agent-browser 实际打开 HTML、点击 Diff / Browser / Terminal 节点，检查规格入口和未实现状态，并查看 Diff 详情截图；无页面脚本错误。这是文档自查，不是独立评审或应用功能验收；没有修改应用源码或发送模型请求。
- 提交门禁：HTML 文档按现有 scope 规则触发完整基础检查；Adapter 构建、全 workspace 类型检查及 395 项脚本 / 单元测试通过（36 + 181 + 178）。这些回归结果不替代未实施的工具功能验收。

- 2026-10-10：依据本次对话确认更新 02～07、Session 的 Diff 依赖和设计索引；新增 Shell Spec v02，保留 v01。任务转为 `ready` 表示三项范围问题已答复，不代表已开始代码实现或通过验收。本次文档 diff 待人工审阅。
- 文档自查：检查本次 13 份文档的标题与表格，170 个本地链接（含锚点）和 55 张 Markdown 表格结构检查通过，`git diff --check` 通过；复核 FR-TOOL-002 / 004、AC-07 与进度引用的一致性。旧的单实例说明仅保留在历史 Shell Spec v01，原型仍明确标注未实现。未运行应用测试，未改动应用代码；这不是独立验收。
