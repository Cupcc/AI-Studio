# W2 Codex Provider 实施与验证记录

- 日期：2026-10-09。
- 范围：`src/codex/**`、`test/codex/**`；未修改共享核心、package 配置、spec、task 或 plan。
- worktree：`codex-provider-resume`；基线 `385adf0`。
- 依据：task 验收标准；spec 第 2.2～2.11、4.4 节；04 第 4 节；[CLI 校验报告](../../../T20261008-cli-preflight/report.md) 第 3～6 节。影响 FR-CHAT-002/003、FR-SESSION-002/003、FR-STATE-001/002/003/007、FR-INPUT-001/002；AC-02/03/05 Adapter 部分。
- 结果文件：[W2-codex-results.json](W2-codex-results.json)。本文不是人工验收确认，不修改任务状态。

## 实现

1. Provider/Driver 使用共享 SessionController、JsonRpcPeer、RuntimeProcess/Slot、LiveSessions、bounded exec 和系统进程探测；每 Session 独立 Runtime。
2. 建立/恢复、原生 ID 锁定、Running 即时、文本增量和全文区分、工具活动、终态/原生耗时、错误归一、标题、分页模型目录和下一轮模型切换。
3. 命令/文件/权限审批、问题/自由文本/保密答案、多请求独立回复、原生撤回、Stop 取消、未知请求拒绝。
4. 默认不覆盖原生模型/权限/配置；明确的 overrides/providerOptions 才传原生。使用宿主传入 env，不直接读取账户或用户配置文件。
5. 0.161.0 CLI 生成 206 份传递依赖类型，只机械补 `.js` import；manifest 保存每份原始内容 SHA-256。

## A-Q4：同轮文字拒绝已真实验证

原生审批还挂起时先发 `turn/steer`（带当前 `expectedTurnId`），回执确认同一轮已接收文字，再回复所有挂起审批 `decline`。这个顺序避免先拒绝导致回合结束、文字无法交付。失败时保留请求可回答，不发起新的 `turn/start`。

真实合成用例要求 `touch approval-probe.txt`，审批出现后输入“拒绝并仅回复随机标记”。结果：同一轮成功回复标记，文件没有产生。未记录原始账户状态或配置。

## Stop：生成字段与锁定实现的差异

官方文档：[Codex App Server](https://learn.chatgpt.com/docs/app-server)，于 2026-10-09 检索并读取。锁定源码来自预检保留的本地 checkout：`openai/codex` 的 `rust-v0.161.0`，HEAD `979011409de0a60b52f179721948e65531d26144`。

`ThreadBackgroundTerminal` 生成类型包含 `osPid:number|null`，但 [thread_processor.rs:2418](https://github.com/openai/codex/blob/979011409de0a60b52f179721948e65531d26144/codex-rs/app-server/src/request_processors/thread_processor.rs#L2418) 实际固定返回 `os_pid: None`。不能把类型中存在字段当成运行时提供该值。

修正后的实现：

- 原生终止目标始终是当前 thread/turn 的 command item/processId；绝不把 processId 当系统 PID，也不使用 `clean` 代替本轮终止。
- 提交前保存原生后台命令基线与系统后代 PID/启动时间基线。存在 osPid 时校验其 Runtime 归属；osPid 为空时记录本轮新出现的 Runtime 后代超集。
- Stop 前采样；原生回合终态后精确 terminate；以系统身份退出确认整个已观察目标集合结束。列表空、原生回执和 interrupted 不单独算完成。
- 无身份、歧义、无法验证、超时或接口失败时，旧 Runtime 确认退出后恢复原 thread。恢复失败明确关闭，无静默新建与输入重放。
- 已观察的脱离进程组/父链后代按身份保留；从未被观察到就已彻底脱离的进程、外部 MCP 进程树仍属边界。超集可能因额外新进程仍活着而保守走兜底。

## 测试

### 不使用真实 CLI / 模型

- 模拟协议测试覆盖生命周期、配置保留、文本、错误、输入、模型、版本/认证报告，以及 Stop 正常/异常分支。
- 系统进程测试由 Node fixture 模拟 App Server，真实创建前一轮服务及当前轮两层子进程；所有原生 osPid 都为 null。修正版成功只终止当前轮，系统 ps 确认两层进程退出、先前服务仍存活，Runtime 未重启。
- 重复 Stop、迟到事件、PID 复用、映射歧义、无观察身份、原生 API 不可用、清理超时、旧 Runtime 残留、恢复失败和其他 Session 隔离均有测试。

### 真实 CLI：总计六个 Astra high 回合，不重试模型请求

| 执行 | 已观察通过 | 未通过 / 限制 |
|---|---|---|
| 六回合综合场景第一次运行，实际提交 4 回合 | executable/version/login、模型目录、流式输出、跨 Runtime 同 ID 恢复与随机标记回忆、A-Q4 文字拒绝 | 第 4 回合进程探测正则大小写错误，macOS 进程名为 `Python`，误判“进程未启动”；90s 后停止，finally 清理确认。不能把该套件记为通过 |
| 修正探测后双回合 Stop 场景，实际提交 2 回合 | 前一轮服务与本轮命令均启动；旧实现遇 osPid:null 保守进入 Runtime 终止/原 ID 恢复，Stop 返回 stopped；finally 清理确认 | 期望原生精确清理，但实际 runtime_restarted，故“保留先前服务”未通过。随后才完成 osPid:null 系统基线修正；六回合预算已用完，未再调用模型重测 |
| 只读协议诊断与 EOF 检查，0 模型回合 | 精确测试 cwd 过滤的 thread/list/read 用于定位；初始化后 stdin 关闭，空闲 App Server 退出码 0，清理确认 | 未验证正在运行命令时宿主异常崩溃的残留清理 |

原生基线修正已通过模拟协议及真实系统进程 fixture，但尚未通过真实 Codex 推理重测。不能据此宣布完整 AC 或所有真实 Stop 场景通过。未在此轮真实切换到第二个模型；模型切换行为由模拟测试证明。

## 共享核心待主 agent 接线

`serverRequest/resolved` 目前会通过 SessionSink 清除 pending input，但 `JsonRpcPeer` 没有“不写响应、仅撤回 incoming 请求”的 API。原生自行撤回的请求在 peer 的内部 incoming Map 保留到连接关闭，长会话中可能积存。建议增加 `dismissIncoming(id)`：把闭包中的 responded 设为 true 并删除 incoming 记录，不写传输；然后由 Driver 在该通知中调用。W2 没有超范围改共享核心。该问题不阻止 UI 解除等待，但应在集成时补齐。

## 交给主 agent 的 spec 补写要点

- 第 2.11 节采用上面的 Provider 默认配置、协议版本、精确恢复、输入映射、A-Q4 已验证顺序及 Stop 系统基线规则；实现细节见 `src/codex/README.md`。
- A-Q1 继续按推荐：0.161.0 tested，其余 untested；未知实验接口在 Stop 时兜底。
- A-Q3 仅验证空闲 App Server 的 stdin EOF 退出；宿主异常崩溃时活动/已脱离的命令清理仍未解决。
- 第 06 节原生“有 osPid 字段”不能表述为“0.161.0 运行时提供系统 PID”；保留本文发现与真实失败记录。
