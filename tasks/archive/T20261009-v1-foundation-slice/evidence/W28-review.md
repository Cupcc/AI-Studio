# W28：V1 收尾独立复核

## 未覆盖与当前结论

- 独立 Review Agent，未参与实现；源码只读，写入限本任务 acceptance 当前增补与 W28 证据。2026-10-18，worktree `fix/v1-closure`，基线 `dc66a16` 加未提交实现。
- W28 已独立操作打包应用与真实 Codex `0.163.0`，完成图片 / Skill / Rule / effort / 非空公开摘要 / 原生 patch、四工具联验、清理超时 GUI、真实宿主崩溃恢复及历史残留工具状态复验。初查的公开输出与旧恢复缺陷均已修复并复验；下方初查和历史失败按其时点解读。
- 当前结论：**当前 V1 Codex 技术范围独立复核通过。** Main Agent 最终完整 E2E / packaged smoke 及文档归档复核继续作为收尾门禁；本记录不冒充已执行那些最终命令。Claude、未观察即脱离的后代、共享 MCP、macOS 13 实机、大体积公开 payload 性能不在当前通过范围；人工产品验收沿用负责记录，新功能不代签。

## 非 GUI 独立执行（2026-10-18 15:21～15:23 UTC）

使用 Vitest skill 的隔离配置与 React best practices skill 复核现有选择控件、按需 Skill 查询、订阅 / 异步失效保护；未新增应用依赖或修改源码。

| 检查 | 结果与范围 |
|---|---|
| 自写 [W28-boundaries.test.ts](W28-boundaries.test.ts)，[配置](W28-vitest.config.ts) | 初始 7 项通过；增加公开输出完整性检查后为 **7 通过 / 2 失败**，见 [首次输出缺陷日志](W28-boundaries-first-output.log) |
| 正式 Adapter 回归 `runtime-ownership.test.ts`、`codex/provider.test.ts` | **2 文件 / 48 项通过**；[日志](W28-adapter-regression.log) |
| 正式 desktop 回归 `shutdown.test.ts`、`session-service.test.ts`、`session-ipc.test.ts`、`file-reference.test.ts` | **4 文件 / 107 项通过**；[日志](W28-desktop-regression.log) |
| `git diff --check` | 通过（初次非 GUI 检查时） |

自写通过项：损坏 journal 保留且不发 signal；清理失败保留存活身份与 journal，随后仅重试匹配目标；返回 Runtime 前身份已落盘，journal 不含 args/env/cwd 且权限 0600/0700；`skills/list` 强制重读、无 Thread、受管 Runtime 退出；无效 Skill 响应的未确认进程保留并按精确句柄重试；CLI 默认 effort 随当前选择模型解析且模型复位使用 Project cwd 的 native config；最终 reasoning snapshot 后迟到 delta 忽略，下一轮复用 item ID 仍可正常接收。

## 输出缺陷（初查未解决）

### W28-F1 · `functionCallOutput` 正文丢弃

通过真实 CodexDriver 接收模拟的原生 `item/completed`，当前 `mapItem()` 将 `functionCallOutput` 降为 `other` + 类型标签，丢弃 `name` / `namespace` / `output`。独立断言预期公开正文 `W28 public function result body` 保留，实际仅有标签。当前已生成的 `ThreadItem` / `FunctionCallOutputBody` 明确包含该公开字段；这是已收到 item 的保存缺口，不要求为所有上游管理 API 新建 UI。

### W28-F2 · Review 模式公开正文丢弃

同样路径发送 `enteredReviewMode` / `exitedReviewMode` 的 `review`，两者当前只保留类型标签，正文丢失。独立探针首次失败在 entered item；两个 item 的代码均走相同 default。

修复建议：复用现有 `ItemSnapshot.text` / `tool.result` 及 Transcript 折叠正文，保留 CLI 实际公开内容。`collabAgentToolCall` 的 prompt / agentsStates 当前也未保留，已提示 Main Agent；需按实际原生接缝和能力矩阵判断，不能宣称全部公开输出已完整接入。

## 原生能力与文档复核

