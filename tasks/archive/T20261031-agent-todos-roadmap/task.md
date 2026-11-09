---
id: T20261031-agent-todos-roadmap
status: done
fr: [FR-TODO-001, FR-TODO-002, FR-TODO-003, FR-TODO-004, FR-TODO-005, FR-TODO-006, FR-TODO-007, FR-TODO-008, FR-TODO-009]
ac: []
specs: [specs/agent-todos/spec.md]
created: 2026-10-31
---

# Agent To-dos 分阶段建设规划

## 目标

依据用户 2026-10-31 的确认，将 Codeg To-dos 的完整能力作为 AI Developer Studio 的后续建设方向，包括跨 Project 总收件箱、任务队列、隔离 Worktree、审阅与合并、自动处理、计划执行和仓库协作；不把这些后续能力回填为已经交付的 V1 功能。

## 范围

- 做：把产品边界、功能需求、交互方向、技术架构输入、模块 spec、验收入口和路线图同步为一份分阶段规划。
- 做：保留当前 V1 的 Codex 发布基线，同时为 To-dos 预留独立数据模型、运行时服务和跨 Project 注意力聚合。
- 不做：本轮实现 Electron 代码、数据库迁移、Worktree / Merge 运行时或自动调度；不修改 V1 既有 AC 结论。

## 依据

- 用户 2026-10-31 确认“所有的都借鉴，跨project的总收件箱也做”。
- [产品定义第 4 节](../../../docs/01.%20Product%20Definition.md)保留历史 V1 边界，To-dos 相关能力由 [DEC-26](<../../../docs/07. Decisions.md#dec-26-agent-to-dos-完整借鉴与分阶段建设>)纳入增量规划；未指定版本 / 日期，不把 Jira 全产品纳入。
- [Codeg To-dos 文档](https://docs.codeg.app/guide/tasks)的任务状态、隔离 checkout、review gate、follow-up、preflight、merge queue、自动处理和任务设置。
- [Codeg Architecture](https://docs.codeg.app/reference/architecture)的共享核心、ACP、桌面 / 服务端边界仅作为参考；本项目继续使用 Electron + React + TypeScript。

## 验收标准

- [x] 形成完整能力清单，并区分 V1 现状与增量提案（用户 2026-10-31 指令；DEC-26）。
- [x] 路线图包含依赖明确的阶段 0～6、每阶段交付物和退出条件，不承诺固定日期（用户同日要求分阶段建设规划）。
- [x] `FR-TODO-001`～`FR-TODO-009` 覆盖全部参考能力和跨 Project 总收件箱（DEC-26；02 §8）。
- [x] UX、技术要求、模块 spec、决定记录与路线图相互链接，新增 AC-TODO-01～06 草案与矩阵；V1 AC-01～AC-08 不被追溯改写（05 §1 / §3.1 / §5）。
- [x] 完成最终 Markdown 链接、标题、表格和 diff 复核；本轮不运行应用或真实 CLI 验收（文档索引一致性要求及 Task Protocol）。

## 已确认事项

| 问题 | 回答（确认日期） |
|---|---|
| 是否只借鉴轻量队列，还是完整借鉴 Codeg To-dos 能力？ | 完整借鉴，并包含跨 Project 总收件箱（2026-10-31）。 |

阶段顺序、默认值和版本号不是用户逐项确认的内容；当前交付是规划草案。未来行为未决项的决策方与阻塞阶段统一见 [spec §1.1](../../../specs/agent-todos/spec.md#11-未决问题)，不阻塞本次规划交付，也不重问完整能力是否纳入。

## 收尾

- 基线 `a0619fe`，工作树开始干净；Main Agent 编写 / 自检，非独立评审。本轮是普通文档规划，无代码、数据库迁移或运行时变更，不按功能交付申请验收。
- 变更涉及 `docs/`、`specs/` 和 `tasks/`，按各目录规则仍待人工审阅 diff；文档审阅不等同于功能验收。
- 已核对：产品定义第 3～4 节、功能需求第 6～8 节、UX 信息架构 / Project 注意力、技术要求事项 8 / 分层边界、V1 验收原则与 FR↔AC 矩阵、路线图下一步 / 整体概况 / 模块状态 / 阶段计划 / 验收进度、specs 索引与本任务。
- 更新 Project / Session spec 中当前无全局列表的表述，链接新增聚合模块；按 To-do / Task / Inbox / Worktree / 合入 / 自动化和 FR / DEC 编号搜索关联内容。旧范围任务、历史 AC 证据、08 架构快照和设计原型保留原基线，不把规划回填为历史实现；普通工具只读 Diff、模型配额和发布限制不变。
- 2026-10-31 自检：归档后 `pnpm check:docs` 0 新增问题，4 项历史问题未新增；`git diff --check` 通过，旧任务路径搜索无遗留；以 remark / GFM 解析并文本预览修改文档的标题与关键表格，14 份 Markdown 的结构检查及 9 项 FR / 6 项新增 AC 映射无错误。提交门禁另行复核暂存快照。
- Main Agent 于 2026-10-31 按草案交付完成条件收尾并归档；产品范围已经对话确认，阶段细化 diff 仍待审阅，不等于功能已实现 / 已验收，也不授权后续开工。10-31 当轮仅在 `task/1` 留存；用户于 11-09 明确授权全部整合到 main 并清理分支，进度见 [11-09 集成记录](../T20261109-main-integration/task.md)。规划交付不变，不据此启动实现。
