# 输入区

## 文档信息

| 项目 | 内容 |
|---|---|
| 模块 | `input` |
| 文档状态 | 草稿 |
| 覆盖需求 | FR-INPUT-001～FR-INPUT-002；关联 FR-STATE-002（在输入框答复 Needs Input）、FR-SESSION-001（输入区固定在对话下方） |
| 相关验收 | AC-02、AC-05；05 第 4 节专项测试中的 Model Selector、Stop |
| 相关设计 | [Shell Spec v01](../../design/components/shell-spec-v01.md) 第 6、7 节；线框图 v02（[design/wireframes](../../design/wireframes/README.md)） |
| 来源 | [02. Functional Requirements](<../../docs/02. Functional Requirements.md>) FR-INPUT-001～002、FR-STATE-002、FR-CHAT-003；[03. UX Specification](<../../docs/03. UX Specification.md>) 第 4、6 节；[04. Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 4、5 节；[CLI Integration Preflight](../../tasks/T20261008-cli-preflight/report.md) 第 4、5、6 节 |

## 1. 问题记录

### 1.1 未决问题

2026-10-09 参考应用复核见 [Session research](../../tasks/T20261009-session-slice/research.md)；推荐仍为草稿，已确认回答保持原样。

| 编号 | 问题 | 推荐答案与依据 | 阻塞实现 | 回答（确认日期） |
|---|---|---|---|---|
| I-Q1 | Needs Input 时 Send / Stop 按钮显示哪一个？Shell Spec 第 7 节只规定“Running 时变为 Stop”，UX 第 6 节要求此时可在输入框回复 | 输入为空时显示 Stop（可取消整轮），输入非空时显示 Send（发送回复）。这样既能回复也能停止，且不新增按钮 | 否（可按推荐实现，确认后调整成本低） | |
| I-Q3 | Running 中是否允许发送（排队）？ | 本切片不支持：Running 中 Enter 不发送，输入保留；待 Adapter 报告并验证排队能力（包括 Stop 时排队消息的处理，[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 5 节 `still_queued`）后再开启。依据：Shell Spec 第 7 节“遵循 CLI 原生能力” | 否 | |
| I-Q4 | 本轮 `+` 菜单是否显示尚不可用的“从 Files 添加文件”？ | 显示并禁用，说明“Files 工具完成后可用”；Files 上线后启用。也可本轮隐藏菜单只保留按钮，请确认 | 否 | |
| I-Q5 | 已有 Session 中未发送的文本在切换 Session / Project、重启应用时是否保留？ | 保留，切换时恢复，并由 Session 独立持久化至 session_drafts；与 chat spec C-Q1 草稿规则一致，秘密问题输入例外见 §4 | 否 | |
| I-Q6 | 模型选择细节：默认值的显示、Running 期间能否切换、已保存的模型下线时怎么办？ | 未选择显示 CLI 原生默认并标注“默认”，不传覆盖；Running / Needs Input 期间可切换，下一轮生效；已下线模型标注不可用，下一轮回退 CLI 默认并提示一次。依据：FR-INPUT-002；01 第 8 节原则 20；agent-adapter task“下一轮使用新模型” | 否 | |

### 1.2 已确认

| 编号 | 问题 | 推荐答案与依据 | 阻塞实现 | 回答（确认日期） |
|---|---|---|---|---|
| I-Q2 | 在输入框输入的回复对 CLI 意味着什么？有多个未答复请求时作用于哪一个？ | 只有一个未答复请求且该请求原生接受自由文本（如提问）时，文字作为该请求的答案；其他情况下，所有未答复请求按“拒绝并附该文字为说明”解决（Claude `canUseTool` 拒绝可附说明；Codex 拒绝后由 Adapter 把文字作为用户消息交给 Agent，具体方式待 Adapter 验证）。对话中显示为用户消息 | 是：涉及 Adapter 接口，须在 Needs Input 实现前确认 | 采纳建议（2026-10-09 确认）；Codex 拒绝后交付文字的具体方式由 Adapter 验证 |

## 2. 职责与边界

- 负责：
  - 输入区结构：文本输入、Context / Attachment 入口、上下文标签位、Model Selector、Send / Stop（FR-INPUT-001；Shell Spec 第 7 节）。
  - 键盘行为、Send / Stop 控件状态。
  - 在输入框中答复 Needs Input（UX 第 6 节“输入框保持可用，用户也可以直接输入回复”）。
  - Model Selector 的内容、默认值与切换时机（FR-INPUT-002）。
  - 已有 Session 中未发送文本的保留。
- 不负责：
  - 发送、答复、Stop、切换模型之后的 Session 状态变化：见 [specs/session/spec.md](../session/spec.md) 第 4.1 节。
  - 草稿的创建与 CLI 选择：见 [specs/chat/spec.md](../chat/spec.md)。
  - 从 Files 添加文件到上下文（FR-TOOL-001，context-tools task）；当前 View 作为上下文的注入方式（04 第 1 节第 10 项，Project View task）。本轮只提供入口与标签位。
  - FR-INPUT-001 中“后续 CLI 支持的其他必要控制”（如推理强度）：本轮不做。

## 3. 行为细则

### FR-INPUT-001 基本结构

依据：FR-INPUT-001；FR-SESSION-001；Shell Spec 第 7 节；UX 第 6 节 Session 打开第 4 项。

#### 布局

1. 输入区固定在 Conversation 下方，与 Conversation 正文同宽（最大 720，Shell Spec 第 2.2 节），草稿、Conversation Mode、Project View Conversation 列共用同一组件。
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

控件为同一位置的单个按钮，状态如下：

| Session / 草稿状态 | 输入为空 | 输入非空 |
|---|---|---|
| 草稿，CLI 可用 | Send 禁用 | Send |
| 草稿，CLI 不可用 | Send 禁用，草稿内显示原因（chat spec） | Send 禁用 |
| 无状态 / Completed Unread / Error | Send 禁用 | Send（Error 后发送会先恢复 CLI Conversation，FR-STATE-003） |
| Running | Stop | Stop；Running 中能否提交见 I-Q3 |
| Stop 进行中 | “停止中”，禁用 | 同左；输入框仍可编辑（session spec S-Q8） |
| Needs Input | Stop（I-Q1） | Send，作为对等待请求的回复（I-Q1、I-Q2） |

1. 输入为空时 Send 禁用（Shell Spec 第 7 节）。
2. Running 时变为 Stop（Shell Spec 第 7 节）；点击 Stop 的效果见 session spec 第 3.12 节。
3. 输入框在任何状态下都可编辑，包括 Running、Needs Input、Stop 进行中（UX 第 6 节“输入框保持可用”）。
4. 发送后立即进入 Running，不等待 CLI 首个输出（FR-STATE-001；[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 5 节）。

#### Running 中发送

Shell Spec 第 7 节规定“Running 期间能否排队发送遵循 CLI 原生能力”。Adapter 按 CLI 报告 `capabilities.inputWhileRunning`（Adapter spec §5.5）。Claude 的排队消息在 Stop 时如何处理尚未验证（[CLI 校验报告](../../tasks/T20261008-cli-preflight/report.md) 第 5 节 `still_queued`）。建议本切片先实现 `none` 分支：Running 中 Enter 不发送，按钮保持 Stop，输入内容保留到本轮结束后由用户发送（I-Q3）。

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
8. 已保存的模型不在当前目录中（CLI 升级后下线）：建议显示该模型名并标注不可用，下一轮回退到 CLI 默认并提示一次（I-Q6）。
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
| `capabilities.inputWhileRunning` | Running 中发送；本切片为 `none` | I-Q3；Adapter 正式契约 |
| `capabilities.freeTextAnswers` 与 `replyWithText(text)` | 输入框回复 Needs Input；作用集合由 Adapter 取当前轮的待答复请求 | I-Q2；Adapter 正式契约 |
