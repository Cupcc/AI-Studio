# W8 独立审阅：Adapter Runtime 严格 / 可重试清理（W5-F2 修复）

## 环境与基线

- 审阅者：W8；未参与 W6 实现，仅编写独立场景与证据，未修改任何源码、`task.md`、`plan.md`、`acceptance.md`。
- 2026-10-13，macOS arm64，Node v26.10。无真实 Codex / Claude CLI 与模型调用；Claude Agent SDK 仅在 [W8-sdk-cwd-probe.mjs](W8-sdk-cwd-probe.mjs) 中以假进程钩子调用一次以读取 `spawnClaudeCodeProcess` 的 `cwd`。
- 被审内容：清理 worktree（`feat/runtime-tools-cleanup`，基线 `2f4bb5a`）的暂存 diff，21 个文件 / +1070 −97。审阅期间主 Agent 已将其导入根 worktree 并提交为 `25a79af`；已核对两者的 patch 逐行相同（去掉 `index` 行后 `diff` 无差异）。W8 用例默认读取清理 worktree 源码，另以 `W8_ADAPTER_SRC=<root>/packages/agent-adapter/src` 在根 worktree 的集成源码上复跑，结果一致。
- 消费者基线：根 worktree `086706a`，已核对 `session-service.ts` 的 `retire` / `projectClosed` / `releaseAllRuntimes` 及 QuitFlow 与审阅时读取的版本相同。
- 差分基线：`git archive 2f4bb5a packages/agent-adapter/src` 解到临时目录，`W8_BASE_SRC` 指向它；未设置时差分用例自动跳过。
- 未向清理 worktree 或主 checkout 写入（暂存区与未暂存状态审阅前后一致）；未运行 `pnpm install`、`build`、`check:*`、Electron、E2E、GUI；未重建 `dist/`。

## 独立自动化结果

| 检查 | 命令 | 结果 |
|---|---|---|
| Adapter 套件 | 清理 worktree：`pnpm --filter @ai-studio/agent-adapter test`，共 6 次 | 6 次均 17 files / 224 tests passed |
| 乱序 | 同上 `exec vitest run --sequence.shuffle --sequence.seed=1/2/3/7` | 4 次均 224 passed |
| 类型检查 | `pnpm --filter @ai-studio/agent-adapter typecheck` | 退出 0，无输出 |
| W8 独立套件（含差分） | `W8_BASE_SRC=… pnpm exec vitest run --config tasks/archive/T20261009-context-tools/evidence/W8-vitest.config.ts --reporter=verbose`（根 worktree 执行） | 最终 5 files / 78 tests：73 passed，5 failed；此前 77 tests（尚无 Claude listModels 观察用例）连续 3 次 + 乱序 2 次（seed 11、12）失败集合与最终完全相同，无抖动；日志见 [W8-run.log](W8-run.log) |
| 根 worktree 集成源码复跑 | `W8_ADAPTER_SRC="$PWD/packages/agent-adapter/src"` 同上 | 同样 73 passed / 5 failed |

5 个失败即下列 W8-F1（2）、W8-F2（1）、W8-F3（2）；其余 73 项通过。失败用例按要求保留，未改源码使其通过。未运行测试断言的项目一律不记为通过，见「未覆盖」。

## 发现

### W8-F1（高）：移除「进程组成员收编」后，退出确认可与仍存活的同组进程并存（相对基线的回归）

来源：[Adapter spec §3.9 第 2 条](../../../../specs/agent-adapter/spec.md)（终止流程「对仍存活的组成员与快照中的后代按身份发 SIGKILL」）、§3.6 第 9 条（成功返回 = 精确句柄已有退出证据）。

W6 为避免 pgid 复用误杀，在 `collectSurvivors` 中只在 `this.running` 时收编 `pgid === pid` 的组成员。但 `runTermination` 先 SIGTERM 再等待宽限期，Runtime 在宽限期内退出后 `running` 即为 false，之后不再收编任何未记录的组成员；初始快照只按 ppid 链取后代，不含「父进程已退出、ppid 变为 1、仍在同一进程组」的孤儿。结果：

1. 常规 `terminate()`：Runtime 因 SIGTERM 退出，同组且忽略 SIGTERM 的孤儿存活，仍报告 `confirmed: true, forced: false, survivors: []`。
2. Runtime 自行退出（崩溃）且组员从未被采样：同样 `confirmed: true`。

基线 `2f4bb5a` 在两种情形都会收编并 SIGKILL。该保证正是 W5-F2 要消除的类别（Project 关闭 / 退出被批准而 CLI 子进程仍存活），工具命令被放到后台、其父 shell 退出后即留下此类孤儿（具体在 Codex / Claude 真实运行中的占比未测）。

