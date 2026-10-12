# 输入区

## 文档信息

| 项目 | 内容 |
|---|---|
| 模块 | `input` |
| 文档状态 | 草稿 |
| 覆盖需求 | FR-INPUT-001～FR-INPUT-002；关联 FR-STATE-002（在输入框答复 Needs Input）、FR-SESSION-001（输入区固定在对话下方） |
| 相关验收 | AC-02、AC-05；05 第 4 节专项测试中的 Model Selector、Stop |
| 相关设计 | [Shell Spec v01](../../design/components/shell-spec-v01.md) 第 6、7 节；[Shell Spec v02](../../design/components/shell-spec-v02.md) 第 2.2、6、7 节（宽度对齐、草稿居中）；线框图 v02（[design/wireframes](../../design/wireframes/README.md)）；交互原型 v02 |
| 来源 | [02. Functional Requirements](<../../docs/02. Functional Requirements.md>) FR-INPUT-001～002、FR-STATE-002、FR-CHAT-003；[03. UX Specification](<../../docs/03. UX Specification.md>) 第 4、6 节；[04. Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 4、5 节；[CLI Integration Preflight](../../tasks/T20261008-cli-preflight/report.md) 第 4、5、6 节 |

## 1. 问题记录

### 1.1 未决问题

2026-10-09 参考应用复核见 [Session research](../../tasks/T20261009-session-slice/research.md)；推荐仍为草稿，已确认回答保持原样。

| 编号 | 问题 | 推荐答案与依据 | 阻塞实现 | 回答（确认日期） |
|---|---|---|---|---|
| I-Q1 | Needs Input 时 Send / Stop 按钮如何同时保持原生操作？ | 输入为空时显示 Stop；输入非空时同时保留 Send 与 Stop，Send 回复等待请求，Stop 取消整轮。布局可合并视觉位置，但不得隐藏任一原生操作 | 否；技术与交互细化 | 依据原则 24（2026-10-11）；diff 待审阅 |
| I-Q4 | 本轮 `+` 菜单是否显示尚不可用的“从 Files 添加文件”？ | 显示并禁用，说明“Files 工具完成后可用”；Files 上线后启用。也可本轮隐藏菜单只保留按钮，请确认 | 否 | |
| I-Q5 | 已有 Session 中未发送的文本在切换 Session / Project、重启应用时是否保留？ | 保留，切换时恢复，并由 Session 独立持久化至 session_drafts；与 chat spec C-Q1 草稿规则一致，秘密问题输入例外见 §4 | 否 | |
| I-Q6 | 模型选择细节与原生兼容性如何呈现？ | 未选择时沿用 CLI 默认；模型选择和生效时机按原生能力接入。模型不在目录中不等于不可调用，显示目录／调用的实际结果；不得由产品擅自换成默认模型。具体接口与显示由 AI 核对，依据 FR-INPUT-002、01 第 8 节原则 20、24 | 否；技术与交互细化，不阻塞原生能力接入 | |

### 1.2 已确认

| 编号 | 问题 | 推荐答案与依据 | 阻塞实现 | 回答（确认日期） |
|---|---|---|---|---|
| I-Q2 | 在输入框输入的回复对 CLI 意味着什么？有多个未答复请求时作用于哪一个？ | 只有一个未答复请求且该请求原生接受自由文本（如提问）时，文字作为该请求的答案；其他情况下，所有未答复请求按“拒绝并附该文字为说明”解决（Claude `canUseTool` 拒绝可附说明；Codex 拒绝后由 Adapter 把文字作为用户消息交给 Agent，具体方式待 Adapter 验证）。对话中显示为用户消息 | 是：涉及 Adapter 接口，须在 Needs Input 实现前确认 | 采纳建议（2026-10-09 确认）；Codex 拒绝后交付文字的具体方式由 Adapter 验证 |
| I-Q3 | Running 中是否允许发送？ | 按各 CLI 原生能力接入，保留 Codex 当前回合追加与 Claude 后续回合排队的差异；消息归属及 Stop 对队列的行为由 Adapter 验证并如实呈现 | 产品问题已解决；实现与验证待完成 | 依据 [01 第 8 节原则 24](<../../docs/01. Product Definition.md#8-已确认的产品原则>)（2026-10-11 确认）；不再采用“本切片不支持”作为产品决定，diff 待审阅 |

## 2. 职责与边界

- 负责：
  - 输入区结构：文本输入、Context / Attachment 入口、上下文标签位、Model Selector、Send / Stop（FR-INPUT-001；Shell Spec 第 7 节）。
  - 键盘行为、Send / Stop 控件状态。
  - 在输入框中答复 Needs Input（UX 第 6 节“输入框保持可用，用户也可以直接输入回复”）。
  - Model Selector 的内容、默认值与切换时机（FR-INPUT-002）。
  - 已有 Session 中未发送文本的保留。
  - FR-INPUT-001 中原生 CLI 支持的必要对话控制（如推理强度）：按原则 24 接入，具体版本／协议能力由 Adapter 验证，未接入项作为实现缺口。
- 不负责：
  - 发送、答复、Stop、切换模型之后的 Session 状态变化：见 [specs/session/spec.md](../session/spec.md) 第 4.1 节。
  - 草稿的创建与 CLI 选择：见 [specs/chat/spec.md](../chat/spec.md)。
  - 从 Files 添加文件到上下文（FR-TOOL-001，[tools spec](../tools/spec.md#fr-tool-001-files)）；当前 View 作为上下文的注入方式（04 第 1 节第 10 项，Project View task）。本轮只提供入口与标签位。Files 的查看动作不自动添加标签；显式添加面向当前 Project 的 Session / 草稿，沿用本模块发送通道（DEC-10，2026-10-12 确认）。

## 3. 行为细则

### FR-INPUT-001 基本结构

依据：FR-INPUT-001；FR-SESSION-001；Shell Spec 第 7 节；UX 第 6 节 Session 打开第 4 项。

#### 布局

1. 输入区固定在 Conversation 下方，内容宽度与消息列相同、左右边缘对齐（最大 720，Shell Spec v02 第 2.2 节）；Session Mode 新对话草稿中与问候语一起居中，发送第一条消息后回到底部（Shell Spec v02 第 6 节；交互原型 v02，2026-10-10 确认）。草稿、Conversation Mode、Project View Conversation 列共用同一组件。
2. 上部为多行文本输入；底行从左到右：`+`（Context / Attachment）、上下文标签、（右侧）Model Selector、Send / Stop（Shell Spec 第 7 节；UX 第 4 节示意图）。
3. 打开 Session 或草稿时输入框获得焦点，可立即输入（UX 第 6 节 Session 打开第 4 项；FR-CHAT-001 第 1 项）。

#### 文本输入与键盘

1. 多行输入，随内容自动增高，最多 8 行，超过后在框内滚动（Shell Spec 第 7 节）。
2. Enter：控件处于可发送状态时发送；否则不发送，也不插入换行（建议）。Shift+Enter：换行（Shell Spec 第 7 节）。
3. 输入法组合输入（中文、日文等）进行中按 Enter 只确认候选词，不发送；组合输入期间界面刷新不得打断输入（实现要求，原型 v01 已示意）。
4. 发送成功后清空输入框与已发送的上下文标签；发送失败（例如草稿 CLI 不可用而未发送）时保留内容。
5. 只含空白字符视为空（建议）。
6. 已有 Session 中未发送的文本在切换 Session、View 或 Project 时保留，回到该 Session 时恢复（建议，I-Q5）。

#### Context / Attachment 入口与上下文标签

1. `+` 打开 Context / Attachment 菜单（Shell Spec 第 7 节）。本轮菜单只放“从 Files 添加文件”一项，在 Files 工具可用前禁用并说明原因（建议，I-Q4）。
2. 上下文标签位：显示当前 View 与从 Files 添加的文件，每个标签可单独移除（Shell Spec 第 7 节；FR-VIEW-007 第 3 项；FR-TOOL-001）。本轮实现标签位与数据结构 `context_items: [{type: 'view', viewId} | {type: 'file', path}]`；Conversation Mode 下不出现 View 标签；View 标签的出现规则与注入方式由 Project View task 决定。
3. 发送时上下文项随用户消息交给 session 模块，记录在对话记录的用户消息中（session spec 第 4.4 节）。

#### Send / Stop

依据：Shell Spec 第 7 节；04 第 5 节第 1 条；UX 第 6 节 Needs Input 呈现；FR-STATE-003。

控件按下表提供操作；Running 时发送与 Stop 均须可访问，不再以“同一位置的单个按钮”限制原生发送能力（I-Q3）。具体布局由实现与交互验收确定。

| Session / 草稿状态 | 输入为空 | 输入非空 |
|---|---|---|
| 草稿，CLI 可用 | Send 禁用 | Send |
| 草稿，CLI 不可用 | Send 禁用，草稿内显示原因（chat spec） | Send 禁用 |
| 无状态 / Completed Unread / Error | Send 禁用 | Send（Error 后发送会先恢复 CLI Conversation，FR-STATE-003） |
| Running | Stop | 按原生能力 Send（追加／排队），同时保留 Stop 入口；见 I-Q3 |
| Stop 进行中 | “停止中”，禁用 | 同左；输入框仍可编辑（session spec S-Q8） |
| Needs Input | Stop（I-Q1） | Send，作为对等待请求的回复（I-Q1、I-Q2） |

1. 输入为空时 Send 禁用（Shell Spec 第 7 节）。
2. Running 时提供 Stop；有可发送输入时同时提供原生发送操作（I-Q3，优先于旧 Shell 的单按钮示意）。点击 Stop 的效果见 session spec 第 3.12 节；排队处理须与原生能力核对，不能自行丢弃已接收消息。
3. 输入框在任何状态下都可编辑，包括 Running、Needs Input、Stop 进行中（UX 第 6 节“输入框保持可用”）。
4. 发送后立即进入 Running，不等待 CLI 首个输出（FR-STATE-001；[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 5 节）。

#### Running 中发送

按 I-Q3 与 FR-INPUT-001，运行中发送是必须接入的原生能力。Codex 当前回合追加与 Claude 后续回合排队分别呈现；发送接收确认后再清空对应输入，失败保留内容，排队接受不显示为已执行。回合结束、Stop 与继续发送的竞态应依原生语义处理，不自行重放、丢弃或合并排队消息。

当前 Adapter 的 `capabilities.inputWhileRunning` 已建模 `none` / `steer` / `queue`，Codex 已接入原生 `steer`；Claude 的排队能力尚未建模，UI 和 IPC 仍需贯通并验证。Claude Stop 后队列行为仍待真实验证（[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 5 节 `still_queued`），不能以此长期禁止 Running 中发送。跟踪见[对齐任务](../../tasks/T20261011-native-cli-parity/task.md)。

#### 在输入框答复 Needs Input

依据：UX 第 6 节 Needs Input 呈现；D-03；FR-STATE-002；Shell Spec 第 6 节 Needs Input 卡片“也可以在下方直接回复”。

1. Needs Input 时输入框可用，输入非空时按钮为 Send。发送后：文字作为用户消息出现在对话中，未答复的卡片按 I-Q2 的规则解决并变为只读（显示“已在输入框回复”），Session 回到 Running，Needs Input 清除（session spec E5）。
2. 文字回复在两种 CLI 原生协议中的语义尚未定义与验证：Codex 授权请求只接受批准 / 拒绝，Claude 的 `canUseTool` 返回允许 / 拒绝（拒绝可附说明），提问类请求可能接受自由文本。推荐规则见 I-Q2，需 Adapter 确认可实现。

### FR-INPUT-002 Model Selector

依据：FR-INPUT-002；FR-CHAT-003；FR-SESSION-003（独立模型配置）；01 第 8 节原则 8、20；04 第 4 节；[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 4 节（模型目录可读取，Codex 9 项、Claude 13 项）与第 6 节（同 Session 模型切换待验证）；agent-adapter task 验收“同一 Session 内切换模型后下一轮使用新模型”。

1. 位置：输入区底行右侧，Send / Stop 左侧；不在顶部 Tab Bar 设置全局 Model Selector（FR-INPUT-002；Shell Spec 第 7 节）。
2. 内容：只列出当前 Session（或草稿）所用 CLI 的模型目录，来自 Adapter；不列出其他 CLI 的模型（FR-CHAT-003）。
3. 默认值：未选择时显示 CLI 原生默认模型，标注“默认”；此时不向 CLI 传入模型覆盖，沿用 CLI 自身配置（01 第 8 节原则 20；04 第 4 节）。原生默认无法读取时显示“CLI 默认”（建议，I-Q6）。
4. 草稿：按草稿当前 CLI 显示模型目录；草稿更换 CLI 后选择重置为该 CLI 的默认（chat spec C-Q2）。草稿中的选择在创建 Session 时写入 `model`。
5. 已有 Session：切换模型写入 `Session.model`，从下一轮开始生效；Running 或 Needs Input 期间也可切换，不影响进行中的轮（建议，I-Q6）。切换后不在对话中插入提示行（建议）。
6. 恢复：Session 恢复原生会话时按 `Session.model` 重新应用模型选择（04 第 5 节第 6 条“以原 thread.id、cwd 和配置恢复”）。
7. 目录读取失败：Model Selector 显示当前值并禁用，悬停说明原因；不影响发送（使用当前或默认模型）。
8. 已保存的模型不在当前目录中：保留用户选择并说明目录未列出；只有实际原生结果证明不可用时才报告对应错误。客户端不擅自换成默认模型，原生若有回退则如实显示实际使用模型；用户可主动重新选择（I-Q6；01 第 8 节原则 24）。
9. 模型目录可读取不代表每个模型都有访问权限（[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 2 节末段）；选择后调用失败按 Error 处理。

## 4. 状态与数据

| 数据 | 字段 | 说明 |
|---|---|---|
| 每个 Session 的输入草稿 | `text`、`contextItems` | 2026-10-09 实现：内存保存并通过 `saveDraft` 写入独立 `session_drafts` 表（I-Q5）；秘密问题待答复内容只在内存中保留，答复成功或清空后清理 |
| 草稿输入 | 见 chat spec 第 4 节 | — |
| 控件状态 | 由 `activity`、`stopping`、`pending_requests` 是否为空、输入是否为空、CLI 可用性、`capabilities` 推导 | 不单独存储 |
| 模型 | `Session.model`（空 = CLI 默认）；草稿 `model` | session spec 第 4.2 节 |

## 5. 接口与事件

### 5.1 调用 session / chat 模块

2026-10-09 实现由 `Composer` 调用 Session store，再经 [`sessionContract`](../../apps/desktop/src/shared/ipc/session.ts) 进入主进程。以下参数名对齐正式 DTO；交互推荐的确认状态保持第 1 节所列状态。

| 操作 | 接口 |
|---|---|
| 草稿首条发送 | store `sendComposer({projectId, kind: 'new_chat'})` → IPC `create({projectId, cli, model, text, contextItems})` |
| Session 发送 | store `sendComposer({projectId, kind: 'session', sessionId})` → IPC `send({sessionId, text, contextItems})` |
| 输入框回复 Needs Input | 同一发送入口根据状态调用 `replyWithText({sessionId, text})`；失败保留草稿，已接受的用户文本先于同步终态入对话记录 |
| Stop | IPC `stop({sessionId})` |
| 切换模型 | IPC `setModel({sessionId, model})`；草稿则通过 `saveDraft` 写入 `model` |

### 5.2 需要 CLI Adapter 提供（经 session 模块）

| 能力 | 用途 | 需对齐的点 |
|---|---|---|
| `listModels(cli)` → `[{id, displayName, isDefault}]` | Model Selector；草稿阶段可用 | 不得为读取目录创建原生会话（chat spec 第 5.2 节） |
| `setModel` / 发送时携带模型 | 下一轮生效 | [CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 6 节未验证同 Session 切换 |
| `capabilities.inputWhileRunning` | Running 中发送；Adapter 报告并执行 `steer` / `queue` 原生语义，确不支持才为 `none` | I-Q3 已确认；Adapter 须保留 steer / queue 差异 |
| `capabilities.freeTextAnswers` 与 `replyWithText(text)` | 输入框回复 Needs Input；作用集合由 Adapter 取当前轮的待答复请求 | I-Q2；Adapter 正式契约 |
