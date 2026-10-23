# Navigation

## 文档信息

| 项目 | 内容 |
|---|---|
| 模块 | `navigation` |
| 文档状态 | 草稿 |
| 覆盖需求 | FR-NAV-001～FR-NAV-003 |
| 相关验收 | AC-01（Project 间导航内容独立）、AC-04 / AC-05（点击 Session 后的清除与定位，状态规则归 session）、AC-06（进入 View）；05 第 4 节专项：Rename、大量 Session 性能 |
| 相关设计 | [Shell Spec v01](../../design/components/shell-spec-v01.md) 第 3、4、5、10、11 节；[线框图 v02](../../design/wireframes/README.md)；[Visual Direction](../../design/visual-direction.md) |
| 来源 | 02 第 2 节 左侧导航；03 第 2、3、6、7、8、10 节；04 第 6、7 节；2026-10-09 起草，尚无对话确认 |

## 1. 问题记录

### 1.1 未决问题

2026-10-09 参考应用复核见 [Session research](../../tasks/archive/T20261009-session-slice/research.md)；推荐仍为草稿，已确认回答保持原样。

“阻塞”指：未回答前，对应部分不应开始实现；“否”表示可按建议答案先实现，回答不同再调整。以下均无阻塞项，但 NAV-Q4、NAV-Q5 建议在实现 Rename 与 View 导航前确认。

| 编号 | 问题 | 建议答案与依据 | 阻塞实现 | 回答（确认日期） |
|---|---|---|---|---|
| NAV-Q1 | “过去 7 天”分组的起止：与“今天”“昨天”相邻时，是指前天起算 7 天、还是自今天起往前 7 个日历日（与前两组重叠部分归前两组）？ | 本地日历日 D−7 到 D−2（含），即 `T(D−7) ≤ t < T(D−1)`，与“昨天”“今天”无缝衔接、互不重叠。依据：FR-NAV-003 给出组名，具体边界是本项目建议；参考应用的精确边界未由官方资料证实（见本轮 research） | 否 | |
| NAV-Q2 | Rename 输入框失焦时是确认还是取消？输入为空或全空白时如何处理？ | 失焦视同确认；去除首尾空白后为空则视同取消（保留原标题，不报错）。依据：FR-NAV-003 / Shell 第 4 节只规定 Enter 确认、Esc 取消；此建议避免点击其他列表项时丢失输入。参考应用失焦行为未由官方资料证实（见本轮 research） | 否 | |
| NAV-Q3 | Rename 的标题长度上限是多少？ | 最多 100 个字符，输入时限制，粘贴时截断，列表中单行省略显示。依据：文档无规定；100 足以描述一次对话，同时避免数据与布局问题。具体数值由人确认 | 否 | |
| NAV-Q5 | 已处于某个 View 的 Project View Mode 时，再次点击导航中同一个 View 的行为：忽略，还是回到新草稿 / 回到 Preview？ | 忽略（不改变左列当前对话与右侧区域）。依据：P-A 的“新草稿”限定为“进入 View”；左列顶栏已提供“新建对话”按钮（Shell 第 8 节），无需用导航承担该功能；避免意外丢弃草稿 | 否 | |
| NAV-Q6 | Session Mode 下停留在 New Chat 草稿时，导航是否有条目高亮（例如 New Chat 按钮呈 Selected）？ | 无任何条目高亮，New Chat 按钮也不呈 Selected。依据：03 第 8 节与 Shell 第 4 节只规定 Session 项与 View 项的 Selected；New Chat 按钮的状态仅列 Default / Hover / Focus | 否 | |
| NAV-Q7 | 自定义 View 加入后（FR-VIEW-002，P1），Project Views 区域过高时如何处理：独立滚动、限制高度、折叠？ | V1 首发只有五项，不设计该情形；P1 实现时再定，建议 Project Views 区域设最大高度并内部滚动，保证 SESSIONS 区域始终可见。依据：FR-VIEW-002 为 P1；03 第 8 节要求 Session History 可持续增长 | 否 | |
| NAV-Q8 | 折叠后顶栏的 New Chat 按钮、以及空状态中的 New Chat 按钮，是否也带 CLI 下拉？ | 都只是单个按钮，使用 Default CLI，不带下拉；需要选其他 CLI 时展开导航，用顶部分裂按钮。依据：Shell 第 3 节顶栏写“New Chat 按钮”，第 4 节导航写“分裂按钮”，第 10 节空状态写“New Chat”，措辞不同；FR-CHAT-002 只要求提供扩展入口。该决定由 `specs/chat/` 最终确认 | 否 | |
| NAV-Q9 | V1 没有删除或归档 Session 的入口，列表只增不减，是否符合预期？ | 符合，V1 不提供。依据：02 与 03 均未定义删除 / 归档；“不添加文档之外的需求”；04 第 7 节要求大量历史 Session 不卡顿，说明按只增长设计 | 否 | |
| NAV-Q10 | 左侧导航的折叠状态是否随应用重启保留？ | 保留（与窗口级状态一起保存）。依据：03 第 8 节称之为“窗口级偏好”，偏好通常持久；与 `specs/project/spec.md` PROJ-Q1 一并确认 | 否 | |
| NAV-Q11 | 导航是否需要键盘快捷键（折叠 / 展开、New Chat、在 Session 间移动、触发 Rename）？ | V1 只保证 3.5 的键盘可达（Tab、方向键、Enter、Esc），不规定全局快捷键；若需要，建议 `⌘B` 折叠、`⌘N` 新建对话（New Chat）。依据：文档仅规定焦点环（Shell 第 11 节）；快捷键属新增需求，需人确认 | 否 | |
| NAV-Q12 | “大量历史 Session”的验收规模是多少？ | 以单个 Project 2,000 条 Session 为性能测试规模：滚动不掉帧、Tab 切换即时、单个状态变化不重排。依据：04 第 7 节与 05 第 4 节只说“大量”，没有数值，测试需要一个目标 | 否 | |
| NAV-Q13 | 界面文案语言：Shell 示例使用中文文案（“今天”“还没有对话”）并保留英文产品名（New Chat、PROJECT VIEWS），V1 是否仅提供中文文案？ | 是，沿用 Shell 的混合写法，字符串集中定义以便日后本地化。依据：Shell 第 4、10 节、03 第 8 节；文档没有语言策略 | 否 | |

