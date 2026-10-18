# 调研与设计记录：CLI Adapter 接口与共享核心（W1）

> 写入者：W1。过程记录，不需要审阅；长期结论在 [specs/agent-adapter/spec.md](../../../specs/agent-adapter/spec.md)。日期 2026-10-09。

## 1. 依据与资料

- 文档：[CLI 校验报告](../../T20261008-cli-preflight/report.md) 第 3～6 节；04 第 2～5、7、1 节；02 Session、State、Input、Chat 各节；03 第 6 节；Shell Spec v01 第 6、7 节；session spec 第 5.1 节、input spec I-Q2 / I-Q3、chat spec C-Q5（并行起草，主 Agent 转达）。
- 预检脚本与证据：`scripts/cli-preflight.mjs`、`evidence/codex-native-stop-check.mjs` 及 `tasks/T20261008-cli-preflight/evidence/` 下筛选后的事件。
- 协议形状（不调用模型）：
  - `codex app-server generate-ts --experimental`（本机 0.161.0）生成到临时目录：根目录 102 个、`v2/` 781 个类型文件。查阅了 `ServerRequest`、`ServerNotification`、`ClientRequest`、`ThreadItem`、`Turn`、`TurnError` / `CodexErrorInfo`、`CommandExecutionRequestApprovalParams`、`ToolRequestUserInputParams`、`ServerRequestResolvedNotification`、`TurnStartParams`、`TurnSteerParams`、`ThreadSettingsUpdateParams`、`Model`、`GetAccountResponse`。
  - `@anthropic-ai/claude-agent-sdk@0.3.293` 的 `sdk.d.ts`：`Query`、`Options`、`CanUseTool`、`PermissionResult`、`SDKResultMessage`、`SDKUserMessage`、`SpawnOptions` / `SpawnedProcess`、`ModelInfo`、`AccountInfo`。
- 本机版本：Codex CLI 0.161.0；Claude Code CLI 2.1.295（预检时 2.1.294）；Node 26.10.0；pnpm 12.10.1。

## 2. 证据中对接口有影响的观察

| 观察 | 来源 | 对设计的影响 |
|---|---|---|
| Codex 中断后，被终止命令的 `item/completed`（`failed`，`exitCode -1`）在 `turn/completed interrupted` 之后、清理完成时才到达 | `codex-native-stop-events.jsonl` 第 82、87 行 | 必须处理“终态后的事件”；回合终态推迟到清理结束才发出，清理期间到达的条目完成事件仍属本回合，之后的才算迟到 |
| Codex 中断工具回合后，`commandExecution` 只有 `item/started` 没有 `item/completed` | `codex-tool-retry-events.jsonl` | 回合结束时由核心补发未完成条目的结束事件 |
| Codex 授权答复后出现 `serverRequest/resolved`；其类型 `ServerRequestResolvedNotification` 含 `threadId`、`requestId` | 多份 Codex 事件；生成的类型 | 作为“原生撤回 / 已解决”信号；核心对正在答复的请求忽略它 |
| Codex `requestApproval` 的 `availableDecisions` 有序且部分为对象（如带 execpolicy 修订） | 生成的类型 | 选项用不透明 `id`，原生答复值留在驱动中 |
| Codex `requestUserInput` 一次可含多个问题；每题 `isOther`、`isSecret`；答案为字符串数组 | 生成的类型 | 统一的提问模型支持多题、多选、自由文本、保密 |
| Codex 服务端请求的 JSON-RPC id 在不同 Runtime 中都从 0 开始递增 | 各次运行的事件中 `requestId: 0`、`1` | Runtime 重启后原生 id 会重复，统一层使用 Adapter 生成的 `requestId` |
| Claude 主动取消返回 `error_during_execution`、`is_error = true`；无效恢复同样返回 `error_during_execution`，文本为 “No conversation found with session ID …” | `claude-run-events.jsonl` 第 128、142 行 | 取消必须靠已记录的取消意图判断，不能看结果类型或文案；恢复失败可能只在首条消息时才知道 |
| Claude `session_id` 在首条消息后的 `system/init` 才出现 | [CLI 校验报告](../../T20261008-cli-preflight/report.md) 第 3 节；`claude-tool-events.jsonl` | 原生 ID 以事件异步报告 |
| Claude SDK `Options.sessionId` 可预先指定 UUID | `sdk.d.ts` | 可让 Claude 也提前知道 ID，但该 ID 在首条消息被处理前不存在于原生历史，接口仍按“可能异步”设计 |
| Claude `result.subtype = success` 也可能 `is_error = true`（API 错误） | `sdk.d.ts` 注释 | 06 的“success 且 is_error=false 才算完成”规则成立，提醒 W3 |
| Claude SDK `spawnClaudeCodeProcess` 只需要一个 ChildProcess 形状的对象 | `SpawnedProcess` 类型 | `RuntimeProcess.processLike()` 让 Claude Runtime 同样处于独立进程组并纳入退出验证 |

