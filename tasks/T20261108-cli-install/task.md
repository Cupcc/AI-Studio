---
id: T20261108-cli-install
status: verifying
fr: [FR-SET-001, FR-CHAT-002]
ac: [AC-08]
specs: [specs/settings/spec.md, specs/chat/spec.md]
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

验收场景：设置入口不再显示或提交 model；旧连接记录 / 会话快照中的 model 不再作为连接覆盖；CLI 原生模型目录、模型与思考强度继续继承；后续用户明确纠正为直接 API 调用，并指定参考 Cockpit Tools 唤醒；测试读取用户级本机模型，直接发送 `hi`，不启动 CLI。成功必须收到完整回复，HTTP 错误 / 流失败 / 截断 / 空回复 / 超时不记通过。保存配置不发模型请求。覆盖服务与 Adapter 定向测试、设置界面实际操作与截图、双 CLI 实测；跨模块契约由独立 Review Agent 复核。真实请求使用本机已配置的连接或应用已保存连接，不记录凭据，不修改本机 CLI 文件。

本轮实现、界面自检与独立技术评审已完成。改动保存在 `fix/cli-connection-inherit` worktree，未提交、未合入 main；新增 TOML 依赖涉及 `apps/desktop/package.json` 与 `pnpm-lock.yaml`，现有受影响检查未映射这两项，不能视为提交门禁通过。本轮不绕过门禁，也不扩展为检查工具改造。原任务的一键安装 / 打包 / 人工验收保留项不因本轮局部验证自动关闭。


参考实现：[Cockpit Tools Codex 唤醒](https://github.com/jlcodes99/cockpit-tools/blob/7ca7f0db1f915452681c9bbc366f199e2310761f/src-tauri/src/modules/codex_local_access_foundation.rs#L2114)，借鉴宿主直连、流式完成判定与可读回复验证；不复制其 OAuth 账号管理、默认模型或调度策略。测试模型读取 Codex 用户 config.toml（含选中内联 profile），Claude 用户 settings.json / 环境变量及模型别名映射；不读取项目级模型选择，缺失时明确失败。TOML 使用固定版本 smol-toml 解析，不修改原文件。

2026-11-10 自检：Codex 0.167.0 / Claude Code 2.1.319。用户纠正前曾用原生 CLI 发送 hi：Codex 成功、Claude 未登录；这些属于已撤回测试方案的诊断，不能作为当前 API 测试验收。当前直接 API 测试使用本机既有 Codex 网关与凭据，model=gpt-6.1-sol，input=hi，返回 `Hi! How can I help you today?`。Claude 本机无用户配置 / 可用凭据，真实 Messages API 尚未验证；已用本地 HTTP fixture 覆盖请求与回复处理。凭据未写入证据。

同日用户追加「UI 太丑了，重新设计」后，将列表内展开表单改为独立连接详情页，保留分类导航，增加本机 / 自定义分段选择、固定保存栏及独立测试结果区。保存后留页；未保存时禁测，字段变化清除旧结果，测试完成自动滚动至回复。Main Agent 通过 agent-browser 操作隔离 Electron（独立 userData、回环 HTTP fixture），验证保存、重开、修改禁测、浅 / 深色与结果可见；fixture 收到 `/v1/responses`、本机模型与 `hi`，未调用 CLI。

证据：[浅色表单](evidence/W1-cli-connection-light.png)、[浅色结果](evidence/W1-cli-connection-result.png)、[深色结果](evidence/W1-cli-connection-dark.png)、[真实 Codex API 回复](evidence/W1-direct-api.json)。UI 截图中的回复来自本地 fixture，真实远端请求单独记在 JSON，不混用通过范围。独立评审结论见 [acceptance](acceptance.md)；人工状态为待验收。

最终验证：桌面类型检查与构建通过；连接服务 / 直接 API / 设置 / Session 共 63 项测试通过，最后保存状态防护修改后设置 15 项再次通过。设置与布局 Electron E2E 首轮 16 项通过、1 项纯色聊天入口等待超时；相同基线仅复跑该项，1 项通过（未重跑全量，偶发超时原因未确定）。日志保存在 worktree `.runtime/cli-connection-inherit/final-e2e.log` 与 `final-e2e-retry.log`。Adapter 最终 116 项 Provider 测试与类型检查由独立评审执行并记录。文档检查 0 新问题，4 项基线问题未新增；最终 diff 无空白错误。

收尾语义复核：settings spec 负责表单、测试和模型读取边界，agent-adapter spec 负责原生连接覆盖，DEC-27 与 AC-08 / 路线图入口已同步；未改变原安装任务状态，也未标记文档 diff 或功能已获人工验收。主 checkout 的并行修改未触碰。


## 2026-11-11 线性集成

用户要求全部合入 main 并清理临时分支。Main Agent 将本轮连接变更同步到最新 main，保留工作台和既有人工验收文档，解决路线图 / DEC-27 文案冲突；同时补齐 `smol-toml` 的受影响检查映射，不绕过提交门禁。集成、最终验证与清理进度见[本次集成](../../.agents/archive/tasks/T20261111-main-integration/task.md)。上文“未提交、未合入”保留为 11-10 的历史交付状态；独立验收也保留原基线，本次 Git 集成不自动补记 Claude 远端、安装、打包或人工验收通过。

## 2026-11-12 Claude 真实验收

Claude Code Session 核心链路（使用本机登录）已完成真实验收，并获用户确认“测试通过”，见 [Claude 真实验收](../../.agents/archive/tasks/T20261112-claude-cli-acceptance/acceptance.md)。该记录中的未覆盖项包括一键安装、自定义 URL / Key 的 Claude 远端调用和打包应用。用户当日表示这些项“不需要你测了”，因此不作为该轮前置，也不记为通过。本任务的状态与保留项不因此自动改变。
