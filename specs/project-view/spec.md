# Project View

## 文档信息

| 项目 | 内容 |
|---|---|
| 模块 | `project-view` |
| 文档状态 | 草稿 |
| 覆盖需求 | FR-VIEW-001～FR-VIEW-008 |
| 相关验收 | AC-06；05 第 4 节的 Project Knowledge / View 数据分离与本地持久化专项 |
| 相关设计 | [Shell Spec v01](../../design/components/shell-spec-v01.md) 第 1、5、7、9 节；[线框图 v02](../../design/wireframes/README.md)；[Visual Direction](../../design/visual-direction.md) |
| 来源 | 02 第 2～4 节；03 第 4、6、10 节；04 第 2、5、7、8 节；[DEC-04～07](<../../docs/07. Decisions.md>)；T20261009-project-view；2026-10-10 起草 |

> 本规格把已确认的 DEC-04～07 落成可实现的模块边界。

来源简称：Project 指 [Project spec](../project/spec.md)；Session 指 [Session spec](../session/spec.md)。其余简称与标注约定见 [specs/README.md](../README.md) 第 2 节。

## 1. 职责与边界

- 负责：
  - 五个默认 View 的目录、标题、顺序和语义入口（FR-VIEW-001）。
  - Project Knowledge 与 View Definition 的文件发现、读取、Schema 校验、版本检查和快照发布（FR-VIEW-003～004；DEC-04、DEC-07）。
  - 受信声明式 View Renderer 与 Preview 的空状态、加载、刷新、缩放、错误回退和只读行为（FR-VIEW-003～005；DEC-05、DEC-07）。
  - Project View Mode 的 Conversation 列、最近对话入口、View Context 标签和普通 Session 创建契约（FR-VIEW-005～008；DEC-06）。
  - 监听 Project 内 `.ai-studio/` 的变化，并在 Project 打开、CLI 回合结束、窗口重新获得焦点时补扫。
  - 向 Renderer、Session 和 Project Shell 提供类型化的 View 数据与事件。
- 不负责：
  - Project 的打开、Tab、`ui_state` 持久化、左右区域尺寸及 Project 间隔离 → [Project spec](../project/spec.md)。
  - Session 生命周期、Conversation 内容、状态提醒、CLI Runtime、首条消息创建 → [Session spec](../session/spec.md)、[Chat spec](../chat/spec.md)、[Agent Adapter spec](../agent-adapter/spec.md)。
  - 输入区的通用布局、Model Selector、Send / Stop → [Input spec](../input/spec.md)。本模块只提供 View Context 标签和创建参数。
  - Files、Diff、Browser、Terminal 的内容 → `specs/tools/spec.md`（后续任务）；Project View Mode 下它们只复用右侧区域切换契约。
  - 自定义 View 的创建入口和自由 HTML / JavaScript 渲染。自定义 View 为 P1；自由 HTML 按 DEC-05 推迟到后续方案。

## 2. 行为细则

### FR-VIEW-001 默认 Project Views

五个 View 始终出现在当前 Project 的导航中，不因 Knowledge 不存在而隐藏或禁用。顺序和稳定 ID 如下：

| ID | 标题 | 目标 | V1 数据来源 |
|---|---|---|---|
| `overview` | Overview | 重新进入项目时恢复整体上下文 | Knowledge；客户端 Session 摘要区块 |
| `progress` | Progress | 表达项目目前做到什么阶段 | Knowledge；由普通 Session 更新 |
| `architecture` | Architecture | 表达模块、服务、技术栈和关系 | Knowledge；声明式关系图 / 表格 |
| `agent-team` | Agent Team | 展示项目使用的 Agent 及其职责 | Knowledge 对 CLI 原生配置的描述 |
| `business-flow` | Business Flow | 表达业务流程及其与代码的映射 | Knowledge；声明式流程图 |

