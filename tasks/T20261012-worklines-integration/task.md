---
id: T20261012-worklines-integration
status: in_progress
fr: [FR-INPUT-001, FR-SET-001, FR-SET-002]
ac: [AC-02, AC-08]
specs: [specs/input/spec.md, specs/agent-adapter/spec.md, specs/settings/spec.md]
created: 2026-10-12
---

# 工作线整理、提交与合入

## 目标与授权

用户 2026-10-12 对话要求「整理工作，提交所有工作线，并合并到main」。按 [贡献指南](../../CONTRIBUTING.md)整理现存工作、验证、提交、快进合入并推送；不把提交或合入记为人工功能验收。

## 工作线与恢复

- 主 checkout 起始基线 `0c86b4e`；未提交工作以 stash `38e41cdb3b48a8674f7e30cc25cd96685d7fe675` 保留，并在 `chore/worklines-integration` 的独立 worktree 恢复。
- 主 checkout：CLI 能力与职责文档、Project View 已有人工结论回写、Codex 运行中发送增量、v04 原型与证据。
- `feat/settings-theme`：设置、外观、规格与验收记录；重复 v04 原型保留同一份，任务确认记录采用该 worktree 的较新内容。
- `chore/test-workflow`、`docs/system-architecture`、`feat/project-view` 已在 main，不重复合入。
- 待完成的原生 CLI 补验、在线原型发布、规格提案及人工功能验收仍由原任务跟踪；本任务不扩展这些交付范围。

## 验收标准

- [ ] 所有现存修改按目标提交，重复内容与合并冲突处理完毕，工作区干净（贡献指南第 3、5 节）。
- [ ] Codex 运行中发送错误能传回 Renderer 并保留草稿，消息与原生回合关联；跨模块增量由独立 Review Agent 复核（FR-INPUT-001；[任务协议](../README.md#验收范围与独立性)）。
- [ ] 最终基线完成文档检查、提交门禁、必要 Electron 回归与界面操作；设置任务已有免做项继续按 `T20261012-settings-theme` 的授权记录执行（随该工作线合入）。
- [ ] main 只快进合入、普通推送，检查远端 CI；合入 worktree 收尾，相关任务和证据更新（贡献指南第 5 节）。

## 执行记录

- 2026-10-12：核对本地分支、worktree、远端与规则；发现运行中发送采用 fire-and-forget 且吞掉异常，IPC 会提前返回并导致 Renderer 清空草稿。修正该集成问题后独立复核。
