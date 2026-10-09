# 执行计划：T20261009-agent-adapter

> 唯一写入者：本任务的主 Agent。Worker 不修改本文件，结果交回主 Agent 后由主 Agent 更新。

## 方案

包位于 `packages/agent-adapter`，不依赖 Electron。W1 先定义 Provider 接口、统一事件模型和共享核心（事件分发、回合与 Stop 状态守卫、Runtime 进程管理、系统进程探测），并起草 spec；合并后 W2、W3 在各自目录并行实现两个 Provider，只使用 W1 的核心，不修改核心与接口文件——需要改动时报告主 Agent。provider 相关的 spec 内容由 W2、W3 在报告中提交，主 Agent 合入 spec。

## Workers

2026-10-09 接续分配覆盖下表尚未完成 worker 的历史模型：W2 使用 GPT-6 Astra xhigh，W3 使用 GPT-6 Astra high，W4 使用 GPT-6.1 Sol high。W2 写入 worktree `.claude/worktrees/codex-provider-resume`，W3 写入 `.claude/worktrees/claude-provider-resume`；原有目录写入范围不变，共享核心变更先报告主 Agent。

| ID | 职责 | 写入范围 | 产出 | 依赖 | 状态 |
|---|---|---|---|---|---|
| W1 | 接口、事件模型、核心、测试工具、spec 草稿（Opus 5.5 xhigh） | `packages/agent-adapter/**`（`src/codex/**`、`src/claude/**` 及对应测试目录除外）；`specs/agent-adapter/spec.md`；本 task 的 `research.md`、`evidence/W1-*` | 包脚手架与依赖、接口、核心、模拟传输工具、spec 草稿 | — | done |
| W2 | Codex Provider（GPT-6 Astra xhigh） | `packages/agent-adapter/src/codex/**`、`packages/agent-adapter/test/codex/**`；本 task 的 `evidence/W2-*` | Provider、锁定版本的协议类型、单元与集成测试 | W1 | delivered |
| W3 | Claude Provider（GPT-6 Astra high） | `packages/agent-adapter/src/claude/**`、`packages/agent-adapter/test/claude/**`；本 task 的 `evidence/W3-*` | Provider、单元与集成测试 | W1 | delivered |
| W4 | 验收（GPT-6.1 Sol high） | 本 task 的 `acceptance.md`、`evidence/W4-*` | 验收记录 | W2、W3 | in_progress |

## 进度与决定

接续独立验收：W4 由 GPT-6.1 Sol high 在 `.claude/worktrees/foundation-verification`（`codex/foundation-verification`）负责，仅写本 task 的 `acceptance.md` 与 `evidence/W4-*`；同时承担 project-shell W3 的独立验收。共享 `JsonRpcPeer.dismissIncoming` 集成修复由主 Agent 写入 `src/core/json-rpc.ts`、`test/core/json-rpc.test.ts` 及 Codex 原生撤回调用处。

- 2026-10-09 task 卡片就绪，状态 ready。
- 2026-10-09 W1 因限流中断后续跑完成，合并到 `dev/v1`（`e680c2e`）；`pnpm-lock.yaml` 冲突以 `pnpm install --lockfile-only` 重新生成。干净克隆复核：类型检查通过，单元测试 desktop 53/53、agent-adapter 101/101。
- 2026-10-09 W1 提出的问题 A-Q1～A-Q5（`specs/agent-adapter/spec.md` 第 5 节）按 2026-10-09 对话指示先按推荐实现、保持待确认：A-Q4（Codex 拒绝后交付文字的方式）由 W2 验证；A-Q5 按推荐加载全部 `settingSources` 并使用 `claude_code` 系统提示预设。与 session spec 第 4.1 节的不一致见 adapter spec 第 4.5 节，由 session-slice 实现时按 adapter 接口对齐。
- 2026-10-09 启动 W2（Codex）与 W3（Claude）。
- 2026-10-09 Codex 团队接续：原 Provider worker 无落盘实现，W2 / W3 从 `385adf0` 创建独立分支，按上述范围重新启动。用户限定 GPT-6 Astra 与 GPT-6.1 Sol 的 high / xhigh 配置（2026-10-09 对话确认）。
- 2026-10-09 W2 / W3 已交付并分别合并于 `0176250` / `b04db17`；转独立验收。Codex 6 个真实 Astra high 回合验证流式、原 ID 恢复、同轮文字拒绝；精确 Stop 修正只有系统 fixture 证据，不能宣称真实复测通过。Claude 27 个模拟测试通过，真实成功回合受配额阻断。真实边界保留在各 worker 证据中。
- 2026-10-09 主 Agent 补齐 `JsonRpcPeer.dismissIncoming(id)` 与 Codex `serverRequest/resolved` 接线：不向原生发送多余响应，释放对应待处理请求，并令既有回调失效；数值 / 字符串 ID、并发请求与 ID 复用有回归测试。相关 38 项测试及 Adapter typecheck 通过，交 W4 独立复核。