## 3. 主要设计决定与备选

### 3.1 组合：共享控制器 + Provider 驱动

- 采用：`SessionController` 实现对外的 `AgentSession`，拥有回合状态、Stop 编排、等待请求登记、事件发出；Provider 只提供 `SessionDriver`（与 CLI 通信）并通过 `SessionSink` 报告原生活动。
- 备选一：每个 Provider 各自实现 `AgentSession`，只共用工具函数。否决：取消关联、迟到事件、提交暂停、兜底等规则要在两处各写一遍，W2 / W3 又不能改核心，不一致的风险最高。
- 备选二：抽象基类 + 模板方法。可行，但继承让 Provider 可以覆盖不该覆盖的行为，测试也需要子类；组合方式可以用 `ScriptedDriver` 直接测试全部分支。

### 3.2 命令只返回“已受理”，结果走事件

`sendUserInput` 在提交前同步发出 `turn.started` 后即返回；CLI 侧的失败只以 `turn.completed(failed)` 报告。备选是等待 CLI 回执再返回、失败时抛错，但那样会出现“抛错 + 失败事件”两条通道，上层容易重复处理。

### 3.3 Stop 完成 = 终态 + 清理

`turn.completed(interrupted)` 在清理（或兜底）结束后才发出，`stop()` 的 Promise 同时完成。备选是收到原生 `interrupted` 就发终态、另发“清理完成”事件；否决原因：04 第 5 节第 1、5 条要求两者同时确认才算 Stop 完成，且上层只需关心一个事件（`stop.cleanup` 已给出清理结果），提交暂停也正好覆盖到清理结束。

### 3.4 取消关联靠意图，竞态以原生成功为准

记录取消意图之后到达的原生 `failed` / `interrupted` 一律视为 `interrupted`；若原生先以成功结束，则报告 `completed` 并跳过清理，避免终止正常完成的回合留下的后台命令（例如 Agent 有意启动的开发服务器）。与 session spec 第 3.12 节第 7 条一致。

### 3.5 一个 `AgentSession` 对应一个 Runtime 生命周期

Runtime 意外退出即关闭该 Session，继续对话统一走 `resumeSession`（应用重启、错误后再次发送、S-Q2 重试共用这一条路径，`ensureSession` 封装）。Stop 兜底是例外：它是 Stop 流程内部的一步，在同一 Session 对象内经 `RuntimeSlot.replace()` 完成，上层无需更换句柄。备选是 Session 在下一次发送时自动恢复；否决原因：恢复失败时的报告位置不清楚，且会把“恢复”藏进发送调用里。

### 3.6 新旧 Runtime 不并行

`RuntimeSlot` 串行化启动 / 替换；替换前必须拿到旧 Runtime 的退出证据（`TerminationReport.confirmed`），否则拒绝并不启动新进程。对应 04 第 5 节第 7 条。

### 3.7 进程退出证据

- `ps -axww -o pid=,ppid=,pgid=,stat=,lstart=,args=`，固定 C locale，异步执行，避免阻塞 Electron 主进程。
- 身份 = pid + 启动时间，按身份确认存活与发信号，防止进程号复用误杀。僵尸进程视为已退出。
- 终止前先拍后代快照：Runtime 退出后其后代会被重新挂到 launchd，之后无法再按父子关系找到；Codex 的命令进程可能在独立会话中（单元测试中用 `detached` 的 `sleep` 模拟），组信号到不了，只能按快照逐个处理。
- 实测：测试中“忽略 SIGTERM 的 Runtime + 独立会话中的 sleep”被升级为 SIGKILL 并确认退出；两个 Runtime 中一个被 SIGKILL 后另一个继续工作。

