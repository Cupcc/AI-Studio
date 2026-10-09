# Session

## 文档信息

| 项目 | 内容 |
|---|---|
| 模块 | `session` |
| 文档状态 | 草稿 |
| 覆盖需求 | FR-SESSION-001～FR-SESSION-003、FR-STATE-001～FR-STATE-007；关联 FR-PROJ-002（关闭时停止当前一轮、Tab 注意力点数据） |
| 相关验收 | AC-02、AC-03、AC-04、AC-05；05 第 4 节专项测试中的 Session Resume、错误恢复、大量 Session 性能、Needs Input / Error 清除规则、Project Tab 注意力点、关闭 Project 确认、Stop |
| 相关设计 | [Shell Spec v01](../../design/components/shell-spec-v01.md) 第 4、5、9 节；线框图 v02（[design/wireframes](../../design/wireframes/README.md)）；交互原型 v01 仅作示意 |
| 来源 | [01. Product Definition](<../../docs/01. Product Definition.md>) 第 6～8 节；[02. Functional Requirements](<../../docs/02. Functional Requirements.md>) 第 2 节；[03. UX Specification](<../../docs/03. UX Specification.md>) 第 6、7、8、10 节；[04. Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 1～6 节；[06. CLI Integration Preflight](<../../docs/06. CLI Integration Preflight.md>) 第 3、5、6 节 |

> 文档状态取值：`草稿` / `已确认（YYYY-MM-DD）`。只有人在对话中明确确认后才能改为已确认。
>
> 本文中“建议”“提案”表示文档未规定、由本草稿提出的做法；标注“技术方案，待实现确认”的是不影响产品行为的实现选择；涉及产品行为且文档未决定的，列入第 5 节，编号 S-Q*。

## 1. 职责与边界

- 负责：
  - App Session 与 CLI Conversation 的 1:1 生命周期：首次发送时创建、绑定原生 ID、恢复、错误恢复（01 第 7 节 Session；04 第 1 节）。
  - Session 注意力状态机：Running、Needs Input、Error、Completed Unread、无状态，以及产生与清除规则（FR-STATE-001～006）。
  - Conversation Mode 中的对话展示：打开即在底部、流式追加、工具活动行、Needs Input 卡片、Error 卡片、轮次完成行（FR-SESSION-001、FR-STATE-007；Shell Spec 第 5 节）。
  - Stop 对 Session 状态的影响；关闭 Project、退出应用时停止当前一轮（FR-PROJ-002；UX D-10）。
  - 多 Session 并行与互相隔离（FR-SESSION-003）。
  - 对话记录（transcript）与 Session 元数据的本地持久化。
  - 向 Project 壳层提供 Project 注意力汇总和活动 Session 数量（UX 第 7 节；D-07、D-14）；向 navigation 提供 Session 列表数据。
- 不负责：
  - New Chat 草稿、Default CLI、CLI 菜单、Session 命名方法：见 [specs/chat/spec.md](../chat/spec.md)。
  - 输入区结构、Send / Stop 控件、Model Selector：见 [specs/input/spec.md](../input/spec.md)。本文只规定发送、答复、Stop、切换模型对 Session 状态的影响。
  - Session History 的分组、排序呈现、滚动、Rename 交互：见 `specs/navigation/spec.md`（并行起草中）。本文提供排序字段与状态。
  - Tab 注意力点的渲染、关闭确认对话框的 UI、折叠按钮注意力点的渲染：Project 壳层（[T20261009-project-shell](../../tasks/T20261009-project-shell/task.md)）。
  - CLI 协议、进程管理、Stop 的资源清理细节：CLI Adapter（`specs/agent-adapter/spec.md`，并行起草中）。本文只以抽象接口描述所需能力（第 4.1 节）。
  - Project View Mode 的 Conversation 列与 View 上下文注入（[T20261009-project-view](../../tasks/T20261009-project-view/task.md)）；本文只定义该列中的 Session 如何计入“正在查看”。
  - 轮次完成行中的“修改了 N 个文件”与 Diff 联动（依赖 04 第 7 节第 13 项与 context-tools task）。

## 2. 行为细则

### 2.1 App Session 与 CLI Conversation 生命周期

依据：01 第 7 节 Session 与第 8 节原则 4；04 第 1 节；FR-CHAT-001（D-01）；FR-SESSION-002；FR-STATE-003（D-04）；04 第 4 节第 7 条；06 第 5 节“每个 App Session 固定 Provider，保存原生会话 ID；恢复不应静默创建新的原生 Session”。

| 阶段 | 进入条件 | 说明 |
|---|---|---|
| 草稿 | 用户点击 New Chat | 不是 Session，不持久化为 Session，不进入 Session History（FR-CHAT-001）。由 chat 模块管理。 |
| 已创建，原生 ID 未知 | 用户在草稿中发送第一条消息 | 立即写入 Session 记录并进入 Session History（FR-CHAT-001 第 5 项），同时进入 Running（第 2.5 节）。`cli_type` 自此锁定（FR-CHAT-003）。 |
| 已绑定 | Adapter 报告原生会话 ID | 立即持久化 `cli_session_id`。Codex 在创建 Thread 时即可得到 `thread.id`；Claude 的 `session_id` 在首条消息触发 `system/init` 后才出现（06 第 3 节）。 |
| 运行时在线 / 离线 | 技术状态，不在 UI 显示 | 有活动 Runtime 时直接发送；无 Runtime（应用重启、空闲回收、进程退出）时，下一次发送先以 `cli_session_id` 恢复，再发送。 |

规则：

1. 1:1 不变式：一个 App Session 在整个生命周期内只绑定一个原生会话 ID。绑定后不得改为其他 ID；恢复失败时报告 Error，不得静默创建新的原生会话（04 第 4 节第 7 条；06 第 5 节）。
2. 原生 ID 未知时失败（例如 CLI 进程在 `system/init` 前退出）：Session 保留在 History 中，显示 Error；下一次发送时由于不存在原生会话，按首次创建处理（见 S-Q4）。
3. 应用重启：Session 列表与对话记录从本地持久化读取，不需要启动 CLI；打开 Session 只读本地记录（第 2.2 节）。用户再次发送时才恢复原生会话。
4. 恢复失败（原生 ID 无效、原生记录被删除、CLI 拒绝）：本轮以 Error 结束，Error 卡片说明恢复失败并保留原生诊断；用户可重试或自行新建对话（S-Q3）。
5. 错误后的恢复：Error 之后用户再次发送消息，或点击 Error 卡片的“重试”，客户端先恢复对应 CLI Conversation 再提交（FR-STATE-003；“重试”的语义见 S-Q2）。
6. V1 不删除 Session，也没有归档；⋯ 菜单只有 Rename（Shell Spec 第 3 节）。

### 2.2 FR-SESSION-001 Conversation 展示

依据：FR-SESSION-001；FR-STATE-005；UX 第 6 节“Session 打开”“Needs Input 与 Error 呈现”；Shell Spec 第 5 节；UX D-02。

1. 打开 Session（从 Session History 点击，或由 FR-PROJ-003 状态恢复）时，Conversation 首帧即定位在最底部，不出现从顶部滚动到底部的过程。实现要求：先加载对话记录的尾部，在首次绘制前完成滚动定位；更早的内容在用户向上滚动时再加载（技术方案，待实现确认）。
2. 定位到底部时，末尾的 Needs Input 卡片或 Error 卡片完整可见（AC-05；UX 第 6 节）。
3. 流式输出逐段追加；用户位于底部时自动跟随；向上滚动后停止跟随并显示“回到最新”（Shell Spec 第 5 节）。
4. 切换 Project Tab 后返回、或在同一 Project 内从其他 View 返回同一 Session 时：离开时处于底部（跟随中）的，返回后定位到最新位置；离开时已向上滚动的，恢复离开时的位置并显示“回到最新”（建议；依据 UX D-15“恢复离开时的完整状态”，与 FR-STATE-005“点击进入最新位置”在点击路径上一致）。
5. 对话记录条目（Shell Spec 第 5 节）：用户消息、Agent 消息、工具活动行、Needs Input 卡片、Error 卡片、轮次完成行。条目定义见第 3.4 节。是否显示 CLI 的推理 / 思考内容见 S-Q12。
6. 主画布顶栏显示 CLI 标识、Session 标题、CLI 名称；Session 的 `origin_view_id` 不为空时，显示来源 View 和“在 View 中打开”入口（UX 第 6 节 Session 打开；D-02）。Project View Mode 尚未实现前，该入口按壳层提供的导航接口跳转到该 View 的占位页。
7. 输入区固定在对话区域下方（FR-SESSION-001），可立即输入（UX 第 6 节 Session 打开第 4 项），细节见 input spec。
8. 性能：打开 Session 和切换 Session 不等待 CLI；大量历史 Session 时只加载列表所需元数据（04 第 6 节性能）。

### 2.3 FR-SESSION-002 Session 连续性

1. 同一 Session 内可进行任意多轮。客户端内部以“轮”（turn）记录每次提交到终态的过程，用于状态机、完成行和 Stop 关联；“轮”不作为 UI 信息架构出现，不显示 Run / Task / Job 列表或编号（FR-SESSION-002；01 第 8 节原则 5、6）。
2. 一个 Session 同一时间最多有一个进行中的轮。Running 期间能否再提交（排队）遵循 CLI 原生能力，见 input spec I-Q3。

### 2.4 FR-SESSION-003 多 Session 并行

1. 同一 Project、不同 Project 的多个 Session 可以同时处于 Running / Needs Input；每个 Session 有独立的原生会话、状态、上下文与模型设置（FR-SESSION-003）。
2. 切换 Session、切换 Project Tab、进入 Project View 都不打断其他 Session 的执行（AC-03；UX 第 6 节 Project 切换）。
3. 隔离：首阶段每个活动 Session 使用独立 Runtime（04 第 2 节“开发前 CLI 校验”；agent-adapter task）。一个 Session 的 Stop、崩溃、兜底恢复不得影响其他 Session、其他 Project 或用户 Terminal（04 第 4 节第 7 条；04 第 6 节稳定性）。
4. 并行 Session 的事件处理不得阻塞 Renderer（04 第 6 节性能）。高频文本增量在主进程合并后按帧推送（技术方案，待实现确认）。
5. 多个 Session 共享同一 Project 目录，不做 Worktree 隔离；同文件冲突检测不在本模块（04 第 7 节第 7 项）。

### 2.5 FR-STATE-001 Running

1. 进入：用户提交消息（首条或后续）后立即进入 Running，不等待首个文本片段或原生 `turn/started`（06 第 5 节 Running 行；agent-adapter task 验收第 2 条）。恢复原生会话、创建 Runtime 的时间也计入 Running。
2. 保持：思考、输出、执行命令、使用工具、修改文件期间均为 Running；用户答复 Needs Input 后回到 Running（FR-STATE-001、FR-STATE-002）。
3. 结束：本轮到达终态（完成、停止、失败）时结束（UX 第 7 节 Running 清除时机）。
4. 表现：列表项右侧中性色 Spinner（Shell Spec 第 4 节）。Running 不计入 Project 注意力汇总（第 2.15 节）。
5. Stop 进行中仍显示 Running，直到 Stop 完成（S-Q8）。

### 2.6 FR-STATE-002 Needs Input

1. 进入：Adapter 报告等待输入请求（授权、确认、选择、提问；06 第 5 节 Needs Input 行），Session 从 Running 转为 Needs Input。同一 Session 可以同时有多个未答复请求，各自独立答复（agent-adapter task 验收第 4 条；06 第 6 节多请求竞态）。
2. 呈现：每个请求在 Conversation 末尾显示一张等待卡片，内容为 CLI 原生问题与选项，按钮直接回传 CLI（UX 第 6 节；D-03；Shell Spec 第 5 节）。列表项显示橙色点。
3. 清除：只有用户答复才清除——点击卡片选项，或在输入框直接输入回复（输入回复的协议语义见 input spec I-Q2）。所有未答复请求都已答复后，Session 回到 Running。仅打开查看不清除（FR-STATE-002）。
4. 正在查看的 Session 进入 Needs Input 时同样显示橙色点，并计入 Project 注意力汇总（例如折叠按钮）；当前 Project 的 Tab 不显示注意力点由壳层处理（UX 第 7 节）。
5. 答复后卡片变为只读记录，显示所选项（Shell Spec 第 5 节）。请求因 Stop、错误、关闭 Project 或 CLI 原生撤回而失效时，卡片同样变为只读，并标注未答复的原因（建议，S-Q11）。
6. Needs Input 依附于进行中的轮和活动 Runtime。原生请求无法跨应用重启保留；启动恢复规则见第 2.14 节。
7. 答复卡片不是“发送消息”，不更新 `last_user_message_at`；在输入框输入的回复是用户消息，更新排序时间（FR-NAV-003“最近一次用户发送消息”）。

### 2.7 FR-STATE-003 Error

1. 进入：本轮以失败终态结束，包括：CLI 返回错误结果、SDK 异常、Runtime 在轮进行中退出、创建或恢复原生会话失败、Stop 兜底恢复失败（06 第 5 节执行错误行；04 第 4 节第 6、7 条）。已与用户 Stop 关联的取消终态不是 Error（06 第 5 节主动取消行；04 第 2 节末段）。
2. 呈现：Conversation 末尾显示 Error 卡片：错误摘要、“重试”、“查看详情”（展开原生诊断）（UX 第 6 节；D-04；Shell Spec 第 5 节）。列表项显示红色点。
3. 清除：用户查看该 Session 时清除列表中的 Error 提醒；卡片与详情永久保留在 Conversation 中（FR-STATE-003）。“查看”的定义见第 2.11 节。
4. 恢复：用户再次发送消息或点击“重试”时，先恢复对应 CLI Conversation（第 2.1 节第 5 条；S-Q2）。
5. 没有进行中的轮时 Runtime 退出（例如空闲进程崩溃），建议不产生 Error，只标记 Runtime 离线，下一次发送时恢复（S-Q5）。
6. 一个 Session 的 Error 不影响同一 Project 其他 Session 的状态（FR-SESSION-003）。

### 2.8 FR-STATE-004 / FR-STATE-005 Completed Unread 与清除

1. 产生：本轮以成功终态结束，且此刻用户未在查看该 Session（FR-STATE-004；06 第 5 节正常完成行：只有成功终态按是否查看产生 Completed Unread）。停止、失败的轮不产生 Completed Unread。
2. 不产生：完成时 Session 正在被查看，包括显示在 Project View 左侧 Conversation 列中（FR-STATE-004 末段；D-05）。
3. 清除：用户点击该 Session，直接进入 Conversation 最新位置，绿色点立即清除；不提供 Mark as Read 或任何确认操作（FR-STATE-005；01 第 8 节原则 12）。重新显示（切换 Tab 返回、启动恢复）是否也清除见第 2.11 节与 S-Q1。
4. 语义是“有新的 Agent 工作结果未查看”，不是“Session 结束”；Session 之后仍可继续对话（FR-STATE-004）。

### 2.9 FR-STATE-006 无状态

不在运行、不等待用户、无未查看的 Error、无未查看的完成结果时，列表项不显示任何状态元素；UI 中不出现 Idle 字样（FR-STATE-006；01 第 8 节原则 10）。CLI 原生的 `idle` 不映射为列表文字（06 第 5 节）。

### 2.10 FR-STATE-007 轮次完成行

1. 成功结束的轮在 Conversation 末尾追加完成行：`Worked for <时长> · Done`（FR-STATE-007；Shell Spec 第 5 节）。“Done”只表示这一轮结束。
2. 时长：从用户提交到终态的墙钟时间，含等待用户答复的时间（建议，S-Q10）。格式建议：小于 1 分钟为 `48s`，小于 1 小时为 `2m 18s`，否则为 `1h 05m`。
3. 用户停止的轮：建议显示同类行 `Worked for <时长> · 已停止`（S-Q9）。失败的轮以 Error 卡片结尾，不显示 Done。
4. “修改了 N 个文件”及点击打开 Diff：本切片不做，完成行数据预留 `files_changed`（null 表示未知），由 context-tools 与 04 第 7 节第 13 项决定。
5. 完成行数据随对话记录持久化，重启后照常显示。

### 2.11 “正在查看”的定义

依据：FR-STATE-004（D-05）；FR-STATE-005；UX 第 6 节 Session 打开、Project View 打开、Project 切换；UX 第 8 节“Project View Mode 下只高亮当前 View”。

Session S 被视为“正在查看”，当且仅当同时满足：

1. S 所属 Project 是当前窗口的当前 Tab；并且
2. 该 Project 的 Main Canvas 处于以下之一：
   - Conversation Mode，且显示的是 S；
   - Project View Mode，且左侧 Conversation 列显示的是 S（D-05；本切片只需支持由壳层传入该值）；并且
3. 窗口处于前台：应用为当前活动应用，窗口获得焦点、未最小化（S-Q1（c），2026-10-09 确认）。

以下不算正在查看：S 只出现在 Session History 列表中；S 所属 Project 是非当前 Tab；Main Canvas 显示草稿或其他 Session / View；窗口失焦、最小化、应用在后台或锁屏。

S-Q1 的确认结果（2026-10-09）：

- 错误发生时 S 正在被查看：与 FR-STATE-004 对称，不产生列表 Error 提醒，Error 卡片照常显示；Project View 左侧 Conversation 列中的 Session 同样处理（D-05 的延伸）。
- 由切换 Tab 返回或启动时 FR-PROJ-003 恢复而重新显示的 S：视为查看，清除 Completed Unread 与 Error。
- 窗口失焦、最小化、应用在后台时，正在显示的 S 完成或出错仍产生提醒。窗口重新回到前台不会自动清除；用户再次点击 S（列表项或其他打开 S 的操作）才清除（FR-STATE-005）。本模块不发系统通知。

因此“清除提醒”（第 3.1 节 E11）只由打开 S 的用户操作触发：点击列表项、切换 Tab 返回、启动恢复、在 Project View 左列继续 S；“是否产生提醒”（E7、E8 中的 V）按上述三个条件在事件发生时计算。

V1 是否支持多窗口文档未说明（D-14 称折叠为“窗口级偏好”）。若出现多窗口，任一窗口满足上述条件即视为查看（建议，交 project-shell 对齐）。

### 2.12 Stop

依据：FR-INPUT-001（Send / Stop 控件）；04 第 4 节 Codex Stop 实现约束 1～7；06 第 5 节主动取消行与 Stop 条目；agent-adapter task 验收。

1. 用户在 Running 或 Needs Input 的 Session 中触发 Stop（控件规则见 input spec）。Stop 作用于该 Session 当前一轮，不影响其他 Session（FR-SESSION-003）。
2. 触发后立即：记录取消意图；暂停该 Session 的新提交（04 第 4 节第 1 条）；所有未答复的 Needs Input 卡片失效（标注“已停止”）；列表状态从 Needs Input 回到 Running（Stop 进行中，S-Q8）。
3. Stop 完成以 Adapter 报告“本轮终态 + 目标资源已清理”为准，不能只凭收到 `interrupted`（04 第 4 节第 1、5 条；06 第 5 节）。完成后：本轮结束，状态回到无状态，追加“已停止”完成行，不产生 Error、不产生 Completed Unread。
4. 已输出的部分 Agent 文本、工具活动行保留在对话记录中。
5. 清理失败或超时时由 Adapter 走 Runtime 兜底并以原 ID 恢复（04 第 4 节第 6 条）。兜底恢复失败：本轮以 Error 结束，Error 卡片说明 Stop 清理或恢复失败；不得静默创建新原生会话，不得自动重跑已取消的命令（04 第 4 节第 7 条）。
6. 重复 Stop 幂等；Stop 完成后到达的迟到事件被丢弃，不改变状态、不追加内容（04 第 4 节；05 第 4 节 Stop 专项）。
7. Stop 与成功完成竞态：以 Adapter 报告的原生终态为准；原生为成功终态时按完成处理（显示 Done）；Claude 在取消后返回的 `error_during_execution` 视为已停止（06 第 5 节）。
8. Stop 不改变 `last_user_message_at`。

### 2.13 关闭 Project（FR-PROJ-002 关闭部分）

依据：FR-PROJ-002；UX 第 6 节 Project 关闭；D-10；Shell Spec 第 9 节关闭确认对话框；project-shell task“与 session-slice 的接口”。

1. 壳层关闭 Tab 前向本模块查询该 Project 中处于 Running 或 Needs Input 的 Session 数量（Stop 进行中的计入 Running）。为 0 时直接关闭；大于 0 时由壳层显示确认对话框并显示该数量。
2. 用户确认后，壳层调用本模块停止该 Project 全部活动 Session 的当前一轮，规则同第 2.12 节。CLI Conversation 与对话记录保留，重新打开 Project 后可继续（FR-PROJ-002）。
3. 与负责关闭流程的 project spec §2.2.4 / PROJ-Q6 对齐：确认后由主进程停止，Tab 在停止成功后关闭；停止失败 / 超时保留 Tab，并显示重试与取消。Stop 成功、Project 关闭后释放该 Project 所有 Runtime（建议，待确认；04 第 4 节第 5 条要求有限等待）。
4. 关闭后保留各 Session 的 Error、Completed Unread 标记，重新打开 Project 后照常显示（持久化，第 3.5 节）。Stop 兜底失败产生的 Error 同样在重新打开后可见。
5. 关闭期间 Stop 尚未完成时用户重新打开该 Project：相关 Session 显示 Running 直至 Stop 完成。

### 2.14 应用退出与再次启动

文档只规定了关闭 Tab（FR-PROJ-002），未规定退出应用。以下为建议（S-Q6、S-Q7）：

1. 退出应用（Cmd+Q 等）时如存在 Running 或 Needs Input 的 Session，显示与关闭 Tab 相同语义的确认，说明受影响的 Session 总数；确认后停止全部当前一轮，在有限等待时间内完成清理后退出；对话保留。
2. 关闭窗口是否等同退出应用（macOS 惯例是应用继续运行）待确认，见 S-Q6。
3. 无论如何退出，应用必须确保其启动的 CLI Runtime 和子进程随之结束，不在系统中遗留孤儿进程（04 第 4 节第 7 条精神；Process Manager 由 Adapter 负责）。
4. 再次启动时：持久化记录中仍为 Running / Needs Input 的 Session（异常退出导致）一律结束该轮：活动状态置为无，未答复卡片失效。异常退出建议显示 Error（“应用退出时本轮未完成”），以便用户发现中断的工作；经确认的正常退出显示“已停止”完成行、无提醒（S-Q7）。
5. 启动时不自动恢复原生会话、不自动重新提交任何内容；下一次用户发送时才恢复（第 2.1 节第 3 条）。

### 2.15 Project 注意力汇总

依据：FR-PROJ-002；UX 第 7 节 Project Tab 注意力点；UX 第 8 节折叠按钮；D-07；D-14；Shell Spec 第 4 节。

1. 某 Project 的注意力值 = 该 Project 所有 Session 显示状态中优先级最高的一个：Needs Input > Error > Completed Unread；Running 和无状态不参与；没有时为空。
2. 本模块对所有已打开 Project 计算该值并在变化时推送。是否显示由壳层决定：非当前 Tab 显示在 Tab 上；左侧导航折叠时，当前 Project 的值显示在展开按钮上；当前 Tab 不显示（UX 第 7、8 节）。
3. 只输出一个值，不输出数量（UX 第 7 节“只显示一个点，不显示数量”）。关闭确认所需的数量单独提供（第 2.13 节）。
4. 不提供跨 Project 的列表（01 第 4 节非目标：跨 Project Attention Inbox）。

## 3. 状态与数据

### 3.1 注意力状态机

每个 Session 的状态由三个相互独立的部分组成（提案；04 第 5 节的单一 `status` 字段不足以同时表达“Error 提醒”和“运行中”的不同清除规则）：

| 变量 | 取值 | 持久化 |
|---|---|---|
| `activity` | `none` / `running` / `needs_input` | 是（用于启动恢复，第 2.14 节） |
| `stopping` | 布尔；仅在 `activity ≠ none` 时有意义 | 否 |
| `pending_requests` | 未答复的等待请求集合 | 否（随 Runtime 存在） |
| `error_unseen` | 布尔：有未查看的 Error | 是 |
| `completion_unread` | 布尔：有未查看的完成结果 | 是 |

显示状态（列表项右侧、汇总计算）按以下顺序取第一个成立的：

1. `activity = needs_input` → Needs Input（橙点）
2. `activity = running` → Running（Spinner，Stop 进行中同样显示）
3. `error_unseen` → Error（红点）
4. `completion_unread` → Completed Unread（绿点）
5. 否则无状态（FR-STATE-006）

说明：Needs Input 优先于 Running，因为列表项只有一个状态位（UX P-D），且 Needs Input 是高注意力状态（FR-STATE-002）。Error 优先于 Completed Unread 与 Project 汇总顺序一致（D-07）。在第 3.1 节转移规则下，Error / Completed Unread 与 Running 不会同时成立（发送即清除二者），顺序仅用于防御。

事件与转移（V = 事件发生时该 Session 是否“正在查看”，第 2.11 节）：

| # | 事件 | 前置条件 | 转移与副作用 |
|---|---|---|---|
| E1 | 用户发送消息（含首条、Error 后再次发送、“重试”） | `activity = none` 且未 `stopping`；Running 中发送见 I-Q3 | `activity = running`；`error_unseen = false`；`completion_unread = false`；更新 `last_user_message_at`；追加用户消息；必要时先恢复原生会话 |
| E2 | Adapter：轮开始 | 任意 | 无变化（E1 已进入 Running）；记录原生 turn ID |
| E3 | Adapter：等待输入请求 | 本轮进行中 | 加入 `pending_requests`；`activity = needs_input`；追加卡片 |
| E4 | 用户点击卡片答复 | 请求未答复 | 移出集合；集合为空时 `activity = running`；卡片只读并显示所选项 |
| E5 | 用户在输入框回复 | `activity = needs_input` | 按 I-Q2 解决相关请求；`activity = running`；追加用户消息；更新 `last_user_message_at` |
| E6 | Adapter：请求被原生撤回 / 失效 | 请求未答复 | 移出集合；卡片只读并标注失效；集合为空且轮仍进行时 `activity = running` |
| E7 | Adapter：轮成功结束 | 本轮进行中 | `activity = none`；清空集合；追加 Done 完成行；`completion_unread = !V` |
| E8 | Adapter：轮失败 / 进行中 Runtime 退出 / 创建或恢复失败 / Stop 兜底失败 | 本轮进行中 | `activity = none`；未答复卡片失效；追加 Error 卡片；`error_unseen = !V`（S-Q1，2026-10-09 确认） |
| E9 | 用户 Stop / 关闭 Project 确认 / 退出确认 | `activity ≠ none` | `stopping = true`；未答复卡片失效并标注“已停止”；`activity = running`；暂停新提交 |
| E10 | Adapter：Stop 完成 | `stopping` | `activity = none`；`stopping = false`；追加“已停止”完成行；不设置任何提醒 |
| E11 | 用户操作打开 S：点击列表项、切换 Tab 返回、启动恢复、在 Project View 左列继续 S（窗口回到前台不触发，S-Q1） | 任意 | `error_unseen = false`；`completion_unread = false`；`activity` 不变（Needs Input 不因查看清除） |
| E12 | 无轮进行时 Runtime 退出 | `activity = none` | 状态不变；标记 Runtime 离线（S-Q5） |
| E13 | 应用启动恢复 | 持久化 `activity ≠ none` | `activity = none`；未答复卡片失效；按 S-Q7 追加“已停止”行或 Error 卡片 |
| E14 | 迟到事件（turn ID 不属于当前进行中的轮） | 任意 | 丢弃 |

### 3.2 Session 字段

以 04 第 5 节 Session 为基础；“提案”列为本草稿新增或调整，均为技术方案，待实现确认。

| 字段 | 来源 | 说明 |
|---|---|---|
| `id` | 04 §5 | 客户端 ID |
| `project_id` | 04 §5 | 所属 Project |
| `cli_type` | 04 §5 | `codex` / `claude-code`（Adapter BUILT_IN_PROVIDER_IDS；显示名为 Claude Code）；创建后不可变（FR-CHAT-003） |
| `cli_session_id` | 04 §5 | 原生会话 ID；可为空直到 Adapter 报告；绑定后不可变 |
| `title` | 04 §5 | 显示标题；生成方法见 chat spec |
| `title_source` | 提案 | `client` / `native` / `user`；决定原生名称能否覆盖（chat spec） |
| `model` | 04 §5 | 用户在 Model Selector 中选择的模型；空表示使用 CLI 原生默认（input spec） |
| `status` | 04 §5 | 提案：拆分为 `activity`、`error_unseen`（第 3.1 节） |
| `completion_unread` | 04 §5 | 同第 3.1 节 |
| `origin_view_id` | 04 §5 | 创建时所在 Project View，可为空（FR-VIEW-007） |
| `last_user_message_at` | 04 §5 | 用户发送消息时更新，用于排序（FR-NAV-003） |
| `last_error_summary` | 提案 | 最近一次 Error 的摘要，供列表悬停或 Overview 使用（可选） |
| `created_at` / `updated_at` | 04 §5 | — |

Runtime 句柄、`pending_requests`、`stopping`、流式中的部分文本只存在于主进程内存，不持久化。

### 3.3 轮记录（内部，提案）

| 字段 | 说明 |
|---|---|
| `turn_id` | 客户端编号；另记录原生 turn ID（如有）用于关联 Stop 与过滤迟到事件 |
| `session_id` | — |
| `started_at` / `ended_at` | 用于完成行时长（S-Q10） |
| `outcome` | `completed` / `stopped` / `failed` / `aborted_by_exit`（S-Q7） |
| `model` | 本轮实际使用的模型（如 Adapter 可报告） |
| `files_changed` | 预留，本切片为空 |
| `error` | 失败时的摘要与原生诊断 |

### 3.4 对话记录条目

| 类型 | 内容 | 来源 |
|---|---|---|
| `user_message` | 文本、附带的上下文项（View、文件，见 input spec）、发送时间 | 用户发送 |
| `agent_message` | 完整文本；流式期间为增量拼接，完成时以完整消息校正，正文不重复（06 第 5 节文本追加行） | Adapter |
| `tool_activity` | 动作类别（Read / Edit / Run / 其他）、单行摘要、进行中 / 完成 / 失败 | Adapter |
| `input_request` | 请求 ID、类型（授权 / 提问）、CLI 原生内容与选项、结果（已答复及所选项 / 文字回复 / 已停止 / 已失效） | Adapter + 用户 |
| `error` | 摘要、原生诊断详情、是否可重试 | Adapter / Session Manager |
| `turn_end` | 时长、结果（Done / 已停止）、`files_changed` | Session Manager |

### 3.5 持久化（技术方案，待实现确认）

- 存储：SQLite（04 第 2 节），数据库位于应用数据目录（app-skeleton task）。表：`sessions`、`session_turns`、`transcript_items`；数据库表结构由实现 worker 与 app-skeleton 的迁移机制确定。
- 对话记录以客户端持久化为显示来源，不依赖读取 CLI 原生历史：两种 CLI 的原生历史格式不同，且打开 Session 必须立即显示底部（FR-SESSION-001）。原生会话只负责模型上下文。
- 流式文本不逐条持久化增量；Agent 消息完成时写入完整文本，进行中按固定间隔（建议 1 秒）写入检查点，异常退出时最多丢失最后一个间隔的增量。
- 状态变化（`activity`、`error_unseen`、`completion_unread`、`last_user_message_at`、`cli_session_id`）立即写入。
- 加载：列表只读 `sessions` 元数据；打开 Session 时按倒序分页读取 `transcript_items`，首屏只取尾部。
- 只记录在本应用中发生的轮；在应用外用 CLI 继续同一原生会话产生的内容不会出现在对话记录中（S-Q13）。

## 4. 接口与事件

### 4.1 需要 CLI Adapter 提供（抽象）

以下为本模块所需能力，命名为示意。实现使用 [Adapter spec §4](../agent-adapter/spec.md) 与 `packages/agent-adapter/src/provider.ts` 的正式契约；两者的名称映射见 Adapter §4.5。本轮对齐记录见 [research](../../tasks/T20261009-session-slice/research.md) §3。

| 能力 / 事件 | 用途 | 对应 06 第 5 节 / 04 第 4 节 | 需对齐的点 |
|---|---|---|---|
| `create(cli, cwd, options)` → 句柄 | 首条消息创建原生会话 | 06 §3 | 原生 ID 同步返回（Codex）还是异步事件（Claude，`system/init` 后） |
| 事件 `nativeSessionId(id)` | 立即持久化 `cli_session_id` | 06 §5“保存原生会话 ID” | Claude 首条消息前无法得到 ID |
| `resume(cli, nativeId, cwd, options)` | 重启后、Error 后、兜底后恢复 | 06 §4 Resume；04 §4 第 7 条 | 失败时必须返回明确错误，不得静默新建 |
| `send(句柄, {text, context, model?})` | 提交一轮；立即可视为 Running | 06 §5 Running 行 | 上下文项（View、文件）如何传入，留给 project-view / context-tools |
| 事件 `turnStarted(turnId)` / `turnEnded(turnId, outcome, durationMs, error?)` | 状态机 E2、E7、E8；完成行 | 06 §5 正常完成 / 执行错误行 | `outcome` 区分 completed / interrupted / failed；已关联 Stop 的取消不报 failed |
| 事件 `textDelta(itemId, delta)` / `messageCompleted(itemId, text)` | 流式与校正 | 06 §5 文本追加行 | 区分增量与完整消息 |
| 事件 `toolActivity(itemId, kind, summary, state)` | 工具活动行 | 06 §5 | 原生工具类型到 Read / Edit / Run 的归类 |
| 事件 `inputRequested(requestId, kind, nativeContent, options)` / `inputResolved(requestId, reason)` | Needs Input 卡片与清除 | 06 §5 Needs Input 行 | 原生撤回请求时是否有事件（Codex 服务端请求失效） |
| `answer(requestId, optionId)` | 卡片答复 | 06 §5 | — |
| `replyWithText(requestId[], text)` | 在输入框回复 Needs Input | UX 第 6 节 | 两种 CLI 的语义未验证，见 input spec I-Q2 |
| `stop(句柄)` → 完成 / 失败 | Stop、关闭 Project、退出 | 04 §4 第 1～7 条 | 幂等；完成表示终态 + 资源清理；兜底失败返回错误 |
| `setModel(句柄, model)` | 下一轮生效 | 06 §6 同 Session 模型切换 | 未验证 |
| 事件 `runtimeExited(code, duringTurn)` | E8 / E12 | 06 §4 运行中进程被终止 | — |
| 事件 `nativeTitle(title)`（可选） | 采用原生名称 | FR-NAV-003 | 两种 CLI 是否提供未验证（chat spec） |
| `capabilities(cli)` | 输入区与状态机分支 | Shell Spec 第 6 节 | 至少：Running 中可否提交、等待请求是否接受自由文本、是否提供原生名称 |
| `shutdownAll()` | 退出应用，不遗留子进程 | 04 §4 第 7 条 | — |

回合事件携带 Adapter Session 句柄与 `turnId`，据此丢弃迟到事件（E14）；Session 级原生 ID、标题、Runtime 事件没有 `turnId`，按当前句柄 / Runtime generation 处理。Stop 清理失败以 `interrupted + stop.cleanup = failed` 与 `session.error` 报告，Session Manager 合并为一次 Error，不生成成功的“已停止”完成行（Adapter §4.5）。

### 4.2 向 Project 壳层与 navigation 提供

| 接口 | 说明 | 消费方 |
|---|---|---|
| `projectAttention(projectId)` 与变化订阅 | `needs_input` / `error` / `completed_unread` / 空（第 2.15 节） | Tab 注意力点、折叠按钮注意力点 |
| `activeTurnCount(projectId)` | Running（含 Stop 进行中）与 Needs Input 的 Session 数量 | 关闭确认对话框 |
| `stopProjectTurns(projectId)` | 异步停止该 Project 全部当前一轮，返回 stopped / failed；关闭成功后释放 Runtime（project spec §4.1） | 关闭 Tab |
| `activeTurnCountAll()` / `stopAllTurns()` | 退出应用确认与停止（S-Q6） | 应用退出流程 |
| `listSessions(projectId)` 与变化订阅 | 每项：`id`、`title`、`cli_type`、显示状态、`last_user_message_at`、`origin_view_id` | Session History、Overview（后续）、Project View 最近对话（后续） |
| `renameSession(id, title)` | 写入 `title`，`title_source = user`；空白标题不生效，保留原标题（建议） | navigation 的 Rename |
| Conversation Mode 组件 | 给定 `sessionId` 渲染对话、顶栏与输入区 | Main Canvas 容器 |

### 4.3 需要 Project 壳层提供

| 接口 | 说明 |
|---|---|
| 查看上下文推送 | 当前窗口的当前 Project；该 Project Main Canvas 的模式与显示对象：`conversation(sessionId)` / `draft` / `view(viewId, leftSessionId?)`。另需窗口前台状态（应用活动、窗口获得焦点、未最小化），以及“打开 S”的用户操作信号（点击列表项、切换 Tab 返回、启动恢复、在 View 左列继续 S），二者区分开：前者决定是否产生提醒，后者触发清除（第 2.11 节，S-Q1 2026-10-09 确认）。状态恢复（FR-PROJ-003）后同样推送 |
| 打开 Session / 打开 View 的导航接口 | 点击列表项、“在 View 中打开”、创建 Session 后切换到该 Session |
| 关闭 Tab 前查询与确认后回调 | 调用 `activeTurnCount`、`stopProjectTurns` |
| 应用退出前钩子 | 调用 `activeTurnCountAll`、`stopAllTurns`（由 app-skeleton / 壳层提供） |
| Project 目录路径 | 作为 CLI cwd |

### 4.4 与 chat、input 模块

- chat → session：`createSession({projectId, cli, model?, originViewId?, firstMessage})`，返回新 Session ID；本模块负责落库、进入 Running 并调用 Adapter。
- input → session：`send(sessionId, message)`、`answer(sessionId, requestId, optionId)`、`replyWithText(sessionId, text)`、`stop(sessionId)`、`setModel(sessionId, model)`；以及只读的控件状态输入（`activity`、`stopping`、`capabilities`）。

## 5. 未决问题

2026-10-09 参考应用复核见 [Session research](../../tasks/T20261009-session-slice/research.md)；推荐仍为草稿，已确认回答保持原样。

| 编号 | 问题 | 推荐答案与依据 | 阻塞实现 | 回答（确认日期） |
|---|---|---|---|---|
| S-Q1 | “正在查看”的边界：(a) 错误发生时用户正在查看该 Session，是否仍在列表显示红点？(b) 切换 Tab 返回、启动恢复后重新显示的 Session 是否视为查看并清除绿点 / 红点？(c) 窗口失焦、最小化、应用在后台是否影响？ | (a) 不显示，与 FR-STATE-004 对 Completed Unread 的规则对称，错误卡片已可见；(b) 视为查看并清除，否则当前显示的 Session 带着提醒；(c) 不影响，V1 无系统通知。依据：FR-STATE-004、D-05、D-15；原型 v01 的行为一致 | 是：决定状态机 E8、E11 | （a）（b）采纳建议；（c）不采纳：窗口失焦、最小化、应用在后台时不算正在查看——此时正在显示的 Session 完成或出错仍产生提醒，窗口重新获得焦点不清除，用户再次点击该 Session 才清除（2026-10-09 确认） |
| S-Q2 | Error 卡片“重试”做什么？ | 先恢复 CLI Conversation（FR-STATE-003），再把失败那一轮的用户消息（含上下文项）作为新消息重新发送，在对话中可见并更新排序时间；恢复失败则追加新的 Error 卡片。不自动重跑已停止的命令（04 第 4 节第 7 条） | 是：Error 卡片实现前 | 采纳建议：先恢复 CLI Conversation，再把失败那一轮的用户消息作为新消息重发（2026-10-09 确认） |
| S-Q3 | 原生会话无法恢复（ID 无效、原生记录被删）时，除重试外是否提供其他出路？ | 不提供迁移或“以新会话继续”；Error 卡片说明原因，用户自行 New Chat。依据：04 第 4 节第 7 条“不得静默创建新 Session”；文档未要求其他入口 | 否 | |
| S-Q4 | 首条消息后原生 ID 尚未产生就失败（如 Claude 在 `system/init` 前退出），下一次发送是创建新的原生会话吗？ | 是。此时不存在原生会话，创建不违反 1:1；一旦绑定 ID 便不再新建。依据：01 第 7 节；06 第 3 节 Claude 初始化时序 | 否 | |
| S-Q5 | 没有进行中的轮时 Runtime 退出，是否显示 Error？ | 不显示，只标记离线，下一次发送时恢复。FR-STATE-003 的 Error 用于提醒执行出错，空闲退出不影响用户工作；06 第 4 节已验证进程终止后可按原 ID 恢复 | 否 | |
| S-Q6 | 退出应用时有 Running / Needs Input Session：是否确认？关闭窗口是否等于退出？ | 退出前显示与关闭 Tab 相同语义的确认（受影响 Session 总数），确认后停止全部当前一轮并在有限时间内清理后退出。关闭最后一个窗口：建议按 macOS 惯例应用继续运行、Session 继续执行，从 Dock 重新打开窗口。依据：FR-PROJ-002 / D-10 类比；文档未规定 | 否（退出流程实现前需确认） | |
| S-Q7 | 应用异常退出（崩溃、强制退出）时进行中的轮，下次启动如何显示？ | 显示 Error（“应用退出时本轮未完成”），以便发现中断的工作；经确认的正常退出则显示“已停止”行、无提醒。依据：FR-STATE-003；06 第 5 节只有成功终态产生 Completed Unread | 否 | |
| S-Q8 | Stop 进行中（等待清理完成）如何显示？ | 列表仍显示 Running；Stop 控件变为禁用的“停止中”；暂停新提交（04 第 4 节第 1 条）。不新增列表状态 | 否 | |
| S-Q9 | 用户停止的轮是否显示完成行？ | 显示 `Worked for <时长> · 已停止`；失败的轮只显示 Error 卡片。依据：FR-STATE-007“或同等语义形式” | 否 | |
| S-Q10 | “Worked for” 时长是否包含等待用户答复的时间？ | 包含，按提交到终态的墙钟时间；与 Adapter 报告的回合耗时一致，实现简单 | 否 | |
| S-Q11 | 因 Stop、错误、关闭 Project、原生撤回而失效的 Needs Input 卡片如何显示？ | 变为只读并标注原因（“已停止”“已失效”），按钮不可点击。依据：Shell Spec 第 5 节“答复后变为只读记录” | 否 | |
| S-Q12 | 是否在 Conversation 显示 CLI 的推理 / 思考内容？ | 本切片不显示，“思考”期间只体现为 Running（FR-STATE-001）；Shell Spec 第 5 节未列此类条目 | 否 | |
| S-Q13 | 是否导入该目录在本应用之外已有的 CLI 会话？应用外继续同一原生会话的内容是否同步？ | V1 不导入、不同步；Session History 只含本应用创建的 Session（01 第 8 节原则 17 只要求 New Chat 创建的 Session 进入 History） | 否 | |
