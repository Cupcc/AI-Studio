# W3 Claude Provider 实现与验证

日期：2026-10-09。任务：T20261009-agent-adapter。范围：FR-CHAT-002/003、FR-SESSION-002/003、FR-STATE-001/002/003/007、FR-INPUT-001/002；AC-02/03/05 的 Adapter 部分。此记录不代表人工验收或任务 done。

## 产出与使用

入口 `@ai-studio/agent-adapter/claude` 导出 `ClaudeProvider`、`createClaudeProvider`、`CLAUDE_CAPABILITIES` 及 `ClaudeProviderDependencies` / `ClaudeProviderOptions` 类型。

```ts
import { ClaudeProvider } from '@ai-studio/agent-adapter/claude';

const provider = new ClaudeProvider();
const session = await provider.createSession({
  cwd: '/absolute/project/path',
  environment: { env: resolvedLoginShellEnvironment },
});
session.subscribe(handleAdapterEvent);
await session.sendUserInput({ text: 'Hello' });
// 原生 ID 由 session.native_id 通知；宿主持久化后可调用 resumeSession。
await provider.dispose();
```

构造器和工厂均接受可选 `ClaudeProviderDependencies`，仅用于注入 SDK / Runtime / executable / exec / processLister 测试替身；产品直接无参实例化。每个 Session 使用独立 SDK Query 和 RuntimeProcess。SDK 同步 spawn 回调与 RuntimeProcess 异步 start 之间以 SpawnBridge 缓冲 stdio；不增加另一套进程管理。

`providerOptions` 支持：`settingSources`、`systemPrompt`、`tools`、`allowedTools`、`disallowedTools`、`additionalDirectories`、`allowDangerouslySkipPermissions`、`maxTurns`、`maxBudgetUsd`。未知项拒绝。Codex 专属覆盖项拒绝。结构化附件暂以 unsupported 前置拒绝，纯文本原生文件引用可直接发送。

## 实现说明

- 使用锁定的 SDK 0.3.293，通过 pathToClaudeCodeExecutable 指向宿主发现的本机 CLI；保留 SDK spawn 回调提供的环境（包括协议变量）。没有读取宿主 process.env 的 Provider 代码。
- A-Q5 按主 Agent 分配实现：不传 settingSources 即加载 user/project/local；systemPrompt 默认 claude_code preset。模型、permissionMode 不设置产品默认。A-Q5 仍待人工确认，真实 Rule/Skill 加载测试受配额阻断。
- 用户消息标 `origin: {kind:'human'}`；授权与问题答复标 `decisionClassification: user_temporary/user_permanent/user_reject`。不按工具名或 MCP 名称自动授权；原生权限规则/模式先行判定，只有 canUseTool 回调进入宿主。
- 授权保留原生 title、description、decisionReason、toolUseID、建议权限更新；仅在原生建议存在且未 suppressAlwaysAllowRule 时提供持久授权选项，说明包含原建议。defaultToNo 反映到 primary 选项。
- AskUserQuestion 保留题目/选项顺序；回答以原始 question 文本为键写回 answers。多请求独立答复；SDK abort 原生撤回；Stop/终态/dispose 释放等待。I-Q2 由共享控制器判断单个自由答复或全部拒绝，Claude deny.message 把文字传给当前 Agent。
- message_start 的 message.id 与 content index 组成文本/思考条目 ID；完整 assistant 消息替换同 ID 的 partial 内容。完整消息和 delta UUID 去重；tool_use/tool_result 独立映射活动。result success 且 is_error=false 才成功；API 错误与用户取消分开。
- SDK user_message_uuid 关联回合，旧回合事件交核心迟到事件守卫；结果 UUID 去重。只保留最近 128 轮关联。SDK 未给 user_message_uuid 的新异步帧只能以当前回合回退关联，无法完整识别任意旧生产者的乱序流。
- setModel 在 Running/Stopping 时暂存，到下一轮提交前才调用 Query.setModel；idle 立即调用。模型目录用 supportedModels；Provider 级探测不发送消息并设 persistSession=false。
- Stop 前/运行期间采样该 Runtime 后代，以 PID+启动时间排除本轮前存在的进程；interrupt 后以系统探测等候新后代退出。中断/退出证明失败走 RuntimeSlot.replace，原生 ID、cwd、配置恢复，不重发消息。still_queued 中若仍有当前输入，走 Runtime 重启防止取消后继续执行。没有原生 ID 时恢复失败，不新建会话。
- 新 Runtime 通过 SDK 初始化控制请求准备就绪；resume 原生 ID 的最终验证可能延迟至下一条输入（CLI 行为）。不同 ID 或懒加载恢复失败会关闭 Session。

