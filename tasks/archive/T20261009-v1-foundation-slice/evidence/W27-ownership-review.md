# W27：A-Q3 / 最后退出责任独立复查

## 第一版实现检查（2026-10-18 17:43 +08）

独立 Review Agent；未参与实现。GUI 由 Main Agent 独占，本轮未启动 Electron、未发 CLI / 模型请求。模拟 OS 表中的身份均为虚构值，signal 为注入函数，不向系统真实 PID 发信号。

检查基线：`dc66a16` 加 Main Agent 未提交实现。相关文件 Git blob hash：

| 文件 | hash |
|---|---|
| `packages/agent-adapter/src/core/runtime-ownership.ts` | `7d3cc737fb1a309dd9b00769106b85087eb04e5c` |
| `apps/desktop/src/main/shutdown.ts` | `fd0abca559fbec96cc1b90da157260e889abff82` |
| `apps/desktop/src/main/ipc/index.ts` | `e8b710f05766cb2c673f67f5749767737732ff9b` |
| `apps/desktop/src/main/services/session/session-service.ts` | `cb250d2fdf3c153ed69cf53a9c1f5b691c816af3` |

## 命令与结果

独立测试：[W27-ownership.test.ts](W27-ownership.test.ts)，单独配置 [W27-vitest.config.ts](W27-vitest.config.ts)。从 worktree 根目录执行：

```sh
pnpm --filter @ai-studio/agent-adapter exec vitest run --root "$PWD" --config "$PWD/tasks/archive/T20261009-v1-foundation-slice/evidence/W27-vitest.config.ts"
```

结果：**4 项，2 通过、2 失败**（Vitest 5.0.3，2026-10-18 17:43）。失败场景已交 Main Agent 修复，本记录不是最终通过结论。

| 独立场景 | 结果 | 关键观察 |
|---|---|---|
| 原宿主仍活跃 | 通过 | 不发 signal，记录保留，返回 active_host |
| Runtime PID / PGID 复用与已知脱离进程 | 通过 | 只清理已知 detached 的 pid+startedAt；新 Runtime、无关同 PGID 成员、外部 MCP、用户 Terminal 均保留 |
| Registry 已观察后代随后脱离，底层 Runtime 未观察它 | **失败** | 内层 confirmed=true；后代仍活；Registry 删除唯一归属记录 |
| 登记写盘失败且首次退出未确认 | **失败** | 外层 RuntimeResources.start 拒绝，句柄未 track；随后 release 成功却没有重试，Runtime 仍 running |

## 阻塞发现

### O1 · 失败登记丢失精确句柄

`Registry.start()` catch 中对 `runtime.terminate()` 的 unconfirmed 结果不检查，reject 前也不保留句柄。外层 RuntimeResources 只在 factory 成功返回时 track，因此不能用正常 Provider release 重试这个 Runtime。若磁盘登记失败同时清理失败，该进程没有持久记录和应用内可重试所有者。

修复要求：失败启动也必须由明确所有者保留并接入退出 / 释放重试；不能通过把登记失败降格为可正常使用 Runtime 来规避。独立探针应按最终主进程实际组合复验。

### O2 · Registry 已登记的后代没有参与正常退出证明

Registry 采样与 RuntimeProcess 内存快照独立。Registry 早先见到的后代可能在 RuntimeProcess 首次采样之前换组并重挂；内层 terminate.confirmed 仅证明它自己的已观察集合退出。wrapper 直接用该结果删除更完整的 journal，遗失仍活跃的已登记归属。

修复要求：正常 terminate 同时按身份检查 journal 已登记目标；存活则继续有限清理，失败保留记录并报告未确认。不得只把 RuntimeProcess 的 confirmed 转写为整个 Registry 已确认。

### O3 · SessionService 最终 dispose 仍吞掉失败