### 3.8 JSON-RPC 对等端

- 默认不写 `jsonrpc` 字段（Codex App Server 的消息格式，预检脚本同样如此），可配置。
- 服务端请求登记到答复为止，重复答复报错；没有任何处理器时自动回 -32601，避免 CLI 永久等待。
- 超时与中止会删除挂起项；之后到达的响应作为“迟到响应”回调；传输关闭时全部挂起请求以错误结束。

### 3.9 事件发出

- 不可重入的有序分发：监听器中触发的事件排队，保证所有监听器看到相同顺序；监听器异常被隔离（默认转为进程警告），不会破坏状态机或影响其他 Session。
- 首个订阅者之前的事件缓存并补发，避免创建过程中报告的原生 ID 丢失。只补发给第一个订阅者，`LiveSessions` 因此不通过订阅而通过 `closed` Promise 跟踪 Session。

### 3.10 输入框回复（I-Q2，2026-10-09 确认）

`replyWithText(text)` 的集合由 Adapter 决定（当前回合全部未答复请求），规则按 I-Q2 写在核心中，Provider 只实现“拒绝并附说明且把文字交给 Agent”的原生部分（`declineInputsWithText`）。可答复判定 `acceptsFreeTextAnswer` 只对“单题且接受自由文本的提问”成立；授权请求的拒绝说明不算“答案”。

### 3.11 可用性检测

四项分别检查，汇总由共享函数计算，保证两个 Provider 的“未安装 / 未登录 / 版本不受支持”判定一致。登录检查只报告状态与粗粒度方式，不保留邮箱等身份字段（Codex `account/read` 与 Claude `accountInfo()` 都含邮箱）。

### 3.12 依赖版本

- `typescript@7.0.2`、`vitest@5.0.3` 为查询时的最新稳定版；`@types/node` 选 22 系列最新（22.20.5）而非 26 系列，用类型检查守住 Node 22 基线。
- SDK 的对等依赖（zod 4、`@anthropic-ai/sdk`、`@modelcontextprotocol/sdk`）由 pnpm 自动安装并锁定在根 `pnpm-lock.yaml`。

## 4. 发现与风险

1. SDK 以可选依赖安装平台专用的 Claude Code 二进制（`@anthropic-ai/claude-agent-sdk-darwin-arm64`，下载约 103 MB、解压约 236 MB），而产品使用本机 CLI（`pathToClaudeCodeExecutable`）。打包时应排除，或在根 pnpm 配置中处理（根配置不在 W1 范围）。
2. 本机 Claude Code 已自动更新到 2.1.295，与预检记录不同；版本策略见 spec A-Q1。
3. Runtime 以独立进程组启动（为了能整组终止且不波及宿主），代价是宿主崩溃时它们不会收到挂断信号；见 spec A-Q3。
4. `withTimeout` 在超时时必须先拒绝再中止，否则“收到中止信号后正常结束”的工作会赢得竞争、掩盖超时（单元测试发现并修正）。
5. 预检脚本中 Codex 的 `approvalsReviewer: 'user'`、只读沙箱、`developerInstructions` 以及 Claude 的空 `settingSources` 都是校验用设置，不能照搬为产品默认（spec 第 3.10 节）。

## 5. 留给 W2 / W3 与后续的验证

- W2：`terminate` 的本轮归属映射（`commandExecution.processId`）、实验接口不可用时的兜底、I-Q2 拒绝后交付文字的方式、错误码映射、`thread/name/updated` 是否可作原生标题、stdin 关闭后 App Server 及其命令是否退出。
- W3：`systemPrompt` 缺省行为、`origin: { kind: 'human' }`、无会话的模型目录读取、`canUseTool` 中 AskUserQuestion 的答复格式与 deny 说明、取消时 `canUseTool` 挂起 Promise 的释放、`interrupt()` 后子进程退出证据、stdin 关闭后 CLI 是否退出。
- 两者：同 Session 模型切换（[CLI 校验报告](../../T20261008-cli-preflight/report.md) 第 6 节）、授权接受 / 取消等待请求 / 多请求竞态（[CLI 校验报告](../../T20261008-cli-preflight/report.md) 第 6 节）、认证 / 网络 / 配额失败映射。
