# 验收：CLI 连接继承与直接 API 测试

## 未覆盖与待决事项

- 本记录仅覆盖 2026-11-10 的 model 移除、连接字段覆盖和直接 API `hi` 测试，不验收原任务的一键安装或完整打包交付。
- 新版独立详情页已完成本轮 AI 交互与截图复核，人工体验仍待用户验收；被否定的旧版界面不计为交付。
- 当前未取得可用于本轮远端调用的 Claude API Key。Claude 的直接 HTTP 协议由回环服务验证，原生配置继承由真实 CLI + 回环服务验证；均不等同于 Claude 远端模型调用成功。
- 组织管理配置、特殊网关协议、旧 CLI 版本及打包应用未在本轮独立复测。直接 API 测试读取用户级模型，不覆盖项目 / 会话专属模型；缺少明确模型时返回错误，不猜测默认模型。

## 人工功能验收

- 状态：待人工验收。
- 范围：本轮连接设置及测试体验。任务关闭、技术评审或真实请求成功均不代表人工接受产品交付。

## AI 结论与运行环境

- 当前结论：本轮实现的独立技术评审与新版 UI 交互验收通过。双 CLI 远端服务验证仍为部分覆盖（仅 Codex 完成真实直接 API 请求）；原任务的一键安装、打包与人工产品验收不因此关闭。
- 验收者：`/root/review_connection_inherit`，未参与代码实现；独立读取 diff、运行测试并搭建隔离的原生 CLI 回环实验。发现问题交回 Main Agent 修改后复验。
- 日期与代码基线：2026-11-10，`3deffa4` 上 `fix/cli-connection-inherit` 未提交 diff；后端复验 11:31，新 UI 交互及最终 diff 复核 11:42～11:46（本机时区）。当日交付保留在独立 worktree，未提交、未合入 main；后续 Git 集成状态见[集成记录](../archive/T20261111-main-integration/task.md)。
- 平台：macOS arm64；源码 / workspace 构建产物；Codex CLI 0.167.0，Claude Code 2.1.319，Claude Agent SDK 0.3.293。
- 测试环境：单元测试的模拟 Provider / 本地 HTTP fixture；原生 CLI 实验使用独立 `CODEX_HOME` / `CLAUDE_CONFIG_DIR`、回环 endpoint 和合成凭据，无外部模型调用、未改用户配置。

## 后端验收结果