复现（均为真实本地进程 `/bin/sh` + `sleep`；测试在 finally 中仅按 pid + 启动时间清理自己的残留）：

```sh
pnpm exec vitest run --config tasks/archive/T20261009-context-tools/evidence/W8-vitest.config.ts W8-runtime-process --reporter=verbose
W8_BASE_SRC=<基线> pnpm exec vitest run --config … W8-differential --reporter=verbose
```

实际输出（节选）：

```
[W8] orphan group member after leader self-exit: confirmed=true survivors=0 orphanAlive=true
[W8] SIGTERM-ignoring same-group orphan after normal terminate(): confirmed=true forced=false survivors=0 orphanAlive=true
[W8] base: confirmed=true survivors=0 orphanAlive=false                 # 崩溃路径，基线已清理
[W8] reviewed: confirmed=true survivors=0 orphanAlive=true
[W8] base: confirmed=true forced=true orphanAlive=false                  # 常规 terminate，基线 SIGKILL 该孤儿
[W8] reviewed: confirmed=true forced=false orphanAlive=true
```

对照：孤儿在 Runtime 运行期间被 `snapshotDescendants()` 采样过时，同一实现能找到并清理（`control` 用例通过）。预期：存在存活同组成员时 `confirmed` 不得为 true，或该成员被清理。失败用例：`W8-runtime-process.test.ts` 的两个 `INVARIANT`。

建议修复（已在临时拷贝验证，未改仓库，补丁见 [W8-runtime-process-fix-proposal.patch](W8-runtime-process-fix-proposal.patch)）：

- 方案 1：`snapshotDescendants()` 在 Runtime 仍运行时除 ppid 链后代外，同时记录 `pgid === pid` 的成员身份（此时 pgid 必属于本 Runtime，不存在复用问题）。W6 的 224 项测试全部通过；W8 常规 terminate 孤儿用例转为通过；崩溃且从未采样的情形仍然存在。
- 方案 2：在 `exit` 事件里立即做一次 `pgid === leader` 快照并在 `runTermination` 开始前等待（组内尚有成员时 pgid 不会被回收，成员必属原 Runtime）。方案 1 + 2 后 W8 的 11 项真实进程用例全部通过；但 W6 的「does not adopt a reused process group after its child has exited」用例使用静态假 lister（退出瞬间也返回该成员）会失败，需要把该用例改为「退出一段时间之后才出现的成员不被收编」。
- 若主 Agent 只取方案 1，须在 spec §3.6 第 9 条与 §3.9 第 2 条写明「崩溃前从未采样的同组孤儿不被检测」这一残余边界。

处理人：W6 / 主 Agent。严重度依据：基线已有的清理能力被削弱，且直接削弱本轮要建立的「确认 = 无存活进程」保证。

### W8-F2（中，影响小）：Claude 显式 `dispose()` 的事件顺序改变，与「事件行为不变」的声明不符

`runDispose` 现在先 `completeClose('disposed')` 再等待驱动释放。Codex 在 `dispose` 前 `detach()`，退出事件不再到达，顺序未变；Claude 的 `runtime.onExit` 监听保持，顺序变化：

```
[W8] Claude dispose() event order (new subscriber)
  base:     runtime.exited > session.state > session.closed
  reviewed: session.state > session.closed > runtime.exited
```

Codex 与 Claude 的「创建、设置模型、完成回合、Stop、Stop 后回退替换 Runtime、继续」整条事件流（去除时间 / ID 字段）、Stop 结果、Runtime 数量与 terminate 参数，基线与被审源码逐项相同；带待答复批准的 Codex dispose 的事件与原生答复也相同。仅此一处差异。失败用例：`W8-differential.test.ts` 的 Claude 用例（前面的事件流 / Stop / Runtime 数断言已通过，仅最后一条顺序断言失败）。

桌面端影响：`retire` 先取消订阅再 dispose，且 `runtime.exited` 的 `expected = true` 会被忽略，我读取代码后未发现受影响路径；未经 Electron 验证。spec 未规定该顺序，也未记录这一变化。建议：要么在 spec §3.4 / §3.6 记录「`session.closed` 不再表示 Runtime 已退出，先于 `runtime.exited`」并补回归测试，要么恢复原顺序（成功路径先等待驱动，再发 `session.closed`；失败时仍需关闭 Session 并发事件）。处理人：W6 / 主 Agent。

### W8-F3（低）：显式 `dispose()` 重试成功后，Session 仍留在 `LiveSessions`

`LiveSessions` 的文档写明「Session 仅在驱动确认释放后离开集合」，但只有 `closed.then(releaseRuntime)` 与 `disposeAll` 会移除条目。首次 `session.dispose()` 失败后，宿主在同一句柄上重试成功，条目不会移除，直到下一次 `releaseRuntimes()` / `Provider.dispose()`。句柄集（`RuntimeResources.retained`）已正确归零，仅泄漏 SessionController 与驱动对象，数量上限为失败次数，故为低。

