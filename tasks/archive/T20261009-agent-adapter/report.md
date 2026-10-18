# 结论：T20261009-agent-adapter

## 当前收尾（2026-10-19）

Main Agent 已逐项核对本任务完成条件并整体归档，当前范围与保留项见[任务收尾](task.md#当前收尾2026-10-19)及[最终总报告](../T20261009-v1-foundation-slice/report.md)。当前 Codex 独立技术复核、完整 Electron 49/49、基础门禁和最终包 / open 冒烟已通过；以下早期“verifying / 待补验”按其历史基线解读，不改变 Claude 后续、新增体验人工验收或草稿审阅状态。

## 当前 V1 推进口径（2026-10-18）

按 [DEC-16](../../../docs/07.%20Decisions.md#dec-16-v1-真实-cli-验收范围) 与 [DEC-20](../../../docs/07.%20Decisions.md#dec-20-terminal-视觉取舍与深色主题方案)，后续真实 CLI 工作只安排 Codex；Claude Code 实现与历史证据保留，真实验收暂缓且不随当前 V1 发布（DEC-19）。本报告的历史版本、配额阻断和未覆盖证据不改写。Codex 的额度、限流及限流后的停止 / 错误由 CLI / 上游服务提供方决定，真实复测按 CLI 实际结果记录；W5-F13 与 SET-Q6 / SET-Q7 的用户确认不改变 Adapter 历史结论。

## W26～W28 实施与验证过程（历史）

当前协议由 Codex `0.163.0` 生成（215 份类型）；生产仅注册 Codex。已接入显式模型保留、原生推理强度与默认复位、图片、可信目录 Skill、公开推理 / 工具正文和持久 Runtime 归属。W26 最终包自检、W27 OS 边界探针及 W28 独立真实应用结果统一见[总体验收](../T20261009-v1-foundation-slice/acceptance.md)及[产品能力矩阵](../T20261009-v1-foundation-slice/evidence/W26-native-capabilities.md)，不由本报告复制进度。

`dispose()` / `releaseRuntimes()` 在已观察进程的退出未获确认时拒绝、保留精确句柄并允许重试；宿主失效后的启动清理按已保存的进程身份执行。采样前已完全脱离且未观察到的后代、任意外部共享 MCP 仍是证明边界，不以当前测试声称覆盖。Claude 原生排队及真实交付留待后续；未使用的上游管理方法不自动形成 V1 UI 工作。

## W25 Codex 专项结果（2026-10-18）

Main Agent 在 `88bbe2c` 基线上以 `codex-cli 0.163.0`（生成协议仍为 `0.161.0`）完成真实 Codex 专项复验，结构化结果见 [W25-codex-native.json](../T20261011-native-cli-parity/evidence/W25-codex-native.json)。六回合综合套件和两回合 Stop 套件通过；当前命令退出、此前后台服务保留、同一 Runtime、同一 Thread 继续和 `cleanup=confirmed` 均有证据。Adapter 真实第二模型从 `gpt-6.1-sol` 切换到 `gpt-6-astra` 的下一轮通过；原生预检的并发隔离、中断后续聊和 Runtime 崩溃恢复通过。

以下为 W25 当时结论；W26～W28 的当前结果见上节。W25 只更新已执行方法子集的事实，不把 0.163.0 结果外推为完整协议兼容，也不替代独立 AI / 人工验收。未观察即脱离的后代、外部 MCP 进程树、宿主异常崩溃清理和 Claude Code 真实链路仍待后续安排。一次默认 integration 命令触发的 Claude Code 调用因 `auth_required / oauth_org_not_allowed` 阻断，按 DEC-16 不计入当前 V1。

## 需要回写的内容

| 目标文档 | 内容 | 状态 |
|---|---|---|
| [Adapter spec](../../../specs/agent-adapter/spec.md) §3.6、§3.11、§3.12、§5 | 两 Provider 正式契约、Codex 系统进程基线、I-Q2 交付顺序、Claude 配置建议与真实验证边界、严格且可重试的 dispose 契约与退出证明边界 | 已回写草稿，待审阅 |
| [desktop README](../../../apps/desktop/README.md) §4 | Electron CJS 主进程经 exports default 加载 Adapter ESM；实际启动由 Electron E2E 覆盖 | 已回写 |

## 历史遗留问题（原验收基线）

- 2026-10-11 处理更新：原生能力对齐依据 [DEC-13](<../../../docs/07. Decisions.md#dec-13-原生-cli-能力对齐>)；A-Q1 / A-Q2 / A-Q5 的产品方向与 A-Q3 的技术处理已写入 [Adapter spec 第 1 节](../../../specs/agent-adapter/spec.md#1-未决问题)。代码、真实兼容与清理补验仍未完成，完整清单见[对齐任务](../T20261011-native-cli-parity/task.md)；以下历史版本与未覆盖证据不变。
- 独立验收时本机 Codex 曾为 `0.162.0`；W25 已在当前 `0.163.0` 完成真实推理、精确 Stop、第二模型、并发及崩溃恢复的已执行子集，历史和未执行方法仍不外推。
- 当前 V1 待补验：Codex 未执行的协议方法、宿主异常清理边界和应用 UI 的 Stop / 模型 / 并发专项；Claude 成功流式、Rule / Skill、Resume、模型切换、命令 Stop、续聊与并发列为后续独立工作。历史 Claude 调用受配额 / 账号策略阻断，未自动重试。
- 宿主崩溃、采样前已脱离的后代与外部 MCP 进程树未验证；dispose 返回并非零残留进程证明。
- 原独立验收时 A-Q1 / A-Q2 / A-Q3 / A-Q5 均待确认；当前处理以本节顶部链接为准。其他无关非阻塞推荐未因本次原则确认自动变为已确认。

## 历史结论（2026-10-09）

统一 Adapter 核心、Codex App Server Provider 与 Claude Agent SDK Provider 已集成到 `dev/v1`，Session 切片使用其正式接口。共享输入撤回、在途答复竞态与 Electron CJS 读取 ESM 导出的问题已修复。独立技术验收结论为**部分通过**，依据与原始证据见 [acceptance.md](acceptance.md)，任务保持 `verifying`。现有功能人工体验已于 2026-10-18 验收，接受范围见[总体验收](../T20261009-v1-foundation-slice/acceptance.md#人工功能验收)。

- 两种 Provider 的创建 / 原 ID 恢复、文本 / 工具 / 等待映射、下一轮模型与 Stop / Runtime 隔离有本地模拟及 OS fixture 验证；当前 V1 真实复测只针对 Codex，Adapter 全量 181 项单测通过。
- Codex 协议锁定 `0.161.0`，206 份生成文件经独立 SHA-256 复核；W25 在 `0.163.0` 真实验证六回合流式 / 原 ID 恢复 / 同轮文字拒绝、精确 Stop、第二模型、并发隔离和崩溃恢复。该结果仍只覆盖已执行方法子集。
- Claude SDK `0.3.293` / CLI `2.1.295` 的可用性与模型目录读取已验证，真实成功推理被 quota 阻断。模拟测试不能替代真实 AC-02 / AC-03 / AC-05。
