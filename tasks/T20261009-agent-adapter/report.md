# 结论：T20261009-agent-adapter

## 当前 V1 推进口径（2026-10-18）

按 [DEC-16](../../docs/07.%20Decisions.md#dec-16-v1-真实-cli-验收范围) 与 [DEC-20](../../docs/07.%20Decisions.md#dec-20-terminal-视觉取舍与深色主题方案)，后续真实 CLI 工作只安排 Codex；Claude Code 实现与历史证据保留，真实验收暂缓且不随当前 V1 发布（DEC-19）。本报告的历史版本、配额阻断和未覆盖证据不改写。Codex 的额度、限流及限流后的停止 / 错误由 CLI / 上游服务提供方决定，真实复测按 CLI 实际结果记录；W5-F13 与 SET-Q6 / SET-Q7 的用户确认不改变 Adapter 历史结论。

## 需要回写的内容

| 目标文档 | 内容 | 状态 |
|---|---|---|
| [Adapter spec](../../specs/agent-adapter/spec.md) §3.6、§3.11、§3.12、§5 | 两 Provider 正式契约、Codex 系统进程基线、I-Q2 交付顺序、Claude 配置建议与真实验证边界、dispose 不抛错与退出证明限制 | 已回写草稿，待审阅 |
| [desktop README](../../apps/desktop/README.md) §4 | Electron CJS 主进程经 exports default 加载 Adapter ESM；实际启动由 Electron E2E 覆盖 | 已回写 |

## 遗留问题

- 2026-10-11 处理更新：原生能力对齐依据 [DEC-13](<../../docs/07. Decisions.md#dec-13-原生-cli-能力对齐>)；A-Q1 / A-Q2 / A-Q5 的产品方向与 A-Q3 的技术处理已写入 [Adapter spec 第 1 节](../../specs/agent-adapter/spec.md#1-未决问题)。代码、真实兼容与清理补验仍未完成，完整清单见[对齐任务](../T20261011-native-cli-parity/task.md)；以下历史版本与未覆盖证据不变。
- 独立验收时本机 Codex 已升为 `0.162.0`；该版本未进行真实推理 / 精确 Stop 兼容验证，历史 `0.161.0` 结果不外推。
- 当前 V1 待补验：Codex 修正版精确 Stop、真实第二模型切换、文件引用和应用内全流程；Claude 成功流式、Rule / Skill、Resume、模型切换、命令 Stop、续聊与并发列为后续独立工作。历史 Claude 调用受配额阻断，未自动重试配额。
- 宿主崩溃、采样前已脱离的后代与外部 MCP 进程树未验证；dispose 返回并非零残留进程证明。
- 原独立验收时 A-Q1 / A-Q2 / A-Q3 / A-Q5 均待确认；当前处理以本节顶部链接为准。其他无关非阻塞推荐未因本次原则确认自动变为已确认。

## 结论

统一 Adapter 核心、Codex App Server Provider 与 Claude Agent SDK Provider 已集成到 `dev/v1`，Session 切片使用其正式接口。共享输入撤回、在途答复竞态与 Electron CJS 读取 ESM 导出的问题已修复。独立技术验收结论为**部分通过**，依据与原始证据见 [acceptance.md](acceptance.md)，任务保持 `verifying`。现有功能人工体验已于 2026-10-18 验收，接受范围见[总体验收](../T20261009-v1-foundation-slice/acceptance.md#人工功能验收)。

- 两种 Provider 的创建 / 原 ID 恢复、文本 / 工具 / 等待映射、下一轮模型与 Stop / Runtime 隔离有本地模拟及 OS fixture 验证；当前 V1 真实复测只针对 Codex，Adapter 全量 181 项单测通过。
- Codex 协议锁定 `0.161.0`，206 份生成文件经独立 SHA-256 复核；真实六回合确认流式、原 ID 恢复及上下文、同轮文字拒绝与 Runtime 兜底恢复。精确 Stop 修正版未再进行真实模型复测。
- Claude SDK `0.3.293` / CLI `2.1.295` 的可用性与模型目录读取已验证，真实成功推理被 quota 阻断。模拟测试不能替代真实 AC-02 / AC-03 / AC-05。