## 验证

| 检查 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile`（独立 worktree） | 通过，无锁文件变更 |
| `pnpm --filter @ai-studio/agent-adapter typecheck` | 通过 |
| `pnpm --filter @ai-studio/agent-adapter test` | 128/128，通过；其中 Claude 27 项 |
| `pnpm --filter @ai-studio/agent-adapter build` | 通过 |
| 未设 AI_STUDIO_REAL_CLI 的 `test:integration` | 4 项全部跳过，没有模型调用 |
| 显式真实 CLI availability | 通过：本机 executable、版本、登录分别检查 |
| 显式真实 CLI catalog | 目录可读；调用前后 Claude projects 的 transcript 文件集合无新增 |
| 真实成功流式/原生 Rule、Skill/恢复/模型切换 | 未通过；首轮模型调用即受 session quota 阻断 |
| 真实命令授权/Stop 子进程退出/继续 | 未通过；工具回合未启动，首次用例等待超时 |

真实运行：`AI_STUDIO_REAL_CLI=1 pnpm --filter @ai-studio/agent-adapter exec vitest run --config vitest.integration.config.ts test/claude/provider.integration.test.ts`。初次 2 项失败（1 项 quota、1 项等待工具超时）；一次单用例诊断复核确认原生 `rate_limit`，提示 session limit、Asia/Shanghai 18:10 重置。收到主 Agent 停止指示后未再发起调用。诊断复核已在收到指示前启动，随后正常结束。每次用例均 finally 调用 provider.dispose；没有测试睡眠命令启动。证据仅保留枚举/布尔和脱敏错误摘要，没有认证响应、邮件、凭证或完整配置。

模拟测试覆盖：部分/完整文本去重、思考/工具、is_error success、多请求授权和原生建议、AskUserQuestion 选择/自由答复、多请求 composer 拒绝、原生撤回/异常请求、重复 Stop、子进程退出证明、先前后代保留、失败兜底、未证实旧 Runtime 退出时不启动新 Runtime、still_queued、迟到结果、无原生 ID 恢复失败、恢复 ID 不匹配、Runtime 崩溃隔离、Stop 中崩溃隔离、模型下一轮生效、目录不持久化、abort 前置检查、availability 身份字段剔除。

## 边界与待验收

- 真实成功回合与 Stop 未完成，不能以模拟结果标记 AC 通过；需要配额恢复后由主 Agent 决定是否重跑。
- 系统后代采样不能完整追踪在采样间隔内脱离父链/进程组的后代；外部 MCP 服务自己启动的进程不在本机 Runtime 后代证明范围。宿主异常退出后的残留清理（A-Q3）未验证。
- 不声明支持运行中追加或排队（inputWhileRunning=none）；SDK interrupt 的内部未知队列项不当作本产品提交的消息。
- 原生 question 没有 secret 字段，AskUserQuestion 问题默认 secret=false；本证据不保存任何用户问题答复。
- A-Q5 实现选择待人工审阅，未修改已确认文档或 task 状态。

## 依据

实现核对 SDK 0.3.293 的 `sdk.d.ts`（CanUseTool、PermissionResult、SpawnOptions、Query、Options、SDKMessage），并参考官方 [用户输入](https://code.claude.com/docs/en/agent-sdk/user-input)。产品行为遵循 `specs/agent-adapter/spec.md`、`docs/04. Technical Requirements.md`、`docs/06. CLI Integration Preflight.md`。SDK 类型声明是本阶段版本的具体行为依据。
