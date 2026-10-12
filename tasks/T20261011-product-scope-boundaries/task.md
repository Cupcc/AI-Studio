---
id: T20261011-product-scope-boundaries
status: verifying
fr: [FR-SESSION-003, FR-INPUT-001, FR-VIEW-003, FR-TOOL-002]
ac: [AC-03, AC-06, AC-07]
specs: [specs/session/spec.md, specs/agent-adapter/spec.md]
created: 2026-10-11
---

# 客户端职责与产品范围文档对齐

## 目标与依据

落实用户在文档范围审查后回复「accept all,update docs」（2026-10-11 确认）的五项结论。决定入口见 [DEC-11](<../../docs/07. Decisions.md#dec-11-客户端职责与范围澄清>)；产品边界以 [01](<../../docs/01. Product Definition.md>)、[02](<../../docs/02. Functional Requirements.md>)、[04](<../../docs/04. Technical Requirements.md>) 为准。

## 范围

- 做：明确冲突检测非目标；收紧异常退出清理保证；区分 Worktree 管理与 Git Diff；修正 Diff 归因概述和知识生成触发主体；同步规格、验收边界、架构说明及历史资料注释。
- 不做：改代码、缩减原生 CLI 能力、删除 Stop / Runtime 管理、修改已有实现验收结论，或新增模型调用。
- 本轮为已确认结论的文档回写，在当前 main 的既有文档上做局部增量；工作区含其他未提交变更，不同步、切分支或提交混合改动。

## 验收标准

- [x] 冲突检测不再作为现行待实现事项，历史假设明确失效；编号保留。（用户确认；01 第 4 节；FR-SESSION-003）
- [x] 正常退出、异常退出与进程归属边界一致；既有 Stop 退出证据要求不取消。（用户确认；04 第 5 节；05 第 4 节）
- [x] Worktree 非目标、Diff 两种范围与用户触发知识生成一致，下游仅引用负责规则。（FR-TOOL-002、FR-VIEW-003；AC-03、AC-06、AC-07）
- [x] 本地链接无新增回归；检查修改处表格、标题、HTML 文案与 FR / AC 一致性，保留其他工作区改动。

## 收尾

- 主 Agent 自检；本轮仅回写已确认范围，不涉及代码、接口或进程机制变更，不构成功能验收。
- 开始基线：`0c86b4e` 加既有未提交变更；检查仅评价本轮增量。
- 产品结论已由对话确认；本次文档 diff 仍待人审阅，不据此补记功能已验收。
- 2026-10-11 文档自检完成：`pnpm check:docs` 为 0 个新增问题、4 个基线问题保持或已移除；`git diff --check` 通过。用 Markdown AST 检查修改处标题与表格列数，并预览对应文本；HTML 内联脚本语法解析通过，未改样式、DOM 结构或运行逻辑，未运行产品 UI / 真实 CLI 验收。
- 逐项对照编辑前内容复核本轮 11 份既有文档增量，加本任务共 12 份文档；搜索旧表述仅命中已加更正注释的历史调研。FR / AC 编号和追踪矩阵不变，03 UX、现行 v02 组件与 Project View spec 已符合边界，无需重复改写。
- 文档回写已交付，状态保留 `verifying` 等待负责目录要求的人类 diff 审阅；未提交、未推送，未改应用代码或既有验收证据。