1. 默认目录由应用内置，不依赖 Project 内存在的 View 文件。Project 内的 `views/<view-id>.view.json` 可以覆盖内置呈现定义；缺失时使用内置定义（2026-10-09 已确认，DEC-05 相关 Q4）。
2. View 的标题、图标和顺序由内置目录提供；读取到未知 `view-id` 时不加入导航，保留诊断供开发日志使用（技术方案，待实现确认）。
3. 进入 View 只改变 Main Canvas，不触发 Knowledge 生成、不创建 Session、不写入 Project 目录（FR-VIEW-007；D-01；DEC-07）。

#### 默认 View 的内容边界

- Overview 的 Project Summary、Overall Progress、Current Focus、技术栈、Architecture Summary 和 Agent Summary 由 View Definition 呈现；Recent Sessions、Needs Input、Recently Completed 是客户端固定数据区块。Agent 不能通过 Knowledge 读取、重排或注入这三个区块（已确认 Q5）。Knowledge 为空时这三个区块仍可显示。
- Progress 不采用 Sprint、Epic、Story、Ticket 作为强制数据模型；知识可以来自 Git、Session、源码、TODO 和用户对话，但事实必须落在 Knowledge。
- Architecture 以语义模块、服务、数据流和外部服务为对象；Files Tree 由 Files 工具负责，不作为 Architecture 的替代品。
- Agent Team 只展示和引用 CLI 已支持的 Agent、Skill、Rule、Instruction；客户端不建立新的 Agent Profile 标准。
- Business Flow 的节点可以绑定 Trigger、Frontend、API、Service、Data、Result 等事实；节点与代码路径的绑定使用 Knowledge 中的相对路径。

### FR-VIEW-002 Project View 可扩展

1. V1 只预留扩展点：View 目录、Schema、Renderer Registry 和导航数据结构不得把五个 ID 写死为不可扩展的数据库枚举。
2. 自定义 View 创建入口、导航排序、权限和迁移不在本轮实现；实现阶段只保证未知 View 文件不会破坏默认 View。
3. 自定义 View 进入 P1 task 时，必须复用本规格的数据 / 展示分离和声明式 Renderer，不得以任意 HTML 作为默认扩展接口。

### FR-VIEW-003 View 内容动态生成

#### 2.3.1 生成触发

1. 客户端从不自动发起 AI 生成，也不在 Knowledge 为空时自动创建隐藏 Session。
2. Preview 检测到某个 View 的 Knowledge 缺失或无可渲染内容时，显示空状态和“生成 <View 名称>”入口。用户点击入口后，左侧草稿只填入可编辑的生成指令；用户仍需自己发送，发送流程完全复用普通 CLI Session（D-06、DEC-07）。
3. View Context 标签默认附加在该草稿上。用户移除标签后，生成指令仍可发送，但不注入 View Context；Session 的 `origin_view_id` 仍记录创建来源（DEC-06）。

#### 2.3.2 外部更新与补扫

客户端读取和校验以下文件；Knowledge 与 View Definition 的生成、修改由用户通过普通 CLI Session 或文件工具完成：

| 时机 | 行为 |
|---|---|
| Project 打开 / View 首次读取 | 为当前 Project 扫描 `.ai-studio/knowledge/` 与 `.ai-studio/views/`，发布可用快照 |
| `.ai-studio/` 监视到变化 | 对受影响的 View 做稳定读取、校验和增量发布（技术方案，待实现确认） |
| View 所属 Session 的回合结束 | 补扫该 Project，合并文件工具可能漏掉的事件 |
| 窗口重新获得焦点 | 补扫该 Project，覆盖睡眠、批量写入和外部编辑遗漏 |

文件监视是刷新触发器，不是事实来源；每次发布都以磁盘上的完整文件为准。更新不切换 View、Session、右侧 Preview / 工具，也不改变 Project 的 UI 状态（DEC-07）。

#### 2.3.3 部分写入与刷新顺序