```
× codex  > a session explicitly disposed after an earlier failure leaves the tracked set  → expected 1 to be +0
× claude > a session explicitly disposed after an earlier failure leaves the tracked set  → expected 1 to be +0
```

预期 `tracked() === 0`。建议在控制器驱动释放首次成功时通知 `LiveSessions`（例如暴露「已释放」Promise）。处理人：W6。

### W8-F4（低，既有问题，非 W6 diff）：已退出句柄上的 `processLike().kill()` 仍向 `-pid` 发信号

`signalGroup` 没有 `running` 保护。表征用例 `CHARACTERIZATION …` 记录：Runtime 已退出后 `processLike().kill('SIGTERM')` 向 `-<pid>` 发了 1 次组信号（`process.kill` 已 mock，未真实发送）。Claude SDK 的 `query.close()` 经 `SpawnBridge.kill` 会走到这里；若该 pid 已被另一个组长复用，会误发信号。窗口很小，W6 没有新增调用点，但「按身份发信号」的 spec 承诺未覆盖这条路径。建议 `signalGroup` 在 `!this.running` 时返回 false，并同时保证方案 1 / 2 能覆盖仍存活的组成员。

### W8-F5（低）：spec 与周边文档的漂移

- `specs/agent-adapter/spec.md` §3.9 第 2 条（本次 diff 未改）仍写「对仍存活的组成员…发 SIGKILL」，与被审实现不一致（见 W8-F1）。
- 新增的 §3.6 第 9 条没有说明：释放期间 `listModels` / 可用性模型探测同样被闸门以 `invalid_state` 拒绝；失败的 `releaseRuntimes()` 单次最多重复终止同一句柄两次（驱动重试 + Provider 句柄），Provider 层重试使用默认 2 s / 3 s 而不是 Session 配置值；`releaseRuntimes` 对从不结算的启动工厂没有上界（见下文 d）；Claude 事件顺序变化（W8-F2）。
- 引文问题：第 9 条写「FR-PROJ-002「退出与关闭需要可证明的清理」」像是 FR 标题，实际 FR-PROJ-002 的标题是「多 Project Tab」，对应内容是其要求中「清理失败保留诊断和重试入口，不静默宣称已关闭（2026-10-13 确认，DEC-14）」。建议改为引用该要求原文。
- `specs/session/spec.md` 第 345 行 `shutdownAll()`「清理受管 Runtime / 子进程并记录退出结果」未反映严格拒绝，也没有 `releaseRuntimes(cwd?)`；Session Manager 现在依赖它。该文件不在 W6 写入范围内，需要主 Agent 决定是否同步。

### W8-F6（低）：错误掩盖与 Provider 之间的不一致

- Claude `listModels` 的 `finally { await session.dispose() }` 现在可能抛出清理错误：模型目录请求失败且清理未确认时，调用方看到 `stop_cleanup_failed`（「Claude runtime exit could not be verified」），原目录错误被替换；成功获取模型但清理未确认时同样整体拒绝（见下文 c）。Codex 的同类行为在基线已存在。
- Claude `Provider.dispose()` 是 `async` 包装，新的拒绝若被调用方丢弃会成为 unhandled rejection；Codex 的共享 `disposal` 已预先处理（实测 `void provider.dispose()` 后：codex 0，claude 1）。`registry.shutdownAll()` 与桌面端均使用 `allSettled`，不受影响。
- Codex `createSession` / `resumeSession` 在 Provider 已 dispose 时同步抛出而非返回拒绝 Promise（基线已有，非本次改动）；Claude 为拒绝。桌面端在 `await` 内调用，不受影响。

### W8-F7（信息，桌面端，非 W6）：`releaseAllRuntimes` 先等待 `background`

`session-service.ts` 的 `releaseAllRuntimes` 在释放 Runtime 前 `await Promise.allSettled([...this.background])`，其中包含进行中的模型目录探测（Adapter 默认最长 30 s，`discoveryAbort` 只在最终 `dispose()` 触发）。退出确认的 10 s 上限可能因此先到期。仅读代码得出，未经测试；`releaseRuntimes()` 本身可立即终止这些探测，建议主 Agent 评估是否改为并行或先 abort。

## W6 四项已知局限的判定