### 1.2 已确认

| 编号 | 问题 | 建议答案与依据 | 阻塞实现 | 回答（确认日期） |
|---|---|---|---|---|
| NAV-Q4 | FR-NAV-003 属 P0 并要求支持 Rename，但 02 第 6 节 MVP 范围表把“Session / Rename”标为 P1，两处优先级不一致，Rename 是否纳入 session-slice 的首个交付？ | 纳入。依据：`tasks/archive/T20261009-session-slice/task.md` 已把 Rename 列入范围（FR-NAV-003；D-12）；实现量小，且 05 第 4 节把 Rename 列入专项测试。若判定为 P1，则首个交付可延后 3.3.6，其余不受影响。需要在 02 中统一优先级 | 否 | Rename 为 P0，纳入 session-slice；02 第 6 节 MVP 表同步改为 P0（2026-10-09 确认） |

## 2. 职责与边界

- 负责：
  - 左侧导航的区域划分、New Chat 的位置、分隔线（FR-NAV-001）。
  - Project Views 列表的呈现、点击后切换 Main Canvas 到 Project View Mode 的导航契约、高亮规则（FR-NAV-002）。
  - Session History 的呈现：日期分组、排序、列表项结构、Rename 的原位编辑、滚动与性能、空状态、选中规则（FR-NAV-003）。
  - 左侧导航的折叠与展开、折叠时顶栏保留的按钮、展开按钮上的注意力点（03 第 8 节；D-14）。
  - 导航内的键盘焦点与 Hover / Selected / Focus / Disabled 状态（Shell 第 11 节）。
- 不负责：
  - New Chat 的草稿、Default CLI 取值与设置、CLI 下拉菜单内容、不可用 CLI 的说明 → `specs/chat/spec.md`（本 spec 只规定按钮放在哪里）。
  - Session 状态的含义、来源、优先级与清除规则；Session 标题的来源（CLI 原生名称或客户端生成）；Rename 的持久化 → `specs/session/spec.md`。
  - Project View 的内容、Conversation 列、最近对话块、Preview → `specs/project-view/spec.md`（后续 task）。
  - Tab 条、窗口尺寸与压缩顺序、状态保存 → `specs/project/spec.md`。导航宽度 248 与折叠后为 0 引用其 3.4 节。
  - 色值、字体、图标、圆角（Visual Direction 第 1 节）。
