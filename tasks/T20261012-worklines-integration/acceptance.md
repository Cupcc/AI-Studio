# 验收：T20261012-worklines-integration

## 未覆盖与边界

- 本记录仅负责 Codex Running 中发送的 Adapter、SessionService、Renderer store 与 Composer 跨模块独立技术评审；不代表整条工作线集成已完成。
- 使用模拟 Provider / Codex JSON-RPC transport，不调用真实 CLI 或模型、不占用 Electron 窗口。实际 Electron 操作与截图由 Main Agent 验证；一般 Running 追加的真实兼容性及 Claude queue 路径继续由[原生能力对齐任务](../T20261011-native-cli-parity/task.md)跟踪。
- 人工产品验收沿用负责功能的任务记录；本次技术评审、提交或合并均不代表人工功能验收。

## AI 结论与运行环境

- 总体结论：通过（限定本次跨模块技术评审范围；初轮 R1、R2 已由 Main Agent 修复，并由本验收者独立复验）。
- 验收者：Review Agent `cli-review`；未参与实现，仅写本文件。
- 日期与基线：2026-10-12；最终代码基线 `19cb08ba2987d7c08df0c1d0e2733dc0e3e46d63`（`19cb08b`）。起始 `0c86b4e`，初轮运行时 HEAD `1c41faa1812b35df68c7d9b01c2f03e2667efb5e`；复验运行时 HEAD `c8ebb5c9610358bc46bbc5f756b042d37faac23a` 加受评审文件未提交 diff。提交后独立核对相对 `0c86b4e` 的以下 diff 指纹未变，复验结果适用于最终代码基线。
- 最终评审 diff 指纹：以下 10 个文件相对 `0c86b4e` 的 `git diff` SHA-256 为 `7007840f9cf9ae3853d666e6c4c12f77c130b55d869845282a47e2aecd93a44a`：`packages/agent-adapter/src/provider.ts`、`src/codex/driver.ts`、`src/codex/provider.ts`、`test/codex/provider.test.ts`；`apps/desktop/src/main/services/session/session-service.ts`、`session-service.test.ts`、`e2e-providers.ts`；`src/renderer/src/features/session/store.ts`、`session.test.tsx`、`src/renderer/src/features/input/Composer.tsx`。提交或 rebase 后内容相同可沿用本结果；内容变化须复核受影响部分。
- 环境：macOS arm64；源码模拟自动化检查，未启动实际桌面窗口。协议模拟使用仓库 Codex 0.161.0 生成类型；无真实 CLI 版本或账号验证。

## 验收结果

| 场景与来源 | 操作与预期 | 最终实际结果 | 方式与证据 | 结论 |
|---|---|---|---|---|
| 正常 Running 追加；FR-INPUT-001、input I-Q3、Adapter §3.4 | 向同一活动回合 `turn/steer`，保持唯一 `turn/start` | Provider 测试通过，请求含原 threadId / expectedTurnId | 独立运行下述 Adapter 过滤测试；`provider.test.ts` 的 Running steer 场景 | 通过 |
| 错误传播与草稿；input §3 文本输入第 4 条、集成任务标准 | 原生拒绝到达 Renderer；保留草稿，不追加失败用户消息 | SessionService 和 Renderer 拒绝模拟通过 | 下述 desktop 过滤测试 | 通过 |
| 终态先于接收确认；session §3.3、input Running 中发送 | 已接收消息仍关联原 turn，不重放、不误报拒绝 | Codex transport 的 completed / 实际 session.stop 先于回执测试均通过；独立内联 Node 完成竞态也返回原 turn 的 accepted | R1 复验与下述 Adapter 测试 | 通过 |
| 接收期间编辑的草稿；input I-Q5、§4 持久化 | 发出后新草稿在内存与数据库均保留 | 不同文本 gate 测试通过；独立运行 A→B→A 后，数据库保留新 A；Renderer 仍按对象身份保护新编辑 | R2 独立内存 SQLite / SessionService 场景及最终代码检查 | 通过 |
| 启动、失败、Stop、持久化及关联回归；session §3.12 | 原生 ID 未绑定时等待；启动失败不得发 steer；保持取消、恢复和持久化隔离 | 独立内联启动场景通过；相关过滤测试最终共 129 条通过 | 下述独立测试与场景结果 | 通过 |
| 桌面全量模拟 E2E 回归；集成任务标准、AC-02～AC-06 的现有覆盖 | 构建后的实际 Electron 运行既有自动化流程 | Main Agent 报告全 E2E 28 条通过 | Main Agent 2026-10-12 执行结果；非本 Review Agent 独立运行，也不替代本轮界面操作与截图 | 通过（Main 自检证据） |

