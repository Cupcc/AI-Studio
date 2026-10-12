---
id: T20261012-worklines-integration
status: verifying
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

- [x] 所有现存修改按目标提交，重复内容与合并冲突处理完毕，工作区干净（贡献指南第 3、5 节）。
- [x] Codex 运行中发送错误能传回 Renderer 并保留草稿，消息与原生回合关联；跨模块增量由独立 Review Agent 复核（FR-INPUT-001；[任务协议](../README.md#验收范围与独立性)）。
- [x] 最终基线完成文档检查、提交门禁、必要 Electron 回归与界面操作；设置任务已有免做项继续按 `T20261012-settings-theme` 的授权记录执行（随该工作线合入）。
- [ ] main 只快进合入、普通推送，检查远端 CI；合入 worktree 收尾，相关任务和证据更新（贡献指南第 5 节）。

## 执行记录

- 2026-10-12：核对本地分支、worktree、远端与规则；发现运行中发送采用 fire-and-forget 且吞掉异常，IPC 会提前返回并导致 Renderer 清空草稿。修正该集成问题后独立复核。

- 2026-10-13 用户续行授权：「commit all , 整理到main， clean all branches and worktrees」。main 上图标稿提交为 `ba7165f`；集成分支 rebase 到该 main，保留工程工具规格及已确认原则。main 已有 DEC-10（工程工具）与工作线 DEC-10（原生 CLI）冲突，未发布的后者改为 DEC-13 并修复全部引用；DEC-11、DEC-12 保持原编号。产品内容与确认范围不变，冲突解决 diff 待人工审阅。
- 2026-10-13 基础检查：文档新增链接问题 0（历史 4 项）；类型检查、脚本 36、Adapter 184、desktop 203 项测试通过。最终功能基线 `bdf4e80` 的独立评审所覆盖 10 个文件与 `19cb08b` 完全相同（`git diff` 无输出），沿用既有独立结论。完整 Electron 回归与 Main 界面操作正在执行；远端 CI、归档与清理完成后收尾。

- 2026-10-13 完整 Electron 回归 37 / 37 通过；Main 已完成模拟 Codex Running 成功追加、拒绝保留草稿及 Stop 界面操作，并查看三张截图。自检证据见 [acceptance.md](acceptance.md#main-agent-集成自检2026-10-13)。待推送、CI 与工作线清理。