- V1 范围外（文档未要求，本 spec 不设计）：Session 搜索 / 过滤、删除 / 归档 Session（NAV-Q9）、拖拽排序、导航宽度拖拽、右键菜单、跨 Project 的统一列表（01 第 4 节）。

## 3. 行为细则

本节 3.1～3.3 依次对应 FR-NAV-001～003，3.4 为折叠，3.5 为键盘与交互状态。

### FR-NAV-001 导航区域划分

宽度 248，固定（Shell 第 2.2 节）。自上而下：

| 序 | 区域 | 尺寸 | 说明 | 来源 |
|---|---|---|---|---|
| 1 | New Chat 分裂按钮 | 高 36 | 位于导航顶部。主区：图标 + “New Chat”，使用 Default CLI；右区：▾ 打开 CLI 菜单。按钮行为、菜单内容归 `specs/chat/` | 03 第 6、8 节；D-11；Shell 第 4 节 |
| 2 | 区域标题“PROJECT VIEWS” | 高 28 | 小号大写 | Shell 第 4 节 |
| 3 | Project Views 列表 | 每项高 32 | 默认五项，见 FR-NAV-002 | FR-NAV-001 |
| 4 | 分隔线 | — | 清晰但低视觉噪音（FR-NAV-001）；具体线宽与色值在高保真阶段确定 | FR-NAV-001 |
| 5 | 区域标题“SESSIONS” | 高 28 | 小号大写 | Shell 第 4 节 |
| 6 | Session History | 占满剩余高度 | 见 FR-NAV-003 | FR-NAV-001 |

规则：

1. 两个区域用分隔线明确划分，上部为 Project Views，下部为 Session History（FR-NAV-001）；New Chat 位于导航顶部，其下依次是 Project Views 与 Session History（03 第 8 节）。
2. 只有 Session History 区域滚动；New Chat 与 Project Views 区域固定在上方，不随列表滚动（提案，与 03 第 8 节“Session History 可持续增长”一致）。Project Views 增加自定义 View（FR-VIEW-002，P1）后的区域高度策略见 NAV-Q7。
3. 导航内容属于**当前 Project**：切换 Tab 时 Project Views 与 Session History 同时切换为该 Project 的内容，列表与高亮互不混淆（FR-PROJ-002；AC-01）。导航所需的数据按 `project_id` 取用，不使用全局“当前列表”（技术方案，待实现确认）。
4. 宽度稳定：展开状态下始终为 248，不随内容、窗口宽度变化（03 第 8 节“宽度稳定”；Shell 第 2.2 节）。
5. 启动页 Tab 激活时没有当前 Project，导航不显示内容；相关按钮的呈现见 `specs/project/spec.md` 3.2.5 与 PROJ-Q2。

### FR-NAV-002 Project View Navigation

#### 3.2.1 列表

默认显示五项，顺序固定，名称使用 FR-NAV-002 的英文名：

1. Overview
2. Progress
3. Architecture
4. Agent Team
5. Business Flow

每项：图标 + 名称，高 32；状态 Default / Hover / Selected / Focus（Shell 第 4 节）。图标采用交互原型 v01。五项在任何 Project 中始终显示，不会因 Knowledge 为空而隐藏或禁用（FR-VIEW-003：Knowledge 为空时 Preview 显示空状态，由 project-view 处理）。

#### 3.2.2 点击 View 的导航契约

点击某个 View，导航保证（细节行为归 `specs/project-view/`）：

1. Main Canvas 切换为 Project View Mode：左 Conversation、右 Preview（FR-NAV-002；FR-VIEW-005；03 第 6 节“Project View 打开”）。
2. **不创建 Session**：进入 View 本身不产生 Session，也不进入 Session History（D-01；FR-VIEW-007）。
3. 左侧 Conversation 为**新对话草稿**；草稿的底部输入框上方列出该 View 最近的对话，无记录时不显示区块（Shell v02 第 8 节：最近 3 条；DEC-23，2026-10-23 确认）；这一规则只适用于“从左侧导航进入 View”，即使刚才在同一 View 中打开过某个对话（P-A；D-15）。同一 View 被再次点击的情形见 NAV-Q5。
4. 右侧区域显示该 View 的 Preview（不沿用 Session Mode 下已展开的工具），见 `specs/project/spec.md` PROJ-Q3。
5. 当前 View 作为 Session Context 的一部分（03 第 6 节；FR-VIEW-007，注入方式归 project-view / input）。
6. 导航在上述动作完成后，才把 `ui_state.main_canvas` 更新为 `view` 分支（`specs/project/spec.md` 4.2），保证重启后恢复。
7. 从其他 Tab 切回时不走本契约，而是按 D-15 原样恢复（`specs/project/spec.md` 3.3.2）。