1. 读取失败或 JSON 不完整时，短暂等待文件稳定后重读；在稳定窗口内不替换上一版成功快照。
2. Knowledge 与 View Definition 可能由 Agent 分步写入。任一部分暂时无效时保留上一版成功渲染，等下一次补扫再尝试；不显示“知识已过期”或自动修复入口（Q9 已确认）。
3. 多次文件事件合并为一次刷新；刷新结果带 `revision` 和 `updatedAt`，Renderer 只接受比当前更新的快照（技术方案，待实现确认）。

### FR-VIEW-004 数据与展示分离

#### 2.4.1 文件布局

Project 内隐藏目录固定为 `.ai-studio/`，默认被 Git 忽略。客户端在需要注入 View Context 前可以幂等写入自己的指南、Schema 和 `.gitignore` 文件；它不写入 Agent 生成的 Knowledge 或 View Definition（DEC-04；Q8 已确认）。

```text
.ai-studio/
├── .gitignore                 # 内容为 *，由客户端初始化（可重复执行）
├── schema/
│   ├── knowledge.schema.json   # 应用内置 Schema 的可读副本（可选）
│   └── view.schema.json
├── knowledge/
│   └── <view-id>.json          # 事实数据；一个 View 一份
└── views/
    └── <view-id>.view.json     # 呈现定义；可缺失，缺失时用内置定义
```

1. `knowledge/<view-id>.json` 和 `views/<view-id>.view.json` 均为带 `schemaVersion` 的 JSON；Schema 由应用内置，Project 内副本不能改变校验规则。
2. 客户端读取 `.ai-studio/` 前解析 realpath，拒绝通过符号链接把 Project 外部文件作为 Knowledge / View Definition 载入（技术方案，待实现确认）。
3. `.ai-studio/` 下未知文件忽略；隐藏目录不由 Files 工具默认展示，具体由 context-tools spec 决定。

#### 2.4.2 事实与呈现

- Knowledge 只描述可以独立验证的事实：名称、状态、依赖、流程节点、Agent 配置引用和代码相对路径。
- View Definition 只描述如何组织和呈现事实：受信组件、布局、排序、数据绑定、关系图方向和强调变体。
- View Definition 不复制事实文本；绑定只允许读取当前 View 的 Knowledge 和由客户端明确提供的 Overview Session 数据。
- Renderer 不执行 Knowledge / View Definition 中的脚本、表达式、HTML、CSS 或网络请求。

### FR-VIEW-005 左右布局

1. Project View Mode 的 Main Canvas 固定为左 Conversation、右 View Preview 的两列结构。尺寸、拖拽分隔线和右侧工具共用区域由 Project spec 统一定义。
2. Preview 右侧区域顶部提供 Preview、Files、Diff、Browser、Terminal 的图标切换；同一时刻只显示一个内容。工具打开时替换 Preview，三列骨架不变；点击 Preview 图标或顶栏右侧边栏按钮回到 Preview（P-B）。
3. 刷新 Preview 不自动打开右侧区域、不把工具切回 Preview，也不改变 Conversation 列宽度。
4. Preview 是只读区域，支持纵向滚动和二维内容缩放；修改必须通过左侧普通 CLI Session 完成。具体缩放手势和视觉参数由设计稿确定。
5. 通过导航进入 View 时，右侧默认为 Preview；从 Project Tab 切回或启动恢复时遵循 Project spec 保存的完整状态，不重新套用进入规则（D-15）。

### FR-VIEW-006 Project View Conversation

