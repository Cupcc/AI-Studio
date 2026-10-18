# W27：V1 原生接入与退出责任独立审查（初查）

## 身份、基线与方法

- 2026-10-18，独立 Review Agent；未参与实现。只读代码、负责规格和 W24 / W25 的具体证据；未启动 Electron、未运行真实模型请求。
- 工作目录：`AI Stduio.worktrees/v1-closure`；源码基线 `dc66a16`。本记录是实施前发现清单，不能作为后续源码或最终安装包的通过结论。
- 依据：[Task Protocol](../../../README.md#验收范围与独立性)、[原生原则 24](<../../../../docs/01. Product Definition.md#8-已确认的产品原则>)、[Adapter spec](../../../../specs/agent-adapter/spec.md)、[Input spec](../../../../specs/input/spec.md)、[Session spec](../../../../specs/session/spec.md)、[04 退出责任](<../../../../docs/04. Technical Requirements.md#退出与异常清理责任边界>)。当前真实 CLI 范围仅 Codex；Claude 不作为本轮 V1 的缺陷修复或真实补验对象。

## 现有证据能证明什么

| 证据 | 可引用结果 | 仍不能据此关闭的事项 |
|---|---|---|
| [W24 应用 UI](../../T20261009-context-tools/evidence/W24-review.md) | Codex 普通引用、Running 同轮追加引用、Files、Project Diff、Browser 本地预览、Terminal 与 Project 关闭接缝 | Stop、模型切换、并发、Needs Input 的本轮真实应用 UI；最终包；独立里程碑验收 |
| [W25 原生 / Adapter](../../T20261011-native-cli-parity/evidence/W25-codex-native.md)及[结构化结果](../../T20261011-native-cli-parity/evidence/W25-codex-native.json) | 0.163.0 的流式、原 ID 恢复、同轮文字拒绝、精确 Stop 保留旧服务、第二模型、原生并发、单 Runtime 崩溃隔离 | 应用 UI 行为、`setModel(null)` 默认复位、宿主异常退出后启动清理、未观察后代、共享 MCP、所有配置和工具能力 |

协议生成版本 `0.161.0` 与真实 CLI `0.163.0` 的差异必须保留；“已执行子集通过”足以支持对应行为，不能写成全协议通过。反过来，也不应把全部上游协议方法逐一执行作为 V1 门禁。

## 实际出站方法清单

按 [connection.ts](../../../../packages/agent-adapter/src/codex/connection.ts)、[driver.ts](../../../../packages/agent-adapter/src/codex/driver.ts)、[process-tracker.ts](../../../../packages/agent-adapter/src/codex/process-tracker.ts) 和 W25 结果交叉核对。

| 方法 | 应用 / Adapter 用途 | 当前证据与补验 |
|---|---|---|
| `initialize` + `initialized` 通知 | 每个 Runtime 握手、experimentalApi | W24 / W25 已间接覆盖 |
| `thread/start` | 新建原生 Session | 已覆盖；本轮 UI 并发需核对不同 native ID |
| `thread/resume` | 恢复、Stop 兜底 | W25 原 ID 恢复已覆盖；兜底失败不新建由自动化检查 |
| `turn/start` | 下一回合、模型 / effort 可选覆盖 | 已覆盖；effort 目前仅 Adapter 可设，见 F3 |
| `turn/steer` | Running 同轮追加、Needs Input 文字拒绝 | W24 / W25 已覆盖；本轮集成应核对消息归属与 Stop 后续聊 |
| `turn/interrupt` | Stop 当前回合 | W25 已覆盖；仍需真实应用 UI Stop、另一 Session / Terminal 不受影响 |
| `thread/backgroundTerminals/list` | 基线和当前命令归属 | W25 已覆盖；不能以列表为空证明进程已退出 |
| `thread/backgroundTerminals/terminate` | 精确停止本轮命令 | W25 已覆盖；仍需应用 UI 和失败恢复集成 |
| `model/list` | 草稿 / Session 模型目录 | W25 已覆盖；不创建持久 Thread 的约束继续保持 |
| `config/read` | `setModel(null)` 解析当前原生默认 | W25 仅两个显式模型，未证实执行此分支。补一次用户选回 CLI 默认后的实际模型与下一轮行为 |
| `thread/settings/update` | 只有 `Methods` 类型声明 | 未发现调用，不是当前运行时兼容性补验项；若实施 effort 等功能后新增调用，再纳入 |

入站授权映射已有命令、文件、权限三类和 `item/tool/requestUserInput`，未知请求明确拒绝。类型存在、模拟通过和真实触发分别记录；W25 文字拒绝不能证明每一种授权 / 问题的应用 UI 均通过。

## 需要实施或补验的发现

### F1 · 阻塞：A-Q3 没有跨宿主持久归属与启动清理

`RuntimeProcess.lastSnapshot`、`exitSnapshot` 和 `RuntimeResources.handles` 仅存在内存。当前代码没有宿主实例身份 / PID + 启动时间 / Runtime 进程组 / Session 的持久记录，也没有应用启动时读取旧记录并判定失效宿主的入口。W25 杀掉 CLI Runtime 的恢复不等同杀掉宿主后的清理。

完成条件：

1. Runtime 返回调用者前建立可恢复的归属记录，并保存可确认的后代身份；正常退出确认后移除相应记录，失败保留。
2. 新宿主先证明旧宿主已失效，再核对每个目标 PID + 启动时间；不得仅按进程名、PGID 或 cwd 清理。
3. 活跃其他实例、PID 复用、其他 Session、用户 Terminal、共享 / 外部 MCP 与未登记进程不受影响。
4. 活动命令下强制终止隔离宿主，再启动并独立验证记录中的目标退出；已观察的脱离后代纳入。未知或采样前脱离的进程如实保留边界。
5. 进程探测失败、记录损坏或退出不确认可诊断、可重试，不能写成零残留或清理成功。

### F2 · 阻塞：最后退出 handler 吞掉失败后仍退出

[shutdown.ts](../../../../apps/desktop/src/main/shutdown.ts) 在 `disposeFeatures()` 拒绝后，仍在 `finally` 中关闭 core 并调用 `quit()`；[对应测试](../../../../apps/desktop/src/main/shutdown.test.ts)目前固定这一行为。上层 Runtime 句柄虽然支持重试，宿主随后关闭使重试入口丢失。

完成条件：清理失败保留 core / 诊断与下一次退出重试；重复退出不并发清理；只有清理成功才关闭 persistence 并完成第二次 quit。验证首次失败后第二次成功、连续失败、进行中重复退出和成功后幂等。按真实关闭编排检查“取消退出后可继续使用”需要保留的服务入口。

### F3 · 阻塞：必要原生推理控制未贯通

[Input spec](../../../../specs/input/spec.md) §2 已明确 FR-INPUT-001 需要原生推理控制。[Provider](../../../../packages/agent-adapter/src/codex/provider.ts) 接受 `providerOptions.effort` 并由 `turn/start` 发送；模型目录还保存 `reasoningEfforts`。但 Session、IPC 与 Composer 没有 effort 字段和控件，应用不能让用户使用该原生控制。

完成条件：按原生模型目录能力提供选择、保留不覆盖时的 CLI 默认、保持下一轮生效；恢复 / 模型变化时不擅自更换用户选择；按适用数据与 UI 路径验证，不把 Adapter 参数测试当作应用接入。

### F4 · 阻塞：已公开推理输出被 Session 层无条件丢弃

[Session spec](../../../../specs/session/spec.md) S-Q12 已明确接入 CLI 对用户公开的推理 / 思考内容。[mapping.ts](../../../../packages/agent-adapter/src/codex/mapping.ts) 已映射原生 `reasoning` item；[SessionService](../../../../apps/desktop/src/main/services/session/session-service.ts) 在 delta 和 snapshot 两条路径均直接忽略，现有单测也断言省略。

完成条件：以 CLI 已实际公开的数据为来源，流式 / 完整快照 / 持久化 / 恢复均能呈现；不推测或重建未公开内容。验证同 item 更新不重复、切换与恢复不丢失、真实回合可见。原生没有返回该内容时不得伪造。

### F5 · 尚需完整能力矩阵，不能写成原生功能全部完成

原生原则 24 和原生对齐任务明确包括附件、Rule / Skill / Context、命令与 Session 操作。当前 Adapter 支持 text / mention / localImage；应用的 ContextItem 只有 file / view，Files 引用统一为 mention。生成类型还含 skill / audio 等输入，但类型本身不能证明本机当前版本、模型或 CLI UI 可用。

完成条件：至少对模型 / 推理、权限、公开输出、普通及运行中附件、Rule / Skill / Context、必要命令 / Session 操作逐项记录“已接入、待接入、有证据的协议限制、当前版本实际不可用”。对本轮 V1 真实可用但尚无应用入口的必要能力继续实施；不把“文本可以写一个名称或路径”自动认定为等同原生结构化能力。没有具体要求或运行证据的上游扩展不盲目扩为新 V1 功能。

### F6 · 集成与最终交付的验证仍未完成

- 应用 UI：创建、流式、同 Session 继续 / 原 ID 恢复、两个 Codex Session 同时 Running、仅停一个、另一 Session 正常完成、用户 Terminal 和先前服务保留、Needs Input 原生选项及文字答复、第二模型和回到默认。
- 原有焦点 / 未读失败应以真实前台状态复现和修复；不得通过短暂压制未读标记绕过前台与明确查看的语义。
- 最终源码上的完整必要门禁、macOS arm64 包与打包应用功能链路；当前开发版 `0.0.0` 包的冒烟不等同 `v1.0.0` 最终包。
- macOS 15.6 本机通过不能写成 macOS 13 实机通过；最低版本的可检查约束与未执行环境分开写明。

### F7 · 阻塞：目录缺失触发客户端擅自模型回退

[Composer.tsx](../../../../apps/desktop/src/renderer/src/features/input/Composer.tsx) 的 `send()` 和 [SessionService.start()](../../../../apps/desktop/src/main/services/session/session-service.ts) 两处均在目录没有所选模型时清空用户模型、改用 CLI 默认；Composer 还显示“已不可用 / 下一轮将使用 CLI 默认”。这与 Input I-Q6、§3.6 第 8 条明确矛盾：目录未列出不代表不可调用，客户端不能擅自替换选择。

完成条件：两处均保留用户选择并尝试原生调用；文案改成“目录未列出”，仅实际原生错误才能标不可用。目录读取失败、模型暂时消失 / 重新出现、真实不支持模型、后台改选均验证不发生客户端回退。允许原生自身的路由变化，但应如实记录实际模型。

## 当前 V1 能力矩阵

本表为 `dc66a16` 初查，状态按应用端完整接入判断；后续实现需以新基线更新结果。生成类型包含的其他上游接口不自动成为新增产品需求。

| 能力 / 负责要求 | 当前应用接缝 | 结论与最小后续 |
|---|---|---|
| 新建、流式、继续、原 ID 恢复；Adapter §3.3 | 独立 Runtime、Thread / Turn、Session 持久化 | 已接入，有 W24 / W25 子集证据；最终 UI 恢复复核 |
| Running 同轮追加；Input I-Q3 | 原生 steer + 用户消息归属 | W24 真实 UI 已通过；复验 Stop / 终态交错，不需重新实现 |
| 精确 Stop / 兜底；04 §5、Adapter §3.6 | 原生 terminate + OS 身份核对 + 原 ID 恢复 | Adapter 真实通过；仍需 UI、并发隔离和最终包 |
| 模型 / 默认 / 目录失败；Input I-Q6、FR-INPUT-002 | 目录与选择控件已有 | F7 客户端回退须修复；默认复位需补真实 config/read |
| 推理强度；Input §2、原则 24 | Adapter effort 可选参数；App 无入口 | F3 明确待实现；旧 JSON 缺省保持原生默认 |
| 公开 reasoning；Session S-Q12 | Adapter 已提供；Session 层丢弃 | F4 明确待实现，覆盖流式、最终快照、持久化及恢复 |
| 普通文本、文件、View Context；Tools §4.1、Input §3.3 | 原生 text / mention，View Context 按既有设计交付 | W24 普通 / Running 文件引用通过；保持已验证语义 |
| 原生图片附件；原则 24 | Adapter localImage 已有；App 仅 file/view | App 缺口：用户明确选图片，主进程复用路径重校验，交付 localImage；不能以 mention 等同图片 |
| Skill 显式选择 / 原生自动加载；原则 20、24、A-Q5 | 默认不覆盖原生配置；无 Skill 输入或目录 App 接缝 | 自动 Rule / Skill 加载真实结果未证；显式 Skill 原生输入待接入。新目录接口需当前 CLI 的实际证据 |
| 权限 / 授权 / 问题；Adapter §3.5、FR-STATE-002 | 命令、文件、权限、question 映射及 UI | 已接入部分；补当前真实 UI 的接受 / 拒绝 / 文字、Stop 撤回。不能由一次命令拒绝外推所有类别 |
| 其他原生可见工具输出；原则 24 | command 输出保留；MCP / dynamicTool 主要保留调用信息 | 映射未保留 mcp result、dynamic contentItems 等正文；按当前 CLI 真实可见结果核对，具体丢失内容属于待接入，不能写全覆盖 |
| Rule / 配置来源；A-Q5、Adapter §3.10 | thread/start 默认只给 cwd，不写产品 system defaults | 代码保留原生加载；仍需隔离 Rule/Skill marker 验证，不能凭参数省略认定全部加载等价 |
| 必要 Session / 命令操作；FR-SESSION、Input | 新建、继续、Stop、恢复、Rename、模型已存在 | 依确认规格核对，不把 CLI 登录 / 管理命令或任意 generated API 直接扩为 V1 新 UI；具体原生功能缺口应逐项列证据 |
| 并发与崩溃隔离；AC-03、Adapter §3.9 | 独立 Runtime，W25 原生测试 | 已有原生证据；App UI 和系统进程核对仍需完成 |
| 宿主异常后恢复；A-Q3 | 无持久登记 / 启动清理 | F1 明确待实现；共享服务与其他活跃实例不得误杀 |
| 正常退出失败；04 §5、Project 关闭规则 | 日常编排可报错，但最后 handler 总会退出 | F2 明确缺陷；失败保持重试与持久化入口 |

## 接入结构建议（只读）

- `ModelInfo` 透传现有原生 `defaultReasoningEffort` 与 `inputModalities`。SessionSummary / ComposerDraft / CreateSessionRequest 可增 `reasoningEffort?: string|null`，读取旧 JSON 时规范为 null；ActiveTurn 创建时快照，改选只影响下一轮。现有 Session / Draft 已使用 JSON，增加这两个字段不必新表。实际每轮生效值若新增记录则单独处理。
- `AgentSession` / `SessionDriver` 提供努力强度设置接缝，Codex 保存 desired 值到下一次 `turn/start.effort`；不要为控件改选终止 Runtime。原生 model / effort 均持续到后续轮次，省略或 null 不应被当作重置保证；默认值应从 `config/read.config.model_reasoning_effort`、Thread start / resume 的 `reasoningEffort` 和对应 Model 原生默认解析，不能硬编码。
- reasoning 可复用 `tool_activity` + `ItemSnapshot.kind='reasoning'`，补 delta 累积与 snapshot 替换，Transcript 为其提供固定标题和折叠正文。需处理原生 summary/content 两种数据源与索引，避免两路 delta 混成重复正文后永久保存。
- 图片 ContextItem 区分 file/image，沿用 Files 的主进程路径 / 符号链接 / 发送时重校验，用户明确选择附件语义。Skill InputAttachment 传 `{kind:'skill',name,path}`，由主进程实际目录返回的身份解析 name/path，Renderer 不能开放任意本机读取。
- UI 结构按 `vercel-react-best-practices` 复核：复用现有 store / 选择控件 / 折叠输出、订阅所需字段，不引入额外全局监听或大型依赖。此处为实现建议，不构成人工产品接受。

## 独立复验安排

等待 Main Agent 提供完成后的源码基线及 GUI 独占时段后，独立执行受影响测试、隔离宿主清理探针、真实 UI 和最终包检查。发现交实现者修复；本 Agent 不修改源码。最终在主 Agent 通知后新增 acceptance 当前小节，保留历史验收结论。
