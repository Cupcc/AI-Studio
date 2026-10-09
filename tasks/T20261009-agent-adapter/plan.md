# 执行计划：T20261009-agent-adapter

> 唯一写入者：本任务的主 Agent。Worker 不修改本文件，结果交回主 Agent 后由主 Agent 更新。

## 方案

包位于 `packages/agent-adapter`，不依赖 Electron。W1 先定义 Provider 接口、统一事件模型和共享核心（事件分发、回合与 Stop 状态守卫、Runtime 进程管理、系统进程探测），并起草 spec；合并后 W2、W3 在各自目录并行实现两个 Provider，只使用 W1 的核心，不修改核心与接口文件——需要改动时报告主 Agent。provider 相关的 spec 内容由 W2、W3 在报告中提交，主 Agent 合入 spec。

## Workers

| ID | 职责 | 写入范围 | 产出 | 依赖 | 状态 |
|---|---|---|---|---|---|
| W1 | 接口、事件模型、核心、测试工具、spec 草稿（Opus 5.5 xhigh） | `packages/agent-adapter/**`（`src/codex/**`、`src/claude/**` 及对应测试目录除外）；`specs/agent-adapter/spec.md`；本 task 的 `research.md`、`evidence/W1-*` | 包脚手架与依赖、接口、核心、模拟传输工具、spec 草稿 | — | done |
| W2 | Codex Provider（Opus 5.5 xhigh） | `packages/agent-adapter/src/codex/**`、`packages/agent-adapter/test/codex/**`；本 task 的 `evidence/W2-*` | Provider、锁定版本的协议类型、单元与集成测试 | W1 | in_progress |
| W3 | Claude Provider（Opus 5.5 high） | `packages/agent-adapter/src/claude/**`、`packages/agent-adapter/test/claude/**`；本 task 的 `evidence/W3-*` | Provider、单元与集成测试 | W1 | in_progress |
| W4 | 验收（Sonnet 5.5 xhigh） | 本 task 的 `acceptance.md`、`evidence/W4-*` | 验收记录 | W2、W3 | todo |

## 进度与决定

- 2026-10-09 task 卡片就绪，状态 ready。
- 2026-10-09 W1 因限流中断后续跑完成，合并到 `dev/v1`（`e680c2e`）；`pnpm-lock.yaml` 冲突以 `pnpm install --lockfile-only` 重新生成。干净克隆复核：类型检查通过，单元测试 desktop 53/53、agent-adapter 101/101。
- 2026-10-09 W1 提出的问题 A-Q1～A-Q5（`specs/agent-adapter/spec.md` 第 5 节）按 2026-10-09 对话指示先按推荐实现、保持待确认：A-Q4（Codex 拒绝后交付文字的方式）由 W2 验证；A-Q5 按推荐加载全部 `settingSources` 并使用 `claude_code` 系统提示预设。与 session spec 第 4.1 节的不一致见 adapter spec 第 4.5 节，由 session-slice 实现时按 adapter 接口对齐。
- 2026-10-09 启动 W2（Codex）与 W3（Claude）。