1. 左侧 Conversation 使用已有的普通 Session / New Chat 组件，不创建特殊 Project Chat、唯一 Project Session 或隐藏聊天记录。
2. 从导航进入 View：左侧显示新草稿；草稿上方列出该 View 最近 3 条相关 Session（Shell Spec 第 7 节），点击某条在 View 左列打开该 Session。该动作不改变导航中当前 View 的 Selected 状态（P-A）。
3. 从 Session History 打开在 View 中创建的 Session：进入普通 Conversation Mode；顶栏提供“在 View 中打开”入口，由 Navigation / Session 交互实现（D-02）。
4. View 左列显示的 Session 满足 Session spec 的“正在查看”条件；完成或错误提醒的清除由 Session 模块处理，Project View 只提供当前显示 Session ID。
5. View 中的 Session 仍按 Session History 的最近用户消息时间排序；Agent 输出或 Preview 更新不得移动列表。

### FR-VIEW-007 Project View New Chat

从 View 左侧草稿发送第一条消息时：

1. 复用 FR-CHAT-001 的 CLI 选择、可用性检查、Session 创建和错误呈现。
2. 请求携带 `projectId`、`originViewId` 和用户选中的 `viewContextAttached`；Session 创建后立即进入当前 Project 的 Session History。
3. 若标签仍存在，在首条用户文本前附加一个独立的英文 View Context 文本块；该块只包含当前 View、少量编辑规则和相关文件路径，不内联 Knowledge 内容。Codex 与 Claude 使用同一文本模板（DEC-06）。
4. UI 将 View Context 折叠显示为可移除的“当前 View”标签。移除后首条消息不附加该文本，但仍保留 `originViewId`，用于 View 最近对话和“在 View 中打开”。
5. 原生 Skill / Agent / Instruction 选择仍由 CLI 自身能力和 Session / Adapter 模块提供；Project View 不定义新的 Agent Profile。
6. 同一 Session 只在首条消息发送时注入一次；后续轮次不重复附加 View Context。恢复原生会话时不重新注入历史块。

### FR-VIEW-008 不绑定长期 Session

1. 一个 View 可以有多个独立 Session；Session 记录创建时的 `originViewId`，但 View 不保存唯一 Session 主键。
2. 关闭或切换 View 不停止 Session；Session 的运行、Needs Input、Error、Completed Unread 规则由 Session 模块负责。
3. View 最近对话只按 `originViewId` 过滤已存在的 Session；已删除、跨 Project 或 origin 为空的 Session 不列入该区块。

## 3. 状态与数据

### 3.1 View 目录与文件快照

| 类型 | 字段 | 说明 |
|---|---|---|
| `ViewCatalogEntry` | `id`, `title`, `kind`, `order` | `kind` 为 `builtin` 或 `custom`；V1 只产生 builtin |
| `KnowledgeDocument` | `schemaVersion`, `viewId`, `data` | `data` 是事实对象；应用按内置 Schema 校验 |
| `ViewDefinition` | `schemaVersion`, `viewId`, `root`, `bindings` | `root` 为声明式组件树；`bindings` 只引用 Knowledge / 明确允许的客户端数据 |
| `ViewSnapshot` | `projectId`, `viewId`, `catalog`, `knowledge`, `definition`, `revision`, `updatedAt` | 主进程发布给 Renderer 的不可变快照；缺失 definition 时已合并内置定义 |

单文件限制（Q11 已确认，作为 V1 防护上限）：Knowledge 或 View Definition 文件默认不超过 256 KB，单个组件树不超过 500 个节点。超过上限时该 View 进入校验错误并保留上一版，不截断、不执行部分 JSON；具体数值在渲染原型校准后若需调整，必须修改本规格与任务证据。

### 3.2 声明式 Renderer 组件

V1 仅开放内置 Registry 中的受信组件（实现名称可调整）：

`stack`、`grid`、`section`、`text`、`metric`、`badge`、`list`、`table`、`timeline`、`diagram`、`callout`、`empty`。

