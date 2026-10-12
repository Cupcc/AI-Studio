# 验收：T20261012-worklines-integration

## 未覆盖与边界

- 本记录仅负责 Codex Running 中发送的 Adapter、SessionService、Renderer store 与 Composer 跨模块独立技术评审；不代表整条工作线集成已完成。
- 使用模拟 Provider / Codex JSON-RPC transport，不调用真实 CLI 或模型、不占用 Electron 窗口。实际 Electron 操作与截图由 Main Agent 验证；一般 Running 追加的真实兼容性及 Claude queue 路径继续由[原生能力对齐任务](../T20261011-native-cli-parity/task.md)跟踪。
- 人工产品验收沿用负责功能的任务记录；本次技术评审、提交或合并均不代表人工功能验收。

## AI 结论与运行环境

- 总体结论：不通过（初轮；R1、R2 等待实现者处理及独立复验）。
- 验收者：Review Agent `cli-review`；未参与实现，仅写本文件。
- 日期与基线：2026-10-12；起始 `0c86b4e`，初轮运行时 HEAD `1c41faa1812b35df68c7d9b01c2f03e2667efb5e` 加未提交的 Adapter、SessionService、Renderer store、Composer 和对应测试 diff。
- 环境：macOS arm64；源码模拟自动化检查，未启动实际桌面窗口。协议模拟使用仓库 Codex 0.161.0 生成类型；无真实 CLI 版本或账号验证。

## 验收结果

| 场景与来源 | 操作与预期 | 初轮实际结果 | 方式与证据 | 结论 |
|---|---|---|---|---|
| 正常 Running 追加；FR-INPUT-001、input I-Q3、Adapter §3.4 | 向同一活动回合 `turn/steer`，保持唯一 `turn/start` | Provider 测试通过，请求含原 threadId / expectedTurnId | 独立运行下述 Adapter 过滤测试；`provider.test.ts` 的 Running steer 场景 | 通过 |
| 错误传播与草稿；input §3 文本输入第 4 条、集成任务标准 | 原生拒绝到达 Renderer；保留草稿，不追加失败用户消息 | SessionService 和 Renderer 拒绝模拟通过 | 下述 desktop 过滤测试 | 通过 |
| 终态先于接收确认；session §3.3、input Running 中发送 | 已接收消息仍关联原 turn，不重放、不误报拒绝 | FakeProvider gate 通过，但 Codex JSON-RPC 独立场景返回 AbortError | R1 的独立内联 Node 复现与调用结果 | 不通过 |
| 接收期间编辑的草稿；input I-Q5、§4 持久化 | 发出后新草稿在内存与数据库均保留 | 不同文本的新草稿测试通过；相同文本的新编辑可能被内容等值比较删除 | R2 代码路径；待实现者回归与复验 | 不通过 |
| 启动、Stop、持久化及关联回归；session §3.12 | 保持已有取消、恢复和持久化隔离行为 | 相关过滤测试共 127 条通过；不能代替 R1 特殊 transport 顺序 | 下述两次独立测试运行 | 通过（受上述缺陷限制） |

独立执行的模拟测试命令和初轮结果：

```text
pnpm --filter @ai-studio/agent-adapter exec vitest run test/codex/provider.test.ts test/core/session-controller.test.ts
Test Files 2 passed (2); Tests 76 passed (76); Duration 1.29s

pnpm --filter @ai-studio/desktop exec vitest run src/main/services/session/session-service.test.ts src/main/services/session/session-ipc.test.ts src/renderer/src/features/session/session.test.tsx
Test Files 3 passed (3); Tests 51 passed (51); Duration 1.12s
```

## 缺陷与复验

### R1：已发出的 steering 等待被回合终态取消

- 独立复现：直接使用构建产物 `CodexProvider`、`FakeRuntime`、`ScriptedJsonRpcServer`；创建模拟 thread，开始并绑定原生 turn；`turn/steer` handler 先发同 turn 的成功 `turn/completed`，再返回 `{ turnId: expectedTurnId }`。
- 初轮结果：`{"result":{"rejected":"AbortError: This operation was aborted"},"state":"idle","requests":["initialize","initialized","thread/start","thread/backgroundTerminals/list","turn/start","turn/steer"]}`。
- 原因：`CodexDriver.steerTurn` 给 RPC 使用当前回合 signal；`SessionController.finalizeTurn` 在终态时 abort 该 signal，RPC 放弃已发出请求的回执。SessionService 随后不落用户消息，Renderer 保留已被原生接收的输入，重发会重复。
- 要求：发出后仍以有界 RPC 确认结果判定接收；补 Codex transport 的 completion / Stop 先于 acknowledgement 场景。FakeProvider 的 gate 不响应 abort，不能独自证明此链路。
- 初轮状态：已交回 Main Agent；待修复与独立复验。

### R2：内容相同的新草稿可能被后端删除

- 代码路径：发送 A 后，在 acknowledgement 前将草稿编辑为 B 再编辑回 A。Renderer 每次 `updateDraft` 创建新对象，因此成功后不会清空新 A；SessionService 仅比较数据库草稿内容与发出消息相同就 `clearComposer`，删除当前 A 的持久化记录。
- 影响：界面仍有 A，但重启后草稿丢失。不同文本的新草稿通过不能证明新编辑的身份受到保护。
- 要求：用可区分编辑的版本或快照保护持久化草稿，或由 Renderer 成功后的清空写入决定删除；追加相同内容再编辑回归。
- 初轮状态：已交回 Main Agent；待修复与独立复验。