#### 3.2.3 高亮规则

任一时刻，整个导航（Project Views 与 Session History 合计）最多一个条目处于 Selected：

| Main Canvas 当前内容 | 高亮的条目 | 来源 |
|---|---|---|
| Session Mode：某个 Session 的 Conversation | 该 Session 项；没有 View 高亮 | 03 第 8 节 |
| New Chat 草稿（Session Mode 下） | 没有条目高亮（NAV-Q6） | — |
| Project View Mode（含左列显示草稿或某个 Session） | **只**高亮当前 View；左列所用 Session **不在** Session History 中高亮 | 03 第 8 节；Shell 第 4 节 |
| 启动页 Tab | 无 | — |

- 在 View Mode 中点击 Session History 的某个 Session：切换为 Session Mode 并高亮该 Session，View 高亮消失（D-02：在 View 中创建的 Session 从 Session History 打开时进入 Conversation Mode，顶栏的“在 View 中打开”由 session / project-view 提供）。
- 高亮仅反映 Main Canvas 当前内容，与键盘焦点无关；Focus 环与 Selected 可同时出现在同一项上。

### FR-NAV-003 Session History

#### 3.3.1 内容范围

- 列出当前 Project 的所有 Session（01 第 8 节原则 17）。新 Session 自动加入历史记录，包括在 Project View 中创建的 Session（FR-NAV-003；FR-VIEW-007）。
- 未发送任何消息的草稿不是 Session，不出现在列表（FR-CHAT-001）。
- Session 无状态时不显示任何状态标识，不显示 Idle（FR-STATE-006）。
- V1 不提供删除、归档（NAV-Q9）。

#### 3.3.2 日期分组

分组依据是 Session 的 `last_user_message_at`（04 第 6 节；FR-NAV-003）。分组标题固定为：今天 / 昨天 / 过去 7 天 / 更早（03 第 8 节），高 24（Shell 第 4 节），按此顺序自上而下排列。

边界按**用户本地时区的日历日**计算，不按滚动 24 小时。记 D 为本地今天的日期，`T(d)` 为日期 d 的本地 00:00：

| 分组 | 条件 |
|---|---|
| 今天 | `last_user_message_at ≥ T(D)`，包含晚于当前时间的值（如时钟回拨后） |
| 昨天 | `T(D−1) ≤ t < T(D)` |
| 过去 7 天 | `T(D−7) ≤ t < T(D−1)`，即前天及更早到 7 天前的那天（提案，NAV-Q1） |
| 更早 | `t < T(D−7)` |

- 没有 Session 的分组不显示标题。
- 日期运算按日历日（含夏令时切换日），不以 24 × 3600 秒折算（技术方案，待实现确认）。
- 本地午夜、系统从睡眠唤醒、系统时区或时钟变化时，重新计算分组；应用保持打开跨过午夜时，原“今天”的条目移入“昨天”无需用户操作（技术方案，待实现确认）。
- 分组标题不可点击、不可折叠，不设吸顶效果（提案；吸顶会增加虚拟列表复杂度，V1 无要求）。

#### 3.3.3 排序

1. 组内按 `last_user_message_at` 倒序（FR-NAV-003；D-12）。
2. `last_user_message_at` 相同时，按 `created_at` 倒序，再按 `id` 稳定排序（技术方案，待实现确认）。
3. **Agent 输出、状态变化、Rename、被查看均不改变排序**，避免并行 Session 在列表中跳动（FR-NAV-003）。只有用户发送消息才更新 `last_user_message_at`，使该 Session 移到“今天”组的顶部；这个字段只由 session 模块在用户发送时写入（5.1）。
4. 排序与分组由渲染端对 session 模块提供的摘要计算（技术方案，待实现确认）。

#### 3.3.4 列表项

