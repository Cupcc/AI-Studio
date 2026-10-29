# Codex Provider

`CodexProvider` 实现共享 `AgentProvider`，所有 Session 使用 `SessionController`、独立 `RuntimeProcess` 和 `RuntimeSlot`。包入口：`@ai-studio/agent-adapter/codex`。

```ts
import { CodexProvider } from '@ai-studio/agent-adapter/codex';

const provider = new CodexProvider();
const session = await provider.createSession({
  cwd: projectDirectory,
  environment: { env: resolvedLoginShellEnvironment },
});
session.subscribe(handleAdapterEvent);
await session.sendUserInput({ text: 'Describe this project' });
// On application shutdown:
await provider.dispose();
```

## 配置与版本

- 不传 overrides 时只向 `thread/start` 传 `cwd`；模型、审批、沙箱、Rule、Skill、Context 均由原生配置决定。不读取宿主的隐式 `process.env`。
- 通用 overrides：`model`、`approvalPolicy`、`sandboxMode`。`permissionMode` 或未知覆盖项明确拒绝。
- 可选 `providerOptions`：`config`（原生 JSON 配置对象）、`baseInstructions`、`developerInstructions`、`effort`、`collaborationMode`。默认不传任何额外项；不提供 `history` / `path`，以免绕过恢复的 `threadId`。
- `setReasoningEffort(effort | null)` 只影响下一轮；显式 null 从该 cwd 有效配置或所选模型原生目录默认解析，取不到时明确失败，不硬编码默认级别。
- `listSkills({ environment, cwd })` 只查询原生目录，不创建 Thread；`sendUserInput` 支持 file / image / skill 原生附件，宿主负责将用户选择解析为可信路径。
- `setModel` 只影响下一轮。原生 `model:null` 表示保持已有设置，因此 Adapter 的 `setModel(null)` 会读取该 cwd 的 CLI 有效默认模型，下一轮显式提交它；无配置值时使用原生目录的默认项。
- 可用性分别检查 executable、`--version`、`login status` 和可选模型目录。认证输出只转换为粗粒度状态，不保留原始输出。模型目录只进行握手与 `model/list`，不创建 Thread。
- 登录兼容旧版 `Logged in` 与新版 `API key configured`；后者只代表本地已配置 API key，不保证远端认证成功。判定边界见 [Adapter spec §3.11](../../../../specs/agent-adapter/spec.md#311-codex-provider)。
- 当前类型锁定为 Codex CLI `0.163.0`；已执行方法的证据见[本轮收尾](../../../../tasks/archive/T20261009-v1-foundation-slice/evidence/W26-closure.md)，不宣称全部生成协议通过。其他版本报告 `untested`，不会因版本号不同自动禁止；实验接口缺失时 Stop 走独立 Runtime 兜底。

## 事件与请求

- 原生 `thread.id` 在创建/恢复时报告；恢复必须返回同一 ID，失败时拒绝，不回退 `thread/start`。
- 回合事件通过 threadId、native turnId 路由；支持开始事件先于 RPC 回执，以及结束后的迟到事件丢弃。
- assistant 文本完整条目替换增量；reasoning、命令、文件、MCP、动态工具、子 Agent 与搜索活动映射为共享条目。
- command/file/permissions 审批、`requestUserInput` 分别保存独立服务端请求。原生审批选项按顺序保留，对象形式 amendment 原样回复；问题选项回复使用原生 label。
- `replyWithText` 需要拒绝请求时，先用带 `expectedTurnId` 的 `turn/steer` 把文字交给仍被请求阻塞的同一轮，再拒绝挂起请求；一般运行中发送也复用该原生 steer，失败时保留输入，不另起一轮。这个顺序已在真实 0.161.0 上验证。
- 不认识的服务端请求明确返回 `-32601` 并报告 diagnostic，不允许请求无限挂起。
- `serverRequest/resolved` 清除 UI 待输入，并通过 `JsonRpcPeer.dismissIncoming` 释放对应的未响应请求；该路径已由输入撤回回归覆盖。

## Stop 的系统进程证据

1. 在提交前保存该 Runtime 的系统 PID/启动时间基线及原生后台 processId 基线。
2. 按当前 native turn 的 command item 关联 `itemId` 与原生 `processId`；运行时定期记录后代进程，保留之后脱离父链/进程组的已观察身份。
3. Stop 前再采样，然后发 `turn/interrupt`；之后只 `terminate` 本轮原生 processId，绝不调用整条 Thread 的 `clean`。
4. 如原生提供 `osPid`，校验其属于本 Runtime 后跟踪该身份及后代。注意：0.161.0 的生成类型虽然含 `osPid`，实际源码固定返回 `null`。此时以提交前基线为界，保守记录该轮新出现的 Runtime 后代超集，原生终止仍按 item/processId；只有整个已观察超集退出才确认完成。
5. 列表空、`terminated:true`、回合 interrupted 都不是退出证据。映射缺失、没有可观察身份、清理/探测失败、超时或接口不可用时，经 `RuntimeSlot.replace` 确认旧 Runtime 退出，再以同一 threadId/cwd/显式配置恢复；不重放输入。

超集验证可能因为本轮新增的非命令进程仍存活而保守进入 Runtime 兜底。兜底可能停止本 Session 以前的后台服务。轮询开始前已经彻底脱离父链/进程组、且从未被系统快照观察到的进程，以及外部 MCP 所在进程树，不在已有证明范围内。

## 协议生成与验证

`protocol/` 是本机 0.163.0 CLI 生成类型的传递依赖子集，共 215 个类型文件。只把相对 import 补 `.js`；`manifest.json` 保存原始文件 SHA-256 和来源版本。

```sh
node packages/agent-adapter/src/codex/generate-protocol.mjs /path/to/codex
pnpm --filter @ai-studio/agent-adapter typecheck
pnpm --filter @ai-studio/agent-adapter test
```

生成器检查 CLI 版本，无模型调用。默认测试不启动真实 CLI；测试用模拟协议与系统 Node 进程验证 OS 退出。真实套件只有 `AI_STUDIO_REAL_CLI=1` 才启用，六回合综合场景和另一个双回合 Stop 场景互斥；后者还需 `AI_STUDIO_CODEX_STOP_ONLY=1`。

官方协议文档：[Codex App Server](https://learn.chatgpt.com/docs/app-server)。本次真实结果与未覆盖项：[W2 evidence](../../../../tasks/archive/T20261009-agent-adapter/evidence/W2-codex-provider.md)。