- effort、图片和 Skill 确有应用入口及可信主进程路径；Skill 由 Project 目录 opaque ID 解析，Renderer 不可自由提交路径；需要原生正文时不由客户端推测隐藏内容。
- reasoning 的代码路径会保存收到的 summary/content；主 Agent 报告的真实回合空正文须对照 CLI 原始输出。若 CLI 本身未公开正文，应记为该回合未提供，不能用模拟内容认定真实正文展示通过。
- Roadmap 已移除完成的 UI Stop / 第二模型 / 并发 / 完成提醒下一步，但 §2、§3.1、§3.4 仍需在最终结果后同步为实际实现 / 包状态；§3.1 输入仍写“部分实现”且成果未包含 effort/image/Skill，§3.4 仍写早期骨架包。这些当前表述不得作为最终收尾保留。
- Tools acceptance 的历史技术缺口仍是失败 / 超时 GUI、原生窗口 resize / Browser bounds、包含真实 Session 的最终包四工具联验。W24 是 Main Agent 技术复验，不能将其直接改成独立里程碑通过；旧验收基线不改写，应新增当前结果入口。
- Adapter §3.11 的“锁定 0.161.0”与当前 pin 0.163.0 需明确标成历史事实；native parity 的 W25 小节同理。实际能力清单以出站方法与已收到的公开用户内容为边界，generated 类型不是产品新增功能清单。

## 初查源码指纹

| 文件 | Git blob hash |
|---|---|
| `codex/mapping.ts` | `6877f178300581807ce2116497855fe5538e2be3` |
| `runtime-ownership.ts` | `942b6c0538701e6cb75ddadafab08e2b7e574169` |
| `codex/driver.ts` | `0ae9c3df7be458da6388a8e16ca722b3188e005a` |
| `codex/provider.ts` | `c0c3c21d715b20243ae7468c5eff1a5fbe878d38` |
| `session-service.ts` | `f948ffe1f0c0f20b48b631db2bf136ad84991823` |
| `main/ipc/index.ts` | `a713f4992f1a02f147b3ee0c43d170a9b9dd4944` |
| `project/store.ts` | `65db87623d84843393ef95f0a89cf90bdd48159a` |
| `shutdown.ts` | `fd0abca559fbec96cc1b90da157260e889abff82` |

后续修复复验和 GUI / 包结论在本文件追加，不覆盖首次失败事实。

## 公开输出修复后独立复验（2026-10-18 15:27 UTC）

Main Agent 修复 F1 / F2，保留 function output、Review 正文与 collaboration 的公开输入 / 状态消息，并以现有折叠结果视图接收较少见 item 的公开字段。本 Agent 新增搜索结果探针发现 `webSearch` 独立分支仍遗漏 `action` / `results`（[9 通过 / 1 失败日志](W28-search-first.log)）；Main Agent 随后修复该分支。

最终相同命令 **1 文件 / 10 项通过**，见 [最终日志](W28-boundaries-final.log)。上述 F1、F2 和搜索正文遗漏已在独立合成 RPC 范围关闭；协作结果的公开 message 保留同时通过。最终 `mapping.ts` Git blob hash 为 `393c8898dff547499b85207f16198982ac3a3bdc`。`git diff --check` 通过。

真实 reasoning 空正文：Main Agent 对照 native rollout 确认首批 fixture 为 CLI `summary=none`、summary 空且未提供 content；当前代码的合成正文路径已独立通过，不能据此宣称真实非空正文呈现已验收。Main Agent 已将隔离 fixture 改为原生 summary auto，下一次实际回合继续核对。

通用结果会保留上游公开 payload，继承 JSON line 的 64 MiB 传输边界；Transcript 现为分页 / 折叠展示。大图片 data URL 等具体性能尚未实测，本轮没有据推测增加模型调用上限、费用限制或截断规则。真实资源边界保持为未执行场景，不能认定任意体积输出均通过。

## 任务收尾资格复核（GUI 前）

| 任务 | 负责交付与当前判断 | 完成前仍需核对 |
|---|---|---|
| `native-cli-parity` | 原交付为决定 / 规格 / 实施清单回写；后续代码由 Adapter、Session、Tools 负责，不必因后续 Claude 真验收无限保持本记录进行中 | 四条文档标准、当前能力矩阵和链接 / 一致性检查；保留后续实现责任入口 |
| `app-skeleton` | 原范围的独立验收均已通过；最低系统实机、签名、公证不在原范围；无须逐 task 人工再签收 | 最新 API / 焦点受影响门禁、最终打包 smoke 引用，保留历史安装 / open 基线 |
| `project-shell` | 原 11 条壳层标准已有独立通过，后续 Session / 工具接入可引用负责验收 | 最终焦点初始化和布局接缝；不把纯占位旧证据扩写为现有全产品通过 |
| `agent-adapter`、`session-slice` | 按 DEC-16 / DEC-19 当前 V1 只纳入 Codex；新增原生入口、归属和输出已有实现及自动化 | 当前 Codex 真实 / 独立应用与最终包；原两 Provider 的标准逐项标明 Claude 后续，不得全部勾成真实通过 |
| `v1-foundation-slice` | 原拆分和责任标准已实现；当前完整核心场景按新决定复核 | 本轮所需独立里程碑、最终包、真实 Codex 和负责文档语义同步 |
| `context-tools` | 四工具与补丁已实现，多个阶段独立结果有效；新增人工功能验收保持独立状态，不自动阻塞技术 task 收尾 | 最终包包含真实 Session 的四工具独立联验、原生窗口 resize / Browser bounds、实际 Browser 错误；历史 cleanup 失败 / 超时 GUI 须实测或明确保留未覆盖边界，不能悄悄改成通过 |

