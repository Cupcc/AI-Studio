# 执行计划：T20261009-project-shell

> 唯一写入者：本任务的主 Agent。Worker 不修改本文件，结果交回主 Agent 后由主 Agent 更新。

## 方案

先由 W1 起草 `specs/project/spec.md` 与 `specs/navigation/spec.md`，汇总未决问题交人回答；task 进入 ready 后再规划实现 worker。

## Workers

| ID | 职责 | 写入范围 | 产出 | 依赖 | 状态 |
|---|---|---|---|---|---|
| W1 | spec 草稿（Sonnet 5.5 high） | `specs/project/spec.md`、`specs/navigation/spec.md` | spec 草稿与未决问题 | — | done |

## 进度与决定

- 2026-10-09 task 卡片为 draft，等待 spec 草稿。
- 2026-10-09 W1 完成并合并到 `dev/v1`：`specs/project/spec.md`（PROJ-Q1～Q17）、`specs/navigation/spec.md`（NAV-Q1～Q13）。阻塞项 PROJ-Q1～Q3；待与 session-slice 的问题合并后一并提交人回答。发现：Rename 在 FR-NAV-003（P0）与 02 第 6 节 MVP 表（P1）优先级不一致（NAV-Q4）。