独立执行的模拟测试命令和最终结果（初轮为 Adapter 76、desktop 51）：

```text
pnpm --filter @ai-studio/agent-adapter exec vitest run test/codex/provider.test.ts test/core/session-controller.test.ts
Test Files 2 passed (2); Tests 78 passed (78); Duration 1.37s

pnpm --filter @ai-studio/desktop exec vitest run src/main/services/session/session-service.test.ts src/main/services/session/session-ipc.test.ts src/renderer/src/features/session/session.test.tsx
Test Files 3 passed (3); Tests 51 passed (51); Duration 1.10s
```

复验额外独立执行的源码 / 构建产物模拟场景（内联 Node 命令，无新增测试源文件）：

```text
native-binding-pending: first.turnId == result.accepted.turnId; state=running; starts=1; steers=1
start-failure: rejected="JsonRpcRemoteError: start rejected"; state=idle; starts=1; steers=0
completed-before-ack: first.turnId == result.accepted.turnId; state=idle; starts=1; steers=1
R2 A to B to A before ack: persistedDraft="A"; userMessages=["start","A"]
git diff --check: exit 0
```

## 缺陷与复验

### R1：已发出的 steering 等待被回合终态取消

- 独立复现：直接使用构建产物 `CodexProvider`、`FakeRuntime`、`ScriptedJsonRpcServer`；创建模拟 thread，开始并绑定原生 turn；`turn/steer` handler 先发同 turn 的成功 `turn/completed`，再返回 `{ turnId: expectedTurnId }`。
- 初轮结果：`{"result":{"rejected":"AbortError: This operation was aborted"},"state":"idle","requests":["initialize","initialized","thread/start","thread/backgroundTerminals/list","turn/start","turn/steer"]}`。
- 原因：`CodexDriver.steerTurn` 给 RPC 使用当前回合 signal；`SessionController.finalizeTurn` 在终态时 abort 该 signal，RPC 放弃已发出请求的回执。SessionService 随后不落用户消息，Renderer 保留已被原生接收的输入，重发会重复。
- 要求：发出后仍以有界 RPC 确认结果判定接收；补 Codex transport 的 completion / Stop 先于 acknowledgement 场景。FakeProvider 的 gate 不响应 abort，不能独自证明此链路。
- 修复：Main Agent 在 RPC 发出前检查回合 signal；发出后的 steering RPC 使用连接的 `requestMs` 超时 / 连接关闭生命周期，不随回合终态 abort。
- 独立复验：上述 Adapter 78 条测试包括 `completed` 和真正执行 `session.stop()` 的 `stopped` 先于 acknowledgement 两例；额外重跑原独立 transport 复现，得到同一应用 turn 的 accepted，唯一 `turn/start` / `turn/steer`，状态 idle。已解决。

### R2：内容相同的新草稿可能被后端删除

- 代码路径：发送 A 后，在 acknowledgement 前将草稿编辑为 B 再编辑回 A。Renderer 每次 `updateDraft` 创建新对象，因此成功后不会清空新 A；SessionService 仅比较数据库草稿内容与发出消息相同就 `clearComposer`，删除当前 A 的持久化记录。
- 影响：界面仍有 A，但重启后草稿丢失。不同文本的新草稿通过不能证明新编辑的身份受到保护。
- 要求：用可区分编辑的版本或快照保护持久化草稿，或由 Renderer 成功后的清空写入决定删除；追加相同内容再编辑回归。
- 修复：Main Agent 移除主进程按内容等值清除草稿；由 Renderer 在 exact submitted snapshot 未被编辑时清空，并持久化其变更。
- 独立复验：使用 Vite 加载实际源码，内存 SQLite、模拟 FakeProvider gate、实际 SessionService；发出 A 后按顺序 `saveDraft(B)`、`saveDraft(A)` 再放行 acknowledgement。实际 `persistedDraft=A`，用户消息只有 `start` 与已接收 A；最终代码中无按值删稿路径，Renderer 对象身份保护仍保留。已解决。
