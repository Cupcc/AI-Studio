# Project View

## 文档信息

| 项目 | 内容 |
|---|---|
| 模块 | `project-view` |
| 文档状态 | 已确认（2026-10-11） |
| 覆盖需求 | FR-VIEW-001～FR-VIEW-008 |
| 相关验收 | AC-06；05 第 4 节的 Project Knowledge / View 数据分离与本地持久化专项 |
| 相关设计 | [Shell Spec v01](../../design/components/shell-spec-v01.md) 第 2、6、8、10 节；[线框图 v02](../../design/wireframes/README.md)；[Visual Direction](../../design/visual-direction.md) |
| 来源 | 02 第 2～4 节；03 第 4、6、10 节；04 第 3、6、1、8 节；[DEC-04～07](<../../docs/07. Decisions.md>)；2026-10-10 起草；用户明确“我都已经全部确定了”（2026-10-11 确认） |
| 后续修订 | 宿主缩放按 [DEC-30](<../../docs/07. Decisions.md#dec-30-工作台宿主精简系统字体与中文界面>)（2026-11-12 确认）取消，见 FR-VIEW-005 第 4 条与 PV-Q9、PV-Q13；本次 diff 待审阅 |

> 本规格负责预设网页包的 Knowledge、Definition 数据与 DEC-04～07 内容行为。统一宿主、目录、定位、快照、事件、生命周期与上下文入口由[工作台规格 §9.7](../workbench/spec.md#97-预设与自定义工作台统一宿主)负责，依据用户 2026-11-11“统一为同一种架构”（DEC-29）。网页包迁移见[网页格式统一任务](../../.agents/archive/tasks/T20261111-workbench-web-format/task.md)。

来源简称：Project 指 [Project spec](../project/spec.md)；Session 指 [Session spec](../session/spec.md)。其余简称与标注约定见 [specs/README.md](../README.md) 第 3 节。

## 1. 问题记录

### 1.1 未决问题

无。PV-Q8～PV-Q13 已采纳建议并移至“已确认”（2026-10-11）。

### 1.2 已确认

| 编号 | 问题 | 回答（确认日期） |
|---|---|---|
| PV-Q1 | Knowledge 是否放在 Project 内 `.ai-studio/`，并默认 Git 忽略？ | 是；每个 View 一份带 `schemaVersion` 的 JSON，`.gitignore` 内容为 `*`（2026-10-09，DEC-04）。 |
| PV-Q2 | 默认 View 与自定义扩展分别如何渲染？ | 预设与自定义使用同一标准 Web 插件包、iframe 和 SDK；Knowledge/Definition 是网页包的内容数据，当前决定见 DEC-29。 |
| PV-Q3 | View Context 是否首条消息前附加可移除的英文文本块？ | 是；不内联 Knowledge，移除后仍保留 `originViewId`（2026-10-09，DEC-06）。 |
| PV-Q4 | 客户端是否只监视、校验和刷新，不自动生成或修复 Knowledge？ | 是；打开、回合结束和重新聚焦时补扫，渲染失败保留上一版（2026-10-09，DEC-07）。 |
| PV-Q5 | 默认 View Definition 是否内置，Project 文件仅可覆盖？ | 是（2026-10-09）。 |
| PV-Q6 | Overview 的 Session 摘要区块是否由客户端固定渲染？ | 是（2026-10-09）。 |
| PV-Q7 | V1 文件上限是否暂定 256 KB、500 节点？ | 是，作为实现防护上限，渲染原型校准后如需调整需更新规格（2026-10-09）。 |
| PV-Q8 | `ViewSnapshot` 是否同时推送完整 Knowledge 与 Definition，还是只推送渲染后的模型？ | 采用已校验的声明式快照，包含完整 Knowledge 与 Definition，便于 Renderer 保持可测试和 last-good；不推送 Session 敏感区块（2026-10-11，依据 DEC-05、04 第 3 节）。 |
| PV-Q9 | 视图缩放是否使用滚轮 + `⌘/Ctrl`，并把比例按 View 持久化？ | 缩放比例只保存在当前 View 的运行期状态，不扩展 Project `ui_state`；具体手势交给高保真设计确认（2026-10-11，依据 FR-VIEW-005、Project spec 状态边界）。控件与手势已按[原型 v03](../../.agents/archive/tasks/T20261011-prototype-v03/task.md) Q1 确认（2026-10-11），见 FR-VIEW-005 第 4 条。宿主缩放已由 DEC-30（2026-11-12）取消，本条仅保留历史结论。 |
| PV-Q10 | `schemaVersion` 升级是否只支持同版本读取，还是提供迁移器？ | V1 只接受当前支持版本；未知版本进入 `error` 并保留 last-good，迁移器作为后续 task（2026-10-11，依据 DEC-04 与本地文件可回退原则）。 |
| PV-Q11 | View Context 生成文本是否显示在 transcript 的可折叠区域，还是只作为用户消息元数据？ | 显示可折叠“当前 View”标签，底层保存 `view_context_attached` 与路径元数据，不复制完整模板（2026-10-11，依据 DEC-06、Input spec 上下文标签规则）。 |
| PV-Q12 | 默认 View 的内置 Definition 是否通过代码常量提供，还是作为应用资源 JSON 打包？ | 作为版本化应用资源 JSON 打包，启动时解析并用同一 Schema 校验；不写入 Project，便于视觉调整（2026-10-11，依据 FR-VIEW-001、DEC-05）。 |
| PV-Q13 | Preview 缩放的比例范围与步长？ | 50%～200%，每次 10%，与[原型 v03](../../.agents/archive/tasks/T20261011-prototype-v03/task.md)一致；高保真阶段如需调整再改本条。用户对话“PV-Q13 采纳答案”（2026-10-11 确认）。宿主缩放已由 DEC-30（2026-11-12）取消，本条仅保留历史结论。 |

## 2. 职责与边界

- 负责：
  - 五个预设工作台的项目知识语义与内容要求（FR-VIEW-001）；目录、标题、顺序与实例定位由工作台宿主负责。
  - Project Knowledge 与 View Definition 的文件发现、读取、Schema 校验、版本检查和快照发布（FR-VIEW-003～004；DEC-04、DEC-07）。
  - 预设网页包中的受信内容脚本与 Preview 的空状态、加载、刷新、错误回退和只读行为（FR-VIEW-003～005；DEC-05、DEC-07）。
  - 预设的首条上下文内容规则（FR-VIEW-005～008；DEC-06）；Conversation、最近对话、标签与 Session 接入由统一工作台负责。
  - 监听 Project 内 `.ai-studio/` 的变化，并在 Project 打开、CLI 回合结束、窗口重新获得焦点时补扫。
  - 向工作台宿主提供已验证的声明式内容；公共快照与事件由宿主提供。
- 不负责：
  - Project 的打开、Tab、`ui_state` 持久化、左右区域尺寸及 Project 间隔离 → [Project spec](../project/spec.md)。
  - Session 生命周期、Conversation 内容、状态提醒、CLI Runtime、首条消息创建 → [Session spec](../session/spec.md)、[Chat spec](../chat/spec.md)、[Agent Adapter spec](../agent-adapter/spec.md)。
  - 输入区的通用布局、Model Selector、Send / Stop → [Input spec](../input/spec.md)。本模块只规定预设上下文内容。
  - Files、Search、Diff、Browser、Terminal 的内容 → [tools spec](../tools/spec.md)；Project View Mode 下它们显示在与 Session Mode 相同的右侧边栏中，切换内容不释放工具的 Project 级资源（DEC-10，2026-10-12 确认；DEC-33）。
  - 所有工作台的目录、公共宿主、会话入口，以及自定义包、实例和后续业务 → [workbench spec](../workbench/spec.md)（FR-WB-001～008）。

## 3. 行为细则

### FR-VIEW-001 默认 Project Views

五个 View 是当前 Project 的默认工作台目录，不因 Knowledge 不存在而自动隐藏或禁用。初始顺序和稳定 ID 如下；用户对名称、顺序或可见性的管理由[工作台规格 §9.8](../workbench/spec.md#98-fr-wb-001006008-工作台列表管理)负责：

| ID | 标题 | 目标 | V1 数据来源 |
|---|---|---|---|
| `overview` | Overview | 重新进入项目时恢复整体上下文 | Knowledge；客户端 Session 摘要区块 |
| `progress` | Progress | 表达项目目前做到什么阶段 | Knowledge；由普通 Session 更新 |
| `architecture` | Architecture | 表达模块、服务、技术栈和关系 | Knowledge；声明式关系图 / 表格 |
| `agent-team` | Agent Team | 展示项目使用的 Agent 及其职责 | Knowledge 对 CLI 原生配置的描述 |
| `business-flow` | Business Flow | 表达业务流程及其与代码的映射 | Knowledge；声明式流程图 |

1. 默认目录由应用内置，不依赖 Project 内存在的 View 文件。内置 Definition 以版本化应用资源 JSON 打包，启动时解析并使用与 Project 文件相同的内置 Schema 校验；不写入 Project。Project 内的 `views/<view-id>.view.json` 可以覆盖内置呈现定义；缺失时使用内置定义（2026-10-09 已确认，DEC-05 相关 Q4；PV-Q12 于 2026-10-11 确认）。
2. View 的默认标题、图标和顺序由内置目录提供；用户的导航偏好由统一工作台宿主保存。读取到未知 `view-id` 时不加入导航，保留诊断供开发日志使用（技术方案，待实现确认）。
3. 进入 View 只改变 Main Canvas，不触发 Knowledge 生成、不创建 Session、不写入 Project 目录（FR-VIEW-007；D-01；DEC-07）。

#### 默认 View 的内容边界

- Overview 的 Project Summary、Overall Progress、Current Focus、技术栈、Architecture Summary 和 Agent Summary 由 View Definition 呈现；Recent Sessions、Needs Input、Recently Completed 是客户端固定数据区块。Agent 不能通过 Knowledge 读取、重排或注入这三个区块（已确认 Q5）。Knowledge 为空时这三个区块仍可显示。
- Progress 不采用 Sprint、Epic、Story、Ticket 作为强制数据模型；知识可以来自 Git、Session、源码、TODO 和用户对话，但事实必须落在 Knowledge。
- Architecture 以语义模块、服务、数据流和外部服务为对象；Files Tree 由 Files 工具负责，不作为 Architecture 的替代品。
- Agent Team 只展示和引用 CLI 已支持的 Agent、Skill、Rule、Instruction；客户端不建立新的 Agent Profile 标准。
- Business Flow 的节点可以绑定 Trigger、Frontend、API、Service、Data、Result 等事实；节点与代码路径的绑定使用 Knowledge 中的相对路径。

### FR-VIEW-002 Project View 可扩展

1. 默认 View 保留扩展边界：View 目录、Schema、Renderer Registry 和导航数据结构不得把五个 ID 写死为不可扩展的数据库枚举。
2. 自定义扩展采用包与 Project 内实例，使用[工作台规格](../workbench/spec.md)的创建、导航、权限与存储规则。预设与自定义工作台共用 §5 所引宿主契约，未知文件不能破坏已有预设内容。
3. 预设与自定义均使用标准网页入口和公共 SDK，Definition 组件是包内可复用的内容实现，不构成宿主的第二种 Renderer。

### FR-VIEW-003 View 内容动态生成

#### 3.3.1 生成触发

1. 客户端从不自动发起 AI 生成，也不在 Knowledge 为空时自动创建隐藏 Session。
2. Preview 检测到某个 View 的 Knowledge 缺失或无可渲染内容时，显示空状态和“生成 <View 名称>”入口。用户点击入口后，左侧草稿只填入可编辑的生成指令；用户仍需自己发送，发送流程完全复用普通 CLI Session（D-06、DEC-07）。
3. View Context 标签默认附加在该草稿上。用户移除标签后，生成指令仍可发送，但不注入 View Context；Session 的 `origin_view_id` 仍记录创建来源（DEC-06）。

#### 3.3.2 外部更新与补扫

客户端读取和校验以下文件；Knowledge 与 View Definition 的生成、修改由用户通过普通 CLI Session 或文件工具完成：

| 时机 | 行为 |
|---|---|
| Project 打开 / View 首次读取 | 为当前 Project 扫描 `.ai-studio/knowledge/` 与 `.ai-studio/views/`，发布可用快照 |
| `.ai-studio/` 监视到变化 | 对受影响的 View 做稳定读取、校验和增量发布（技术方案，待实现确认） |
| View 所属 Session 的回合结束 | 补扫该 Project，合并文件工具可能漏掉的事件 |
| 窗口重新获得焦点 | 补扫该 Project，覆盖睡眠、批量写入和外部编辑遗漏 |

文件监视是刷新触发器，不是事实来源；每次发布都以磁盘上的完整文件为准。更新不切换 View、Session、右侧 Preview / 工具，也不改变 Project 的 UI 状态（DEC-07）。

#### 3.3.3 部分写入与刷新顺序

1. 读取失败或 JSON 不完整时，短暂等待文件稳定后重读；在稳定窗口内不替换上一版成功快照。
2. Knowledge 与 View Definition 可能由 Agent 分步写入。任一部分暂时无效时保留上一版成功渲染，等下一次补扫再尝试；不显示“知识已过期”或自动修复入口（DEC-07；PV-Q4 已确认）。
3. 多次文件事件合并为一次刷新；刷新结果带 `revision` 和 `updatedAt`，Renderer 只接受比当前更新的快照（技术方案，待实现确认）。

### FR-VIEW-004 数据与展示分离

#### 3.4.1 文件布局

Project 内隐藏目录固定为 `.ai-studio/`，默认被 Git 忽略。客户端在需要注入 View Context 前可以幂等写入自己的指南、Schema 和 `.gitignore` 文件；它不写入 Agent 生成的 Knowledge 或 View Definition（DEC-04；PV-Q1 已确认）。

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

1. `knowledge/<view-id>.json` 和 `views/<view-id>.view.json` 均为带 `schemaVersion` 的 JSON；Schema 由应用内置，Project 内副本不能改变校验规则。V1 只接受当前支持的 `schemaVersion`；未知版本按校验错误处理并保留 last-good，不在本轮提供迁移器（PV-Q10，2026-10-11 确认）。
2. 客户端读取 `.ai-studio/` 前解析 realpath，拒绝通过符号链接把 Project 外部文件作为 Knowledge / View Definition 载入（技术方案，待实现确认）。
3. `.ai-studio/` 下未知文件忽略；隐藏目录不由 Files 工具默认展示，具体由 context-tools spec 决定。

#### 3.4.2 事实与呈现

- Knowledge 只描述可以独立验证的事实：名称、状态、依赖、流程节点、Agent 配置引用和代码相对路径。
- View Definition 只描述如何组织和呈现事实：受信组件、布局、排序、数据绑定、关系图方向和强调变体。
- View Definition 不复制事实文本；绑定只允许读取当前 View 的 Knowledge 和由客户端明确提供的 Overview Session 数据。
- Renderer 不执行 Knowledge / View Definition 中的脚本、表达式、HTML、CSS 或网络请求。

### FR-VIEW-005 左右布局

1. Project View Mode 的 Main Canvas 为左 Conversation、右工作台列（View Preview）的两列结构；右侧边栏打开时位于工作台列右侧，形成四列（[DEC-33](<../../docs/07. Decisions.md#dec-33-工作台与右侧工具栏分列>)）。尺寸、拖拽分隔线与空间不足时的处理由 Project spec 统一定义。
2. 工作台列顶栏只放工作台名称、状态、操作与“关闭工作台”×；工具在右侧边栏中切换，与 Session Mode 相同。工作台列关闭后 Conversation 占用其宽度，Conversation 顶栏的“工作台”按钮重新打开。Files 查看文件时，文件内容列临时占用工作台列的位置，见 [UX 第 5 节](<../../docs/03. UX Specification.md#5-context-panel-交互模型>)（取代 P-B 的共用右侧区域）。
3. 刷新 Preview 不自动打开工作台列或右侧边栏、不切换工具，也不改变 Conversation 列宽度。
4. Preview 是只读区域，支持滚动；修改必须通过左侧普通 CLI Session 完成。宿主不提供页面缩放，缩放属于带画布的页面（用户 2026-11-12 确认，DEC-30）。原型 v03 Q1 的缩放控件与 PV-Q9、PV-Q13 的比例规则不再适用。
5. 通过导航进入 View 时打开工作台列，右侧边栏保持原状；从 Project Tab 切回或启动恢复时遵循 Project spec 保存的完整状态，不重新套用进入规则（D-15）。

### FR-VIEW-006 Project View Conversation

1. 左侧 Conversation 使用已有的普通 Session / New Chat 组件，不创建特殊 Project Chat、唯一 Project Session 或隐藏聊天记录。
2. 从导航进入 View：左侧显示新草稿；草稿的底部输入框上方列出该 View 最近 3 条相关 Session，无记录时不显示区块（Shell Spec v02 第 8 节；DEC-23，2026-10-23 确认），点击某条在 View 左列打开该 Session。该动作不改变导航中当前 View 的 Selected 状态（P-A）。
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

## 4. 状态与数据

### 4.1 View 目录与文件快照

| 类型 | 字段 | 说明 |
|---|---|---|
| `KnowledgeDocument` | `schemaVersion`, `viewId`, `data` | `data` 是事实对象；应用按内置 Schema 校验 |
| `ViewDefinition` | `schemaVersion`, `viewId`, `root`, `bindings` | `root` 为声明式组件树；`bindings` 只引用 Knowledge / 明确允许的客户端数据 |
| `ViewSnapshot` | `projectId`, `viewId`, `catalog`, `knowledge`, `definition`, `revision`, `updatedAt` | 宿主提供给网页包的完整、已校验的内容资源；缺失 definition 时已合并内置定义，不包含 Session 敏感区块（PV-Q8，2026-10-11 确认） |

单文件限制（PV-Q7 已确认，作为 V1 防护上限）：Knowledge 或 View Definition 文件默认不超过 256 KB，单个组件树不超过 500 个节点。超过上限时该 View 进入校验错误并保留上一版，不截断、不执行部分 JSON；具体数值在渲染原型校准后若需调整，必须修改本规格与任务证据。

### 4.2 网页包的 Definition 组件

预设网页包解释 Definition 时支持以下组件：

`stack`、`grid`、`section`、`text`、`metric`、`badge`、`list`、`table`、`timeline`、`diagram`、`callout`、`empty`。

1. 组件属性是有限 JSON 值或受限枚举；不得出现函数、事件处理器、任意 CSS、`style` 字符串、HTML 字符串、脚本、网络 URL 或动态模块名。
2. 文本通过 React 文本节点输出；不得使用 `dangerouslySetInnerHTML`。链接只允许指向 Project 内相对路径或由客户端提供的安全外部链接策略（技术方案，待实现确认）。Project 内相对路径由用户点击后在 Files 中定位：目录展开，文件选中；属于用户主动打开工具，不由 Agent 触发（[原型 v03](../../.agents/archive/tasks/T20261011-prototype-v03/task.md) Q3，2026-10-11 确认；UX 第 5 节）。
3. `bindings` 使用受限路径读取数据，不执行 JavaScript 表达式；绑定缺失显示组件级空状态，不使整个 Preview 崩溃。
4. `diagram` 接收节点 / 边和布局方向，由 Renderer 计算布局；Agent 不提供 SVG 坐标或可执行绘图代码。关系图宽于 Preview 时在图内横向滚动，不自动缩小，避免节点文字过小（[原型 v03](../../.agents/archive/tasks/T20261011-prototype-v03/task.md) Q2，2026-10-11 确认）。
5. Overview 的客户端 Session 区块使用独立 React 组件插槽，不进入 Agent 可编辑的 `root`，避免把 Session 标题、Needs Input 内容交给 View Definition 控制。

### 4.3 Preview 状态

| 状态 | 进入条件 | UI 行为 |
|---|---|---|
| `empty` | Knowledge 缺失、为空或没有可渲染内容 | 空状态 + “生成 <View 名称>”入口；不自动发起 Session |
| `loading` | 首次读取或正在刷新，且没有上一版成功快照 | 读取超过 200 ms 才在 Preview 内显示骨架，之前不显示内容，避免快速读取时闪烁（[原型 v03](../../.agents/archive/tasks/T20261011-prototype-v03/task.md) Q6，2026-10-11 确认）；保留 Conversation |
| `ready` | Knowledge 与 Definition 校验通过且 Renderer 成功 | 显示只读 View 和最近更新时间 |
| `stale` | 正在刷新但已有上一版成功快照 | 继续显示上一版，可显示轻量“更新中”标记；不改变布局 |
| `error` | 稳定读取、Schema、绑定或 Renderer 失败 | 保留上一版成功 View；若无上一版显示错误空状态和可复制摘要 |

`error` 不改变 Session 状态、不产生隐藏对话、不清除用户输入。下一次成功快照到达后自动回到 `ready`；错误详情应避免包含完整 Knowledge 内容或敏感 Session 文本。

### 4.4 View Context

| 字段 | 类型 | 说明 |
|---|---|---|
| `originViewId` | `string \| null` | Session 创建时的 View 来源；移除标签后仍保留 |
| `viewContextAttached` | `boolean` | 首条消息是否附加 View Context；只在首条创建请求有效 |
| `viewContextPaths` | `string[]` | 由主进程解析的 Project 内相对路径，供生成文本块和诊断使用 |
| `viewContextText` | `string` | 主进程按固定英文模板生成的独立文本块；不持久化到 Knowledge |

模板只包含：

```text
Current Workbench: <view title>
Relevant files: <relative paths>
Rules: update the relevant Knowledge and View Definition files when the user asks to change this view; keep facts separate from presentation; do not add executable HTML or scripts.
```

`<view title>` 取页面包清单的标题，预设为中文名称（如 `Current Workbench: 架构`，见 [navigation NAV-Q13](../navigation/spec.md#12-已确认)）；模板其余部分保持英文。实际发送时模板文本由 Session / Adapter 组装，Renderer 不自行拼接、转义或决定 CLI 分支。对话记录保存 `view_context_attached` 与 `view_context_paths` 的可折叠元数据和用户文本；不复制完整模板或 Knowledge 内容进 transcript（PV-Q11，2026-10-11 确认）。

## 5. 接口与事件

### 5.1 Main Service

公共服务由[工作台规格 §9.7](../workbench/spec.md#97-预设与自定义工作台统一宿主)负责。预设的 Knowledge 资源服务 负责真实路径、文件读取、Schema 与绑定校验、稳定读取、快照版本、last-good 和文件监视。Renderer 不直接访问 `fs`、Shell 或 Project 目录。

### 5.2 IPC 契约

预设内容通过统一 `workbench` typed IPC 的目录、快照、上下文和事件使用，不再公开独立 `projectView` IPC。具体模型及事件由工作台规格 §9.7 维护。

不提供“生成 View”或“写入 Knowledge”的 IPC；生成与修改仍通过普通 Session。若后续需要手动刷新，应先补充 FR 和 UX 决定，不能在本规格隐式加入按钮。

### 5.3 Renderer Store 与组件

统一工作台 store 与 integration 负责缓存、版本去重、订阅、会话及项目关闭清理，契约见工作台规格 §9.7。预设标准网页包包含内容渲染、错误回退、空态生成按钮及样式。Overview 通过公共 SDK 获取最小 Session 摘要，并在 iframe 内渲染分组和打开入口。父 Renderer 不再提供预设内容组件。

### 5.4 Session 接缝

1. 从 View 草稿发送时，Renderer 把 `originViewId`、`viewContextAttached` 和已有 `contextItems` 传给 Session store；Session 创建 DTO 由 `CreateSessionRequest` 扩展相应可选字段（技术方案，待实现确认）。
2. Session 主进程在创建前向 `WorkbenchService.buildContext` 取模板；若标记为 false 或 View 已失效，则不附加文本，但仍保存 `originViewId`。
3. Adapter 接收统一的“View Context 文本块 + 用户文本”输入；Codex / Claude 的差异不暴露给 Renderer。首条消息完成后，服务将附加状态记录到 transcript 元数据，后续轮次不重复注入。
4. Session 回合结束事件通知统一 `WorkbenchService` 补扫；Project 窗口聚焦事件也触发补扫。补扫失败不改变 Session 的成功 / Error 终态。

### 5.5 Project / Navigation 接缝

Project、Navigation、Session 和 Input 统一通过[工作台宿主](../workbench/spec.md#97-预设与自定义工作台统一宿主)访问目录、快照、上下文与生命周期。Knowledge runtime 只提供内部内容贡献，不向这些模块公开另一套接口。Shell 的布局持久化、Session 状态和通用输入仍由各自模块负责。

## 6. 实现计划与落地记录

本节保留 2026-10-11 实现及验证基线，其中独立服务和 IPC 已由[统一任务](../../.agents/archive/tasks/T20261111-unified-workbench/task.md)迁入工作台宿主；当前契约以 §5 及工作台规格为准。

本节列出实现阶段；模拟验证不等于真实 AC-06 或人工验收通过。

### 2026-10-11 技术落地

由 Main Agent 在本规格授权范围内决定，代码与本次 diff 一起审阅，不标为人工确认：

- 内置定义及可读 JSON Schema 位于 `apps/desktop/src/shared/project-view/resources/`；`schema.ts` 执行严格字段、版本、绑定、相对路径与大小/深度校验。项目 Schema 副本不参与信任判断。绑定语法为 `data.field.subfield`；组件字段为 `type / bind / props / children`，不支持表达式。
- 每个项目根目录监视 `.ai-studio` 创建，目录存在后递归监视该目录；100ms 合并事件和稳定读取，最多三次尝试。Project 关闭取消发布并释放 watcher；目录移动/不可读只形成局部 Preview 错误。焦点与回合终态补扫不影响 Session 终态。
- realpath 边界检查叠加符号链接组件拒绝、文件描述符 `O_NOFOLLOW`、有界读取；初始化客户端辅助文件前检查目标，并拒绝硬链接写入。Knowledge / Definition 不由客户端创建或修复。
- 组件树与单图节点上限均为 500；图超限报错，不截断。Diagram 接受 `nodes: [{id,name,path?}]` 与 `edges: [{from,to,label?}]`，坐标由 Renderer 计算。所有文本均为 React 文本，不发网络请求。
- `getSnapshot` 与两个事件均返回带 revision 的 `ViewState`（status、snapshot、error），snapshot 为完整声明式数据。IPC 错误不带原始 JSON/绝对路径。
- View 草稿扩展普通 `new_chat` 键的可选 `viewId`，按项目/View 独立持久化；首条附加状态和路径存入已有 Session/Transcript JSON，无数据库迁移。英文模板仅存在发送时内存，后续轮次与恢复不重复注入。
- Preview 暂用可访问的 − / 比例重置 / + 控件实现 50%～200% 缩放；比例只存运行期，手势与高保真视觉仍按 PV-Q9。Overview Session 摘要独立于 Renderer；`lastOutcome` 元数据使已读的最近完成 Session 仍可展示。

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
3. 多步写入的中间错误保留 last-good；只有稳定读取后仍失败才通过统一工作台事件发布错误快照。

### 阶段 3 的安全约束

1. 网页包解释 Knowledge 与 Definition 时使用受信组件映射和文本节点，不把数据作为可执行 HTML、表达式或脚本。
2. Preview 不拥有 Node.js、文件系统、Shell、凭据或任意 IPC 能力；Renderer 只接收已经校验的 DTO。
3. 预设和自定义页面使用[统一网页包协议](../workbench/spec.md#97-预设与自定义工作台统一宿主)，宿主不保留另一套原生页面渲染入口。

## 7. 验证清单

| 场景 | 预期 | 依据 |
|---|---|---|
| 新 Project 无 Knowledge 进入 Overview | 显示空状态和生成入口；不创建 Session；客户端 Session 区块可显示 | FR-VIEW-003；AC-06；D-06 |
| Architecture 中发送“重新整理支付模块架构” | 使用普通 CLI Session；左右布局保留；Agent 修改文件后 Preview 自动刷新 | FR-VIEW-005～008；AC-06 |
| Agent 写入半个 JSON | 保留上一版成功 View，稳定读取后再尝试；不崩溃、不清空 Conversation | DEC-07 |
| View Definition 含脚本、HTML 或未知组件 | 对应 View error；保留 last-good；不执行内容 | DEC-05；04 第 3 节 |
| View Context 标签被移除 | 首条消息不附加 View Context；Session 仍记录 `originViewId` | DEC-06；FR-VIEW-007 |
| 两个 Project 同时更新 | Renderer 按 `projectId:viewId` 隔离；切 Tab 不显示另一项目的 Preview 或 Session | FR-PROJ-002；AC-01 |
| View Session 在后台完成 | 左侧 View 对话仍是普通 Session；提醒与清除遵循 Session spec，不由 Preview 改写 | D-05；FR-STATE-004～005 |
| 客户端 / Agent 写入 `.ai-studio/` 外部 symlink | 拒绝载入；错误只影响该 View | 04 第 3 节；本 spec §3.4.1 |
