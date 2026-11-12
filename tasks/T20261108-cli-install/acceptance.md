# 验收：CLI 连接继承与直接 API 测试

## 未覆盖与待决事项

- 本记录仅覆盖 2026-11-10 的 model 移除、连接字段覆盖和直接 API `hi` 测试，不验收原任务的一键安装或完整打包交付。
- 新版独立详情页已完成本轮 AI 交互与截图复核，人工体验已于 2026-11-12 验收通过；被否定的旧版界面不计为交付。
- 当前未取得可用于本轮远端调用的 Claude API Key。Claude 的直接 HTTP 协议由回环服务验证，原生配置继承由真实 CLI + 回环服务验证；均不等同于 Claude 远端模型调用成功。
- 组织管理配置、特殊网关协议、旧 CLI 版本及打包应用未在本轮独立复测。直接 API 测试读取用户级模型，不覆盖项目 / 会话专属模型；缺少明确模型时返回错误，不猜测默认模型。

## 人工功能验收

- 状态：已验收。
- 范围与版本：本轮连接设置及测试体验，主目录 `dev` @ `872978b`。一键安装的真实网络流程、Claude 自定义远端调用与打包应用未覆盖，不在接受范围内。
- 人工记录：2026-11-12 用户回复“所有待验收均已验收通过”，见[集中验收记录](../../.agents/archive/tasks/T20261112-dev-acceptance/task.md)。

## AI 结论与运行环境

- 当前结论：本轮实现的独立技术评审与新版 UI 交互验收通过。双 CLI 远端服务验证仍为部分覆盖（仅 Codex 完成真实直接 API 请求）；原任务的一键安装、打包与人工产品验收不因此关闭。
- 验收者：`/root/review_connection_inherit`，未参与代码实现；独立读取 diff、运行测试并搭建隔离的原生 CLI 回环实验。发现问题交回 Main Agent 修改后复验。
- 日期与代码基线：2026-11-10，`3deffa4` 上 `fix/cli-connection-inherit` 未提交 diff；后端复验 11:31，新 UI 交互及最终 diff 复核 11:42～11:46（本机时区）。当日交付保留在独立 worktree，未提交、未合入 main；后续 Git 集成状态见[集成记录](../../.agents/archive/tasks/T20261111-main-integration/task.md)。
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

## 2026-11-12 补测（W2）