| 项 | 判定 | 依据 |
|---|---|---|
| (a) 未采样的组成员不被收编，崩溃孤儿可能读作 confirmed | 真实缺陷，且范围比 W6 描述更大：常规 terminate 也受影响 | W8-F1：真实进程复现 + 基线差分 + 临时拷贝验证的修复 |
| (b) 失败释放后驱动与 Provider 先后终止，约 2 倍时间 | 可接受的局限，需写入文档 | 实测每次失败的 `releaseRuntimes()` 对同一句柄多 2 次 `terminate()`；失败的启动在 `createSession` 内已有 2 次。真实 `RuntimeProcess`：驱动尝试（killWait 100 ms 配置）198 ms，随后的 Provider 重试 3049 ms（默认 killWait 3000 ms），见 `TIMING` 用例。默认超时下两次约 6–10 s，可能越过 Project 关闭 / 退出的 10 s 上限，表现为「停止超时」而非「未确认」；两者结果都是不批准关闭，锁保留到真实操作结束，与 `close-flow.ts` 的设计一致。可选优化：Provider 重试沿用 Session 的终止参数，或跳过本次释放内已由 Session 尝试失败的句柄 |
| (c) 探测取到模型但清理未确认时仍拒绝 | 可接受（失败即关闭），需文档；注意掩盖原错误（W8-F6） | Codex 基线已如此；Claude 为新增拒绝。两家探测句柄在拒绝后仍保留，`releaseRuntimes()` 可重试（用例通过） |
| (d) 启动工厂永不结算时 `releaseRuntimes()` 无上界 | 可接受的局限，需文档；生产路径基本不可达 | `RuntimeProcess.start` 总会收到 `spawn` 或 `error`。但在该情形下释放永远 pending，且同 cwd 的新启动一直被 `invalid_state` 闸门拒绝，其他 Project 不受影响（`DOCUMENTED LIMITATION (d)` 用例，两家 Provider 通过）。建议给等待加上界并按失败关闭（迟到句柄仍会登记，下次释放处理），或在 spec 中明示 |

## 未发现缺陷的区域（均有 Codex 与 Claude 两组独立用例，另有 Session 级用例）

| 区域 | 实际检查 |
|---|---|
| 拒绝 → 重试 → 成功（同一句柄） | `W8-providers`：Runtime 保持 `hang` 时 `session.dispose()` 拒绝且 `state` 已 `closed`；再次调用在同一 FakeRuntime 上再次 `terminate`，未新增 spawn；改为 `exit` 后成功，Runtime 数始终为 1，`retained` 归零；成功后再调用不再触发 `terminate`，`session.closed` 仅 1 次 |
| 并发共享一次尝试 | `session.dispose()` 两次返回同一 Promise；与 `releaseRuntimes()`、`releaseRuntimes(cwd)`、`provider.dispose()` 并发时 Runtime 只被终止 1 次；与失败的 `dispose` 并发的 `releaseRuntimes()` 也一致失败且可重试 |
| 释放期间的启动与闸门 | 启动在 spawn 处被挂起时 `releaseRuntimes(cwd)` 保持 pending，同 cwd 新启动 `invalid_state`，全部放行后无运行中的 Runtime、`retained = 0`、闸门解除；全局释放闸住所有 cwd；失败的释放同样解除闸门；`releaseRuntimes(B)` 不等待 A 的启动；`Provider.dispose()` 同理；启动超时后迟到的 Runtime 被终止，未确认时保留并可重试；迟到的模型探测同理 |
| `cwd` 精确字符串范围 | `/tmp/w8/proj-a`、`/tmp/w8/proj-a/`、`/tmp/w8/./proj-a`、`/tmp/w8/proj-b` 互为独立范围；释放一个不触及其余，且闸门只作用于同一字符串；真实 SDK 钩子逐字传递 `cwd`（`W8-sdk-cwd-probe.mjs`，4 种非规范写法 `identical: true`）；桌面端 `createSession` / `resumeSession` / `listModels` 使用 `project.canonicalPath`，`releaseRuntimes` 使用 `this.project(id).canonicalPath`，该值来自数据库列且从不被更新，字符串相同 |
| PID 复用 | 无法强制真实复用。以真实无关 `sleep` 作旁观者，lister 声称其 pid 属于 Runtime 但启动时间不同：全程没有任何对该 pid 或 `-pid` 的 `process.kill`，旁观者存活、`confirmed = true`；启动时间相同的对照用例确实发出 `SIGKILL` 并杀掉它。Runtime 退出后且 lister 失败的重试，没有对 `-pid` 或 Runtime pid 发信号 |
| 重试语义（真实进程） | lister 首次失败 → 未确认；同一句柄重试 → 确认；进行中的调用共享 Promise，已确认的结果被缓存，之后不再调用 `ps`；忽略 TERM/HUP 的 Runtime 及其同组子进程被 SIGKILL 清理 |
| 未处理拒绝 / 定时器 | 每个文件都有 `unhandledRejection` 守卫，所有场景（含 fire-and-forget、重入、超时、迟到启动）零记录；`process.getActiveResourcesInfo()` 的 Timeout 计数在成功 / 失败 / 超时 / 宽限期内退出后不高于起始值 |
| 重入 | 在 `session.state` / `session.closed` 监听器内调用 `dispose()` 得到的就是外层同一 Promise，只终止 1 次；失败的尝试中在 `diagnostic` 监听器里重试，不递归、无泄漏，之后显式重试成功 |
| `disposeMs` 超时 | 超时拒绝（`timeout`），再次调用共享仍在进行的清理（`terminate` 未被重复发起），清理结束后成功 |
| 句柄集增长 | 25 次创建/释放、25 次探测、25 次失败启动、25 次崩溃后，`retained = 0`、`tracked = 0`；崩溃后未确认的会话保留，`releaseRuntimes()` 拒绝、修复后清空 |
| Stop / 替换 / 并发 | Codex Stop 回退替换 Runtime 一次，旧句柄离开集合，使用 Session 配置的 terminate 参数；Stop 恢复无法确认旧退出时 Session `stop_failed` 关闭、句柄保留并严格拒绝；Claude Stop 后继续，以及排队输入触发的替换，计数准确；Stop 与 dispose 双向并发只产生 1 个 `turn.completed`（`interrupted`）与 1 个 `session.closed`；崩溃与 dispose 竞争只关闭 1 次；`ensureSession` 在旧退出未确认时不新建 Runtime，重试后以同一原生 ID 恢复 |
| 失败启动不掩盖原错误 | 握手失败（创建与恢复）的错误码与消息保持原样，句柄保留，`releaseRuntimes()` 报告并可重试 |
| `ProviderRegistry.shutdownAll()` | 一个 Provider 未确认时，另一个仍被尝试；`AggregateError` 只含失败项；修复后重试成功 |
| 基线差分 | 见 W8-F2：除 Claude dispose 顺序外，Stop / 模型 / 事件流在两个 Provider 上与基线逐项相同；唯一有意变化是 Stop 失败后 `session.dispose()` 现在拒绝（基线 resolve） |