1. 组件属性是有限 JSON 值或受限枚举；不得出现函数、事件处理器、任意 CSS、`style` 字符串、HTML 字符串、脚本、网络 URL 或动态模块名。
2. 文本通过 React 文本节点输出；不得使用 `dangerouslySetInnerHTML`。链接只允许指向 Project 内相对路径或由客户端提供的安全外部链接策略（技术方案，待实现确认）。
3. `bindings` 使用受限路径读取数据，不执行 JavaScript 表达式；绑定缺失显示组件级空状态，不使整个 Preview 崩溃。
4. `diagram` 接收节点 / 边和布局方向，由 Renderer 计算布局；Agent 不提供 SVG 坐标或可执行绘图代码。
5. Overview 的客户端 Session 区块使用独立 React 组件插槽，不进入 Agent 可编辑的 `root`，避免把 Session 标题、Needs Input 内容交给 View Definition 控制。

### 3.3 Preview 状态

| 状态 | 进入条件 | UI 行为 |
|---|---|---|
| `empty` | Knowledge 缺失、为空或没有可渲染内容 | 空状态 + “生成 <View 名称>”入口；不自动发起 Session |
| `loading` | 首次读取或正在刷新，且没有上一版成功快照 | Preview 内显示轻量加载状态，保留 Conversation |
| `ready` | Knowledge 与 Definition 校验通过且 Renderer 成功 | 显示只读 View 和最近更新时间 |
| `stale` | 正在刷新但已有上一版成功快照 | 继续显示上一版，可显示轻量“更新中”标记；不改变布局 |
| `error` | 稳定读取、Schema、绑定或 Renderer 失败 | 保留上一版成功 View；若无上一版显示错误空状态和可复制摘要 |

`error` 不改变 Session 状态、不产生隐藏对话、不清除用户输入。下一次成功快照到达后自动回到 `ready`；错误详情应避免包含完整 Knowledge 内容或敏感 Session 文本。

### 3.4 View Context

| 字段 | 类型 | 说明 |
|---|---|---|
| `originViewId` | `string \| null` | Session 创建时的 View 来源；移除标签后仍保留 |
| `viewContextAttached` | `boolean` | 首条消息是否附加 View Context；只在首条创建请求有效 |
| `viewContextPaths` | `string[]` | 由主进程解析的 Project 内相对路径，供生成文本块和诊断使用 |
| `viewContextText` | `string` | 主进程按固定英文模板生成的独立文本块；不持久化到 Knowledge |

模板只包含：

```text
Current Project View: <view title>
Relevant files: <relative paths>
Rules: update the relevant Knowledge and View Definition files when the user asks to change this view; keep facts separate from presentation; do not add executable HTML or scripts.
```

实际发送时模板文本由 Session / Adapter 组装，Renderer 不自行拼接、转义或决定 CLI 分支。对话记录保存“已附加 View Context”的可折叠元数据和用户文本；不把 Knowledge 内容复制进 transcript。

## 4. 接口与事件

### 4.1 Main Service

建议新增 `ProjectViewService`（技术方案，待实现确认），放在 `apps/desktop/src/main/services/project-view/`：

| 方法 | 作用 | 备注 |
|---|---|---|
| `list(projectId)` | 返回默认目录和当前可用快照摘要 | 不创建文件，不启动 AI |
| `getSnapshot(projectId, viewId)` | 读取、校验并返回一个 ViewSnapshot | 受 Project canonical path 限制 |
| `getRecentSessions(projectId, viewId)` | 由 Session 摘要按 `originViewId` 取最近 3 条 | 可由 Renderer 组合，边界由 Session 提供 |
| `buildContext(projectId, viewId)` | 返回相对路径、英文模板和默认附加标记 | 不返回 Knowledge 内容 |
| `watch(projectId)` / `dispose(projectId)` | 管理文件监视和补扫 | Project 关闭时释放 |

主进程服务负责真实路径、文件读取、Schema 校验、稳定读取、快照版本和安全错误；Renderer 不直接访问 `fs`、Shell 或 Project 目录。

### 4.2 IPC 契约

建议新增 `shared/ipc/project-view.ts`，按 DEC-02 登记到 `contracts.ts`、`main/ipc/index.ts`，参数均带 `projectId`：