高 32（Shell 第 4 节）。从左到右：CLI 标识 → 标题 → 悬停时的 ⋯ → 状态（P-D；03 第 8 节）。

| 部分 | 规则 | 来源 |
|---|---|---|
| CLI 标识 | 约 18×14，等宽小字，Codex 为 `CX`，Claude Code 为 `CC`，1px 描边，单色（不使用状态色） | P-D；Shell 第 4 节 |
| 标题 | 单行，超出尾部省略；选中字重见 [Shell Spec v02](../../design/components/shell-spec-v02.md) 第 11 节 | Shell Spec v02 第 4、11 节（2026-10-11 确认） |
| ⋯ | 仅在悬停或键盘聚焦该项、或菜单打开时显示，位于状态左侧 | FR-NAV-003；Shell 第 4 节 |
| 状态 | 右侧一个状态指示；形态与尺寸见下表；无状态时留空，不绘制任何元素 | P-D；Shell 第 5 节 |

状态指示形态（含义、触发与清除归 `specs/session/`，导航只负责呈现 session 模块给出的单一状态值）：

| 状态值 | 形态 | 尺寸 |
|---|---|---|
| `running` | 中性色 Spinner | 11 |
| `needs_input` | 橙色圆点 | 7 |
| `error` | 红色圆点 | 7 |
| `completed_unread` | 绿色圆点 | 7 |
| 无 | 无 | — |

规则：

1. 一个列表项同一时刻只显示一个状态；当多种条件同时成立时显示哪一个，由 session 模块给出（本模块只接收单一值）。
2. 状态点不得影响标题阅读（03 第 8 节）：状态位始终预留固定宽度，状态出现与消失时标题不发生位移（提案）。
3. Hover 不改变尺寸与布局（Shell 第 11 节）：⋯ 叠加在标题末端，不挤压标题，不引起重排（提案）。
4. 颜色之外应提供可访问名称，以免只靠颜色传达状态：列表项的可访问名称包含 CLI 名称、标题与状态文字（技术方案，待实现确认）。
5. 悬停标题时提示完整标题文本，用于查看被截断的内容（提案）。
6. CLI 标识的可访问名称为“Codex”或“Claude Code”（技术方案，待实现确认）。

#### 3.3.5 标题

- 标题优先使用 CLI 原生 Session Name；CLI 不提供时由客户端生成；用户 Rename 后使用用户设置的名称（FR-NAV-003）。来源优先级与更新时机归 `specs/session/`，导航始终显示 session 模块给出的 `title`。
- 标题为空或尚未生成时，导航显示占位文案“未命名对话”（提案），不显示空白行。
- 同一 Session 的标题在 Session History、Conversation 顶栏、Overview 的 Recent Sessions、Project View 的最近对话块中应一致，均来自同一个字段，Rename 后全部同步。

#### 3.3.6 Rename

入口与表现来自 FR-NAV-003、D-12、Shell 第 4 节：悬停列表项显示 ⋯，菜单 V1 仅含 Rename，点击后标题**原位**变为输入框。

| 步骤 | 规则 |
|---|---|
| 打开菜单 | 点击 ⋯ 打开菜单（宽 160，仅一项 Rename）；Esc 或点击菜单外关闭 |
| 进入编辑 | 点击 Rename：菜单关闭，该项进入 Renaming 状态；标题位置变为单行输入框，内容为当前标题并全选，焦点在输入框；CLI 标识与状态点保持显示，⋯ 隐藏 |
| 确认 | Enter 确认（Shell 第 4 节） |
| 取消 | Esc 取消，恢复原标题（Shell 第 4 节） |
| 失焦 | 视同确认，见 NAV-Q2 |
| 空 / 全空白 | 去除首尾空白后为空：视同取消，保留原标题，不报错（NAV-Q2） |
| 未变化 | 去除首尾空白后与原标题相同：不触发保存 |
| 长度 | 输入框限制最多 100 个字符（NAV-Q3）；粘贴超长内容时截断；换行符在粘贴时替换为空格，输入框始终单行 |
| 保存 | 确认后调用 `renameSession`（5.1）；界面立即显示新标题，保存失败时恢复原标题并给出轻量提示（提案） |

附加规则：

