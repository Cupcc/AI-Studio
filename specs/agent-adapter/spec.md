# CLI Adapter

## 文档信息

| 项目 | 内容 |
|---|---|
| 模块 | `agent-adapter`（代码：`packages/agent-adapter`） |
| 文档状态 | 草稿 |
| 覆盖需求 | 无 FR 前缀（[specs/README.md](../README.md) 第 5 节）；为 FR-CHAT-002、FR-CHAT-003、FR-SESSION-002、FR-SESSION-003、FR-STATE-001～003、FR-STATE-007、FR-INPUT-001、FR-INPUT-002 提供 CLI 侧能力 |
| 相关验收 | AC-02、AC-03、AC-05 的 Adapter 部分；[05. Acceptance Criteria](<../../docs/05. Acceptance Criteria.md>) 第 4 节 CLI Adapter 状态映射与 Stop 专项 |
| 相关设计 | [Shell Spec v01](../../design/components/shell-spec-v01.md) 第 6、7 节（工具活动行、轮次完成行、Needs Input 卡片、Error 卡片、Send / Stop） |
| 来源 | [04. Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 1～5、7 节；[CLI Integration Preflight](../../tasks/T20261008-cli-preflight/report.md) 第 3～6 节；[01. Product Definition](<../../docs/01. Product Definition.md>) 第 8 节原则 19、20；任务 [T20261009-agent-adapter](../../tasks/T20261009-agent-adapter/task.md)；input spec I-Q2、session spec S-Q2（2026-10-09 确认） |
| 设计记录 | [research.md](../../tasks/T20261009-agent-adapter/research.md) |

> 本文的类型名、方法名与 `packages/agent-adapter/src` 一致；字段的完整定义以代码为准，本文只写行为规则与约束。第 3.11、3.12 节记录已实现的 Provider 行为，并分别列明模拟测试与真实 CLI 验证的边界。

## 1. 未决问题

2026-10-11 按 [01 第 8 节原则 24](<../../docs/01. Product Definition.md#8-已确认的产品原则>) 处理以下遗留项。产品原则已确认，参数、协议和进程方案由 AI 负责；不再以这些技术问题阻塞原生功能接入。仍未完成的代码与验证见[对齐任务](../../tasks/T20261011-native-cli-parity/task.md)。本次 diff 待审阅，历史验收结论保留。

### 1.1 已确认的产品要求

| 编号 | 问题 | 处理与确认依据 |
|---|---|---|
| A-Q1 | 未验证版本是否禁用？ | 不能仅因版本不在已验证集合内额外禁用原生可用能力；标明验证边界。已知不兼容属于技术限制，按第 1.2 节处理。依据原则 24（2026-10-11 确认）；同步 chat C-Q5 |
| A-Q2 | 是否支持运行中发送？ | 支持各 CLI 原生允许的行为，保留当前回合追加与后续回合排队的差异；不统一报告 `none` 作为产品策略。依据原则 24 与 input I-Q3（2026-10-11 确认） |
| A-Q5 | 原生配置加载是否由产品裁剪？ | 对齐原生 CLI 的 Rule / Skill / Context、配置来源与系统预设，不注入产品默认来替代原生行为。依据原则 24（2026-10-11 确认）；具体 SDK 配置与验证由第 1.2 节负责 |

### 1.2 技术决定与待验证

| 编号 | AI 技术决定 | 状态与证据 |
|---|---|---|
| A-Q1 | 保留 `tested` / `untested` / `unsupported` 分类；只在证据表明会话集成不可用时禁用 Provider，单项接口缺失按功能报告并适配。协议版本与生成类型固定作基线，实际 CLI 版本另行记录；按第 3.6 节处理 Stop 接口失败 | 主 Agent，2026-10-11；现有版本标记不能代表该版本全部功能通过，尤其精确 Stop 仍缺真实证据 |
| A-Q2 | 扩展能力、提交结果与事件模型以区分 steer / queue，保留消息与原生回合关联；排队不能伪造成当前回合追加 | 主 Agent，2026-10-11；待实现及真实验证，当前接口与实现缺口见第 3.4、5.5 节 |
| A-Q3 | 对客户端启动的 Runtime 建立归属记录（宿主实例身份、PID、启动时间、进程组、Session），启动时确认原宿主已失效且进程身份仍匹配后清理；活跃其他实例、共享 MCP、用户终端不得清理。无法确认归属或退出则保留诊断，不声明零残留 | 主 Agent，2026-10-11；依据现有 Runtime 隔离责任（04 第 5 节、本文第 3.9 节）与本次遗留问题处理要求。待实现及崩溃／脱离进程验证；不标成人工确认异常清理已通过 |
| A-Q4 | I-Q2 先 `turn/steer` 回执，再拒绝原请求，失败保留原请求 | 2026-10-09 已验证，见第 3.11 节；保持历史技术结论 |
| A-Q5 | 以 CLI 原生加载结果为准核对 user / project / local 配置和 `claude_code` 预设；SDK 参数若未达到同等行为则修正，不能只凭缺省参数名称认定等价 | 主 Agent，2026-10-11；现有实现见第 3.12 节，真实 Rule / Skill 仍待授权预算补验 |

## 2. 职责与边界

- 负责：
  - 把 Codex App Server（stdio JSON-RPC）与 Claude Agent SDK Streaming Input 两条已验证路径统一为一套 Provider 接口和事件模型（[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 3 节）；架构上允许注册更多 CLI（04 第 7 节“可扩展性”）。
  - 可用性检测：可执行文件、版本、登录状态、模型目录分开报告（[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 5 节末条）。
  - 每个活动 Session 一个独立 Runtime 进程；进程启动、退出检测、终止与退出证明（04 第 3、5、7 节）。
  - 回合生命周期、等待输入、Stop、错误归一、模型切换的 CLI 侧规则（[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 5 节；04 第 5 节第 1～7 条）。
  - 默认不覆盖 CLI 自身的模型、权限、Rule、Skill、Context 配置；覆盖项只作为可选参数（01 第 8 节原则 19、20；04 第 4 节）。
- 不负责（由 Session Manager 等上层负责，见 [specs/session/spec.md](../session/spec.md)）：
  - 产品注意力状态：Running / Needs Input / Error / Completed Unread / 无状态的显示与清除，“正在查看”判定，Project 注意力汇总。
  - Session 排序、标题生成与 Rename、对话记录与 Session 元数据的持久化（SQLite）。原生会话 ID 由本模块以事件报告，持久化由上层负责。
  - IPC、UI、“Worked for … · Done”的文案与格式（本模块只提供时长）。
  - 文件变更归因与 Diff（04 第 1 节第 13 项；显示与持久化见 [tools spec](../tools/spec.md#fr-tool-002-diff)）、Project View Context 注入（04 第 1 节第 10 项）。后续原生补丁接缝须保留 Thread / Turn 与完成状态，区分聚合更新和缺失能力；不以工作区前后差集伪造原生记录。DEC-10（2026-10-12 确认）不表示这些事件已接入或真实覆盖已验证。
  - Error 卡片“重试”的编排（S-Q2）：本模块只保证“恢复后再发送”是一条干净路径（第 3.3 节）。

## 3. 行为细则

### 3.1 包与运行环境

1. 独立 workspace 包 `@ai-studio/agent-adapter`，ESM + 严格 TypeScript，不引用 Electron；在 Electron 主进程的 Node 中运行，以 Node 22 为 API 基线（`@types/node` 22 用于类型检查）。
2. 依赖精确锁定：`@anthropic-ai/claude-agent-sdk` 为 [CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 2 节验证过的 `0.3.293`。
3. 入口：`.`（接口与核心）、`./codex`（`CodexProvider`）、`./claude`（`ClaudeProvider` / `createClaudeProvider`）、`./testing`（测试工具）。根入口不加载 Claude SDK。
4. 测试：`test` 只跑单元测试，不启动真实 CLI、不调用模型；`test:integration` 只有设置 `AI_STUDIO_REAL_CLI=1` 时运行真实 CLI 套件，否则跳过（任务 task.md 范围，2026-10-09 确认）。真实测试项目目录在系统临时目录下创建（`createScratchProject`），不在仓库内（`tasks/README.md` 证据规则）。
5. 环境：本模块从不隐式读取 `process.env`。宿主传入 `ProviderEnvironment.env`（桌面应用解析出的登录 Shell 环境，[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 6 节；app-skeleton task）及可选的显式可执行文件路径。

### 3.2 Provider 接口与可用性检测

1. 每个 CLI 实现一个 `AgentProvider`，经 `ProviderRegistry` 按 `id` 注册。V1 的 id：`codex`、`claude-code`（`BUILT_IN_PROVIDER_IDS`，即 04 第 6 节 `cli_type` 的取值）。
2. `checkAvailability()` 分别报告四项，每项为 `ok` / `failed` / `skipped`：
   - 可执行文件：显式路径优先，否则在传入的 PATH 中查找；
   - 版本：`--version` 解析结果及兼容性 `tested` / `untested` / `unsupported`；
   - 登录：`logged_in` / `logged_out` / `unknown`，只报告状态与粗粒度方式，不含邮箱、组织等身份信息；
   - 模型目录：可选（`includeModels`），可能需要启动短时 Runtime。
3. 汇总状态由共享函数 `deriveAvailabilityStatus` 统一计算：可执行文件失败 → `not_installed`；版本 `unsupported` → `unsupported_version`；未登录 → `not_logged_in`；版本或登录检查出错 → `error`；否则 `available`。模型目录失败不阻断可用，单独报告。`reason` 给出说明，供 UX 第 6 节 New Chat 第 4 项禁用菜单时显示原因；`unsupported_version` 的证据要求见 chat spec C-Q5 与本文 A-Q1，未验证不得据此禁用。
4. “可用”只表示四项检查结果，不保证下一次真实调用成功（[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 5 节末条）。
5. `listModels()`（Provider 级，草稿阶段可用）不得创建或持久化原生会话。Claude 的做法见第 3.12 节。

### 3.3 Session 生命周期：创建、恢复、原生 ID

1. `createSession()` 启动独立 Runtime 并创建新的原生会话；返回时即可发送。`resumeSession({ nativeSessionId })` 启动独立 Runtime 并恢复指定原生会话。
2. 原生 ID 以事件 `session.native_id` 报告，上层收到后立即持久化：Codex 创建 Thread 时即可得到（`capabilities.nativeSessionIdTiming = on_create`），Claude 在首条消息触发 `system/init` 后才出现（`after_first_input`；[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 3 节）。在第一个订阅者出现前发出的事件会缓存并补发给它，因此创建期间报告的 ID 不会丢失。
3. 原生 ID 一经确定不可改变：之后再收到不同的 ID（包括恢复后 CLI 报告了另一个 ID）时，按 `resume_failed` 关闭该 Session，当前回合以失败结束；绝不在另一个原生会话中继续（04 第 5 节第 7 条；[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 5 节）。
4. 恢复失败必须明确报告：能立即判断的，`resumeSession` 以 `resume_failed` 拒绝；只能在首条消息时发现的（[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 4 节：Claude 无效 ID 返回错误结果），该回合以 `failed` + `resume_failed` 结束，Session 关闭。任何情况下都不回退为新建原生会话。
5. Session 关闭（`state = closed`，事件 `session.closed`）后不可再用。原因：`disposed`、`runtime_exited`、`resume_failed`、`stop_failed`、`fatal_error`。继续该对话的唯一途径是 `resumeSession`。
6. 错误后的继续与“重试”（FR-STATE-003；S-Q2，2026-10-09 确认）：上层调用 `ensureSession(provider, 当前句柄, { nativeSessionId, … })` 得到可用 Session——仍可用则复用；已关闭且有原生 ID 则恢复（失败时拒绝，不新建）；没有原生 ID 时才新建（对应 session spec S-Q4，待确认）。随后由上层用 `sendUserInput` 重新发送失败那一轮的用户消息。本模块从不自动重发输入，也不重跑已取消的命令（04 第 5 节第 7 条）。
7. `AgentProvider.dispose()` 是关机操作：停止该 Provider 全部活动 Session 的当前一轮、清理受管 Runtime 并核对退出结果，失败时保留诊断；`ProviderRegistry.shutdownAll()` 对所有 Provider 执行（session spec 第 3.14 节第 3 条）。职责遵循 [04 第 5 节](<../../docs/04. Technical Requirements.md#退出与异常清理责任边界>)；返回值不证明零残留（第 3.6 节第 9 条）。宿主异常退出后的归属检查与清理见 A-Q3（2026-10-11 确认，DEC-11）。

### 3.4 回合与事件（FR-STATE-001、FR-STATE-007）

1. `sendUserInput()` 在调用 CLI 之前同步发出 `turn.started`（携带 Adapter 生成的 `turnId`），不等待首个文本片段或 CLI 回执（FR-STATE-001；[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 5 节 Running 行）。该方法只对前置条件失败抛错（`invalid_state`、`invalid_argument`、`unsupported`）；CLI 侧失败一律以 `turn.completed`（`failed`）报告，避免双通道。
2. 目标行为按 A-Q2 / input I-Q3：运行中提交保留原生当前回合追加或后续回合排队语义，分别关联消息与回合；排队接受不等于新回合已经开始。当前代码已建模 `none` / `steer` / `queue`，Codex 报告并接入 `steer`，Claude 仍报告 `none`，其排队路径是待补齐的实现缺口。`none` 只有在原生确不支持或有证据的版本／协议限制下才可作为能力结论，不能代替实现。
3. 文本：`item.delta`（`channel = text`）为增量，按 `itemId` 累加；`item.completed` 携带完整正文，替换（而非追加）已累加的文本，因此正文不重复（[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 5 节文本追加行）。原生完成事件不带全文时，由核心用已累加文本补齐。
4. 工具活动：命令、文件修改、工具调用等以 `item.started / updated / completed` 报告，`activity.verb` 取 `read / edit / run / search / list / fetch / tool / agent / other`，`label` 为单行摘要，供“Read / Edit / Run”活动行使用（Shell Spec 第 6 节）。上层可归为 Read（read、list、search）、Edit、Run 与其他。
5. 终态：每个回合恰好一次 `turn.completed`，`outcome` 为 `completed` / `interrupted` / `failed`；只有 `completed` 是成功终态（[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 5 节正常完成行）。`durationMs` 为提交到终态的墙钟时长（单调时钟），包含等待用户答复的时间，供“Worked for …”（FR-STATE-007；S-Q10 建议一致）；`nativeDurationMs`、`model` 在 CLI 提供时附带。
6. 回合结束时仍未完成的条目由核心补发 `item.completed`（状态随回合结果：`completed` / `interrupted` / `failed`，正文取已累加文本），未答复的等待请求补发 `input.resolved`（`cancelled`，原因 `turn_ended`）。
7. 迟到事件：终态之后到达、属于已结束回合的事件一律丢弃，只发 `diagnostic`（`late_event`），不改变状态、不复活回合（04 第 5 节；05 第 4 节 Stop 专项）。实测中 Codex 在 `turn/completed interrupted` 之后才发出被终止命令的 `item/completed`，属于此类（证据见 research.md）。
8. 事件信封：每个事件带 `seq`（Session 内单调递增）、`at`、`providerId`、`sessionId`（Adapter 内的 Session 句柄，不是原生 ID）；回合内事件另带 `turnId`。上层据此丢弃不属于当前回合的事件（session spec E14）。

### 3.5 等待输入（FR-STATE-002；I-Q2）

1. 授权与提问统一为 `input.requested`：`kind = approval`（命令、文件修改、工具、权限、网络）或 `kind = question`（一个请求可含多个问题，每题有选项、是否多选、是否接受自由文本、是否保密）。携带 Adapter 生成的 `requestId`（原生 ID 在 Runtime 重启后会重复，不能直接使用）、原生提示文本与按原生顺序排列的原生选项（[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 5 节 Needs Input 行）。
2. 多个请求可同时存在，各自独立答复（`respondToInput(requestId, response)`）。核心校验：请求仍待答复、答复类型与请求匹配、选项与问题存在、单选不多选、仅在允许时接受自由文本、所有问题均有答案。同一请求的并发第二次答复以 `invalid_state` 拒绝；驱动写入失败时请求恢复为待答复。
3. 解除：用户答复后发出 `input.resolved`（`answered`，含答复，保密问题的文字以 `[secret]` 代替）；CLI 自行撤回（如 Codex `serverRequest/resolved`）发出 `cancelled` / `native_resolved`；回合结束、Stop、Runtime 退出、dispose 分别以 `turn_ended`、`turn_stopping`、`runtime_exited`、`disposed` 取消。仅查看不解除（FR-STATE-002）。
4. 输入框回复 `replyWithText(text)`（I-Q2，2026-10-09 确认）作用于当前回合全部未答复请求：
   - 恰好一个未答复请求，且原生可以把文字作为答案（`acceptsFreeTextAnswer`：只含一个问题且该问题接受自由文本的提问）→ 文字作为该请求的答案，`input.resolved` 为 `answered` 且 `viaText = true`；
   - 其他情况 → 所有未答复请求被拒绝并以该文字为说明，Agent 收到文字后继续当前回合；`input.resolved` 为 `declined_with_text`。驱动方法 `declineInputsWithText` 负责原生实现：Claude 用 `canUseTool` 的 deny 说明；Codex 先取得当前回合 `turn/steer` 的接收回执，再拒绝请求（第 3.11 节、A-Q4）。
   - 没有未答复请求时以 `invalid_state` 拒绝，上层改用 `sendUserInput`。
   - 静态能力 `capabilities.freeTextAnswers`（questions / approvals）供输入区预判；逐个请求以 `acceptsFreeTextAnswer` 为准。
5. 回合已结束、Stop 进行中或 Session 关闭时到达的新请求不予接受（sink 返回 `undefined`），驱动须立即在原生侧拒绝 / 取消，避免 CLI 一直等待。

### 3.6 Stop 流程（04 第 5 节第 1～7 条；[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 5 节）

`stop()` 幂等：同一回合的重复调用返回同一个 Promise；没有活动回合时返回 `not_running`。返回的 Promise 在回合终态与资源清理都确定后才完成。

| 阶段 | 行为 | 依据 |
|---|---|---|
| requested | 先记录取消意图，Session 进入 `stopping`，暂停新提交；该回合全部未答复请求立即以 `turn_stopping` 取消 | 第 1 条 |
| interrupting | 若原生提交仍在进行，先等它结束（有限等待）；再调用驱动 `interruptTurn`（同时由驱动按协议顺序释放被取消的原生请求） | 第 1 条 |
| awaiting_terminal | 有限等待原生终态；不以收到 `interrupted` 视为清理完成 | 第 1、5 条 |
| cleaning_up | 原生终态之后调用驱动 `cleanupAfterInterrupt`：精确终止本轮命令，并以系统进程退出作为证据；返回 `confirmed` / `not_required` / `unsupported` / `failed` 及清理范围 `turn` / `thread` / `runtime` | 第 2～5 条 |
| recovering | 中断失败、终态超时、清理失败 / 超时 / 不可用、或 Stop 期间 Runtime 退出时，调用驱动 `recoverRuntime`：终止该 Session 的独立 Runtime 并取得退出证据，再以原原生 ID、cwd 与配置恢复；不重发被取消的输入 | 第 6、7 条 |
| completed / failed | 发出唯一的 `turn.completed`，`stop` 字段给出清理结果 | 第 5 条 |

结果映射：

1. 原生终态为 `interrupted` 或错误类型（Claude 取消时返回 `error_during_execution`、`is_error = true`）→ `outcome = interrupted`，不带 `error`；原生诊断保留在 `stop.nativeDiagnostic`。判断依据是已记录的取消意图，不依赖错误文案（[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 5 节主动取消行）。
2. 取消意图记录后原生仍以成功结束（竞态）→ `outcome = completed`，`stopRequested = true`，`StopResult.status = already_completed`，不执行清理（不终止该回合正常完成后留下的后台命令）；与 session spec 第 3.12 节第 7 条一致。
3. 清理确认或无需清理 → `stopped`；兜底恢复成功 → `stopped`，`stop.cleanup = runtime_restarted`，`recovery.mayHaveStoppedEarlierBackgroundCommands = true`（04 第 5 节第 6 条：兜底不承诺保留先前回合的后台服务）。
4. 清理失败且兜底不可用或失败 → 回合仍以 `interrupted` 结束，`stop.cleanup = failed`；另发 `session.error`（`stop_cleanup_failed` 或 `resume_failed`），Session 以 `stop_failed` 关闭，`StopResult.status = failed`。上层据 `stop.cleanup = failed` 或 `session.error` 显示 Error（session spec 第 3.12 节第 5 条、E8）。
5. 兜底只允许在旧 Runtime 的退出得到确认之后启动新 Runtime：`RuntimeSlot.replace()` 在旧 Runtime 未确认退出时直接拒绝（`stop_cleanup_failed`），不并行启动新旧 Runtime（第 7 条）。
6. Stop 期间 Runtime 意外退出视为该回合的终态（`interrupted`），进入兜底恢复；Provider 不支持兜底时 Session 以 `runtime_exited` 关闭，回合仍不报错。
7. 任何 Stop、清理或兜底只作用于本 Session 的 Runtime 及其后代进程，不触及其他 Session、Project 或用户 Terminal（第 7 条；FR-SESSION-003）。
8. `dispose()` 对活动回合先执行 Stop（有限等待），超时则强制以 `interrupted`（`stop.cleanup = failed`）结束该回合，再终止 Runtime。
9. 2026-10-09 实现复查边界：`dispose(): Promise<void>` 为不抛错的释放接口，driver 清理错误或超时会转成 diagnostic；调用返回不能单独作为操作系统确认所有进程退出的证明。精确 Stop 的退出证据来自 `StopResult` 与进程身份检查；空闲 Runtime 释放和异常宿主退出的保证仍需后续真实验证。各 phase 的超时相加不等于整个应用固定时限，见 [W4 生命周期复查](../../tasks/T20261009-session-slice/evidence/W4-lifecycle-review.md)。

### 3.7 错误与终态（FR-STATE-003；[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 5 节）

1. 归一错误码：`not_installed`、`unsupported_version`、`auth_required`、`spawn_failed`、`resume_failed`、`runtime_crashed`、`protocol_error`、`network_error`、`quota_exceeded`、`provider_error`、`timeout`、`stop_cleanup_failed`、`invalid_state`、`invalid_argument`、`unsupported`、`disposed`、`unknown`。认证、网络、配额三类对应 [CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 6 节尚未注入真实故障的项目，由 W2、W3 按原生错误映射并补测。
2. 每个错误保留原生诊断 `native`（来源、原生代码、原生文本、结构化细节），供 Error 卡片“查看详情”（UX 第 6 节；Shell Spec 第 6 节）。界面显示的诊断不做脱敏；写入证据文件前使用 `redactSecrets` / `redactDeep`（`tasks/README.md` 证据规则）。
3. 回合内 Runtime 意外退出：`runtime.exited`（`duringTurn = true`）→ 回合 `failed`（`runtime_crashed`，附退出码、信号、stderr 尾部）→ 未答复请求以 `runtime_exited` 取消 → Session 关闭。无回合时退出：`duringTurn = false`，不产生回合事件，Session 关闭；是否显示 Error 由上层决定（session spec S-Q5）。
4. 驱动可报告不中断 Session 的错误（`session.error`），或不可恢复错误（`fatal`：当前回合失败、Session 关闭；若 Stop 进行中，回合仍以 `interrupted` 结束）。

### 3.8 模型（FR-INPUT-002；FR-CHAT-003）

1. `setModel(model | null)` 对之后的回合生效，`null` 表示回到 CLI 默认；成功后发出 `model.changed`。不提供逐回合覆盖参数：Codex `turn/start` 的 `model` 本身对后续回合持续有效，Claude 通过 `Query.setModel` 切换，两者统一为“下一轮生效”。
2. Session 的模型选择由上层持久化（04 第 6 节 `Session.model`），恢复时经 `overrides.model` 传回；未选择时不传，沿用 CLI 自身配置。
3. Session 级 `listModels()` 复用该 Session 的 Runtime；Provider 级见第 3.2 节第 5 条。CLI 固定（FR-CHAT-003）：一个 Session 只属于创建它的 Provider，接口中不存在跨 Provider 切换。

### 3.9 并发与隔离（FR-SESSION-003；04 第 3、5、7 节）

1. 首阶段每个活动 Session 一个独立 Runtime（`RuntimeProcess`），以新进程组（`detached`）启动；组终止只作用于该 Runtime。
2. 终止流程：先记录后代进程快照（Runtime 退出后后代会被重新挂到 launchd，之后无法再按父子关系找回）→ 向进程组发 SIGTERM → 宽限期后对仍存活的组成员与快照中的后代按身份（pid + 启动时间）发 SIGKILL → 以系统进程列表确认全部退出。只有确认后才算 `confirmed`。按身份发信号，进程号被复用时不会误杀。
3. 一个 Session 的崩溃、Stop 或兜底不影响其他 Session：每个 Session 有独立的控制器、事件流和 Runtime；事件监听器抛出的异常被隔离，不会破坏状态机；stdio 管道错误（如崩溃后的 EPIPE）在 Runtime 内部吸收，不会成为宿主进程的未捕获异常。
4. Codex 与 Claude Session 可同时运行（AC-03 的 Adapter 部分）；同一 Provider 的多个 Session 互不共享 Runtime。

### 3.10 原生配置复用（01 第 8 节原则 19、20；04 第 4 节）

1. 不传覆盖项时，Provider 不得写入产品默认的模型、审批、沙箱、权限模式、Rule、Skill 或系统提示，交由 CLI 自身配置决定。
2. 需要覆盖的项通过 `overrides`（`model`、Codex `approvalPolicy` / `sandboxMode`、Claude `permissionMode`）或 `providerOptions` 传入；Provider 对不支持的覆盖项以 `unsupported` 拒绝，不静默忽略。
3. 协议所需的设置不属于产品默认：如 Codex 为后台命令清理开启 `capabilities.experimentalApi`（04 第 5 节第 2 条）、Claude 的流式片段与 `canUseTool` 接线。预检脚本中的限制性设置（Claude 空 `settingSources`、受限工具、只读沙箱）只用于校验，不进入产品默认（[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 3 节）。

### 3.11 Codex Provider

实现与证据：[Provider 说明](../../packages/agent-adapter/src/codex/README.md)、[W2 实施记录](../../tasks/T20261009-agent-adapter/evidence/W2-codex-provider.md)。本节为 2026-10-09 实现记录；现行版本策略见第 1 节 A-Q1，不将历史实现与证据写成新版本通过。

1. 每 Session 启动本机 `codex app-server --listen stdio://`，以共享 `JsonRpcPeer` 连接，消息缺省不带 `jsonrpc` 字段。`initialize` 声明实验能力后发送 `initialized`；协议类型由 CLI `0.161.0` 生成，206 份传递类型及原始内容摘要保存在 `src/codex/protocol/`。模型、权限与配置只传调用方明确覆盖的项，不读取或改写用户配置。
2. 新建使用 `thread/start`，恢复使用 `thread/resume` 并要求返回原 ID；恢复失败不创建新 Thread。文本增量和完整条目按同一 item ID 更新；命令的 `commandActions` 映射活动，`thread/name/updated` 报告原生标题。`turn/completed` 是权威终态；`error` 通知只作诊断，避免原生重试期间提前结束。
3. 命令、文件、权限授权与问题均映射为第 3.5 节的请求，保留原生选项顺序及对象形式决定。`serverRequest/resolved` 同时通过 `dismissIncoming(id)` 无响应地释放 JSON-RPC 记录，并解除 Session 等待；旧回调不可再答复。未知请求明确拒绝，其他 Thread 的通知不影响当前 Session。
4. I-Q2 的拒绝路径先以当前 `expectedTurnId` 调用 `turn/steer`，确认文字已被同一回合接收，再对所有待处理请求答复 `decline`。交付失败时保留原请求可回答，不发新 `turn/start`。真实场景已确认同一回合回复指定标记且被拒绝命令未执行；一般 Running 中追加现已复用同一原生接口，真实兼容复验仍待完成。
5. 模型目录分页使用 `model/list`，不创建 Thread。模型选择保留到下一轮 `turn/start`；重置为 `null` 时读取原生配置的默认模型。错误依据 `codexErrorInfo` 归一，认证 / 配额 / 网络错误有模拟覆盖；可用性只保留粗粒度登录结果。
6. Stop 以当前命令 item / App Server `processId` 调用 `thread/backgroundTerminals/terminate`；`processId` 从不作为系统 PID。生成类型虽含 `osPid`，锁定的 `0.161.0` 实现实际返回 `null`（源码位置见 W2 证据），不能依赖该字段取得退出证明。
7. 提交前保存后台命令与系统后代身份基线，运行中和 Stop 前继续采样。有 `osPid` 时验证其 Runtime 归属；没有时保守跟踪本轮新出现的后代集合。原生终态后终止对应命令，并以 PID + 启动时间确认已观察目标均退出。没有身份、映射歧义、接口错误或无法确认退出时，按第 3.6 节先确认旧 Runtime 退出，再恢复原 ID；不重放输入。不会调用 Thread 级 `clean` 替代本轮清理。
8. 验证边界：六个真实 Astra high 回合确认流式、跨 Runtime 原 ID 恢复及上下文、I-Q2 同轮文字拒绝和 Runtime 兜底恢复。`osPid:null` 修正版已用真实 Node / 系统进程 fixture 证明本轮两层进程退出、先前服务保留，但六回合预算用完后未再对真实 Codex 重测，因此精确 Stop 真实验收仍未通过。真实第二模型切换、活动命令下宿主崩溃、未观察即脱离的后代与外部 MCP 进程树仍待验证；两次真实套件失败记录保留在 W2 证据。

### 3.12 Claude Provider

实现与证据：[W3 实施记录](../../tasks/T20261009-agent-adapter/evidence/W3-claude-provider.md)。以下行为已落入 SDK 模拟测试；真实成功回合的限制见第 7 项。

1. 锁定 SDK `0.3.293`，`pathToClaudeCodeExecutable` 指向宿主发现的本机 CLI。每 Session 独立 Query / Runtime；同步 `spawnClaudeCodeProcess` 回调通过 stdio 缓冲桥接共享异步 `RuntimeProcess.start`，保留 SDK 给出的协议环境，Runtime 仍使用独立进程组与统一退出验证。
2. 历史实现按 A-Q5 推荐加载 user / project / local `settingSources`，使用 `claude_code` 系统预设，不追加产品指令，不设产品级默认模型或权限。原生配置对齐原则现已确认，参数等价性与真实 Rule / Skill 加载仍待验证（第 1 节）。用户消息标记 `origin: human`；用户授权决定标记 SDK 的 `user_temporary` / `user_permanent` / `user_reject`。
3. `system/init.session_id` 到达后报告原生 ID，不预造已存在的原生会话。恢复先按原 ID 初始化，CLI 的最终校验可能延后到首次发送；ID 不匹配或懒加载恢复失败均关闭，不静默新建。
4. `message_start` 的 message ID 与内容 index 组成稳定条目 ID，完整 assistant 消息替换 partial 内容，消息及结果 UUID 去重。只有 `result.subtype = success && is_error = false` 成功，主动取消按核心取消意图判断。SDK 给出 `user_message_uuid` 时关联原回合，未给关联字段的新异步帧只能回退到当前回合，不能承诺识别任意旧生产者的乱序流。
5. `canUseTool` 保留原生说明、工具 ID、建议权限更新与选项顺序；只在原生允许时提供持久授权。`AskUserQuestion` 按原题目与选项回写答案，SDK abort 撤回原请求。输入框拒绝以 `deny.message` 交付文字；Stop / 终态 / dispose 释放所有等待。结构化附件当前前置返回 `unsupported`，不宣称已支持。
6. Running / Stopping 中改模型先暂存，下一轮提交前调用 `Query.setModel`；空闲时立即设置。Provider 目录探测不发送消息，使用 `persistSession:false` 调用 `supportedModels()` 后关闭。Stop 前后按本轮后代身份取得退出证明；`still_queued` 若仍含本轮输入，或清理无法确认，走旧 Runtime 退出后原 ID 恢复。没有原生 ID 时不以新建代替恢复。
7. 验证边界：27 项 Claude 模拟测试覆盖上述行为；本机 CLI `2.1.295` 的 executable / version / login 与模型目录探测通过，目录读取前后 transcript 文件集合无新增。真实成功流式、Rule / Skill、恢复、模型切换、命令 Stop / 继续被 session quota（`rate_limit` / `quota_exceeded`）阻断，没有通过。不得用模拟结果代替 AC-02 / AC-03 / AC-05 的真实验收。采样前已脱离的后代、外部 MCP 进程树与宿主崩溃清理仍未验证。

### 3.13 工程工具接缝

FR-TOOL-001、FR-TOOL-002、FR-INPUT-001；04 第 1 节事项 13；DEC-14（2026-10-13 确认）。本节是接口准备，尚未实现或运行验证；逻辑契约以 [Tools §4.1、§4.2](../tools/spec.md#4-状态与接口) 为准。

- 文件输入：Codex 已有 file → mention 映射，但桌面 Session 尚未转交 attachments；Claude 当前拒绝结构化附件。后续分别核对原生文件 / 文本引用方式并接通，覆盖普通发送和原生支持的运行中输入；不把当前 unsupported 固化为产品禁止，不静默丢弃引用或声称已发送。
- 轮次数据：Codex 当前 fileChange 映射仅保留路径 / 类型，尚未转交 patch，未接入 turn/diff/updated。先验证锁定版本的聚合更新、完成状态、非 Git 和 Shell 修改覆盖，再输出带来源与原生身份的记录。Claude 独立核对同等数据及缺失原因，不假设两者一致。
- 事件接收核对 Runtime 代次、Thread / Turn 归属及修订；Adapter 报告 unknown / empty / unavailable / failed 的依据，应用 Session 负责持久化与 App Turn 关联，Adapter 不读当前工作区伪造历史。
- 能力验证最先安排，但不阻塞 Files 的非 CLI 部分、项目 Diff 或 Terminal；不等待原生能力对齐全部遗留项。真实调用范围与预算另行确定，本轮只更新文档。

本地审阅依据及官方接口来源见 [工程工具调研 §9](../../tasks/T20261009-context-tools/research.md#9-开发准备审阅2026-10-13)。

## 4. 状态与数据

### 4.1 Adapter 级 Session 状态

`SessionRuntimeState` 只是 Adapter 的技术状态，不是 UI 状态，不在列表中显示（FR-STATE-006）。

| 状态 | 含义 | 可做的操作 |
|---|---|---|
| `idle` | 没有活动回合 | 发送、改模型、dispose |
| `running` | 回合进行中（含等待输入） | 答复、输入框回复、Stop、改模型；`steer` 能力下可追加输入 |
| `stopping` | 已记录取消意图，等待终态与清理 | Stop（返回同一结果）、改模型；新提交被拒绝 |
| `closed` | 终态，不可再用 | dispose；继续对话须 `resumeSession` |

转移：`idle → running`（发送）；`running → stopping`（Stop）；`running / stopping → idle`（回合终态，清理完成）；任意 → `closed`（dispose、Runtime 退出、恢复失败、Stop 兜底失败、不可恢复错误）。实现：`TurnGuard`（同步状态机）+ `SessionController`（异步编排）。

### 4.2 与 [CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 5 节状态映射表的对应

映射规则本身见 [CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 5 节，本表只说明各行在本模块中的落点。

| [CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 5 节的行 | 统一事件 / 字段 | 实现位置 |
|---|---|---|
| Running | `turn.started`（提交时同步发出） | `SessionController.sendUserInput` |
| 文本追加 | `item.delta`（`text`）+ `item.completed` 全文替换 | 控制器累加；驱动报告 |
| Needs Input | `input.requested` / `input.resolved` | 控制器登记与校验；驱动保存原生引用并答复 |
| 正常完成 | `turn.completed`，`outcome = completed` | 驱动报告原生终态 |
| 主动取消 | `turn.completed`，`outcome = interrupted`，`stop` 摘要 | Stop 流程（第 3.6 节） |
| 执行错误 | `turn.completed`，`outcome = failed`，`error`；Runtime 退出另有 `runtime.exited` | 驱动报告 / Runtime 退出检测 |

### 4.3 超时默认值

均为工程初值，可按 Session 覆盖（`timeouts`）；文档只要求“有限等待”（04 第 5 节第 5 条）。

| 项 | 默认 |
|---|---|
| 启动与握手 `startupMs` | 30 s |
| 单个请求 `requestMs` | 60 s |
| 中断回执 `interruptMs` | 10 s |
| 等待原生终态 `terminalMs` | 15 s |
| 清理与退出确认 `cleanupMs` | 10 s |
| 兜底恢复 `recoveryMs` | 60 s |
| SIGTERM 宽限 `terminateGraceMs` / SIGKILL 后等待 `killWaitMs` | 2 s / 3 s |
| dispose 中的 Stop `disposeMs` | 20 s |

## 5. 接口与事件

### 5.1 `AgentProvider`

| 成员 | 说明 |
|---|---|
| `id`、`displayName`、`capabilities` | 能力：`nativeSessionIdTiming`、`inputWhileRunning`（`none` / `steer` / `queue`）、`questionRequests`、`freeTextAnswers`（questions / approvals）、`nativeTitle`、`runtimeRecovery` |
| `checkAvailability(options)` | 第 3.2 节；不可用不抛错，以报告表达 |
| `listModels(options)` | 不创建原生会话 |
| `createSession(options)` / `resumeSession(options)` | 第 3.3 节；`options`：`cwd`、`environment`、可选 `overrides`、`timeouts`、`providerOptions` |
| `dispose()` | 关机：处置全部活动 Session，尝试终止 Runtime；不抛错契约及退出证明边界见 §3.6 |

### 5.2 `AgentSession`

| 成员 | 说明 |
|---|---|
| `sessionId`、`providerId`、`nativeSessionId`、`state`、`activeTurn`、`pendingInputs`、`model`、`capabilities` | 只读快照 |
| `subscribe(listener)` | 全部事件；首个订阅者会收到此前缓存的事件 |
| `sendUserInput({ text, attachments? })` → `{ turnId }` | 第 3.4 节；附件 `file` / `image`，不支持的类型由 Provider 拒绝 |
| `respondToInput(requestId, response)` | 卡片答复 |
| `replyWithText(text)` → `{ disposition, requestIds }` | 输入框回复（I-Q2） |
| `stop()` → `StopResult` | 第 3.6 节 |
| `setModel(model \| null)`、`listModels()` | 第 3.8 节 |
| `dispose()` | 幂等 |

辅助：`ensureSession`（第 3.3 节第 6 条）、`ProviderRegistry`（`register` / `get` / `list` / `shutdownAll`）。

### 5.3 事件

| 类型 | 主要字段 | 说明 |
|---|---|---|
| `session.native_id` | `nativeSessionId` | 立即持久化 |
| `session.state` | `state`、`previous` | Adapter 级状态 |
| `session.title` | `title` | 原生标题（可选能力） |
| `session.error` | `error` | 不对应回合结果的错误 |
| `session.closed` | `reason`、`error?` | Session 不可再用 |
| `turn.started` | `turnId`、`startedAt` | 提交时 |
| `turn.completed` | `outcome`、`durationMs`、`nativeDurationMs?`、`model?`、`stopRequested`、`stop?`、`error?`、`nativeTurnId?` | 每回合一次；`error` 只在 `failed` 时出现 |
| `item.started` / `item.updated` / `item.completed` | `item`（`kind`、`status`、`text`、`activity`、`command`、`files`、`tool`） | 条目快照 |
| `item.delta` | `itemId`、`channel`（`text` / `reasoning` / `output`）、`delta` | 增量 |
| `input.requested` / `input.resolved` | `request` / `resolution` | 第 3.5 节 |
| `stop.updated` | `phase`、`detail?` | Stop 进度，可用于“停止中” |
| `model.changed` | `model` | 下一轮生效 |
| `runtime.started` / `runtime.exited` | `generation`、`pid`；退出码、信号、`expected`、`duringTurn`、`stderrTail` | 被替换的旧 Runtime 迟到的退出事件被丢弃 |
| `diagnostic` | `kind`（`late_event`、`unhandled_native`、`warning`、`stderr`、`protocol`） | 不改变状态 |

### 5.4 Provider 实现契约（`SessionDriver` / `SessionSink`）

Provider 不直接实现 `AgentSession`，而是为每个 Session 提供一个驱动，交给共享的 `SessionController`，从而让所有 Provider 共用第 3.4～3.7 节的规则。

| 驱动方法 | 职责 |
|---|---|
| `startTurn` | 原生提交；被拒绝即回合失败 |
| `steerTurn?` | 运行中追加输入（仅 `steer` 能力） |
| `interruptTurn` | 原生中断并释放 Stop 取消的请求 |
| `cleanupAfterInterrupt?` | 终止本轮进程并给出退出证据 |
| `recoverRuntime?` | 兜底：经 `RuntimeSlot.replace()` 重启并以原 ID 恢复，报告 `sink.nativeSessionId` |
| `respondToInput` / `declineInputsWithText` / `cancelInput?` | 答复、输入框拒绝、非 Stop 情形的原生释放 |
| `setModel` / `listModels` / `dispose` | dispose 须幂等且不抛错 |

驱动通过 `SessionSink` 报告原生活动：原生 ID、原生回合 ID 绑定与反查、条目与增量、等待请求（返回 `undefined` 时须原生拒绝）、原生撤回、原生终态、模型变化、原生标题、Runtime 启动 / 退出、错误、诊断。驱动不得在构造函数中调用 sink。

共享核心（Provider 必须复用，不自行实现）：`RuntimeProcess` / `RuntimeSlot`、`JsonRpcPeer` 与行传输、进程探测（`listDescendants`、`findAlive`、`waitForExit`、`signalProcesses`）、`resolveExecutable` / `execBounded` / `parseVersion`、`buildAvailabilityReport`、`AsyncQueue`（Streaming Input）、`LiveSessions`（关机跟踪）、`redactSecrets`。测试工具见 `./testing`：联动的内存传输与脚本化 JSON-RPC 服务端、`FakeRuntime`、`EventRecorder`、`ScriptedDriver`、`FakeProvider`（也可供 Session Manager 测试使用）。

### 5.5 与 session spec 第 5.1 节的对齐

| session spec 期望 | 本模块 | 差异 |
|---|---|---|
| `send(句柄, {text, context, model?})` | `sendUserInput({ text, attachments })`；模型用 `setModel` 先行设置 | 无逐次模型参数（第 3.8 节）；上下文项的传入方式仍属 project-view / context-tools |
| `turnStarted` / `turnEnded(outcome, durationMs, error?)` | `turn.started` / `turn.completed` | 一致；Stop 兜底失败时回合为 `interrupted` + `stop.cleanup = failed` + `session.error`，上层据此显示 Error（第 3.6 节第 4 条） |
| `textDelta` / `messageCompleted` | `item.delta` / `item.completed`（`assistant_message`） | 一致 |
| `toolActivity(kind ∈ read/edit/run/other)` | `activity.verb` 更细 | 上层归类（第 3.4 节第 4 条） |
| `inputRequested` / `inputResolved(reason)` | 一致，含原生撤回 `native_resolved` | — |
| `answer(requestId, optionId)` | `respondToInput(requestId, { kind: 'approval', optionId })`；提问用 `answers` | — |
| `replyWithText(requestId[], text)` | `replyWithText(text)` | 作用集合由 Adapter 按 I-Q2 取当前回合全部未答复请求，不由调用方传入 |
| `stop` 幂等、清理后完成、兜底失败返回错误 | 一致（`StopResult.status = failed`） | — |
| `setModel` 下一轮生效 | 一致 | — |
| `runtimeExited(code, duringTurn)` | `runtime.exited` 含 `duringTurn` | — |
| `nativeTitle(title)`（可选） | `session.title` + `capabilities.nativeTitle` | — |
| `capabilities`：Running 中提交、自由文本答复、原生名称 | `inputWhileRunning`、`freeTextAnswers`、`nativeTitle` | `inputWhileRunning` 按原生行为报告 `none` / `steer` / `queue`；Codex 已接入 `steer`，Claude 式排队仍待建模与验证（I-Q3） |
| 可用性：已安装、版本、已登录、原因；版本不受支持 | 一致，`unsupported_version` 为第三种不可用原因 | 按 C-Q5 / A-Q1，仅有证据的会话集成不兼容才禁用，未验证不等于不支持 |
| `listModels` 不创建原生会话 | 一致 | Claude 真实目录探测未新增 transcript，见第 3.12 节 |
| `shutdownAll()` 清理受管进程并记录结果 | `ProviderRegistry.shutdownAll()` | 责任边界见 04 §5；返回不证明零残留（§3.6）；宿主异常退出见 A-Q3 |
| 事件携带 Session 句柄与 turn ID | 信封 `sessionId`；回合事件 `turnId` | Session 级事件（原生 ID、标题、Runtime、模型）无 turn ID |
| 轮记录中的实际模型（第 4.3 节） | `turn.completed.model`（CLI 提供时） | — |
