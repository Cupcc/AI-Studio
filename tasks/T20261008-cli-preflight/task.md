---
id: T20261008-cli-preflight
status: verifying
fr: [FR-CHAT-001, FR-CHAT-002, FR-CHAT-003, FR-SESSION-001, FR-SESSION-002, FR-SESSION-003, FR-STATE-001, FR-STATE-002, FR-STATE-003, FR-STATE-004, FR-STATE-005, FR-STATE-006, FR-INPUT-001, FR-INPUT-002]
ac: [AC-02, AC-03, AC-05]
specs: []
created: 2026-10-08
---

# CLI 集成开发前校验

> 本任务早于 `tasks/` 规范执行。task.md 于 2026-10-08 依据 [06. CLI Integration Preflight](<../../docs/06. CLI Integration Preflight.md>) 和 [scripts/README.md](../../scripts/README.md) 补录。06 即本任务的结论报告，不另写 report.md 和 acceptance.md。

## 目标

在启动 macOS 应用骨架和 CLI Adapter 开发前，用真实模型调用验证本机 Codex CLI 与 Claude Code CLI 能否满足 Session 创建、流式回复、恢复、授权与提问等待、取消和异常退出等集成需求。

## 范围

- 做：Codex App Server（stdio JSON-RPC）与 Claude Agent SDK Streaming Input 两条接入路径的协议级校验；Codex 原生 Stop 清理接口复核。
- 不做：Electron、PTY、Browser、SQLite、文件变更归因、GUI 提醒行为；结果不代表 AC-01～AC-07 或完整 P0 已验收。

## 依据

- [04. Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 2、3、4、6、7 节。
- FR 与 AC 见文件头。
- 校验脚本：[scripts/cli-preflight.mjs](../../scripts/cli-preflight.mjs)；原生 Stop 复核脚本：[evidence/codex-native-stop-check.mjs](evidence/codex-native-stop-check.mjs)。

## 验收标准

补录说明：按 06 第 4 节实测矩阵整理，逐项结论与证据链接见 06。

- [x] 协议初始化与 Model Selector 数据来源
- [x] 创建 Session 与流式回复
- [x] 进程重启后 Resume 原 Session
- [x] 同 Provider 多 Session 并行
- [x] 授权等待与拒绝
- [x] 主动提问与选择
- [x] 文本生成中取消并继续
- [x] 无效 Session 恢复返回错误，不误报 Completed
- [x] 运行中进程被终止后，其他 Runtime 可用，原 ID 可恢复
- [ ] 仅中断工具回合即可保证子进程退出：Codex 断言不成立（复现 3 次），Claude 通过；Codex 改由下一条的原生接口处理
- [x] Codex 原生 `clean` / `terminate` 清理与 Thread 隔离
- [x] Codex 停止独立 Runtime 后恢复（兜底路径）

后续必须完成的校验见 06 第 6 节，将拆为新的 task。

## 未决问题

| 问题 | 回答（确认日期） |
|---|---|

## 签收

- 状态：待签收。人在对话中确认后，本任务标记为 done。