1. 同一时刻只有一个项处于 Renaming；在另一项上开始 Rename，或点击其他列表项、View 项、切换 Tab，都会使当前编辑按失焦规则结束。
2. 输入框内的点击、双击和键盘操作不触发“打开 Session”，也不触发列表的方向键导航。
3. 编辑期间该项的状态点仍然实时更新；Session 在编辑期间被其他操作改变（如状态变化）不中断编辑。
4. Rename 不改变排序、分组、状态与选中（3.3.3）。
5. 任意状态的 Session（含 Running）都允许 Rename：Rename 只修改应用内的标题（是否同步写回 CLI 原生名称归 `specs/session/`）。
6. 优先级：02 第 6 节把 Rename 标为 P1，而 FR-NAV-003（P0）的要求列表包含 Rename（NAV-Q4）。

#### 3.3.7 滚动与大量 Session

规则来自 FR-NAV-003“Session 数量持续增长、列表支持滚动”和 04 第 7 节“大量历史 Session 不应导致左侧列表明显卡顿”。

1. Session History 区域独立纵向滚动（2.1 第 2 条）。滚动条的呈现在高保真阶段确定。
2. 列表使用虚拟化渲染：只渲染可视区加缓冲区内的行；分组标题（高 24）与列表项（高 32）高度固定，便于快速计算位置（技术方案，待实现确认）。
3. 渲染端只接收列表所需的摘要（见 5.1），不加载 Conversation 内容；摘要集合一次载入，增量更新（技术方案，待实现确认）。
4. 单个 Session 状态变化（尤其 Running 期间的频繁更新）只重绘该行，不重排或重绘整个列表（技术方案，待实现确认）。
5. 新 Session 出现在“今天”组顶部。用户已向下滚动查看旧条目时，列表保持当前可视内容不跳动（滚动锚定）；用户自己创建的 Session 因被选中而滚入视野（技术方案，待实现确认；对应 NAV-Q12 的验收规模）。
6. 选中的 Session 不在可视区内时（如恢复状态、从“在 View 中打开”返回），列表滚动到使其可见（提案）。
7. 切换 Tab 后返回，列表滚动位置保持（运行期内存态，D-15；`specs/project/spec.md` PROJ-Q12）；应用重启后不保证。
8. 性能验收规模见 NAV-Q12。

#### 3.3.8 空状态

当前 Project 没有任何 Session 时（Shell 第 10 节）：

- “SESSIONS”区域标题保留；列表区域显示“还没有对话”和一个 New Chat 按钮；不显示日期分组标题（提案：标题保留，列表区居中放置文案与按钮）。
- 按钮的行为同顶部 New Chat 的主区，使用 Default CLI（NAV-Q8）。
- 第一个 Session 创建成功后，空状态立即被分组列表取代。草稿本身不使列表变为非空（FR-CHAT-001）。

#### 3.3.9 选中规则

1. 点击列表项：Main Canvas 切换为 Conversation Mode，显示该 Session 的最底部，输入区可立即输入（03 第 6 节“Session 打开”）；从 View Mode 点击亦然（3.2.3）。Completed Unread 与 Error 的清除由 session 模块依据导航提供的查看信号执行（5.2），导航本身不判断也不修改状态。
2. 点击当前已选中的 Session 项：仍触发 `openSession` 和“用户打开 S”信号，定位到最新位置，由 session 模块清除 Completed Unread / Error；Needs Input 不因查看清除。窗口恢复前台本身不触发此信号（session spec §3.11；S-Q1（c），2026-10-09 确认）。
3. 在 Session Mode 的草稿中发送第一条消息，新 Session 创建后被选中，Main Canvas 转为该 Session 的 Conversation（FR-CHAT-001）。在 Project View 的左列发送则不切换模式，新 Session 出现在列表的“今天”组顶部但**不高亮**（3.2.3）。
4. 选中的项因午夜或用户发送消息而移到其他分组或位置时，选中保持不变。
5. 选中状态由 `ui_state.main_canvas` 推导，不单独保存（`specs/project/spec.md` 4.2）。

### 3.4 左侧导航折叠

规则来自 03 第 3、8 节与 D-14，尺寸来自 Shell 第 3 节：