## 对 spec 暂存 diff 的逐条核对

| spec 声明 | 结论 |
|---|---|
| `AgentSession.dispose()` 未确认时拒绝、保留句柄、`closed` 后可重试、超时后重试共享、不新建原生会话、进行中共享、成功后无操作 | 被用例证明（两家 Provider + 控制器级） |
| `releaseRuntimes(cwd?)` 严格 / 可重试、含失败或迟到启动与探测、精确 `cwd`、`AggregateError`、仅释放期间 `invalid_state`（含失败后恢复）、`dispose()` 沿用同路径 | 被用例证明；闸门同时作用于探测，spec 未写（W8-F5） |
| `shutdownAll()` 全部尝试后以 `AggregateError` 拒绝 | 被用例证明；「逐一尝试」实际为并行 `allSettled`，语义无差别 |
| 启动失败保持原启动错误，句柄留在 Provider | 被用例证明 |
| 边界：成功返回 = Runtime 退出且「已记录后代」按 pid + 启动时间核对；探测失败不算确认；不证明零残留 | 字面成立，但与 §3.9 第 2 条（仍写组成员 SIGKILL）不一致，且「已记录后代」忽略了基线原有的组成员收编（W8-F1，声明强于实现的实际覆盖） |
| 「上述拒绝、保留与重试已有模拟测试覆盖」 | 属实；但 W6 的「不收编复用的进程组」用例固化了 W8-F1 的缺口 |
| 驱动表：`dispose` 须在确认后才 resolve，失败后同句柄重试 | Codex / Claude 驱动成立；`ScriptedDriver` 总是 resolve，只用于控制器测试 |
| 共享核心列表加入 `RuntimeResources`、`LiveSessions` 改为「跟踪与释放」 | 属实；`LiveSessions` 的离开条件有 W8-F3 缺口 |
| 来源标注 | FR 标题引用不准确（W8-F5） |

## 未覆盖

- 真实 Codex / Claude CLI、真实 `codex app-server` 崩溃后孤儿进程的实际占比、真实 Claude SDK `query.close()` 在进程退出后的行为：均未运行。
- 桌面端 SessionService / QuitFlow 与真实 Adapter 的联调、Electron、E2E、GUI：未运行（协调者已说明根 worktree `pnpm check:code` 通过且 W5-idle-runtime 通过，W8 未重复）。
- 真实的 PID 复用无法制造，只用 lister 伪造与对照；无法杀死的进程用不存在的 ghost pid 模拟，未测真实 D 状态进程。
- 仅 macOS `ps` 输出格式；Linux、并发压力、`/bin/ps` 超时（10 s）未测。
- 未运行 `pnpm check:docs`，spec 链接与锚点未机械检查。
- 方案 1 / 2 只在临时拷贝验证，未提交，也未经过完整桌面端回归。

## 需要决定

