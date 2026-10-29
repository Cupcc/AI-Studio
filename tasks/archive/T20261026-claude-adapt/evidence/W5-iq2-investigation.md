# W5 I-Q2 集成场景调查

- 日期 / 执行者：2026-10-28，`/root/claude_diagnose`；参与本次测试修正，不属于独立验收。
- 基线：`e85d64f` 加 `packages/agent-adapter/test/claude/provider.integration.test.ts` 的本次未提交 diff；未修改生产 Adapter / SDK / 应用代码。
- 环境：macOS arm64，Node 26.10.0，Vitest 5.0.3，SDK 0.3.293。当前用户 CLI 链接已指向 2.1.312；本轮通过临时 PATH 目录的 `claude` 符号链接固定使用已保留的 `~/.local/share/claude/versions/2.1.311`（`--version` 为 `2.1.311 (Claude Code)`），没有改用户 CLI 链接、配置或认证。
- 调用沿用 task 所载真实验证授权；只使用仓库外的合成临时 Project，没有操作原生窗口。

## 发现

W4 两次完整套件在拒绝后等不到 `turn.completed`，当时没有记录失败终点的 pending 状态，因此不能区分新的待授权请求、CLI 无终态或其他原因；单独成功的事件追踪不能反证这两次失败。

本轮先保持原场景、增加枚举级事件诊断，固定 2.1.311 完整复跑一次。结果 5/6 通过；I-Q2 在 11.910 秒收到了 `turn.completed: completed`，仅有一次审批，3.637 秒被 `declined_with_text` 解决。模型随后明确描述 Bash 拒绝消息要求不执行并回复代码，它没有重试，但没有输出唯一 marker，导致原 marker 断言失败。见 [原场景诊断](W5-full-2.1.311-diagnostic.log)。

这次结果证明原场景还混入了另一种不确定性：把“回复指定代码”的新行为指令放在工具拒绝结果中，测试结果会取决于模型如何对待工具结果中的指令；它不能单独证明拒绝文字没有传到 CLI。**这不等于已找到 W4 两次历史超时的唯一根因**；两次超时保持原记录与边界。

## 修正与保持的断言

- 首条人类消息预先要求：仅执行指定命令一次；如果被拒绝，不重试并报告用户拒绝原因。
- `replyWithText` 只提供拒绝原因数据，唯一 marker 是原因的一部分。继续严格断言模型输出包含 marker，证明它读取了本次拒绝文字。
- 命令独立成行，新增断言：待拒绝的真实审批必须是 `touch declined-command-ran.txt`，避免模型改写命令或句末标点导致文件断言失真。
- 保持 `disposition: declined`、`input.resolved: declined_with_text`、`turn.completed: completed` 和指定文件不存在的断言。未自动批准任何命令。
- 拒绝后若出现新 pending 请求，立即带枚举级 pending 信息失败，不把无人作答造成的等待隐藏成普通 90 秒超时。
- 新增测试专用 `AI_STUDIO_CLAUDE_TRACE=1`：仅输出事件类型、相对时间、状态、请求种类与结果枚举；不输出 prompt / 工具输入 / 响应正文。原生失败日志仍沿用既有脱敏逻辑。

## 结果

| 检查 | 基线 / 结果 | 证据 |
|---|---|---|
| 原场景完整诊断 | 2.1.311，5 通过 / I-Q2 marker 断言失败；本轮未重现超时 | [诊断日志](W5-full-2.1.311-diagnostic.log) |
| 修正原因数据场景后的完整套件 | 2.1.311，6/6 通过，66.65 秒；I-Q2 6.906 秒。此轮在随后补充精确命令断言和独立命令行之前执行 | [完整日志](W5-full-2.1.311-fixed.log) |
| 最终精确命令场景定向复验 | 2.1.311，I-Q2 1/1 通过、5 跳过，7.13 秒 | [最终 I-Q2](W5-iq2-2.1.311-final.log) |
| Adapter typecheck | 最终测试 diff，通过 | `pnpm --filter @ai-studio/agent-adapter typecheck` |
| diff 格式 | 通过 | `git diff --check` |

复跑命令为 `AI_STUDIO_REAL_CLI=1 AI_STUDIO_CLAUDE_TRACE=1 pnpm --filter @ai-studio/agent-adapter exec vitest run --config vitest.integration.config.ts test/claude/provider.integration.test.ts --reporter verbose`，最终定向复验追加 `-t I-Q2`；PATH 在进程内固定到上述 2.1.311 二进制。

## 未覆盖与后续

- 生产代码没有改动；没有可据此修正的协议映射缺陷证据。测试语义变化仍须交未参与本次修正的 reviewer 独立复核。
- 原 W4 两次超时未完全归因；本轮一次完整通过与一次最终定向通过只说明这些具体运行成功，不证明所有模型 / 服务时序下都稳定。
- 2.1.312 未在本轮发起模型验证；不新增 `testedVersions`。SDK 保持锁定，DEC-19 与当前 V1 发布范围不变。
- 不修改人工验收、AC 或任务状态；由 Main 同步负责记录。