1. **按钮位置**：折叠 / 展开按钮位于顶栏左侧、窗口控制区之后（macOS 为交通灯之后），尺寸 30×28，侧栏图标；展开与折叠使用同一个按钮、同一位置。状态 Default / Hover / Focus。
2. **折叠**：点击后左侧导航完全隐藏，宽度变为 0；Main Canvas 获得空间，已保存的右侧边栏宽度与 Conversation 列宽度不变，Main Canvas 的伸缩与压缩遵循 `specs/project/spec.md` 3.4。
3. **折叠后顶栏保留**：展开按钮，其右侧紧邻 New Chat 按钮，然后是 Project Tabs（Shell 第 3 节）。New Chat 按钮的行为同导航中的主区，使用 Default CLI；是否带 CLI 下拉见 NAV-Q8。
4. **展开**：点击展开按钮恢复 248 宽度，列表滚动位置与高亮保持。展开会占用 Main Canvas 宽度，窗口宽度不足时按 `specs/project/spec.md` 3.4.2 压缩右侧区域，不会自动关闭右侧边栏。
5. **注意力点**：仅在**折叠**状态下，当前 Project 存在 Needs Input、Error 或 Completed Unread 的 Session 时，展开按钮右上角显示一个 7px 的点；优先级为 Needs Input > Error > Completed Unread，与 Tab 注意力点相同，不显示数量与 Running（03 第 8 节；Shell 第 3、5 节）。
   - 数据来自 session 模块的 `getProjectAttention(current_project_id)`（5.1），导航只订阅并渲染。
   - 只反映**当前** Project；其他 Project 的状态在各自 Tab 的点上显示（`specs/project/spec.md` 3.2.3）。
   - 展开状态不显示该点，相关状态已在 Session History 中可见。
6. **偏好范围**：折叠状态是窗口级偏好，切换 Project 时保持不变（D-14），不属于任何 Project 的 `ui_state`。是否随应用重启保留见 NAV-Q10。
7. 折叠时仍然能打开 New Chat；要切换 Project View 或 Session 需先展开（03 第 8 节“折叠后导航完全隐藏”）。折叠期间 Project View Mode 的选中 View 与 Session 的选中状态保持，展开后仍然高亮。
8. 键盘焦点在导航内时折叠，焦点移到展开按钮（技术方案，待实现确认）。
9. 折叠 / 展开的动画：文档未规定，V1 不要求动画；若实现，不得造成内容重排闪烁（提案）。

### 3.5 键盘焦点与交互状态

状态规则来自 Shell 第 11 节，对左侧导航中的所有可交互元素统一适用：

| 状态 | 规则 |
|---|---|
| Hover | 背景轻微加深，不改变尺寸与布局 |
| Selected | 背景与字重见 [Shell Spec v02](../../design/components/shell-spec-v02.md) 第 11 节；字重变化不得使文字位置跳动（提案） |
| Focus | 键盘导航时显示 2px 焦点环；鼠标点击不触发焦点环（技术方案，待实现确认：`:focus-visible`） |
| Disabled | 降低对比度，并通过提示或说明文字给出原因 |

各元素支持的状态（Shell 第 4 节）：

| 元素 | 状态 |
|---|---|
| New Chat 分裂按钮 | Default / Hover / Focus（不可用 CLI 的 Disabled 呈现归 chat） |
| Project View 项 | Default / Hover / Selected / Focus |
| Session 项 | Default / Hover / Selected / Focus / Renaming |
| ⋯ 菜单项 | Default / Hover |
| 折叠 / 展开按钮 | Default / Hover / Focus |

键盘操作（文档只规定焦点环，下列为让键盘可达的提案与技术方案，快捷键见 NAV-Q11）：

1. Tab 键顺序：顶栏按钮 → New Chat 主区 → ▾ → Project Views 列表（单一 Tab 停靠点）→ Session History（单一 Tab 停靠点）；列表内用上 / 下方向键在条目间移动，Home / End 跳到首 / 末，Enter 或 Space 打开（技术方案，待实现确认：roving tabindex）。
2. 聚焦某个 Session 项时，可通过键盘到达 ⋯ 并打开菜单（提案：右方向键移动到 ⋯，Enter 打开菜单）。
3. 菜单打开后焦点在 Rename，Esc 关闭并回到该项；Rename 编辑中遵循 3.3.6 的 Enter / Esc。
4. 当前选中项以 `aria-current` 标识；分组标题以标题语义标识，不进入方向键序列（技术方案，待实现确认）。

## 4. 状态与数据

### 4.1 导航使用的数据

导航不拥有业务数据，只持有视图模型：