- W8-F1 的处理（实现者与主 Agent，技术决定）：只取方案 1 并在 spec 记录崩溃孤儿的残余边界，还是方案 1 + 2 并改写 W6 的复用组用例。我的建议是方案 1 + 2。
- W8-F2：记录事件顺序变化还是恢复原顺序（技术决定）。涉及 spec 文字变更，仍须按 AGENTS.md 由人审阅该 diff；本审阅未发现需要产品层决定的事项。

---

## 复验（2026-10-13，基线 `81db33c`）

### 范围与方法

- 复验对象：根 worktree `feat/runtime-tools` HEAD `81db33c`（W6 的 `4e7e5f8` 经 cherry-pick；仅 `packages/agent-adapter/**` 与 `specs/agent-adapter/spec.md`），前序为 `25a79af`（上文所审内容）与基线 `2f4bb5a`。`git status packages` 为空，源码即提交内容。W6 声称的修复不作证据，全部以独立执行为准。
- 仍遵守规则：未改任何源码、未重建 `dist/`、未运行 Electron / GUI / `pnpm check:*`、未调用真实 CLI 或模型。仅有的写入是 `W8-*` 证据文件与临时目录。
- 原失败证据保留为历史：[W8-run.log](W8-run.log)（`25a79af`，5 项失败）；本轮修复前原样套件在 `81db33c` 上的结果 [W8-run-81db33c-before-invert.log](W8-run-81db33c-before-invert.log)；本轮最终日志 [W8-run-81db33c.log](W8-run-81db33c.log)。

### 对 W6 所述 4 项失败测试的判断

在 `81db33c` 上原样运行旧套件：78 项中 74 通过、4 失败，与 W6 所述一致。逐项判断：

| 失败用例 | 判断 | 依据 |
|---|---|---|
| `processLike().kill()` 表征（断言 1 次 `-pid` 信号） | 确实断言旧缺陷（W8-F4），W6 无误 | 实际输出 `[W8] processLike().kill() after exit sent 0 group signal(s)`；已改为回归断言「不向 Runtime pid / 组发信号」，通过 |
| 差分「基线清理崩溃孤儿、被审源码不清理」 | 确实断言旧缺陷（W8-F1） | 现输出 `base: confirmed=true orphanAlive=false` / `reviewed: confirmed=true orphanAlive=false`；改为两者一致的回归断言，通过 |
| 差分「SIGTERM 忽略孤儿，基线 SIGKILL、被审源码不清理」 | 确实断言旧缺陷（W8-F1） | 现输出 `base: forced=true orphanAlive=false` / `reviewed: forced=true orphanAlive=false`；已反转，通过 |
| `void provider.dispose()` 观察（`{codex:0, claude:1}`） | 确实断言旧缺陷（W8-F6 之一） | 现为 `{"codex":0,"claude":0}`；改为回归断言，并补充「await 的调用方仍能看到拒绝、重试成功」，通过 |

四项都不是 W6 误判；反转后的断言与原缺陷方向相反，因此仍能在 `25a79af` 上失败（已用该版源码验证，见下）。

### 为破坏新的同组成员逻辑而新增的真实进程测试

新文件 [W8-group-adoption.test.ts](W8-group-adoption.test.ts)（12 项，`/bin/sh`、`sleep`、`perl` 的 `setsid` / `setpgid` 与 `ps`；旁观者为真实无关 `sleep`，pid + 启动时间被伪造的列表冒充「复用的组」）：

| 尝试 | 结果（`81db33c`） |
|---|---|
| 多个孤儿（含忽略 TERM），Leader 在任何采样前自行退出 | 4 个全部被清理，`confirmed = true` |
| 常规 terminate 时忽略 TERM、ppid 为 1 的同组孤儿（旧 `INVARIANT` 用例） | 被 SIGKILL，`forced = true`，不再与存活孤儿并存 |
| 在最后一次快照之后、退出之前出现的成员 | 被退出瞬间的列表记录并清理 |
| 退出瞬间的列表失败，且无进程占用 Leader pid | 仍按组收编并清理 |
| 退出列表失败，但另一进程现在占用 Leader pid（回收） | 不收编、无任何指向旁观者 / Leader / `-pid` 的 `process.kill`，旁观者存活 |
| 退出列表成功且为空，之后表中冒出同组「陌生人」 | 不收编、不发信号，`confirmed = true` |
| 已记录成员的 pid 被复用（启动时间不同） | 不发信号，也不被当作「组仍属于我们」的证据 |
| 已记录成员存活时，退出后才由它 fork 出的新成员 | 被收编并清理（规则本身有效，非恒假） |
| 外部会话是否能 `setpgid` 加入已退出 Leader 的存活组 | 内核拒绝（`refused:1`，EPERM），所以组内存活成员保证组号不会被陌生进程占用 |
| 探测（`ps`）失败 | 第一次 terminate 不向任何未验证的进程发信号（`confirmed = false`，孤儿仍在）；同一句柄重试后清理成功 |
| 嵌套会话：仍在 ppid 链内的 `setsid` 子进程 | 被按身份找到并 SIGKILL，且没有对其自有进程组发信号 |
| `ps` 挂起（lister 超时 300 ms） | `terminate()` 在 563 ms 内以 `confirmed = false` 结算，不挂起、不对任何进程发信号 |