来源为 [本轮任务](task.md#2026-11-10-连接配置收窄与-hi-实测)、[连接规格](../../specs/settings/spec.md#cli-连接配置2026-11-08-确认)及 [Adapter 连接覆盖](../../specs/agent-adapter/spec.md#314-应用连接覆盖)。

| 场景 | 独立操作与实际结果 | 结论 |
|---|---|---|
| 移除连接 model，兼容旧记录 | 检查 shared / IPC / 存储 / Adapter 契约；旧 profile 与 Session 快照中的 model 被忽略，保存后不再携带该字段；原生模型目录不再被收窄为一项。连接服务回归通过。 | 通过 |
| 直接 API 发送 hi | 本地 HTTP fixture 校验请求 URL、认证、原生 model、`hi` 和流式参数；Codex Responses 与 Claude Messages 均有协议覆盖。代码调用 fetch，不创建 Provider / CLI Session。 | 通过 |
| 严格判定测试成功 | HTTP 错误、失败 / 未完成事件、截断流、空回复不记通过；JSON fallback 也拒绝 max_tokens / refusal；真实回复才展示成功。 | 通过 |
| 本机模型读取 | Codex TOML profile、Claude 用户 settings / 环境 / alias 读取测试通过；Claude settings.env 的模型变量优先于进程环境，符合本轮原生实验。 | 通过 |
| Codex 仅替换连接 | 原生 CLI + 回环服务：本机模型 local-model、effort high、自定义请求头 kept 保留；全部请求发到 `/new/responses`，使用新合成凭据，旧 endpoint 未收到请求。配置探测与新 Runtime 均退出。 | 通过 |
| Claude 仅替换连接 | 原生 ClaudeProvider + 回环服务：用户 settings.env 含旧地址 / Key / Token 及 settings-model，进程含另一个模型；通过 stdin 的 applyFlagSettings 覆盖后，请求只到 `/new/v1/messages?beta=true`，使用新合成 API Key，无旧 Authorization，模型仍为 settings-model。 | 通过 |
| Claude Runtime 恢复 | 检查初次初始化和 recoverRuntime 的原生握手之后均应用连接 overlay，覆盖发生在提交用户输入之前；相关 Provider 单测通过。真实 Stop / 恢复全流程不在本轮回环实验范围。 | 源码与模拟通过 |
| Codex 真实远端 hi | Main Agent 自检结果已读取：direct HTTP API，模型 gpt-6.1-sol，回复 “Hi! How can I help you today?”。这是直接 API 请求成功证据，不是 CLI Session 实测。证据见 [W1-direct-api.json](evidence/W1-direct-api.json)。 | 自检成功，非重复独立调用 |

独立执行的检查：

- `pnpm --filter @ai-studio/agent-adapter typecheck` 通过。
- `pnpm --filter @ai-studio/agent-adapter exec vitest run test/codex/provider.test.ts test/claude/provider.test.ts`，116 项通过。
- `pnpm --filter @ai-studio/desktop exec vitest run src/main/services/session/connection-test.test.ts src/main/services/session/cli-connection.test.ts src/renderer/src/features/settings/settings.test.tsx`，26 项通过。该命令已于 11:41 在重设计后的界面基线上独立重跑，26 项通过，覆盖 URL / Key 保存、留页测试、dirty 禁测及返回丢弃未保存修改。
- 保存 / 返回禁用的最后补充后，于 11:46 独立重跑 `settings.test.tsx` 与 `connection-test.test.ts`，23 项通过。
- `git diff --check` 通过。

## 缺陷与复验

1. Codex 原生 config/read 的空 provider 字段直接回传导致 `gateway_oauth` 类型错误；thread 级 provider 切换还产生原生 provider mismatch。最终采用配置探测、剔除空字段 / 旧认证、在 app-server 启动时注入覆盖。独立原生回环请求已通过。
2. Claude 宿主管理环境标记会抑制用户 settings.env 的模型，不满足继承要求。独立实验确认：单独移除标记又会让用户文件中的旧 URL / Key 覆盖进程值。最终改为原生设置加载后，经 stdin RPC 应用仅含连接字段的 flag overlay；独立真实 CLI 与最终 Adapter 均验证新连接和旧模型同时生效。凭据不写 CLI 参数或配置文件。
3. 旧版设置页面异步测试结果可能串到另一个 CLI；最终界面使用按 CLI 挂载的独立详情组件，卸载后不写测试状态。独立返回 / 切换 CLI 操作未观察到结果串页。
4. 最初实现经 CLI 发送测试消息；用户随后明确要求直接 API 测试，当前实现已移除测试用 CLI Session 路径。此前 CLI `hi` 自检不替代本记录的直接 API 证据。

## 新版界面验收

使用独立 agent-browser session 连接 Main Agent 已启动的 Electron 调试端口 9335，从可见入口操作。应用使用隔离 userData，已保存的 `http://127.0.0.1:9336/v1` 是回环 HTTP fixture，无真实密钥。本轮独立 UI 操作没有修改持久配置。

| 操作 | 独立观察 | 结论 |
|---|---|---|
| 打开 Codex 连接详情 | 同一设置侧栏保留，详情中只有 URL / API Key；模型字段与认证方式选择均移除。已保存 / 安全保存状态和测试操作分区清晰。 | 通过 |
| 将 URL 改为 `/v2`，不填新 Key | 测试禁用；保存禁用，避免复用另一地址的密钥；此前测试结果清除。 | 通过 |
| 返回列表，再次打开 Codex 详情 | URL 恢复已保存的 `/v1`，未保存输入被丢弃，测试重新可用。 | 通过 |
| 点击测试连接 | API fixture 返回文本后显示“连接正常”、本机模型、耗时和回复。页面自动滚动，使结果完整可见，底部按钮没有遮挡回复。 | 通过 |
| 打开 Claude 详情并切换自定义 | 本机模式说明清楚；自定义模式只出现 URL / Key；空表单的保存 / 测试禁用。返回后未持久化切换。 | 通过 |
| 浅 / 深色检查 | 独立查看 [浅色表单](evidence/W1-cli-connection-light.png)、[浅色结果](evidence/W1-cli-connection-result.png)、[深色结果](evidence/W1-cli-connection-dark.png)，未发现遮挡、溢出或不可辨认的主文字。独立回环测试后另查看实际截图确认自动滚动。 | 通过 |

最终补充 diff 复核：配置加载期间禁用列表的配置按钮；保存期间禁用详情返回 / 取消；保存成功先同步父层回调，再判断详情是否仍挂载。避免以未加载配置初始化详情，以及普通返回路径漏同步。保存失败、等待、成功状态和结果结构由定向 UI / API 测试覆盖。

结果契约已核对：成功结果必须提供 `model`、`reply`、`durationMs`；失败仅提供错误消息。详情用结构化字段展示结果，不再解析拼接消息。时长仅表示本次 API 测试用时，不是性能基准。

## 工作树交付与门禁边界

本次增加 `smol-toml` 依赖以读取原生 TOML。现有受影响选择器把 desktop package.json 与 pnpm-lock.yaml 视为未映射的全局路径，因此自动提交门禁不能给出可靠范围。本轮没有扩写全局豁免、没有跳过门禁，也没有修改选择器来强行提交。已经执行的定向类型 / 测试 / 构建与真实、界面证据仍有效；提交 / main 合入未完成，不以这些自检代替门禁通过。后续若安排提交，应单独补充基于实际依赖差分的范围映射及回归，再执行正常门禁。
