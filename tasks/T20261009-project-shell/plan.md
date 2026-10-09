# 执行计划：T20261009-project-shell

> 唯一写入者：本任务的主 Agent。Worker 不修改本文件，结果交回主 Agent 后由主 Agent 更新。

## 方案

先由 W1 起草 `specs/project/spec.md` 与 `specs/navigation/spec.md`，汇总未决问题交人回答；task 进入 ready 后由 W2 实现。W2 遵循 [D20261009-desktop-feature-folders](../../docs/decisions/D20261009-desktop-feature-folders.md)：拥有 `src/renderer/src/app/`、`tokens.css`，以及 `project`、`navigation` 两个功能目录；对 session 模块的依赖（注意力汇总、阻塞 Session 计数、停止当前一轮、Session History 列表、查看信号）以可替换接口占位，由 session-slice 接入。

## Workers

2026-10-09 接续分配覆盖下表尚未完成 worker 的历史模型：W2 使用 GPT-6.1 Sol xhigh，W3 使用 GPT-6.1 Sol high。W2 在原 worktree `.claude/worktrees/agent-a014c55195a9e9487` 继续，保留已有未提交 Project service、IPC、共享类型与迁移代码；写入范围沿用下表。

| ID | 职责 | 写入范围 | 产出 | 依赖 | 状态 |
|---|---|---|---|---|---|
| W1 | spec 草稿（Sonnet 5.5 high） | `specs/project/spec.md`、`specs/navigation/spec.md` | spec 草稿与未决问题 | — | done |

| W2 | 壳层实现（Opus 5.5 high） | `apps/desktop/src/renderer/src/app/**`、`apps/desktop/src/renderer/src/styles/tokens.css`、`apps/desktop/src/renderer/src/features/{project,navigation}/**`、`apps/desktop/src/{shared,main}/ipc/project.ts`、`apps/desktop/src/shared/project/**`、`apps/desktop/src/main/services/project/**`、`apps/desktop/src/main/menu/**`（新建）、project 迁移文件、`apps/desktop/e2e/project.spec.ts`；共享登记文件各加一行；`src/main/index.ts` 仅为菜单与窗口关闭 / 退出流程做最小改动；本 task 的 `evidence/W2-*` | 壳层实现与测试 | W1 | in_progress |
| W3 | 验收（Sonnet 5.5 xhigh） | 本 task 的 `acceptance.md`、`evidence/W3-*` | 验收记录 | W2 | todo |

## 进度与决定

接续独立验收：W3 由 GPT-6.1 Sol high 在 `.claude/worktrees/foundation-verification`（`codex/foundation-verification`）负责，仅写本 task 的 `acceptance.md` 与 `evidence/W3-*`；同时承担 agent-adapter W4 的独立验收，不改实现代码。

- 2026-10-09 task 卡片为 draft，等待 spec 草稿。
- 2026-10-09 W1 完成并合并到 `dev/v1`：`specs/project/spec.md`（PROJ-Q1～Q17）、`specs/navigation/spec.md`（NAV-Q1～Q13）。阻塞项 PROJ-Q1～Q3；待与 session-slice 的问题合并后一并提交人回答。发现：Rename 在 FR-NAV-003（P0）与 02 第 6 节 MVP 表（P1）优先级不一致（NAV-Q4）。
- 2026-10-09 阻塞问题 PROJ-Q1～Q3 已回答；细化验收标准，task 转为 ready；启动 W2 实现。
- 2026-10-09 Codex 团队接续 W2：先检查保留的未提交实现，再完成壳层与验证。Session 接口尽早报告主 Agent，供下一批 Session worker 对齐。用户限定 GPT-6 Astra 与 GPT-6.1 Sol 的 high / xhigh 配置（2026-10-09 对话确认）。
- 2026-10-09 W2 写入范围补充 `apps/desktop/e2e/app.spec.ts`：仅更新新增 project IPC / 壳层导致失效的骨架冒烟断言。Session 重复点击须发送 opened 信号，window focus 与 opened 分开（S-Q1 已确认）。
- 2026-10-09 W2 范围补充 `features/app-info/app-info.test.tsx` 中的 app-only mock 类型，以适配扩展后的 StudioApi；不扩展产品功能。启动页使用产品内容，骨架技术信息不再作为用户首页。
- 2026-10-09 W2 主进程 / 共享阶段提交 `598ab87` 已合并：Project 路径身份、持久化、共享状态规则、关闭 IPC、菜单与退出接口；worker 报告类型检查和 66 项单测通过。界面、既有测试适配和截图仍由 W2 后续提交；Session 后端可基于该接口开工。
- 2026-10-09 W2 界面阶段 `b64065e` 已由 `4ddc59e` 合并：worker 报告 74 项单测、9 项 Electron E2E 通过，两种模式三个宽度截图已落盘。开始独立 W3 验收；Session / 工具 / Preview 仍按范围留槽位。