| 调用 / 事件 | DTO | 作用 |
|---|---|---|
| `projectView:list` | `projectId → ViewCatalogEntry[]` | 导航与 View 最近对话入口 |
| `projectView:get-snapshot` | `{projectId, viewId} → ViewSnapshot` | 首次进入 / 恢复时读取 |
| `projectView:get-context` | `{projectId, viewId} → {originViewId, paths, text}` | 创建首条 Session 前渲染标签 |
| `projectView:snapshot-changed` | `{projectId, viewId, snapshot}` | 文件变化、回合结束、窗口聚焦后的增量刷新 |
| `projectView:error` | `{projectId, viewId, revision, kind, message}` | 诊断与 Preview 错误状态；不替换 last-good |

不提供“生成 View”或“写入 Knowledge”的 IPC；生成与修改仍通过普通 Session。若后续需要手动刷新，应先补充 FR 和 UX 决定，不能在本规格隐式加入按钮。

### 4.3 Renderer Store 与组件

建议新增 `apps/desktop/src/renderer/src/features/project-view/`：

| 文件 / 责任 | 内容 |
|---|---|
| `store.ts` | 按 `projectId:viewId` 缓存 catalog、snapshot、Preview 状态和 last-good；处理版本去重 |
| `api.ts` | 仅通过 `studio.projectView` 调用 IPC，便于测试替换 |
| `ProjectView.tsx` | 左右布局、View 最近对话、右侧区域入口与 Preview 容器 |
| `Preview.tsx` | 状态机、滚动、缩放、更新时间和错误回退 |
| `renderer.tsx` | 受信组件 Registry 和递归渲染；无动态 HTML / 脚本 |
| `project-view.css` | 布局与状态样式；不写入 View Definition |

Project Shell 只负责把当前 `UiState.mainCanvas.view` 和 `viewRightArea` 传入；View feature 通过现有 `ShellIntegration` 调用 Session 的 `Conversation`、`ConversationHeader` 和输入区。所有 store 均以 `projectId` 为键，避免跨 Project 混淆（AC-01）。

### 4.4 Session 接缝

1. 从 View 草稿发送时，Renderer 把 `originViewId`、`viewContextAttached` 和已有 `contextItems` 传给 Session store；Session 创建 DTO 由 `CreateSessionRequest` 扩展相应可选字段（技术方案，待实现确认）。
2. Session 主进程在创建前向 `ProjectViewService.buildContext` 取模板；若标记为 false 或 View 已失效，则不附加文本，但仍保存 `originViewId`。
3. Adapter 接收统一的“View Context 文本块 + 用户文本”输入；Codex / Claude 的差异不暴露给 Renderer。首条消息完成后，服务将附加状态记录到 transcript 元数据，后续轮次不重复注入。
4. Session 回合结束事件通知 `ProjectViewService` 补扫；Project 窗口聚焦事件也触发补扫。补扫失败不改变 Session 的成功 / Error 终态。

### 4.5 Project / Navigation 接缝

| 调用方 | Project View 提供 | 调用方负责 |
|---|---|---|
| Navigation | `list()`、当前 View ID、高亮所需的目录信息 | 左侧列表、选中状态和折叠行为 |
| Project Shell | `getSnapshot()`、右侧 Preview slot、当前显示 Session ID | `ui_state` 保存 / 恢复、左右宽度和工具切换 |
| Session | `buildContext()`、按 View 查询最近对话的过滤条件、回合结束通知 | Session 状态、Conversation、原生 CLI 和 transcript |
| Input | View Context 标签的可移除状态 | 通用输入区、Model Selector、Send / Stop |

## 5. 实现计划

以下是后续实现轮次的顺序和写入范围。本轮只完成规格草稿与文档同步，不宣称代码交付。