| 数据 | 来源 | 说明 |
|---|---|---|
| Project Views 列表 | project-view 模块（`specs/project-view/`）；V1 默认五项为内置，顺序固定 | 对应 04 第 6 节 ProjectView 的 `type`、`title`、`order`；自定义 View（P1）加入时由同一接口返回 |
| Session 摘要 | session 模块 | 见 5.1 |
| 当前选中项 | project 模块的 `ui_state.main_canvas` | 见 `specs/project/spec.md` 4.2 |
| 当前 Project | project 模块 | `current_project_id` |
| 折叠状态 | 窗口级偏好 `nav_collapsed` | `specs/project/spec.md` 4.3；唯一写入者为本模块 |
| 列表滚动位置、Renaming 状态 | 渲染进程内存 | 按 `project_id` 保存；不持久化 |

### 4.2 `SessionSummary`（导航所需最小字段，提案）

| 字段 | 说明 | 来源 |
|---|---|---|
| `id` | Session 标识 | 04 第 6 节 |
| `cli_type` | `codex` / `claude-code`，决定 CX / CC（对齐 Adapter BUILT_IN_PROVIDER_IDS） | 04 第 6 节；P-D |
| `title` | 显示标题 | 04 第 6 节 |
| `status` | `running` / `needs_input` / `error` / `completed_unread` / 空；已按 session 规则折算为单一值 | 04 第 6 节 `status`、`completion_unread`；FR-STATE |
| `last_user_message_at` | 分组与排序依据 | 04 第 6 节 |
| `created_at` | 排序并列时的次级依据 | 04 第 6 节 |

导航不使用 `origin_view_id`、`model`、`updated_at`；Session 在 View 中创建不影响其在列表中的呈现（P-D 的列表项结构没有来源标记）。

## 5. 接口与事件

接口名为占位，目的是固定数据形状与方向。

### 5.1 需要 session 模块提供

| 需要 | 形状 | 用途 |
|---|---|---|
| 摘要列表与变更 | `listSessionSummaries(project_id) → SessionSummary[]`；订阅：`added` / `updated` / `removed`（V1 无删除，`removed` 暂不触发） | 渲染 Session History |
| 重命名 | `renameSession(session_id, title) → ok \| error` | 3.3.6；session 模块负责持久化与标题来源优先级，用户设置的标题不得被后续的 CLI 名称或自动生成覆盖（建议，由 `specs/session/` 确认） |
| Project 注意力 | `getProjectAttention(project_id)` 与订阅 | 折叠按钮上的点（3.4）；与 Tab 点同一来源 |
| 约束 | `last_user_message_at` 只在用户发送消息时更新；Agent 输出只更新 `status`，不得更新它 | 保证排序不因 Agent 输出而跳动（3.3.3） |

### 5.2 需要 / 提供给 project 模块

- 取得：`current_project_id`、`ui_state.main_canvas`、`nav_collapsed`。
- 提供：`openSession(session_id)`、`enterView(view_id, { origin: "nav" })`；两者由 project 模块更新 `ui_state.main_canvas` 并落盘。
- 提供查看信号给 session 模块：由 project 模块汇总后发出（`setViewing`，`specs/project/spec.md` 5.2）；导航在点击 Session 项、切换模式时只触发 `openSession`，不直接调用 session 模块清除状态。

### 5.3 与 chat

- 导航放置 New Chat 分裂按钮与空状态按钮；点击主区调用 chat 模块的 `startNewChat(project_id)`（使用 Default CLI）；▾ 展示 chat 模块提供的菜单。草稿创建、Session 创建的结果通过 session 模块的 `added` 事件进入列表。
- 导航不读取、不修改 `default_cli`。

### 5.4 与 project-view

- 调用：`enterView(view_id, { origin: "nav" })`，契约见 3.2.2。
- 读取：Views 列表（4.1）。
- project-view 负责在进入时构造新草稿与最近对话块，并决定右侧区域显示 Preview。

### 5.5 事件

| 事件 | 方向 | 触发 |
|---|---|---|
| `nav.collapsed.changed` | navigation → project | 折叠状态变化，供布局重算 |
| `nav.view.clicked` / `nav.session.clicked` | navigation → project | 用户点击条目 |
| `session.summary.updated` | session → navigation | 摘要变化 |
| `attention.changed` | session → navigation / project | 注意力状态变化 |