本表是独立复核判断，不变更 task 状态。由 Main Agent 按任务协议逐项核对、完成状态与归档同步，W28 不编辑 task / plan / report / roadmap。

## 最终包真实 GUI 独立联验（2026-10-18）

环境：macOS 15.6 arm64；隔离 fixture `/tmp/ai-studio-v1-input-20261018`；独立 userData，真实 Codex `0.163.0`。应用为 `dist/mac-arm64/AI Developer Studio.app`，不是开发服务器或模拟 Provider。W28 独占 GUI，主 Agent 只做非 GUI；操作使用 agent-browser，原生窗口验证使用 macOS System Events / screencapture；只读 DOM / WebContents 检查不注入状态。

| 场景 | 实际观察与证据 |
|---|---|
| 新真实回合、图片 / Skill / Rule、high | 从 Files 显式附加 `two-colors.png`，从原生目录选 `w26-marker`，选择 high；结果正确区分左红右蓝，包含 Rule841 / Skill913 / W28_UI_732；[输入](W28-native-start.png)、[结果](W28-native-result.png) |
| 非空公开 reasoning | 新 Thread 原生 summary auto；真实收到并在折叠控件展开 `Planning restricted skill file reading` 等公开摘要，[摘要与补丁同屏](W28-public-reasoning-diff.png)。不是隐藏推理推断或合成正文 |
| 原生 patch 与保存归属 | 真实 native apply_patch 创建 `w28-review.txt`，完成行打开 Session `1da03312` / turn `36413495` 的 `+W28_PATCH_715`；外部将工作区改成 `W28_WORKTREE_916` 后重开仍显示旧原生补丁，[编辑后历史](W28-saved-patch-after-edit.png)；Project Diff 单独列当前未跟踪文件 |
| Terminal 与 Browser | 从 UI Terminal 1 启动本地 Python server9428（PID6464 / shell5591），隐藏后保持；Browser 实际加载 `w28-review.txt` 显示 marker。另建 Terminal 2、输入命令后关闭；切回 Terminal 1 保持。Browser native page `window.studio` 与 `require` 均 undefined |
| Browser 错误 / 重试 | GUI 导航不可达127.0.0.1:9429，显示 ERR_CONNECTION_REFUSED 和“重新加载”，点击后保持真实失败；改回9428恢复，[错误截图](W28-browser-error.png) |
| 原生 resize / Browser bounds | 宿主 PID3438，System Events 设置真实窗口从1280×800到1024×640。前者 renderer Browser区域399×657 / native inner399×657，后者367×497 / native inner367×497；[macOS原生窗口截图](W28-native-window-small.png)；Settings 打开时 native Browser 隐藏，[原生 overlay](W28-native-settings-overlay.png) |
| 实际 cleanup timeout / 可重试 | 真实 Codex command18462执行300秒 sleep，精确核对 start identity 后只 SIGSTOP Runtime5264。UI关闭 Project → 关闭并停止 → “部分资源未能停止 / 停止超时”，Project及应用保留，[原生错误截图](W28-project-cleanup-timeout.png)。底层后续清理已使 Runtime / command退出，不对死 PID 发送 SIGCONT；点击重试后回启动页 |
| 清理隔离 | timeout 时 Terminal server6464仍在；重试成功后它退出；外部独立 sentinel1646 / 9417前后存活。[前置身份与journal](W28-cleanup-before.json)、[重试后进程](W28-cleanup-after.json)。未对未知进程或进程名发信号 |

这组 GUI 通过在 PID3438 的已打包版本上执行，包含 public output mapping 修复，尚未包含随后发现的旧 crash transcript spinner 修复。主 Agent 后续包 `app.asar` SHA256 `43d60c7359f9cbee13f1ab83360571e2bb01fe8aef8fe052b78e5fef48872225`（PID21735）包含当前 active-turn恢复与 effort 修复。

### 重启保留、真实宿主异常与历史残留缺陷