| 阶段 | 主要写入范围 | 交付 / 验证 | 依赖 |
|---|---|---|---|
| 1. 共享类型与 Schema | `apps/desktop/src/shared/project-view/`；`shared/ipc/project-view.ts`；契约登记 | View ID、Knowledge / Definition / Snapshot 类型；恶意字段、版本、大小和节点数校验测试 | 无 |
| 2. 主进程读取与刷新 | `main/services/project-view/`、`main/ipc/project-view.ts`、必要的 `CoreServices` 接缝 | `.ai-studio/` 初始化辅助文件、realpath 边界、稳定读取、watch / 补扫、last-good 保留测试 | 阶段 1；Project canonical path |
| 3. Renderer Renderer / Preview | `renderer/src/features/project-view/`、Workspace slot 与样式 | 受信组件渲染、空 / 加载 / ready / stale / error 状态、滚动缩放、更新不改布局 | 阶段 1～2；Shell 容器 |
| 4. Session / Input 接入 | `shared/session`、`main/ipc/session`、Session store / Composer、Adapter 输入 DTO | View 草稿、可移除标签、首条一次性注入、Codex / Claude 共用文本、`originViewId` 与 transcript 元数据 | 阶段 1～2；Session spec |
| 5. 五类 View 与导航接入 | Navigation、Project Shell、默认 View Definition / 内置组件绑定 | Overview 固定 Session 区块、Progress / Architecture / Agent Team / Business Flow 示例数据；AC-06 场景 | 阶段 3～4 |
| 6. 集成验证 | `apps/desktop` Vitest、Electron E2E、`.runtime/desktop-e2e/` | 多 Project 隔离、空 Knowledge、Agent 更新刷新、渲染失败回退、AC-06；真实 CLI 只在已授权的专项验证中执行 | 阶段 5 |

### 阶段 1 的 Schema 约束

1. 应用内置 Schema 是唯一信任锚；Project 内的 `schema/` 文件只给 Agent 阅读，客户端不得读取它来改变规则。
2. 校验必须拒绝未知组件、任意脚本 / HTML / CSS、跨 Project 路径、超出文件和节点上限的数据。
3. Schema 失败只影响对应 View；默认目录、其他 View、Session 和工具继续可用。

### 阶段 2 的刷新约束

1. `fs.watch` / 原生 watcher 只能触发调度；读取、校验和快照替换必须串行化并可取消旧刷新。
2. Project 关闭时释放 watcher；重新打开时重新扫描，不依赖 Renderer 旧缓存。
3. 多步写入的中间错误保留 last-good；只有稳定读取后仍失败才发出 `projectView:error`。

### 阶段 3 的安全约束

1. Renderer 使用固定组件映射，不使用动态 `import()`、`eval`、`new Function`、`dangerouslySetInnerHTML`。
2. Preview 不拥有 Node.js、文件系统、Shell、凭据或任意 IPC 能力；Renderer 只接收已经校验的 DTO。
3. 如果未来引入自由 HTML，必须另立 P1 规格和 Electron 沙箱原型，不能复用本阶段的声明式入口。

## 6. 验证清单

| 场景 | 预期 | 依据 |
|---|---|---|
| 新 Project 无 Knowledge 进入 Overview | 显示空状态和生成入口；不创建 Session；客户端 Session 区块可显示 | FR-VIEW-003；AC-06；D-06 |
| Architecture 中发送“重新整理支付模块架构” | 使用普通 CLI Session；左右布局保留；Agent 修改文件后 Preview 自动刷新 | FR-VIEW-005～008；AC-06 |
| Agent 写入半个 JSON | 保留上一版成功 View，稳定读取后再尝试；不崩溃、不清空 Conversation | DEC-07 |
| View Definition 含脚本、HTML 或未知组件 | 对应 View error；保留 last-good；不执行内容 | DEC-05；04 第 2 节 |
| View Context 标签被移除 | 首条消息不附加 View Context；Session 仍记录 `originViewId` | DEC-06；FR-VIEW-007 |
| 两个 Project 同时更新 | Renderer 按 `projectId:viewId` 隔离；切 Tab 不显示另一项目的 Preview 或 Session | FR-PROJ-002；AC-01 |
| View Session 在后台完成 | 左侧 View 对话仍是普通 Session；提醒与清除遵循 Session spec，不由 Preview 改写 | D-05；FR-STATE-004～005 |
| 客户端 / Agent 写入 `.ai-studio/` 外部 symlink | 拒绝载入；错误只影响该 View | 04 第 2 节；本 spec §2.4.1 |