范围与授权见 [补测未覆盖项](task.md#2026-11-12-补测未覆盖项)。本节是 W2 的独立 AI 验证，不是人工产品验收；上文各节的结论与人工状态不变。

### 未覆盖与边界

- **打包原始产物不可启动**：`pnpm package` 输出在本机启动即被系统以 `SIGKILL (Code Signature Invalid)` 终止，`pnpm smoke:packaged` 不通过（D-W2-1）。下表标“诊断产物”的打包场景，使用同一基线、仅在 electron-builder 命令行追加 `-c.electronFuses.resetAdHocDarwinSignature=true` 重新打包的产物（未改仓库文件）。这些结果只说明签名修正后打包形态的功能可用，不等于当前打包配置通过。复测条件：修复后用 `pnpm package` 原始产物重跑 `smoke:packaged` 及下表打包场景。修复后的原始产物复验见[复验](#复验1780c63)。
- **失败路径只覆盖网络失败**：在启动环境中把 `https_proxy` 指向不可达端口，触发真实 curl 失败（退出码 7），不是断网。安装脚本非零退出、10 分钟超时未在真实环境触发。
- **取消安装**：主进程有 `cancelCliInstallation`，界面没有取消入口，未覆盖；安装中退出应用的清理已覆盖。
- **登录后转为可用**：隔离 HOME 中新装的两个 CLI 都未登录，只验证了未登录提示。为避免产生新凭据，未在隔离环境登录；“可用”状态由打包形态下用户本机已登录的 CLI 验证。
- **打包形态的安装只覆盖 Claude Code**：Codex 一键安装只在开发构建执行。
- **打包 Session 只覆盖创建、流式、完成与 Stop**：并发、恢复、Needs Input 未在打包形态重测；开发构建结果见 [Claude 真实验收](../../.agents/archive/tasks/T20261112-claude-cli-acceptance/acceptance.md)。打包产物禁用 Node inspect，退出改用 SIGTERM，只确认进程清理，不覆盖 QuitFlow 的确认路径。
- **Claude 自定义 URL / Key 的远端调用**：没有可用 Key，按分派不在本轮范围。
- **自动化**：仓库中没有 `CliInstaller` / `runInstallCommand` 的单元测试（O-W2-3），本节结论全部来自真实环境操作。

### 待决事项

- D-W2-1 与 D-W2-2 已在 `1780c63` 修复，W2（未参与修复）复验通过，见[复验](#复验1780c63)。
- 官方 Claude 安装器会执行 `npm uninstall --global @anthropic-ai/claude-code`（O-W2-4）。一键安装在用户真实环境中可能移除用户经 npm 全局安装的 Claude Code。是否接受、是否在界面提示，需人工决定。
- 原先只在诊断产物上执行的打包场景，已在 `1780c63` 的原始产物上全部重跑通过，不再需要决定是否沿用诊断产物的证据，见[复验](#复验1780c63)。

### AI 结论与运行环境

- 总体结论：**部分通过**（补测当时的结论；`1780c63` 修复后的结论见[复验](#复验1780c63)）。
  - 开发构建一键安装（真实联网，隔离 HOME）：Claude Code 与 Codex 的安装、状态反馈、去重、重开保留、安装后刷新与未登录提示、退出清理均通过；网络失败时界面不显示错误，不通过（D-W2-2）。
  - 打包：原始产物不通过（D-W2-1）。诊断产物上冒烟、CLI 列表与状态、连接详情页、Claude（Haiku 5.5）与 Codex Session、Stop、Claude 一键安装均通过。
  - 用户真实安装（`~/.local/bin`、版本目录、`~/.codex/packages`、shell profile）前后一致。
- 验收者：W2（Claude Code 会话），未参与 CLI 安装、连接配置或 Provider 的实现；本轮未改产品代码。
- 日期与代码基线：2026-11-12 16:05～16:27（本机时区）；`0310fa6`（`test/cli-install-retest`，相对 `872978b` 只增加任务文档，无代码 diff）。开发构建与两次打包均在该基线完成。
- 平台与应用形态：macOS 26.6 (25G72)，Apple Silicon arm64；Electron 44.4.5。开发构建为 `pnpm build` 产物，由 Electron 直接启动；打包为未签名的 `pnpm package` 产物（原始 / 诊断两种，见上）。agent-browser 0.41.2 经 CDP 操作（开发 9341，打包 9343）。
- Provider 与 CLI：均为真实 CLI。隔离安装得到 Claude Code 2.1.322 与 Codex CLI 0.167.2（官方安装器当日版本）。打包 Session 使用本机已安装并登录的 Claude Code 2.1.322、Codex CLI 0.167.2；Claude Agent SDK 0.3.293。凭据、账号与认证响应均未记录。
- 隔离方式：
  - 开发构建以 `env -i` 启动：`HOME=/tmp/ai-studio-retest/home`，PATH 只含系统目录，独立 `--studio-user-data-dir`，不带 `CLAUDE*` / `CODEX*` 变量。登录 Shell 因此读不到用户的 `~/.local/bin`。
  - 打包形态的安装用 `open -n` 加同样的最小环境，`HOME=/tmp/ai-studio-retest/home2`。
  - 打包 Session 使用真实 HOME，只读使用本机 CLI 与配置。
- 测试数据：`/tmp/ai-studio-retest/project`（合成 git 仓库，含 `README.md`、`math.js`）。
  - 开发构建按 e2e 方式在主进程替换原生目录对话框。
  - 打包产物禁用 inspect，因此先用同一基线的开发构建把测试 Project 登记到同一隔离 userData，再由打包应用打开。这是测试准备，不属于被测行为。
  - 其余操作都从可见入口执行。

### 验收结果

| 场景与来源 | 前置条件与操作 | 预期结果 | 实际结果 | 验证方式与环境 | 结论 | 证据 |
|---|---|---|---|---|---|---|
| task 场景 1、FR-SET-001：支持项可见 | 开发构建，两 CLI 均不在登录 Shell PATH；设置 → CLI | 所有支持项可见，包括未安装项 | Codex、Claude Code 都在“已添加”，状态“未安装”，各有“一键安装”；New Chat 选择器两项不可用 | agent-browser，真实 | 通过 | [列表](evidence/W2-01-dev-settings-cli-not-installed.jpg) |
| task 场景 2：Claude Code 一键安装 | 点击 Claude Code 的“一键安装” | 官方安装器运行，有状态反馈 | 主进程依次为 downloading（curl `https://claude.ai/install.sh`）、installing（`bash install.sh` 下载 2.1.322 并执行 `claude install`）、checking、complete，约 71 秒；期间按钮为禁用的“正在安装…”；文件只写入隔离 HOME | agent-browser + 进程与只读 IPC 采样，真实网络 | 通过；界面不显示阶段（O-W2-2） | [安装中](evidence/W2-04-reopen-still-installing.jpg)、[时间线 B](evidence/W2-install-timeline.txt) |
| task 场景 2：重复点击 | 安装中再次点击（按钮禁用，另对该按钮触发一次 DOM click） | 不重复启动 | 始终只有一个 `install.sh` 进程组，状态未重置 | 同上 | 通过 | [时间线 B](evidence/W2-install-timeline.txt) |
| task 场景 4：关闭设置后重开 | 安装中关闭设置，再从“设置”入口进入 CLI | 状态保留 | 重开后仍为禁用的“正在安装…”。两次定点复测：加载约 0.5～0.8 秒不显示按钮，随后直接显示正确状态。首轮有一次采样看到可用的“一键安装”，未复现（O-W2-1） | agent-browser + 页面内 20ms 采样 | 通过（有未复现观察） | [重开](evidence/W2-04-reopen-still-installing.jpg)、[时间线 B / D](evidence/W2-install-timeline.txt) |
| task 场景 3：安装结束刷新 | Claude 安装完成后不手动重新检测 | 刷新环境与 CLI 状态；未登录显示登录提示 | 行自动变为“未登录 / 处理方法”；展开为原因与“在终端完成 Claude Code 登录后，点击右上角‘重新检测’。”；New Chat 选择器同步显示未登录 | agent-browser，真实 | 通过 | [提示](evidence/W2-05-claude-installed-login-hint.jpg)、[选择器](evidence/W2-06-new-chat-menu-after-install.jpg) |
| task 场景 2～3：Codex 一键安装 | 点击 Codex 的“一键安装” | 同上 | downloading、installing（`sh install.sh`）、complete，约 35 秒；codex-cli 0.167.2；未登录提示；未写隔离 HOME 的 shell profile | 同上 | 通过 | [Codex](evidence/W2-07-codex-installed-login-hint.jpg)、[时间线 C](evidence/W2-install-timeline.txt) |
| task 场景 4：网络失败 | 启动环境的 `https_proxy` 指向不可达端口；点击 Claude Code 的“一键安装” | 清晰错误，可重试 | 主进程状态为 error：“安装命令失败（退出码 7）。请检查网络、代理及目录权限……”。设置页没有任何错误文字，行立即回到“未安装 / 一键安装”，关闭重开后仍无提示；可以再次点击 | agent-browser + 只读 IPC，真实 curl | 不通过（D-W2-2） | [失败后](evidence/W2-02-install-failure-no-message.jpg)、[时间线 A](evidence/W2-install-timeline.txt) |
| task 场景 4：进程清理 | 安装中通过主进程 `app.quit()` 退出 | 进程与临时文件清理 | 5 秒内安装进程组全部结束，临时目录删除，无残留进程 | 进程与文件检查 | 通过 | [时间线 E](evidence/W2-install-timeline.txt) |
| 分派要求：不影响真实安装 | 测试前后只读比对 `~/.local/bin/claude`、`codex` 链接、版本目录、二进制哈希与 shell profile | 不变 | 除时间戳外完全一致。官方 Claude 安装器调用了 PATH 上的 npm 执行全局卸载，本机该全局目录无此包，npm 无改动（O-W2-4） | 只读快照、npm 日志 | 通过 | [快照](evidence/W2-real-cli-untouched.txt) |
| 打包：原始产物冒烟 | `pnpm package` 后执行 `pnpm smoke:packaged` | 冒烟通过 | 应用启动即被 SIGKILL，未写报告；`codesign --verify` 报告 Electron Framework 签名无效 | 打包 + 冒烟 | 不通过（D-W2-1） | [失败摘要](evidence/W2-packaged-raw-failure.txt) |
| 打包：诊断产物冒烟 | 追加签名重置参数重新打包，执行 `pnpm smoke:packaged` | 冒烟通过 | ok=true：SQLite、PTY、Terminal、ripgrep、Files 重命名、登录 Shell 解析（启动 PATH 不含 CLI，解析后找到两个 CLI）、Renderer 均通过 | 打包 + 冒烟 | 通过（诊断产物） | [报告](evidence/W2-packaged-smoke-diag.json) |
| 打包：CLI 列表与状态 | 真实 HOME；设置 → CLI | 两个 CLI 均显示真实状态 | Codex、Claude Code 均为“可用”，Codex 为默认 | agent-browser，真实 | 通过（诊断产物） | [列表](evidence/W2-08-packaged-settings-cli.jpg) |
| 打包：连接详情页 | 打开 Claude Code、Codex 的“配置”；切到“自定义连接”后返回，不保存 | 详情页正常打开 | 本机配置说明正常；自定义模式只有 Base URL / API Key，空表单时测试与保存均禁用；返回后列表无变化 | agent-browser | 通过（诊断产物） | [Claude 连接](evidence/W2-09-packaged-claude-connection.jpg) |
| 打包：Claude Session | New Chat 选 Claude Code，模型选 Haiku 5.5，发送短文请求 | 流式输出并完成 | 约 1.2 秒内文本长度 182→226→282→324→377 逐步增加，“Worked for 6s · Done”；原生会话记录 model 为 `claude-haiku-5-5` | agent-browser + 只读原生记录，真实 | 通过（诊断产物） | [完成](evidence/W2-10-packaged-claude-haiku-done.jpg)、[采样](evidence/W2-packaged-session-samples.txt) |
| 打包：Stop | 同一会话请求约 1500 字长文，流式中点击 Stop | 本轮停止，无 Error | 运行中显示 Stop 与列表转圈；点击后 1.5 秒内停止增长（1540→1573 后不变），“Worked for 14s · 已停止”，无 Error / 绿点 | agent-browser，真实 | 通过（诊断产物） | [运行中](evidence/W2-11-packaged-claude-running.jpg)、[已停止](evidence/W2-12-packaged-claude-stopped.jpg) |
| 打包：Codex Session | New Chat 选 Codex（本机默认 GPT-6.1-Sol），发送一句话请求 | 流式输出并完成 | 11 秒完成，回复切题 | agent-browser，真实 | 通过（诊断产物） | [Codex](evidence/W2-13-packaged-codex-done.jpg) |
| 打包：一键安装 | 隔离 HOME（home2）与最小 PATH，`open -n` 启动；设置 → CLI → Claude Code 的“一键安装” | 同开发构建 | preparing、downloading、installing、checking、complete，约 59 秒；未登录提示；临时目录删除，无残留进程 | agent-browser + 进程采样，真实网络 | 通过（诊断产物） | [安装前](evidence/W2-14-packaged-not-installed.jpg)、[安装后](evidence/W2-15-packaged-claude-installed-login-hint.jpg)、[时间线 G](evidence/W2-install-timeline.txt) |
| 打包：退出清理 | 向打包应用主进程发送 SIGTERM | Runtime 全部释放 | 应用进程与 claude / codex Runtime 在 10 秒内全部结束 | 进程检查 | 通过（只验证进程层面） | [采样](evidence/W2-packaged-session-samples.txt) |

### 缺陷与观察

| 编号 | 级别 | 内容与复现 | 处理 |
|---|---|---|---|
| D-W2-1 | P1，阻塞打包交付 | **复现**：在 macOS 26.6 arm64 上执行 `pnpm package`，再执行 `pnpm smoke:packaged`，输出“The app did not write a smoke report.”；直接运行可执行文件返回 137。崩溃报告为 `SIGKILL (Code Signature Invalid)`、`CODESIGNING / Invalid Page`，崩溃帧 `electron::fuses::IsRunAsNodeEnabled()`；`codesign --verify` 报告 `Electron Framework.framework: invalid signature`。<br>**分析**：`electron-builder.yml` 配置了 `electronFuses` 且 `identity: null`。翻转 fuse 修改了 Electron Framework，但未设置 `resetAdHocDarwinSignature`，随后签名被跳过，Framework 保留失效的原 ad-hoc 签名。<br>**诊断**：追加 `-c.electronFuses.resetAdHocDarwinSignature=true` 后 `codesign --verify --deep` 通过，冒烟与打包场景通过。<br>**补充**：本机诊断报告中另有 2026-11-11 15:56 的同类崩溃，说明问题早于本轮。 | `1780c63` 已修复，原始产物复验通过，见[复验](#复验1780c63) |
| D-W2-2 | P2 | **复现**：启动环境的 `https_proxy` 指向不可达端口，设置 → CLI → 一键安装。主进程状态为 error 并带有错误消息，设置页没有任何提示，行直接回到“一键安装”。<br>**分析**：`CliSettings` 只用安装状态判断 installing，未渲染 `status: 'error'` 的 `message`。安装失败被转换为状态，`installCli` 正常返回，组件的 catch 不会触发。不满足 task 场景 4 的“清晰错误”。 | `1780c63` 已修复，复验通过，见[复验](#复验1780c63) |
| O-W2-1 | 观察，未复现 | Claude 首次安装中关闭再打开设置，有一次采样看到该行为可点击的“一键安装”，同时主进程仍为 installing；两次定点复测未出现。源码中重开时安装状态初始为空，要等 Provider 检测等请求一起完成后才写入；如果列表先由缓存渲染，就会出现这一窗口。此时点击会命中主进程去重，不会启动第二个安装。 | 记录；修复 D-W2-2 时可一并让安装状态先于检测结果加载 |
| O-W2-2 | 观察 | 界面只显示“正在安装…”，主进程的 preparing / downloading / installing / checking 阶段不显示，也没有取消入口。最长一次安装约 71 秒，没有阶段信息。 | 是否需要阶段与取消，由产品决定 |
| O-W2-3 | 观察 | 当前代码中没有 `cli-installation.ts` 的单元测试；设置页测试只 mock `installCli`。task 场景表中的“服务测试 / 定向测试”没有对应用例，失败、超时、取消路径缺少可重复的回归。 | 建议修复缺陷时补定向测试 |
| O-W2-4 | 观察，涉及用户数据 | 官方 Claude 安装器的 `claude install` 会执行 `npm uninstall --global @anthropic-ai/claude-code`，使用 PATH 上的 npm 及其全局前缀；隔离 HOME 无法隔离这一步。本机该前缀下没有此包，npm 日志 `reify moves {}`，没有改动。 | 见待决事项 |
| O-W2-5 | P3 文案 | 未登录原因显示英文 “The CLI is not logged in”，与下一行中文提示混排（设置“处理方法”与 New Chat 选择器）。 | 记录 |

### 执行说明

- 测试 CLI 装在 `/tmp/ai-studio-retest/home*`，测试结束后删除。打包 Session 在用户的 `~/.claude/projects/` 与 Codex 会话目录留下本次测试项目的原生会话记录，属于 CLI 的正常使用记录，没有修改 CLI 配置。
- 补测时打包目录 `apps/desktop/dist/` 保留诊断产物；复验后该目录为 `1780c63` 的原始产物（被 Git 忽略）。
- 所有 Electron 实例、安装进程与 claude / codex Runtime 已退出并经进程检查确认。

### 复验（1780c63）

- 复验者：W2，未参与修复。时间为 2026-11-12 16:43～16:55（本机时区）。
- 基线：`1780c63`；`test/cli-install-retest` 已变基到 `d924d2c`，工作树无未提交改动。
- 平台、CLI 版本与隔离方式同上。
- 记录：[复验日志](evidence/W2-R-retest-log.txt)、[冒烟报告](evidence/W2-R-packaged-smoke.json)。

| 缺陷与场景 | 操作 | 实际结果 | 结论 | 证据 |
|---|---|---|---|---|
| D-W2-1：原始产物冒烟 | `pnpm package`（无额外参数），然后 `pnpm smoke:packaged` | 打包日志仍显示翻转 fuse 后跳过签名。`codesign --verify` 对 Electron Framework 与整个应用均报告 valid on disk。冒烟 `ok=true` | 通过 | [日志](evidence/W2-R-retest-log.txt)、[报告](evidence/W2-R-packaged-smoke.json) |
| D-W2-1：原始产物 CLI 设置 | 真实 HOME、隔离 userData，`open -n` 启动；设置 → CLI | Codex 可用（默认），Claude Code 可用 | 通过 | [列表](evidence/W2-R05-raw-packaged-settings-cli.jpg) |
| D-W2-1：原始产物 Claude Session | 新建 Claude Code 对话，选 Haiku 5.5，发送一句话请求 | 3 秒完成，文本长度 121→162→212。原生记录 model 为 `claude-haiku-5-5`。SIGTERM 后应用与 Runtime 全部结束 | 通过 | [完成](evidence/W2-R06-raw-packaged-claude-haiku-done.jpg) |
| D-W2-2：失败提示 | 开发构建，`https_proxy` 指向不可达端口；点击 Claude Code 的“一键安装” | 行内以 `role="alert"` 显示红色错误“安装命令失败（退出码 7）……”，按钮恢复为可用的“一键安装” | 通过 | [错误](evidence/W2-R01-install-failure-alert.jpg) |
| D-W2-2：重开保留 | 关闭设置，再从“设置”入口进入 CLI | 同一错误仍显示 | 通过 | [重开](evidence/W2-R02-reopen-error-kept.jpg) |
| D-W2-2：重试时清除 | 再次点击“一键安装”。另用本地测试代理（4 秒后返回 502）放慢失败，以便截图 | 点击后 12ms 内错误消失，按钮变为禁用的“正在安装…”；失败后错误重新出现（退出码 22） | 通过 | [重试中](evidence/W2-R03-retry-error-cleared.jpg)、[再次失败](evidence/W2-R04-retry-failed-again.jpg) |
| 原始产物：连接详情页 | 真实 HOME，只读。打开 Claude Code 与 Codex 的“配置”，各自切到“自定义连接”后返回，不保存 | 两个详情页都显示本机配置说明。自定义模式只有 Base URL / API Key，空表单时测试与保存均禁用。返回后再次打开 Codex 仍为本机配置，列表不变 | 通过 | [Claude 本机](evidence/W2-R07-raw-claude-connection-local.jpg)、[Claude 自定义](evidence/W2-R08-raw-claude-connection-custom.jpg)、[Codex 自定义](evidence/W2-R09-raw-codex-connection-custom.jpg) |
| 原始产物：Stop | 新建 Claude Code 对话，选 Haiku 5.5，请求约 1500 字长文；流式中点击 Stop | 运行中显示 Stop 按钮，列表项转圈。点击后 1.5 秒内停止增长（496→519 后不变），显示“Worked for 18s · 已停止”，无 Error。原生记录 model 为 `claude-haiku-5-5` | 通过 | [运行中](evidence/W2-R10-raw-claude-haiku-running.jpg)、[已停止](evidence/W2-R11-raw-claude-haiku-stopped.jpg) |
| 原始产物：Codex Session | 新建 Codex 对话（本机默认 GPT-6.1-Sol），发送一句话请求 | 文本长度 120→154→173→189，“Worked for 15s · Done”，回复切题。SIGTERM 后 claude / codex Runtime 全部结束 | 通过 | [Codex](evidence/W2-R12-raw-codex-done.jpg) |
| 原始产物：一键安装 | 临时 HOME（home2）与最小 PATH，`open -n` 启动；设置 → CLI → Claude Code 的“一键安装” | downloading、installing、checking、complete，约 50 秒，期间按钮为禁用的“正在安装…”。完成后显示“未登录 / 处理方法”与登录提示。CLI 只写入临时 HOME，临时目录删除，退出后无残留进程。用户真实安装前后一致 | 通过 | [安装前](evidence/W2-R13-raw-pkg-not-installed.jpg)、[安装中](evidence/W2-R14-raw-pkg-installing.jpg)、[安装后](evidence/W2-R15-raw-pkg-installed-login-hint.jpg)、[日志 5d / 5e](evidence/W2-R-retest-log.txt) |
| 受影响回归 | `node scripts/check-affected.mjs --base d924d2c`（不带 `--ci`） | exit 0。脚本测试 82 项、设置相关测试 24 项、Renderer 类型检查通过。`packaging` 列出 `electron-builder.yml` 并提示执行 full CI。计划中的 `e2e/settings.spec.ts` 仅在 `--ci` 时运行，本次未执行 | 通过（E2E 未运行） | [日志](evidence/W2-R-retest-log.txt) |

更新后的条目结论：

- 上文“task 场景 4：网络失败”与“打包：原始产物冒烟”两行保留原记录，在 `1780c63` 上均改为通过。
- 上文标“通过（诊断产物）”的打包场景都已在同一 `1780c63` 原始包（16:43:41 构建，未重建）上重跑并通过：冒烟、CLI 列表与状态、连接详情页、Claude Session、Stop、Codex Session、一键安装。打包结论不再依赖诊断产物。
- 本节已执行的场景现在全部通过。“未覆盖与边界”中除第一条（打包原始产物不可启动）已解决外，其余项目不变，补测范围仍为部分覆盖。
- 用户真实 CLI 安装在复验前后一致。复验未发现新缺陷；O-W2-1～O-W2-5 未处理，状态不变。
- Main Agent 发起的远端 full CI（打包与打包冒烟）结果不在本节记录范围。