变异检验（证明用例有区分力，不是恒真）：

- 对基线 `2f4bb5a`（总是收编组成员）运行：陌生组 2 项、探测失败、挂起 `ps` 共 4 项失败，即基线的做法会向被冒充的无关进程发信号。
- 对 `25a79af`（只在 Leader 运行时收编）运行：孤儿清理类 3 项、「组由已记录成员保持存活」支持用例 1 项、探测失败后重试清理 1 项、退出后新出现成员被收编 1 项，共 6 项失败，与初审缺陷一致。
- 对 `81db33c`：12 项全部通过。

结论：新规则只在「Leader 仍在运行」「已记录成员仍存活在该组」「退出列表失败且当前无进程占用 Leader pid」三种组号确定仍属本 Runtime 的条件下收编，所有信号仍按 pid + 启动时间核对；未发现能让它杀死无关进程或使 `terminate()` 挂起的路径。仍成立的边界（均非本次引入，也不是缺陷，应保持在 spec 的「仍需后续真实验证」一句内）：

- 在任何采样之前就已双重 fork 并 `setsid`、ppid 变为 1 的守护进程不可见（`KNOWN LIMITATION` 用例：`confirmed = true`、守护进程存活，基线同样看不到）。
- 极短窗口：退出瞬间的列表之后，由已死亡的成员刚刚 fork 出来的新孤儿；以及「退出列表失败 + pid 已被回收 + 回收者留下同组子进程」这一需要多重巧合的组合。
- 真实的 pid / pgid 回收无法制造，只能用伪造列表；`ps` 挂起时 `terminate()` 的上界取决于 `PsProcessLister` 的 10 s 超时（退出列表与确认列表各一次），超过桌面端 10 s 上限时按失败处理，仍是失败关闭。

### 逐项结论

| 编号 | 结论 | 复验依据 |
|---|---|---|
| W8-F1 | 已关闭 | 上述 12 项真实进程测试与变异检验；W8 原两项 `INVARIANT` 在 `81db33c` 通过；基线差分显示崩溃孤儿与常规 terminate 孤儿均与基线一样被清理 |
| W8-F2 | 已关闭 | Claude 差分：dispose 事件顺序 `runtime.exited > session.state > session.closed` 与基线相同；Codex / Claude 完整生命周期、Stop 结果、带待答复批准的 dispose（事件与原生答复）均与基线一致；新增用例确认未确认时 `session.state(closed)` / `session.closed` 先于拒绝发出且重试后各只有 1 次 |
| W8-F3 | 已关闭 | 两个 Provider 的「显式 dispose 重试成功后离开跟踪集合」用例均通过（`tracked() === 0`） |
| W8-F4 | 已关闭 | 反转后的回归用例通过（0 次指向 Runtime pid / 组的信号）；Runtime 退出后的各重试路径也没有 `-pid` 信号 |
| W8-F5 | 已关闭（附一项待提交） | 见下节「spec 复核」；`specs/session/spec.md` 第 345 行已在主 Agent 的未提交工作区修改，内容与行为一致，但不在 `81db33c` 内，需随后续提交一并进入 |
| W8-F6 | 部分关闭 | Claude `listModels` 现保持目录错误（用例通过）；两个 Provider 的 `dispose()` 都已预处理 Promise（`{codex:0, claude:0}`）；Codex `createSession` 在 Provider 已 dispose 后同步抛出为既有行为，未改；Codex `probeModels` 仍会用清理错误替换目录错误，见新发现 W8-F8 |
| W8-F7 | 未处理（信息项，桌面端） | 不在 W6 范围；`releaseAllRuntimes` 先等 `background` 的情况未变，需主 Agent 评估 |
| 局限 (b) | 已关闭 | 注册了终止参数的 Runtime，Provider 层重试用其 `{graceMs, killWaitMs}`（真实进程实测 189 ms，对照未注册的探测句柄仍为默认 3051 ms，spec 已如实写明）；失败的 `releaseRuntimes()` 对同一句柄恰多 2 次终止（Session 驱动一次、Provider 一次），使用 `{graceMs: 1, killWaitMs: 1}` 即 Session 配置值 |
| 局限 (c)、(d) | 如实记入 spec | (d) 用例仍通过（释放 pending、同 cwd 闸门保持、其他 Project 不受影响）；(c) 的 Claude 部分已修，Codex 部分见 W8-F8 |

