---
id: T20261108-cli-install
status: verifying
fr: [FR-SET-001, FR-CHAT-002]
ac: [AC-08]
specs: [specs/settings/spec.md, specs/chat/spec.md, specs/agent-adapter/spec.md]
created: 2026-11-08
---

# 支持的 CLI 列表与一键安装

## 目标与依据

用户 2026-11-08 请求：app 支持的 CLI 都显示；检测到未安装 Codex / Claude Code 时可选择一键安装。沿用 [CLI 管理规则](../../specs/settings/spec.md#cli-管理与默认-cli2026-10-25-确认) 的添加 / 移除、默认选择与可用性检测。

## 范围

设置中显示支持项；主进程执行官方原生安装器；安装状态、失败重试、安装后环境刷新与可用性重检。安装不等于登录或人工验收。

## 已确认事项

- 用户 2026-11-08 回答「同时启用 Claude Code 会话（推荐）」：解除正式版 Provider 开关限制，发布范围相应更新；不等于真实验收已通过。
- 同日新增：应用维护独立 CLI 配置，配置 base URL / API key，优先不替换本机文件。用户随后在机制研究后回复「apply,实现上述方案」（2026-11-08 确认）：使用本机 / 应用两种模式，独立配置、加密密钥、原文件不替换，新会话使用新配置、已有会话保留配置快照。

## 验收场景

| 来源 | 场景与操作 | 预期 | 验证 |
|---|---|---|---|
| 本次请求、FR-SET-001 | 打开设置 → CLI | 所有支持项可见，包括未安装项 | 实际 Electron + agent-browser 截图 |
| 本次请求 | 点击未安装 CLI 的一键安装 | 官方安装器运行，状态反馈，重复点击不重复启动 | 服务测试、隔离环境真实安装、UI |
| 本次请求 | 安装结束 | 刷新环境与 CLI 状态；未登录显示登录提示 | 服务 / UI 测试、真实检测 |
| 本次请求 | 网络失败、非零退出、超时、关闭设置后重开 | 清晰错误，可重试；状态保留；进程正确清理 | 定向测试、UI |
| 既有 CLI 管理规则 | 添加、移除、默认选择 | 原行为不回退，不改运行中的会话 | 设置及 Session 定向回归 |

## 执行记录

- 2026-11-08：主工作区有大量既有未提交变更。`main` 与 `origin/main` 同为 `9846eea`，在独立 worktree `../AI Stduio.worktrees/cli-install`、分支 `feat/cli-install` 开发，不覆盖主工作区。
- 官方来源：[Codex CLI](https://learn.chatgpt.com/docs/codex/cli)、[Claude setup](https://code.claude.com/docs/en/setup)，2026-11-08 检索。两者支持原生安装，不依赖 npm / brew。

## 收尾

实现已完成并提交于 `a50ec2e`（独立 worktree `../AI Stduio.worktrees/cli-install`）；任务进入 verifying。安装服务、双 CLI Provider、独立连接配置和配置修订快照已接入。用户随后要求先核实配置机制并参考 CC Switch；研究结果与实现边界见 [机制研究](research.md)。

本轮收尾复核：已核对 settings spec 的 CLI 管理与连接配置、agent-adapter spec 的 ProviderEnvironment、DEC-19 历史边界与 DEC-27 新确认、路线图下一步 / 模块状态 / 验收进度；已更新负责文档。保留项：未执行 Electron agent-browser 交互验收、真实网关请求、打包应用验证与人工产品验收；一键安装真实网络流程仅完成实现与进程单测，未在本轮重复执行。

2026-11-09：按用户“全部整合，并清理所有 worktree/本地任务分支”授权，安装与连接实现整合为 `ce94716`；保留附件缓存与设置文案规则。类型检查、Adapter 287 项、桌面 305 项通过。DEC 编号碰撞已改为 DEC-27，Adapter 连接节改为 §3.14。当前 Git 交付进度见 [集成记录](../../.agents/archive/tasks/T20261109-main-integration/task.md)，本任务保持 verifying，未完成的功能验收不因提交而关闭。

## 2026-11-10 连接配置收窄与 hi 实测

用户要求移除 CLI 连接设置的 model，只替换 URL / API Key，其他设置保持本机行为，并用模型实际发送 `hi` 验证。本轮在 `fix/cli-connection-inherit` 独立 worktree 实施；主工作区既有文档整理不在本轮写入范围。

验收场景：设置入口不再显示或提交 model；旧连接记录 / 会话快照中的 model 不再作为连接覆盖；CLI 原生模型目录、模型与思考强度继续继承；后续用户明确纠正为直接 API 调用，并指定参考 Cockpit Tools 唤醒；测试读取用户级本机模型，直接发送 `hi`，不启动 CLI（2026-11-13 曾改为经 CLI 模型目录解析 Claude 别名，随后按用户纠正撤回，现为测试模型，见[下文](#2026-11-13-连接测试改为测试模型)）。成功必须收到完整回复，HTTP 错误 / 流失败 / 截断 / 空回复 / 超时不记通过。保存配置不发模型请求。覆盖服务与 Adapter 定向测试、设置界面实际操作与截图、双 CLI 实测；跨模块契约由独立 Review Agent 复核。真实请求使用本机已配置的连接或应用已保存连接，不记录凭据，不修改本机 CLI 文件。

本轮实现、界面自检与独立技术评审已完成。改动保存在 `fix/cli-connection-inherit` worktree，未提交、未合入 main；新增 TOML 依赖涉及 `apps/desktop/package.json` 与 `pnpm-lock.yaml`，现有受影响检查未映射这两项，不能视为提交门禁通过。本轮不绕过门禁，也不扩展为检查工具改造。原任务的一键安装 / 打包 / 人工验收保留项不因本轮局部验证自动关闭。


参考实现：[Cockpit Tools Codex 唤醒](https://github.com/jlcodes99/cockpit-tools/blob/7ca7f0db1f915452681c9bbc366f199e2310761f/src-tauri/src/modules/codex_local_access_foundation.rs#L2114)，借鉴宿主直连、流式完成判定与可读回复验证；不复制其 OAuth 账号管理、默认模型或调度策略。测试模型读取 Codex 用户 config.toml（含选中内联 profile），Claude 用户 settings.json / 环境变量及模型别名映射；不读取项目级模型选择，缺失时明确失败。TOML 使用固定版本 smol-toml 解析，不修改原文件。

2026-11-10 自检：Codex 0.167.0 / Claude Code 2.1.319。用户纠正前曾用原生 CLI 发送 hi：Codex 成功、Claude 未登录；这些属于已撤回测试方案的诊断，不能作为当前 API 测试验收。当前直接 API 测试使用本机既有 Codex 网关与凭据，model=gpt-6.1-sol，input=hi，返回 `Hi! How can I help you today?`。Claude 本机无用户配置 / 可用凭据，真实 Messages API 尚未验证；已用本地 HTTP fixture 覆盖请求与回复处理。凭据未写入证据。

同日用户追加「UI 太丑了，重新设计」后，将列表内展开表单改为独立连接详情页，保留分类导航，增加本机 / 自定义分段选择、固定保存栏及独立测试结果区。保存后留页；未保存时禁测，字段变化清除旧结果，测试完成自动滚动至回复。Main Agent 通过 agent-browser 操作隔离 Electron（独立 userData、回环 HTTP fixture），验证保存、重开、修改禁测、浅 / 深色与结果可见；fixture 收到 `/v1/responses`、本机模型与 `hi`，未调用 CLI。

证据：[浅色表单](evidence/W1-cli-connection-light.png)、[浅色结果](evidence/W1-cli-connection-result.png)、[深色结果](evidence/W1-cli-connection-dark.png)、[真实 Codex API 回复](evidence/W1-direct-api.json)。UI 截图中的回复来自本地 fixture，真实远端请求单独记在 JSON，不混用通过范围。独立评审结论与人工状态见 [acceptance](acceptance.md)。

最终验证：桌面类型检查与构建通过；连接服务 / 直接 API / 设置 / Session 共 63 项测试通过，最后保存状态防护修改后设置 15 项再次通过。设置与布局 Electron E2E 首轮 16 项通过、1 项纯色聊天入口等待超时；相同基线仅复跑该项，1 项通过（未重跑全量，偶发超时原因未确定）。日志保存在 worktree `.runtime/cli-connection-inherit/final-e2e.log` 与 `final-e2e-retry.log`。Adapter 最终 116 项 Provider 测试与类型检查由独立评审执行并记录。文档检查 0 新问题，4 项基线问题未新增；最终 diff 无空白错误。

收尾语义复核：settings spec 负责表单、测试和模型读取边界，agent-adapter spec 负责原生连接覆盖，DEC-27 与 AC-08 / 路线图入口已同步；未改变原安装任务状态，也未标记文档 diff 或功能已获人工验收。主 checkout 的并行修改未触碰。


## 2026-11-11 线性集成

用户要求全部合入 main 并清理临时分支。Main Agent 将本轮连接变更同步到最新 main，保留工作台和既有人工验收文档，解决路线图 / DEC-27 文案冲突；同时补齐 `smol-toml` 的受影响检查映射，不绕过提交门禁。集成、最终验证与清理进度见[本次集成](../../.agents/archive/tasks/T20261111-main-integration/task.md)。上文“未提交、未合入”保留为 11-10 的历史交付状态；独立验收也保留原基线，本次 Git 集成不自动补记 Claude 远端、安装、打包或人工验收通过。

## 2026-11-12 Claude 真实验收

Claude Code Session 核心链路（使用本机登录）已完成真实验收，并获用户确认“测试通过”，见 [Claude 真实验收](../../.agents/archive/tasks/T20261112-claude-cli-acceptance/acceptance.md)。该记录中的未覆盖项包括一键安装、自定义 URL / Key 的 Claude 远端调用和打包应用。用户当日表示这些项“不需要你测了”，因此不作为该轮前置，也不记为通过。本任务的状态与保留项不因此自动改变。

## 2026-11-12 补测未覆盖项

用户审阅架构页 Claude Code Provider 的待办后回复「评审通过，继续推进」，并在追问中说明「这个架构和任务可行，评审通过，可以执行」，选择补测未覆盖项（2026-11-12）。这是执行授权，不是人工产品验收；上文人工验收状态不变。

本轮范围：一键安装的真实联网流程、打包应用中的 CLI 设置与 Claude / Codex Session。Claude 自定义 URL / Key 的远端调用需要可用的 Claude API Key 或兼容网关，取得前保留为未覆盖。运行中排队与结构化附件另由任务 `T20261112-claude-native-input` 负责。

Worker 分工与进度见 [plan](plan.md)。

结果（AI 验证，不是人工验收）：一键安装真实联网流程与打包应用已补测；发现的打包签名（D-W2-1）与安装失败无提示（D-W2-2）已修复，并由 W2 在 `1780c63` 复验通过，见[验收记录](acceptance.md#2026-11-12-补测w2)。仍保留：Claude 自定义 URL / Key 远端调用（需用户提供可用的 API Key 或网关）、远端 CI 打包冒烟（等待 dev 既有 E2E 失败修复，Main Agent 负责）、官方安装器卸载 npm 全局包的产品决定（用户）、人工产品验收（用户）。其中远端 CI 打包冒烟已于当日以 package 模式通过（见 [plan](plan.md)），Claude 自定义连接与 O-W2-4 的进展见下一节。

## 2026-11-13 Claude 自定义连接实测与 O-W2-4 决定

用户回复「放到.env.local 里面了」，提供 Claude 兼容网关与 Key（存于未跟踪的 `apps/desktop/.env.local`，不写入记录）。该网关是公网 IP 上的 HTTP 地址，原规则只允许 HTTPS 与本机 HTTP，在设置中无法保存。用户决定「允许http和https，不用警告」（2026-11-13），规则见 [settings spec](../../specs/settings/spec.md#cli-连接配置2026-11-08-确认)第 5 条。

实测中还发现，连接测试把本机配置的模型别名 `opus` 原样发给 API，网关返回 `model_not_found`；Claude Code 自身会把别名解析为实际模型 ID。现改为经 CLI 模型目录（握手，不发送消息）取 `resolvedModel`，未设置模型时用目录的默认项。该做法已由用户纠正撤回，见[连接测试改为测试模型](#2026-11-13-连接测试改为测试模型)。

结果（AI 验证，不是人工验收）：在隔离 Electron 中保存该 HTTP 网关、测试连接，以及新建 Claude Code 会话发送 `hi`，均成功，网关用量随之增加，见[验收记录](acceptance.md#2026-11-13-claude-自定义连接实测w3)。

同日用户将 O-W2-4 交由 AI 决定（「you decide」）。AI 决定：接受官方安装器卸载 npm 全局 `@anthropic-ai/claude-code`，不加界面提示。理由：
- 一键安装只在检测不到 `claude` 时出现，安装服务执行前还会再查一次 PATH。能从 PATH 运行的 npm 安装不会触发这一步，可能被移除的只是当前环境本来就用不上的那份。
- 官方文档建议只保留一份安装，并优先使用原生安装；移除 npm 全局包正是文档给出的做法（[Troubleshoot install：Check for conflicting installations](https://code.claude.com/docs/en/troubleshoot-install)，2026-11-13 查阅）。
- 应用不增删官方安装器的步骤。

用户对 O-W2-2（安装阶段与取消入口）回复「收到」，该项仍为可选的产品问题，不在本轮实现。

独立评审（R1）有条件通过，条件已处理，见 [R1](acceptance.md#独立评审r1)。用户随后回复「accept, implemnt,commit and integrate」（2026-11-13）：确认 settings spec 第 4 条与 DEC-27 中 Claude 测试的变化（经 CLI 模型目录握手、未设置模型时用目录默认项，随后被用户纠正撤回，见下一节）；同意顺带实现两项建议：设置页的错误提示去掉 Electron 的 IPC 包装前缀（改用现有的 `ipcErrorText`），以及 `.gitignore` 忽略 `.env*.local`，避免含密钥的本地环境文件被提交。

## 2026-11-13 连接测试改为测试模型

集成后用户纠正：「测试只测试网关连通性，确认该api是否可达，不通过cli测试完整的路径」。在给出的选项中选择“仍发 hi，模型名原样用”，并补充「增加一个测试模型选项填写」「如果没有填写，用app内置的模型名」（2026-11-13）。

实现：连接表单增加可选的“测试模型”，随连接保存，只用于连接测试，不影响 Session 的模型。未填写时用内置默认模型：Codex `gpt-6.1-sol`、Claude Code `claude-opus-5-5`，分别取自 Codex 0.167.2 与 Claude Code 2.1.323 当前的默认模型。测试不再读取本机模型配置，也不经 CLI 解析别名，因此移除了本机模型读取、经 CLI 模型目录的握手（含 Adapter 的 `resolvedModel` 与 `SessionService.nativeModels`），以及只为读取 Codex 配置引入的 `smol-toml`。失败提示区分 Key 被拒、模型不可用与其他错误。规则见 [settings spec](../../specs/settings/spec.md#cli-连接配置2026-11-08-确认) 第 4、6 条。
