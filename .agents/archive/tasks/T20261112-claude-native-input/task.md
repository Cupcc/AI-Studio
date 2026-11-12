---
id: T20261112-claude-native-input
status: done
fr: [FR-INPUT-001, FR-TOOL-001, FR-CHAT-002]
ac: [AC-02, AC-05, AC-07]
specs: [specs/agent-adapter/spec.md, specs/input/spec.md, specs/session/spec.md, specs/tools/spec.md]
created: 2026-11-12
---

# Claude Code 运行中排队与结构化附件

## 收尾

2026-11-12 由 Main Agent 收尾。这是 AI 交付，不是人工产品验收；人工状态见[验收记录](acceptance.md#人工功能验收)（待人工验收）。

- 交付：Claude 报告并执行原生 `queue`（Adapter `queueUserInput` / `input.started` / `input.cancelled`，桌面排队列表与未送达处理）；结构化附件（图片为 base64 图片块，文件与粘贴文件为路径引用）；Provider 可选 `checkInput`，在创建 Session、记录回合或重试前检查附件。
- 评审与验证：真实 CLI 集成 8/8（Claude Code 2.1.322）；独立评审 R1（`864f366`）部分通过，修复后 R2（`b14f156`）通过，验收者未参与实现，见 [acceptance](acceptance.md)。之后的 `e60e17f` 补上重试前检查（R2 观察项），有单测。
- 远端 CI：affected [run 43230534701](https://github.com/Tiancheng-ai/AI-Studio/actions/runs/43230534701)（`012587b`）选中 E2E 59 项通过，`product-selection.spec.ts:63` 失败；单独重跑 [run 43231968045](https://github.com/Tiancheng-ai/AI-Studio/actions/runs/43231968045) 中 `:35`、`:63` 失败。两者都卡在 `brief()` 填写“任务目标”超时；dev `3d5dbb1` 上同一 spec 以同一症状失败（[run 43232724879](https://github.com/Tiancheng-ai/AI-Studio/actions/runs/43232724879)，`:35`），与本任务无关，不阻塞收尾。
- 文档复核：adapter / input / session / tools spec；docs/05 的 Claude 暂缓表述（已确认文档，变更 diff 交用户审阅）；docs/06 下一步、人工事项、模块状态与验收进度；docs/08 Claude / 输入 / Files 节点。保留项：Claude Skill 附件与 Skill 目录（不在本任务范围）；已知边界见执行记录与 acceptance。

## 目标

补齐 Claude Code Provider 的两项未接入原生能力：

1. 运行中发送：按 [input I-Q3](../../../../specs/input/spec.md) 与 [Adapter A-Q2](../../../../specs/agent-adapter/spec.md#11-已确认的产品要求)，Claude 报告并执行 `queue` 语义，如实呈现排队、并入与后续回合。
2. 结构化附件：图片（Files 图片、粘贴图片）以原生图片内容块交付；文件引用与粘贴文件由 Adapter 统一转换，取代当前 Claude 的“桌面文本路径清单 + 附件 unsupported”。

## 范围

- 做：Adapter（Claude 驱动、核心 SessionController、公共契约与事件）、桌面 Session 服务与 IPC、输入区与对话中的排队呈现；模拟测试、真实 Claude CLI 验证、agent-browser 界面验收、独立评审；同步 adapter / input / session / tools 规格与路线图。
- 不做：Claude Skill 目录与 Skill 标签（Claude Provider 尚无 `listSkills`，见[技术决定](#技术决定)）；撤回单条排队消息（原生有 `cancel_async_message` 控制请求，但 SDK 0.3.293 未公开方法）；Codex 行为变更；打包与安装补测（由 [CLI 安装任务](../../../../tasks/T20261108-cli-install/task.md) 负责）。

## 依据

- 产品原则 24、[FR-INPUT-001](<../../../../docs/02. Functional Requirements.md>)、[input I-Q3 与 Send / Stop](../../../../specs/input/spec.md)、[session §3 回合与输入](../../../../specs/session/spec.md)、[Adapter §3.4 / §3.12 / §5.5](../../../../specs/agent-adapter/spec.md)、[Tools §4.1 文件引用契约](../../../../specs/tools/spec.md#41-文件引用契约)。
- 文件内容不内联、只传路径引用的规则沿用 Tools §4.1；粘贴附件的暂存与校验沿用 input spec「粘贴附件与缓存生命周期」。

## 已确认事项

| 问题 | 回答（确认日期） |
|---|---|
| 是否执行 Claude Code Provider 的后续工作 | 用户审阅架构页后回复「评审通过，继续推进」，追问后说明「这个架构和任务可行，评审通过，可以执行」，选择 Claude 运行中排队、Claude 结构化附件、补测未覆盖项（2026-11-12）。这是执行授权，不是人工产品验收 |
| Claude 运行中发送的产品行为 | 已由 I-Q3 / A-Q2 确认（2026-10-11）：按原生能力接入，保留 Codex 同轮追加与 Claude 排队的差异，消息归属与 Stop 对队列的行为由 Adapter 验证并如实呈现 |

## 原生行为实测（2026-11-12）

环境：Claude Code 2.1.322、Agent SDK 0.3.293、haiku、`/tmp` 下的隔离项目、`persistSession: false`。记录见 [W1-claude-queue-spike.txt](evidence/W1-claude-queue-spike.txt)。

- 每条带 uuid 的用户消息都有 `command_lifecycle` 帧：`queued` → `started` → `completed`，或 `cancelled`。`system/init.capabilities` 含 `msg_lifecycle_v1`、`interrupt_receipt_v1`、`interrupt_cancel_queued_v1`。
- 运行中发送的消息先 `queued`。当前回合还有工具轮时，它在工具结果后 `started`，并入当前回合（结果帧 `user_message_uuids` 为 [A, B]，只有一个 result）。
- 当前回合没有后续工具轮就结束时，它在上一回合 result 之后 `started`，作为下一回合单独执行（`user_message_uuid` = B）。
- 连续排队的多条消息在下一回合一起 `started`，合并为一个回合（`user_message_uuids` = [B, C]）。
- Stop（普通 interrupt）时，回执 `still_queued` 列出排队消息；当前回合以 `error_during_execution` 结束并 `cancelled`，排队消息随后 `started` 并作为新回合执行。
- 图片以 base64 `image` 内容块随用户消息发送，模型正确识别内容（红色图片回答 “Red.”）。

## 技术决定

（Main Agent，2026-11-12，依据上节实测与 I-Q3）

1. Claude `inputWhileRunning` 报告 `queue`，只在 CLI 声明 `msg_lifecycle_v1` 时接受排队；否则前置返回 `unsupported`，不猜测归属。
2. Adapter 新增 `AgentSession.queueUserInput(input) → { inputId }`：收到原生 `queued` 才算接受；`sendUserInput` 的 `{ turnId }` 契约不变。新增事件 `input.started { inputId, turnId }`（并入当前回合或成为新回合的输入）与 `input.cancelled { inputId, reason }`；原生从队列发起的回合，`turn.started` 携带 `queuedInputIds`。
3. 原生 `started` 时有进行中的原生回合 → 归入该回合；没有 → 新回合。上一回合仍在 Stop 收尾时，新回合及其事件在控制器中暂存，上一回合结束后再开始，保证每个 Session 同时只有一个回合。
4. Stop 沿用普通 interrupt，不取消排队消息：原生行为是保留并继续执行，产品规则要求不自行丢弃已接收消息。被停止回合自身的输入仍在队列时，保持现有的 Runtime 恢复路径。
5. 桌面端：排队消息在 Session 摘要中以“排队中”列表呈现，不写入任何回合；`input.started` 时作为用户消息写入对应回合。Runtime 退出、退役或原生取消时标为“未送达”，用户可放回输入框或移除；不自动重发。
6. 附件：Claude 改用 `attachments` 策略。图片按文件头识别 PNG / JPEG / GIF / WebP，读入后以 base64 图片块发送；文件引用与粘贴文件使用与 Codex 相同的“本地路径引用，不含内容”文本。Skill 附件对 Claude 仍前置 `unsupported`。
7. Claude Skill 目录不在本任务范围：需要另行确定 SDK `supportedCommands` / 斜杠命令与原生 Skill 的对应关系。

## 验收标准

| 场景与来源 | 前置条件与用户操作 | 预期结果 | 验证方式与环境 |
|---|---|---|---|
| I-Q3 排队接受 | Claude 回合运行中，在输入框发送第二条消息 | 发送可用；收到原生 queued 后清空输入，消息显示“排队中”，不显示为已执行 | 单测 + agent-browser + 真实 CLI |
| I-Q3 并入当前回合 | 当前回合运行工具时排队 | 工具结束后消息移入当前回合，Agent 回复中处理该消息；只有一个完成行 | 单测 + 真实 CLI |
| I-Q3 下一回合 | 当前回合无后续工具时排队 | 当前回合完成后自动开始新回合（Running），用户消息位于新回合开头 | 单测 + 真实 CLI |
| I-Q3 合并 | 连续排队两条 | 两条进入同一个新回合 | 单测 + 真实 CLI |
| input Send / Stop | 有排队消息时点击 Stop | 当前回合显示已停止；排队消息按原生行为随后执行，不丢弃、不重复 | 单测 + 真实 CLI |
| 失败恢复 | 排队后 Runtime 退出 / 回合失败退役 Runtime | 排队消息标为“未送达”，可放回输入框或移除；不自动重发 | 单测 + 界面 |
| 排队不可用 | CLI 未声明 lifecycle 能力；或 Stop 进行中发送 | 明确错误，输入保留 | 单测 |
| FR-TOOL-001、Tools §4.1 | 向 Claude 发送 Files 文件引用 | CLI 收到路径引用（不含内容）；Agent 能按路径读取 | 单测 + 真实 CLI |
| FR-INPUT-001 图片 | Files 图片或粘贴图片发送给 Claude | 原生图片块；Agent 描述图片内容 | 单测 + 真实 CLI + 界面 |
| 粘贴文件 | 粘贴非图片文件发送给 Claude | 路径引用文本，Agent 可读取 | 单测 + 真实 CLI |
| 附件边界 | 图片不可读 / 类型不符 / Skill 标签 | 发送前明确失败，输入保留 | 单测 |
| Codex 回归 | Codex 运行中追加、附件 | 行为不变 | 现有单测 / E2E 相关用例 |

## 执行记录

- 2026-11-12：Main Agent 建立任务与 worktree `../AI Stduio.worktrees/claude-native-input`（`feat/claude-native-input`，基于 dev `872978b`），完成原生行为实测，记录技术决定。下一步：Adapter 实现与单测。
- 2026-11-12：Main Agent 完成 Adapter、桌面 Session / IPC / 界面与规格同步，受影响单测通过。
- 2026-11-12：Main Agent 自检（Claude Code 2.1.322、haiku、隔离 userData 的开发构建，agent-browser 操作）：
  - 排队：工具运行中排队后并入当前回合（W1-01、W1-02）；无工具时排队成为下一回合（W1-03、W1-04）；有排队消息时 Stop，当前回合停止，排队消息随后执行（W1-05、W1-06）。
  - 附件：Files「作为图片附加」与文件引用（W1-07、W1-08），粘贴图片与粘贴文件（W1-09）。CLI 会话记录确认图片为 `image/png` base64 块，文件只有路径引用；Agent 不用工具说出颜色，再按路径读取文件。Files「添加到对话」对图片仍是路径引用，符合 input §1.3 第 5 条。
  - 失败恢复：kill 测试应用的 Claude 子进程后，排队消息标为“未送达”（W1-10）；放回输入框（W1-11）；重发后启动新 Runtime 正常回复（W1-12）。“移除”与“放回输入框”走同一 `dismissQueued` IPC，由单测覆盖，未单独在真实应用点击。
  - 真实 CLI 集成 8/8 通过，新增排队（含 Stop）与附件两例（[记录](evidence/W1-claude-integration-2.1.322.txt)）；2.1.322 记入已测试版本。连续排队合并为一个回合由原生实测与单测覆盖，未在界面单独操作。
  - 自检修复：“未送达”标签在窄对话宽度下折成两行；“放回输入框”后焦点未回到输入框。
  - 下一步：远端 CI（affected，含选中 E2E）与独立评审。
- 2026-11-12：远端 CI affected（[run 43184581028](https://github.com/Tiancheng-ai/AI-Studio/actions/runs/43184581028)，`864f366`）通过，选中的 claude-effort / cli-default / composer / session E2E 21 项通过。
- 2026-11-12：独立评审 R1（Review Agent，未参与实现）结论部分通过，见 [acceptance](acceptance.md)。Main Agent 修复：
  - D1：Runtime 尚未收到 `system/init` 时，排队先等待能力上报，不再误报 CLI 版本不支持。
  - D2：Provider 新增可选 `checkInput`，桌面在创建 Session 或记录回合前执行，图片类型 / 大小不符时输入保留；Session 错误不再显示 Electron IPC 包装前缀。
  - D3：附件前置检查与写入 CLI 按调用顺序进行。
  - D4：粘贴附件清理计入排队 / 未送达消息的引用。
  - 评审疑点中一并处理：Stop 后 `started` 先于被停回合的 result 到达时开新回合；移除排队消息后焦点回到输入框。其余疑点（回执无超时、队列回合的进程基线异步、恢复期取消的提示措辞）保留为已知边界。
  - D5：tools spec 与路线图的过期表述随本次同步。下一步：R1 复验失败场景与受影响回归。
- 2026-11-12：R2 复验通过（见 acceptance）。Main Agent 按 R2 观察项让重试同样执行 Provider 检查（`e60e17f`），rebase 到集成了 CLI 补测的 dev，同步路线图与架构页，远端 CI 结果见[收尾](#收尾)。