### 新发现

**W8-F8（低）：spec 声称模型探测在目录请求失败时保持原目录错误，Codex 并未做到。**
`specs/agent-adapter/spec.md` §3.6 第 9 条第 3 点写「模型探测同理：目录请求失败时保持原目录错误（清理未确认的句柄仍被保留）」，未限定 Provider。`codex/provider.ts` 的 `probeModels` 仍在 `finally` 中抛出 `stop_cleanup_failed`，替换目录错误。

- 复现：`pnpm exec vitest run --config tasks/archive/T20261009-context-tools/evidence/W8-vitest.config.ts W8-providers -t "Codex: the same contract"`（`W8_ADAPTER_SRC` 指向根 worktree 源码）。
- 实际：`[W8] codex listModels catalog failure + unconfirmed cleanup surfaces: stop_cleanup_failed / Model catalog Runtime exit was not confirmed`；预期消息为目录错误。句柄仍保留，`releaseRuntimes()` 重试成功，所以只是诊断信息丢失，不是清理缺口。
- 处理建议：优先改代码，约 4 行（目录请求已抛错时吞掉清理错误，仿 Claude 的做法），与两个 Provider 保持一致；不改则必须把 spec 该句收窄为「Claude」。不阻塞合入，但须二选一。该用例保持红色，作为这一项的独立证据。
- 对「Codex `createSession` 同步抛出」的判断：既有行为、spec 无承诺、桌面端在 `async` 函数的 `try` 内 `await`，不受影响，可继续只作记录（以后顺手把 `open` 改为异步即可）。

### spec 复核（`81db33c`）

- §3.9 第 2 条：运行期间记录 ppid 链后代与同组成员、退出瞬间再列一次、`confirmed` 不得与存活同组成员并存、退出后才首次出现的成员仅在有已记录成员存活时收编、列表失败时仅在无进程占用 pid 时按组收编、退出后不向 `-pid` 发信号（含 `processLike().kill()`）——逐句均有真实进程用例（见上表）证明，无强于实现的表述。
- §3.6 第 9 条：事件顺序（确认成功时与基线相同、未确认时先发 `session.state` / `session.closed` 再拒绝）有差分与新增用例证明；「确认释放后 Provider 不再跟踪」有用例；闸门含 `listModels` / 模型探测（两个 Provider，释放进行期间 `invalid_state`，结束后恢复）有用例；`dispose()` 丢弃 Promise 不产生未处理拒绝有用例；失败的 `releaseRuntimes()` 对同一句柄再终止一次、使用登记的 Session 终止参数、未登记的探测使用默认值，有用例与实测；无上界的启动工厂有用例。唯一不成立的一句是上文 W8-F8。
- FR-PROJ-002 引文：spec 现写「FR-PROJ-002 的关闭 Project / 退出应用：清理失败保留诊断和重试入口，不静默宣称已关闭」并链接 `docs/02. Functional Requirements.md`；该文件第 60 行（FR-PROJ-002 要求）确有原文「清理失败保留诊断和重试入口，不静默宣称已关闭（2026-10-13 确认，DEC-14；FR-TOOL-004）」，链接目标存在。W8-F5 的引文问题已关闭。未运行 `pnpm check:docs`，链接仅人工核对存在性。

### 独立复跑数据

| 检查 | 结果 |
|---|---|
| Adapter 套件（根 worktree，`pnpm --filter @ai-studio/agent-adapter test`） | 3 次均 17 files / 240 tests passed |
| 乱序（seed 1、2、5） | 3 次均 240 passed |
| `pnpm --filter @ai-studio/agent-adapter typecheck` | 退出 0 |
| W8 套件（`W8_ADAPTER_SRC=<root>/packages/agent-adapter/src`，差分启用） | 6 files / 98 tests：97 passed，1 failed（上文 W8-F8 的 Codex 用例）；连续 3 次与乱序 2 次（seed 31、32）结果相同，无抖动；无遗留测试进程 |

### 总体结论

Adapter 复验结论：**通过**（基线 `81db33c`，其前序 `25a79af`，对照基线 `2f4bb5a`）。初审的 F1–F4 与 F6 的主体均已独立确认关闭；遗留项均为低严重度且不阻塞：W8-F8（修 4 行或收窄 spec，二选一）、W8-F7（桌面端评估）、spec 中 `specs/session/spec.md` 第 345 行的未提交修改需随后续提交带入。

未覆盖：真实 Codex / Claude CLI 与真实崩溃孤儿占比；Electron / E2E / GUI 与桌面端联调（另有评审者正在使用 Electron）；Linux；真实 pid / pgid 回收（只能伪造）；`pnpm check:docs`。