- 在上述 PID21735 包重新打开 Project，新 W28 Session 的图片 / Skill 标签、high、输出、旧 patch 均保存；公开摘要可再次展开，[重启记录](W28-restart-retained.png)、[重启公开摘要](W28-restart-public-summary.png)。native Thread ID 为 `01a14fa4-640d-7fb3-b0a8-a8179c7f0f2e`。
- 独立读库发现 W26 旧 crash turn `4f9e3c50` 已结束但 command仍 `in_progress`。当前 active-turn修复不会触及旧版已置 idle 的 Session；W28 报告该缺口，主 Agent 新增按已 failed / interrupted turn归一化的修复与正式测试，待最终包独立复验。不能将旧 spinner算作已在先前包关闭。
- W28 在同一 native Thread实际发起新300秒 command；确认 Runtime23311、command23618及正在运行工具快照已持久化后，精确核对 Electron21735启动身份并 SIGKILL。Runtime / command随EOF退出，external1646存活，[真实异常前证据](W28-crash-before.json)。下一次最终包启动复核该真实中断恢复，不用改库构造状态。

### effort 补丁独立复验与能力矩阵审查

自写新增探针从 create providerOptions传入 `max`，下一轮传入未来原生命名，两者均原样到 `turn/start`；当前 **11 / 11通过**，[日志](W28-boundaries-final-effort.log)。原10项最终日志保留。执行入口为本仓库 Adapter 所安装 Vitest v5.0.3；root `pnpm exec vitest` 命中另一版本v5.0.1导致suite加载失败，改用明确入口后实际执行，前述失败不代表业务断言失败。

审读 [当前产品能力表](W26-native-capabilities.md)：按实际产品接缝列能力，公开payload的合成探针与真实非空summary区分，真实Electron EOF退出与W27残留清理区分，Claude / 未执行上游管理API / 人工新增体验均保留边界；当前范围表述可接受。Project / 退出清理引用的 W28 GUI已实际补齐，最终异常恢复以随后记录为准。

## 最后恢复包独立结论

最终独立使用包：PID24881，`app.asar` SHA256 **`fc68a61326caa6ae55dadc860e33aa34c6bc5abd6f65931377d5170d41694813`**。该包包含公开结果、非枚举 effort、active turn恢复及旧已失败 / 已中断历史修复。

- 上次实际 SIGKILL 的 W28 turn `7d5e6039` 在启动后归为失败；真实 command显示 `!` 且页面 spinner数量0，不再继续转圈，无“正在输出”残留。[恢复截图](W28-crash-restored.png)。journal实际报告 cleaned；本次 CLI / command已随EOF退出，不把它记作仍存活残留的实杀证明。
- W26旧turn `4f9e3c50` 的command从in_progress修正为failed，UI spinner数量0，[旧历史修复](W28-old-crash-repaired.png)。修复只针对session/turn匹配且已有结束时间的failed/interrupted行，保留原正文和成功历史，未将历史改成成功。
- 从UI同一Session发送新输入，真实得到 `W28_RESUMED_409 W26_RULE_841`，结束Done；nativeID仍 **`01a14fa4-640d-7fb3-b0a8-a8179c7f0f2e`**，没有新建替代Thread、自动重放旧300秒命令或改模型。[续聊截图](W28-real-resumed.png)、[重启后只读库/进程证据](W28-crash-after.json)。external1646仍存活。
- 独立执行最新正式Session回归 **81 / 81通过**，[日志](W28-recovery-regression.log)；包括本轮新增旧历史保护与重复启动不重放。合成partial-agent恢复由正式测试覆盖，实际崩溃回合已完成的Agent正文保留，W28不宣称这次GUI恰好截获半个token流。

最终源码blob：store `15b8c795575f2dafac5f31c94d64043d41c1a458`、session-service `647baf19a4a3173145fa6b3624ef9751bb01715b`、Codex provider `e6ebc1a3283c94736f78d888b942aed0e8f0f406`、mapping `393c8898dff547499b85207f16198982ac3a3bdc`。

### 七任务当前范围收尾资格

按 DEC-16 / DEC-19 当前 Codex 范围，W28独立复核没有剩余已重现的技术阻断。`native-cli-parity`、`app-skeleton`、`project-shell`、`agent-adapter`、`session-slice`、`context-tools`、`v1-foundation-slice` **可由 Main Agent 在最终门禁及文档同步通过后完成并归档**。原双CLI标准仍保留Claude历史未通过 / 后续范围，不将其全勾成真实通过；新增Diff、推理控制 / 公开输出、图片 / Skill人工体验验收仍待人，不由技术task完成代替。

语义收尾复核：核对本任务acceptance顶部当前结论与历史报告边界、上述七任务交付标准和证据责任、Roadmap下一步 / 整体概况 / 模块状态 / 阶段 / 验收、当前原生能力表、Adapter / Session / Input规格中的默认、图片Skill和公开输出范围。W28写入仅本任务当前acceptance及本文件/evidence；未修改task状态或历史验收。Main Agent负责最终跨文档同步、其余验收当前入口、归档链接及提交。
