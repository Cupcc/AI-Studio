# 执行计划：T20261009-project-shell

> 唯一写入者：本任务的主 Agent。Worker 不修改本文件，结果交回主 Agent 后由主 Agent 更新。

## 方案

先由 W1 起草 `specs/project/spec.md` 与 `specs/navigation/spec.md`，汇总未决问题交人回答；task 进入 ready 后由 W2 实现。W2 遵循 [D20261009-desktop-feature-folders](../../docs/decisions/D20261009-desktop-feature-folders.md)：拥有 `src/renderer/src/app/`、`tokens.css`，以及 `project`、`navigation` 两个功能目录；对 session 模块的依赖（注意力汇总、阻塞 Session 计数、停止当前一轮、Session History 列表、查看信号）以可替换接口占位，由 session-slice 接入。

## Workers

| ID | 职责 | 写入范围 | 产出 | 依赖 | 状态 |
|---|---|---|---|---|---|
| W1 | spec 草稿（Sonnet 5.5 high） | `specs/project/spec.md`、`specs/navigation/spec.md` | spec 草稿与未决问题 | — | done |

| W2 | 壳层实现（Opus 5.5 high） | `apps/desktop/src/renderer/src/app/**`、`apps/desktop/src/renderer/src/styles/tokens.css`、`apps/desktop/src/renderer/src/features/{project,navigation}/**`、`apps/desktop/src/{shared,main}/ipc/project.ts`、`apps/desktop/src/shared/project/**`、`apps/desktop/src/main/services/project/**`、`apps/desktop/src/main/menu/**`（新建）、project 迁移文件、`apps/desktop/e2e/project.spec.ts`；共享登记文件各加一行；`src/main/index.ts` 仅为菜单与窗口关闭 / 退出流程做最小改动；本 task 的 `evidence/W2-*` | 壳层实现与测试 | W1 | in_progress |
| W3 | 验收（Sonnet 5.5 xhigh） | 本 task 的 `acceptance.md`、`evidence/W3-*` | 验收记录 | W2 | todo |

## 进度与决定

- 2026-10-09 task 卡片为 draft，等待 spec 草稿。
- 2026-10-09 W1 完成并合并到 `dev/v1`：`specs/project/spec.md`（PROJ-Q1～Q17）、`specs/navigation/spec.md`（NAV-Q1～Q13）。阻塞项 PROJ-Q1～Q3；待与 session-slice 的问题合并后一并提交人回答。发现：Rename 在 FR-NAV-003（P0）与 02 第 6 节 MVP 表（P1）优先级不一致（NAV-Q4）。
- 2026-10-09 阻塞问题 PROJ-Q1～Q3 已回答；细化验收标准，task 转为 ready；启动 W2 实现。