初版 shutdown handler 能在 feature reject 后保留 core 并重试，FeatureDisposer 能保留失败的 feature。但 `SessionService.dispose()` 对 entry.retiring 和 provider.dispose() 使用 allSettled 后不检查 rejected，仍置 disposed=true。故上层可能认为 Session feature 成功，将其加入 completed Set，失去原句柄的后续 dispose 重试。

修复要求：Session dispose 聚合并报告所有受管清理失败，失败不标最终 disposed，保留下一次重试；验证 first failure / second success 和停止失败。正常退出前的 releaseAllRuntimes 通过不能替代最后 handler 的防线。

## 后续

等待 Main Agent 交付修复基线后重跑失败探针和受影响回归。活动真实 OS 进程 / 宿主强杀的测试另行执行，仅使用自建隔离 fixture；共享外部进程 / 用户 Terminal 的保护边界持续保留。

## 第二次独立复验（2026-10-18 17:48 +08）

Main Agent 修复 O1 / O2 / O3 后，原 4 项于 17:44 通过。继续增加并发 wrapper 探针，17:45 发现 O4：两次同时 `terminate()` 共享内层释放后并发写同一个临时文件，导致一次 fulfilled、一次 rejected。Main Agent 再次修复整个 wrapper 的 promise 合并与成功缓存 / 失败重试，并让采样只保留仍活跃的身份，避免自行写出 reader 以超过 10000 项拒绝的历史记录。

最新执行上方同一命令，**3 个文件、9 项全部通过**（17:48:43，2.35 秒）：

| 文件 / 层次 | 通过范围 |
|---|---|
| [W27-ownership.test.ts](W27-ownership.test.ts)，模拟 OS / 真实临时文件 | 活跃原宿主；PID / PGID 复用且外部 MCP / Terminal 保留；已观察脱离后代参与正常退出；登记失败保留精确句柄释放重试；并发 terminate 不冲突 |
| [W27-disposal.test.ts](W27-disposal.test.ts)，真实 SessionService / Controller / SQLite + FakeProvider | Provider.dispose 首次失败第二次执行；同一 retired Session driver 失败后精确句柄重试且不新建 Runtime；FeatureDisposer 失败不 unregister、成功 feature 不重复、并发共享、成功后幂等 |
| [W27-host-crash.test.ts](W27-host-crash.test.ts)，**真实 macOS OS 进程** | 两个独立宿主及各自 Runtime；先观察并持久化后换组重挂的后代；SIGKILL 首宿主后启动恢复清理其 Runtime / 后代；另一活跃宿主、其 Runtime / 后代及无关同可执行文件服务保留；实际 ps 身份核对 |

真实 OS 探针将当前 Registry 源码打成临时 Node harness，启动的都是本测试的合成 Node 进程；**不是 Electron / Codex / 模型调用**。返回值为一个 `cleaned`、一个 `active_host`；首宿主两个受管目标均退出，第二实例 3 个目标和独立服务均仍存活。最后按测试预先保存的精确身份清理全部 fixture，未扫描 / 终止同名进程。外部服务是进程隔离探针，不声称实际共享 MCP 协议已覆盖。

本次复验后捕获的相关文件 Git blob hash：

| 文件 | hash |
|---|---|
| `runtime-ownership.ts` | `942b6c0538701e6cb75ddadafab08e2b7e574169` |
| `runtime-resources.ts` | `aa8dda5e46db201c58ff5ab591eb0f8eb0786e65` |
| `runtime-process.ts` | `7002ea8f8a7f21efac339d10d1f0d6245cabba28` |
| `session-service.ts` | `8a0f6b846bf347532539eb0c59d7a5d955c6fb7b` |
| `ipc/index.ts` | `e8b710f05766cb2c673f67f5749767737732ff9b` |
| `shutdown.ts` | `fd0abca559fbec96cc1b90da157260e889abff82` |

O1～O4 在上述受影响范围均已复验通过。尚未执行真实 Electron 宿主强杀、未观察即脱离的后代、真实共享 MCP、最终打包 UI；完整里程碑结论仍等待后续接缝、独立界面与包验证。