## 7. 问题记录

### 7.1 已确认

| 编号 | 问题 | 回答（确认日期） |
|---|---|---|
| PV-Q1 | Knowledge 是否放在 Project 内 `.ai-studio/`，并默认 Git 忽略？ | 是；每个 View 一份带 `schemaVersion` 的 JSON，`.gitignore` 内容为 `*`（2026-10-09，DEC-04）。 |
| PV-Q2 | V1 是否采用受信组件声明式渲染，推迟自由 HTML / JavaScript？ | 是；自由 HTML 推迟到 P1 / 自定义 View（2026-10-09，DEC-05）。 |
| PV-Q3 | View Context 是否首条消息前附加可移除的英文文本块？ | 是；不内联 Knowledge，移除后仍保留 `originViewId`（2026-10-09，DEC-06）。 |
| PV-Q4 | 客户端是否只监视、校验和刷新，不自动生成或修复 Knowledge？ | 是；打开、回合结束和重新聚焦时补扫，渲染失败保留上一版（2026-10-09，DEC-07）。 |
| PV-Q5 | 默认 View Definition 是否内置，Project 文件仅可覆盖？ | 是（2026-10-09，T20261009-project-view Q4）。 |
| PV-Q6 | Overview 的 Session 摘要区块是否由客户端固定渲染？ | 是（2026-10-09，T20261009-project-view Q5）。 |
| PV-Q7 | V1 文件上限是否暂定 256 KB、500 节点？ | 是，作为实现防护上限，渲染原型校准后如需调整需更新规格（2026-10-09，T20261009-project-view Q11）。 |

### 7.2 未决问题

| 编号 | 问题 | 建议答案与依据 | 阻塞实现 |
|---|---|---|---|
| PV-Q8 | `ViewSnapshot` 是否同时推送完整 Knowledge 与 Definition，还是只推送渲染后的模型？ | 建议推送已校验的声明式快照，便于 Renderer 保持可测试和 last-good；不推送 Session 敏感区块。依据 DEC-05、04 第 2 节。 | 否，可在阶段 1～3 调整 |
| PV-Q9 | 视图缩放是否使用滚轮 + `⌘/Ctrl`，并把比例按 View 持久化？ | 建议只保存运行期比例，不扩展 Project `ui_state`；具体手势交给高保真设计确认。依据 FR-VIEW-005“支持缩放”、Project spec 状态边界。 | 否 |
| PV-Q10 | `schemaVersion` 升级是否只支持同版本读取，还是提供迁移器？ | 建议 V1 只接受当前版本，未知版本进入 error 并保留 last-good；迁移器作为后续 task。依据 DEC-04 与本地文件可回退原则。 | 否 |
| PV-Q11 | View Context 生成文本是否显示在 transcript 的可折叠区域，还是只作为用户消息元数据？ | 建议显示可折叠“当前 View”标签，底层保存 `view_context_attached` 和路径，不复制完整模板。依据 DEC-06、Input spec 上下文标签规则。 | 是：阶段 4 UI 与 transcript 结构 |
| PV-Q12 | 默认 View 的内置 Definition 是否通过代码常量提供，还是作为应用资源 JSON 打包？ | 建议作为版本化应用资源 JSON，启动时解析并用同一 Schema 校验；便于视觉调整而不写入 Project。依据 FR-VIEW-001、DEC-05。 | 否 |
