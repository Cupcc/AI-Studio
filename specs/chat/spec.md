# New Chat

## 文档信息

| 项目 | 内容 |
|---|---|
| 模块 | `chat` |
| 文档状态 | 草稿 |
| 覆盖需求 | FR-CHAT-001～FR-CHAT-003；关联 FR-VIEW-007（只记录 `origin_view_id`）、FR-NAV-003（Session 命名） |
| 相关验收 | AC-02、AC-03；05 第 4 节专项测试中的 New Chat 草稿 |
| 相关设计 | [Shell Spec v01](../../design/components/shell-spec-v01.md) 第 2、3、7、9 节；线框图 v02（[design/wireframes](../../design/wireframes/README.md)） |
| 来源 | [02. Functional Requirements](<../../docs/02. Functional Requirements.md>) FR-CHAT-001～003、FR-VIEW-007、FR-NAV-003；[03. UX Specification](<../../docs/03. UX Specification.md>) 第 6 节 New Chat、第 10 节 D-01、D-11、D-15、P-A；[04. Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 5 节 Project、Session；[06. CLI Integration Preflight](<../../docs/06. CLI Integration Preflight.md>) 第 5 节 |

> 文档状态取值：`草稿` / `已确认（YYYY-MM-DD）`。只有人在对话中明确确认后才能改为已确认。
>
> “建议”表示文档未规定、由本草稿提出的做法；涉及产品行为且文档未决定的列入第 5 节，编号 C-Q*。

## 1. 职责与边界

- 负责：
  - New Chat 草稿：进入、保留、离开，以及首条消息时交给 session 模块创建 Session（FR-CHAT-001；D-01）。
  - CLI 选择：New Chat 分裂按钮、CLI 菜单、“设为此 Project 默认”、Default CLI 规则、不可用 CLI 的禁用与原因（FR-CHAT-002；UX 第 6 节 New Chat 第 1～5 项；D-11）。
  - CLI 锁定的产品规则（FR-CHAT-003）。
  - Session 命名方法：原生名称优先，否则客户端生成（FR-NAV-003 命名部分）。
  - 从 Project View 草稿创建 Session 时记录 `origin_view_id`（FR-VIEW-007 最后一段）。
- 不负责：
  - Session 生命周期、状态、对话展示：见 [specs/session/spec.md](../session/spec.md)。
  - 输入区与 Model Selector：见 [specs/input/spec.md](../input/spec.md)。
  - New Chat 按钮在导航中的位置与折叠时的顶栏按钮布局：Project 壳层与 `specs/navigation/spec.md`。
  - Project View Mode 的草稿、最近对话块、View 上下文注入（P-A；FR-VIEW-007 第 2～4 项）：Project View task 后续实现。
  - Session History 列表与 Rename 交互：`specs/navigation/spec.md`。

## 2. 行为细则

### FR-CHAT-001 创建 Session

依据：FR-CHAT-001；UX 第 6 节 New Chat 第 5 项；D-01；01 第 8 节原则 17。

1. 点击 New Chat 主按钮：当前 Project 的 Main Canvas 切换到 Conversation Mode 的新对话草稿，使用该 Project 的 Default CLI，输入框获得焦点，可立即输入。
2. 草稿不是 Session：不写入 Session 记录，不出现在 Session History，不调用 CLI 创建原生会话，也不为读取模型目录而创建原生会话（见第 4.2 节注意事项）。
3. 草稿中发送第一条消息（规则见 input spec）：
   1. 发送前检查草稿 CLI 的可用性；已知不可用时不发送、不创建 Session，保留输入内容并显示原因（UX 第 6 节 New Chat 第 4 项；避免产生空 Session）。
   2. 可用时调用 session 模块创建 Session：`cli_type` = 草稿 CLI，`model` = 草稿中选择的模型（未选择则为空，使用 CLI 原生默认），`origin_view_id` = 草稿所在 View（Conversation Mode 草稿为空），首条消息与上下文项一并提交。
   3. Session 立即出现在 Session History（今天分组顶部），Main Canvas 从草稿切换为该 Session 的 Conversation，进入 Running（FR-STATE-001）。
   4. 此后 CLI 已锁定（FR-CHAT-003）。CLI 实际调用失败（例如登录状态检测通过但调用失败，06 第 5 节末条）时，Session 已存在，显示 Error，规则见 session spec 第 2.7 节。
4. 草稿顶栏：建议显示“新对话 · <CLI 名称>”（Shell Spec 第 7 节 Project View 草稿为“新对话 · <View 名称>”，Conversation Mode 草稿未规定；文案以高保真为准）。
5. 草稿的保留与离开（建议，C-Q1）：
   - 每个 Project 最多保留一份 Conversation Mode 草稿（文本、CLI、模型）。
   - 离开草稿（点击 Session、View 或切换 Tab）不丢弃草稿；切换 Tab 返回时恢复离开时的完整状态，包括草稿（D-15）。
   - 再次点击 New Chat 时回到这份草稿（保留已输入文本），而不是新建空草稿；草稿发送或被清空后，下次 New Chat 为空草稿。
   - 草稿由 Session 模块独立持久化至 `session_drafts`，应用重启后与 Project UI 状态一并恢复（与 FR-PROJ-003 状态恢复一致）。
6. 空白草稿离开后不留下任何痕迹，Session History 不变（FR-CHAT-001 末段）。

### FR-CHAT-002 CLI 选择

依据：FR-CHAT-002；UX 第 6 节 New Chat 第 1～4 项；D-11；Shell Spec 第 3、9 节；04 第 5 节 Project `default_cli`。

#### New Chat 分裂按钮与 CLI 菜单

1. 主区：图标 + “New Chat”，使用当前 Project 的 Default CLI（UX 第 6 节 New Chat 第 1 项）。
2. 右区 ▾：打开 CLI 菜单，按 Codex CLI、Claude Code 顺序列出（UX 第 6 节 New Chat 第 2 项）。每项包含 CLI 名称、默认标记、“设为此 Project 默认”（Shell Spec 第 3 节）。
3. 点击菜单中的 CLI 名称：打开使用该 CLI 的草稿，不改变 Project Default CLI。已有草稿时改变该草稿的 CLI（建议，C-Q2）。
4. 点击“设为此 Project 默认”：把该 CLI 写入当前 Project 的 `default_cli`，同时记为应用级“最近一次设置的默认值”；不打开草稿，不影响已有 Session 和已有草稿的 CLI。
5. 导航折叠时顶栏保留的 New Chat 按钮（D-14）行为与主区相同；按 navigation NAV-Q8 的本轮建议使用单个按钮与 Default CLI，需要切换 CLI 时展开导航使用分裂按钮（待确认）。

#### Default CLI 规则

| 情形 | Default CLI | 依据 |
|---|---|---|
| 用户对该 Project 执行过“设为此 Project 默认” | 该值 | UX 第 6 节 New Chat 第 2 项 |
| 新 Project（首次打开，尚无记录），应用级“最近一次设置的默认值”存在 | 该值；在 Project 创建时写入该 Project（快照，建议，C-Q4） | UX 第 6 节 New Chat 第 3 项 |
| 首次使用，尚无“最近一次设置的默认值” | 检测到的第一个可用 CLI，按菜单顺序 Codex CLI → Claude Code（顺序为建议，C-Q4）；不写入应用级“最近一次设置的默认值” | UX 第 6 节 New Chat 第 3 项 |
| 两个 CLI 均不可用 | 暂为空；New Chat 仍打开草稿并显示不可用说明（C-Q3）；之后检测到可用 CLI 时按上一行规则补齐 | Shell Spec 第 9 节 CLI 不可用 |

#### 可用性与不可用 CLI

1. 每个 CLI 的可用性分为：可用、未安装、未登录（UX 第 6 节 New Chat 第 4 项；agent-adapter task 验收“可用性检测”）。已安装但版本不在 Adapter 支持范围内的处理见 C-Q5。
2. 菜单中不可用的 CLI 整项禁用（包括“设为此 Project 默认”），并显示原因（“未安装”“未登录”）（Shell Spec 第 3 节 CLI 菜单；第 10 节 Disabled）。
3. 草稿的 CLI 不可用时（例如 Default CLI 后来退出登录）：草稿内显示“CLI 不可用”说明与安装 / 登录指引（Shell Spec 第 9 节），发送不可用；用户可通过 ▾ 菜单换用其他可用 CLI（C-Q3）。
4. 可用性检测时机（技术方案，待实现确认）：应用启动时检测一次；打开 CLI 菜单、显示草稿时若缓存超过短时限则重新检测；检测进行中菜单项显示“检测中”，不阻塞打开草稿。
5. 登录状态“可用”不保证调用成功（06 第 5 节末条）；调用失败按 Error 处理。

### FR-CHAT-003 Session CLI 锁定

依据：FR-CHAT-003；01 第 7 节 CLI、第 8 节原则 7、8。

1. Session 创建后 `cli_type` 不可修改；界面中不提供把 Session 切换到另一 CLI 的入口。
2. 已有 Session 的 Conversation 中，New Chat 菜单的操作只会新建草稿，不影响当前 Session。
3. 草稿阶段尚未创建 Session，CLI 可以更换（本文 FR-CHAT-002 节“New Chat 分裂按钮与 CLI 菜单”第 3 条）。
4. 模型切换只在该 CLI 支持的模型范围内进行，见 input spec FR-INPUT-002。
5. CLI 在 Session 创建后变为不可用（卸载、退出登录）：Session 仍保留并可查看；发送时失败进入 Error（session spec 第 2.7 节），不提示换用其他 CLI。

### FR-VIEW-007（本切片范围）记录来源 View

依据：FR-VIEW-007 第 1、5 项与最后一段；UX 第 6 节 Project View 打开（P-A）；D-01；D-02。

1. 从 Project View 左侧草稿发送第一条消息时，与 FR-CHAT-001 相同的流程创建普通 CLI Session，并把该 View 的 ID 写入 `origin_view_id`；Session 同样立即进入 Session History（FR-VIEW-006、FR-VIEW-007 第 5 项）。
2. 进入 Project View 本身不创建 Session（FR-VIEW-007 最后一段；D-01）。
3. 本切片提供带 `originViewId` 参数的创建接口；Project View 草稿 UI、最近对话块、View 上下文注入在 Project View task 实现。
4. `origin_view_id` 创建后不变，用于 Conversation 顶栏显示来源 View 和“在 View 中打开”（D-02），以及在该 View 中列出相关对话（P-A）。

### FR-NAV-003（命名部分）Session 名称

依据：FR-NAV-003“优先复用 CLI 原生提供的 Session Name；如果 CLI 不提供名称，可由客户端生成名称”“支持 Session Rename”。

1. 名称优先级：用户 Rename > CLI 原生名称 > 客户端生成名称。用 `title_source`（`user` / `native` / `client`）记录来源（session spec 第 3.2 节）。
2. 客户端生成方法（建议，C-Q6）：Session 创建时取首条用户消息第一行非空文本，去除首尾空白并合并连续空白，截取前 40 个字符，超出加“…”；若首条消息没有可用文字（例如只有上下文项），使用“新对话”。不额外调用模型生成标题，避免消耗额度和在 CLI 历史中产生额外会话。
3. 原生名称：Adapter 报告原生名称时，如 `title_source` 不是 `user`，采用原生名称并置为 `native`。两种 CLI 是否提供、何时提供原生名称未经 06 校验，需 Adapter 确认；不提供时一直使用客户端生成名称。
4. Rename（交互见 navigation spec）：写入新标题并置为 `user`，之后不再被原生名称覆盖。Rename 只修改客户端标题，不回写 CLI（建议，C-Q6）。

## 3. 状态与数据

| 数据 | 字段 | 说明 |
|---|---|---|
| Project | `default_cli` | 04 第 5 节；可为空（两个 CLI 均不可用且从未设置时） |
| 应用偏好 | `last_set_default_cli` | 提案：最近一次通过“设为此 Project 默认”设置的值，供新 Project 继承（UX 第 6 节 New Chat 第 3 项） |
| 草稿（每 Project 一份，另有每个 Project View 一份由 Project View task 定义） | `cli`、`text`、`model`（可空）、`contextItems`；创建参数另带 `originViewId` | 2026-10-09 实现：独立 `session_drafts` 表，`DraftKey = {projectId, kind: 'new_chat'}`。Project UI 只保存当前是否显示草稿；同一事实不重复存储 |
| CLI 可用性快照 | 每个 CLI：`state`（`available` / `not_installed` / `not_logged_in` / 其他见 C-Q5）、`reason`、`checked_at` | 运行时缓存，不持久化 |

## 4. 接口与事件

### 4.1 提供给其他模块

2026-10-09 实现入口为 Session Renderer store、`CliMenu` 与 [`sessionContract`](../../apps/desktop/src/shared/ipc/session.ts)，具体持久化与事件见 [Session §3.5 / §4.4](../session/spec.md)。下表替换实现前的占位名称，产品推荐仍待确认。

| 接口 | 说明 | 消费方 |
|---|---|---|
| Renderer `startDraft(projectId, cli?)` | 打开或回到草稿；未指定 CLI 则保留草稿 CLI 或使用 Default CLI | 导航 New Chat 主按钮、顶栏 New Chat、CLI 菜单 |
| IPC `setDefaultCli({projectId, cli})` | 写入 `projects.default_cli` 与 `session_preferences.last_set_default_cli` | CLI 菜单 |
| MainSessionPort `initializeProject(projectId)` | Project 创建回复前快照默认 CLI；发现失败不阻止打开目录 | Project 模块（project-shell） |
| IPC `getProviders()` / `providersChanged` | 版本、登录、兼容性与原因分别来自 Adapter，菜单展示可用性快照 | 导航、草稿、input |
| Renderer `sendComposer(DraftKey)` → IPC `create` | 首条消息与草稿参数提交；返回新摘要后进入 Session，未接受时保留输入 | input |

### 4.2 需要 CLI Adapter 提供

| 能力 | 说明 | 需对齐的点 |
|---|---|---|
| 可用性检测 | 分开报告是否安装、版本、登录状态（06 第 5 节末条；agent-adapter task） | 版本不支持时的报告方式（C-Q5）；GUI 启动下的 PATH 由 app-skeleton 提供 |
| 模型目录 | 草稿阶段即可读取所选 CLI 的模型列表 | **读取目录不得创建原生会话**，否则违反 FR-CHAT-001“不产生空 Session”的意图并污染 CLI 历史；Claude SDK 初始化需首条消息或控制请求触发（06 第 3 节），需 Adapter 确认可行方式 |
| 原生名称（可选） | 见本文 FR-NAV-003 节 | 两种 CLI 是否提供 |

## 5. 未决问题

2026-10-09 参考应用复核见 [Session research](../../tasks/T20261009-session-slice/research.md)；推荐仍为草稿，已确认回答保持原样。

| 编号 | 问题 | 推荐答案与依据 | 阻塞实现 | 回答（确认日期） |
|---|---|---|---|---|
| C-Q1 | 未发送草稿在离开、再次点击 New Chat、切换 Project、重启应用时如何处理？ | 每个 Project 保留一份草稿（文本、CLI、模型）；离开不丢弃；再次 New Chat 回到该草稿；切换 Tab 返回恢复（D-15）；由 Session 独立持久化至 session_drafts，重启后恢复。依据：FR-CHAT-001 只规定不创建 Session；D-15、FR-PROJ-003 要求恢复离开时的状态 | 否 | |
| C-Q2 | 在已有草稿时从 CLI 菜单选择另一个 CLI：新建空草稿，还是改变当前草稿的 CLI？ | 改变当前草稿的 CLI，保留已输入文本，模型重置为新 CLI 的原生默认。草稿未创建 Session，CLI 未锁定（FR-CHAT-003） | 否 | |
| C-Q3 | Project 的 Default CLI 不可用（或两个都不可用）时，New Chat 主按钮如何表现？ | 主按钮仍可点击并打开草稿；草稿内显示不可用原因与安装 / 登录指引（Shell Spec 第 9 节），发送不可用；用户可在 ▾ 菜单中选其他可用 CLI。不自动改写 Project Default CLI | 否 | |
| C-Q4 | “检测到的第一个可用 CLI”按什么顺序？新 Project 沿用的默认值是创建时的快照，还是始终跟随最近设置？ | 顺序按菜单顺序 Codex CLI → Claude Code（UX 第 6 节 New Chat 第 2 项）；新 Project 在创建时写入快照，之后其他 Project 改默认不影响它（“沿用”指新 Project 的初始值） | 否 | |
| C-Q5 | 已安装但版本不在 Adapter 支持范围内（04 第 4 节第 2 条要求锁定版本）时，菜单如何显示？ | 与 Adapter A-Q1 对齐：已验证版本正常显示，未验证版本标注“未验证”且仍可使用；只有已知不兼容才作为“版本不受支持”禁用并说明原因。Stop 实验协议不可用时走 Runtime 兜底。此为推荐修订，仍待确认 | 否 | |
| C-Q6 | 客户端生成名称的方法；Rename 是否回写 CLI？ | 取首条消息第一行前 40 字符；不调用模型生成；原生名称出现且用户未改名时替换；Rename 不回写 CLI。依据：FR-NAV-003 未规定方法；01 第 8 节原则 20 复用原生能力，但 06 未验证原生命名接口 | 否 | |
