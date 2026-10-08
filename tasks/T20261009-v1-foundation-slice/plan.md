# 执行计划：T20261009-v1-foundation-slice

> 唯一写入者：本任务的主 Agent。Worker 不修改本文件，结果交回主 Agent 后由主 Agent 更新。

## 方案

- 分支：`main` 只放人审阅过的内容；`dev/v1` 为本轮集成分支；每个 worker 在独立 worktree 分支上提交，由主 Agent 合并到 `dev/v1`（2026-10-09 确认）。
- 波次：
  - Wave 1 并行：app-skeleton W1；agent-adapter W1（接口与核心）；project-view W1（调研）；project-shell W1、session-slice W1（spec 草稿）。
  - agent-adapter W1 合并后，并行启动 agent-adapter W2（Codex）与 W3（Claude）。
  - spec 草稿的未决问题由人回答后，project-shell 与 session-slice 进入实现（Wave 2）。
- 模型：仅限 Opus 5.5（xhigh / high）与 Sonnet 5.5（xhigh / high）（2026-10-09 确认）。协议、并发与状态机用 Opus xhigh；骨架与 spec 起草用 Opus high；调研与验收用 Sonnet xhigh；范围明确的文档整理用 Sonnet high。
- 根目录文件归属：`package.json`、`pnpm-workspace.yaml`、`tsconfig*.json`、`.gitignore`、`.npmrc` 由 app-skeleton W1 维护；其他 worker 不修改。`pnpm-lock.yaml` 冲突在合并时重新生成。`AGENTS.md` 由主 Agent 在合并时更新。
- 真实 CLI 调用：只在显式开启的集成测试中限量运行，测试目录在 `/tmp`（2026-10-09 确认）。

## Workers

各子 task 的 worker 详表见其 `plan.md`；此处只列总览。

| Task | Worker | 职责 | 模型 | 依赖 | 状态 |
|---|---|---|---|---|---|
| app-skeleton | W1 | 应用骨架 | Opus 5.5 high | — | in_progress |
| agent-adapter | W1 | 接口、事件模型、核心运行时、spec 草稿 | Opus 5.5 xhigh | — | in_progress |
| agent-adapter | W2 | Codex Provider | Opus 5.5 xhigh | agent-adapter W1 | todo |
| agent-adapter | W3 | Claude Provider | Opus 5.5 high | agent-adapter W1 | todo |
| project-view | W1 | 待决事项调研与决定草稿 | Sonnet 5.5 xhigh | — | in_progress |
| project-shell | W1 | `specs/project`、`specs/navigation` 草稿 | Sonnet 5.5 high | — | in_progress |
| session-slice | W1 | `specs/session`、`specs/chat`、`specs/input` 草稿 | Opus 5.5 high | — | in_progress |

## 进度与决定

- 2026-10-09 基线提交 `e17e295` 进入 `main`，创建 `dev/v1`；写入本轮拆分与各子 task 卡片。
- 2026-10-09 Wave 1 启动 5 个 worker，各自在 `.claude/worktrees/agent-*` 的独立 worktree 分支（`worktree-agent-*`）上工作，基于 `98490b2`。`.claude/worktrees/` 已加入本地 `.git/info/exclude`。合并后的验证在临时干净克隆中进行，避免主工作区的 `node_modules` 影响仍在运行的 worktree。
