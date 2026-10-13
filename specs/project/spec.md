# Project

## 文档信息

| 项目 | 内容 |
|---|---|
| 模块 | `project` |
| 文档状态 | 草稿 |
| 覆盖需求 | FR-PROJ-001～FR-PROJ-003 |
| 相关验收 | AC-01；05 第 4 节专项：Project Tab 注意力点、关闭 Project 确认、多 Project 后台运行、本地持久化 |
| 相关设计 | [Shell Spec v01](../../design/components/shell-spec-v01.md) 第 2、3、10、11 节；[线框图 v02](../../design/wireframes/README.md)；[Visual Direction](../../design/visual-direction.md) |
| 来源 | 02 第 2 节 Project 管理；01 第 6、7、8 节；03 第 3、5、6、7、8、10 节；04 第 6、7 节；2026-10-09 起草，尚无对话确认 |

## 1. 问题记录

### 1.1 未决问题

“阻塞”指：未回答前，对应部分不应开始实现；“否”表示可按建议答案先实现，回答不同再调整。

| 编号 | 问题 | 建议答案与依据 | 阻塞实现 | 回答（确认日期） |
|---|---|---|---|---|
| PROJ-Q4 | 最近 Projects 列表：排序、条数、是否包含已打开项、是否可移除、移除的含义？ | 按最近打开时间倒序；显示 10 条；已打开项也列出并标注“已打开”；可移除，只隐藏条目不删除记录与 Session；重新选择同一目录时重新出现。依据：Shell 第 10 节只规定名称、路径、最近打开时间；FR-PROJ-001“同一 Project 后续可以重新打开” | 否 | 待确认；先按建议实现（2026-10-09） |
| PROJ-Q5 | 目录已不存在或不可读时：最近列表条目如何呈现？已打开 Tab 的目录运行中失效怎么办？Project 目录被移动后是否支持重新指定位置？ | 最近列表仍显示并标注，点击提示原因并提供“从列表移除”；已打开 Tab 保持、不轮询，由使用目录的功能各自报错；V1 不支持重新指定位置，在新位置重新打开会创建新 Project，旧 Session 历史不迁移。依据：文档无规定；最小可用且不扩大范围 | 否 | 待确认；先按建议实现（2026-10-09） |
| PROJ-Q7（剩余部分） | 关闭最后一个窗口是否等于退出应用？ | 沿用现有建议：关闭窗口不退出应用，Session 继续执行；与 Session S-Q6 对齐 | 否；沿用既有实现 | ⌘Q 的合并确认部分已由 FR-PROJ-002 / DEC-14 于 2026-10-13 确认；本轮不扩大为其余旧提案的全部确认 |
| PROJ-Q8 | 恢复的 Session / View 已不存在时回落到哪里？ | 回落到 Overview，不弹窗，不改写其他已保存状态（3.3.5）。依据：FR-PROJ-003“首次进入 Project：默认显示 Overview”；V1 没有删除 Session 的入口（见 NAV-Q9），此情形主要来自数据异常 | 否 | 待确认；先按建议实现（2026-10-09） |
| PROJ-Q9 | Tab 条：目录名相同的 Project 如何区分？Tab 数量多到放不下时怎么办（最小宽度、溢出滚动、溢出菜单）？ | 同名时在名称后加上级目录名消歧（如“app · work”），悬停显示完整路径；Tab 宽度从 200 随数量收缩到最小宽度 96，仍放不下时顶栏 Tab 区域横向滚动，`+` 固定在 Tab 区右端并保持可见。依据：Shell 第 3 节只给最大宽 200 与单行截断；AC-01 要求能“快速切换” | 否 | 待确认；先按建议实现（2026-10-09） |
| PROJ-Q10 | 新增 Tab 的位置（`+` 创建、打开 Project 新建）与关闭当前 Tab 后激活哪个 Tab？是否支持拖拽排序？ | 新 Tab 追加在最右；关闭当前 Tab 后激活右侧相邻 Tab，没有则激活左侧相邻；V1 不支持拖拽排序。依据：浏览器与桌面应用惯例；文档无规定 | 否 | 待确认；先按建议实现（2026-10-09） |
| PROJ-Q11 | 未发送的 New Chat 草稿文字：切换 Tab 返回保持（D-15 隐含）；关闭 Tab / 重启后是否保存与恢复？ | project 只保存 `main_canvas.mode = "draft"`；草稿文本由 chat C-Q1 负责独立落盘并恢复。依据：FR-CHAT-001“未发送草稿不创建 Session”；D-15；chat §4 | 否 | 待确认；先按建议实现（2026-10-09） |
| PROJ-Q12 | D-15 的“完整状态”到底包含哪些内容？是否包括 Conversation 滚动位置、Session History 滚动位置、输入框草稿文字、Files 展开的目录等？ | 切换 Tab 返回时保留内存中的 History 滚动位置、草稿、工具状态；Conversation 依 session §3.2.4 保留上滚位置或底部跟随状态，History 显式打开与重启恢复定位底部；重新打开 Project 或重启恢复 3.3.1 中持久化项与所属模块草稿。依据：D-15、FR-SESSION-001、04 第 7 节“Project 切换即时响应” | 否 | 待确认；先按建议实现（2026-10-09） |
| PROJ-Q14 | 新 Project 首次展开右侧边栏时默认显示哪个工具？新 Project 右侧边栏初始是展开还是收起？（03 第 3 节“默认允许收起”含义不明确） | 初始收起；第一次展开默认 Files（02 中工具列表的第一项）。依据：02 Context Panel 操作原则（完全由用户主动控制）；AC-07“Agent 不得自行强制打开” | 否 | 待确认；先按建议实现（2026-10-09） |
| PROJ-Q15 | 一个已打开 Project 的子目录或父目录，被选择为另一个 Project 时是否允许？ | 允许，视为独立 Project，不合并也不提示。依据：01 第 8 节原则 3（一个 Project 对应一个本地目录）；同一目录判定只处理等价路径，不处理包含关系 | 否 | 待确认；先按建议实现（2026-10-09） |
| PROJ-Q16 | V1 是否只有单个窗口？“窗口级偏好”的说法暗示窗口概念，但文档未提多窗口 | 仅单窗口；第二次启动应用时聚焦已有窗口。依据：03 第 3 节只描述一个窗口；多窗口不属于 V1 非目标之外的任何需求 | 否 | 待确认；先按建议实现（2026-10-09） |
| PROJ-Q17 | Tab 与启动页是否需要键盘快捷键（新建、关闭、切换、打开目录）？ | V1 仅提供 macOS 标准菜单项及其常用快捷键：`⌘T` 新建启动页 Tab、`⌘W` 关闭当前 Tab（走 3.2.4 的确认）、`⌘O` 打开本地目录、`⌃Tab` / `⌃⇧Tab` 切换 Tab。依据：文档未规定快捷键，此处为提案；若不采用，则 V1 无快捷键，不影响验收 | 否 | 待确认；先按建议实现（2026-10-09） |

### 1.2 已确认

PROJ-Q6 已于 2026-10-13 随 DEC-14 确认：关闭 / 退出清理失败保留所属 Project、诊断及重试 / 取消入口，不静默宣称成功；规则见 §3.2.4。PROJ-Q7 的退出确认部分同日确认，窗口后台行为的剩余部分仍在上表，不重复请求已解决的决定。

| 编号 | 问题 | 建议答案与依据 | 阻塞实现 | 回答（确认日期） |
|---|---|---|---|---|
| PROJ-Q1 | 应用重启后是否恢复上次打开的 Tab 集合与当前 Tab？文档只要求“重新打开 Project 时恢复状态”，且“没有打开任何 Project 时显示启动页” | 恢复 Tab 集合、顺序与当前 Tab；启动页只在没有可恢复 Tab 或首次使用时出现。依据：01 第 6 节“恢复上一次使用状态”的精神与桌面应用惯例；Running 的 CLI 进程不随重启恢复，只恢复界面，不触发 `last_opened_at` 更新 | 是（影响窗口级状态的持久化设计与启动流程） | 采纳建议：重启后恢复 Tab 集合、顺序与当前 Tab（2026-10-09 确认） |
| PROJ-Q2 | 启动页 Tab 的模型：启动页是否总以一个 Tab 呈现？关闭最后一个 Tab 后是回到启动页、还是关闭窗口？已有启动页 Tab 时再点 `+` 如何处理？从启动页 Tab 选中已打开的目录后，该启动页 Tab 是保留还是关闭？启动页 Tab 激活时左侧导航与右侧边栏如何呈现、Tab 标题是什么？ | 启动页总以 Tab 呈现；最后一个 Project Tab 关闭后回到启动页，窗口不关闭；仅剩一个启动页 Tab 时不可关闭；已有启动页 Tab 时 `+` 切换到它；选中已打开目录时关闭该启动页 Tab（它是为了打开 Project 才创建的）；启动页激活时导航与边栏相关按钮 Disabled 并说明；Tab 标题取“新标签页”（文案待定）。依据：D-09“`+` 在新 Tab 中打开同一启动页”、03 第 6 节、Shell 第 11 节 Disabled 规则 | 是（影响 Tab 数据模型与关闭流程） | 采纳建议：启动页总以 Tab 呈现，规则同建议答案；Tab 标题文案“新标签页”仍待定（2026-10-09 确认） |
| PROJ-Q3 | 右侧边栏的展开状态在 Session Mode 与 Project View Mode 之间是共享还是各自独立？从导航进入 View 时，右侧区域显示 Preview 还是沿用已展开的工具？（AC-06 要求打开 Architecture 即看到 Preview；P-B 又规定打开工具会替换 Preview；FR-PROJ-003 只列“展开状态”一项） | 两种模式各自保存：Session Mode 用 `sidebar_open`，View Mode 用 `view_right_area`，`last_tool` 共享；切换模式互不改写；从导航进入 View 时 `view_right_area` 置为 Preview；Tab 切换与重新打开按 D-15 原样恢复。依据：AC-06、P-B、D-15 | 是（决定 `ui_state` 的形状，也决定 tools 与 project-view 的接口） | 采纳建议：两种模式各自保存，`last_tool` 共享，从导航进入 View 时右侧回到 Preview（2026-10-09 确认） |
| PROJ-Q13 | 回到某 Project 的 Tab 时，恢复出的 Session 若带有 Completed Unread / Error，是否因“已展示在 Conversation 中”而视为已查看并清除？ | 视为已查看并清除（与 D-05 对 Project View 左列的处理一致）；仅当该 Project 是当前 Tab 且 Session 实际显示时才算。依据：D-05、FR-STATE-005。本条规则最终归 `specs/session/`，此处提出是因为信号来自 project 模块（5.2） | 否 | 按 S-Q1（b）：视为已查看并清除（2026-10-09 确认） |

## 2. 职责与边界

- 负责：
  - Project 的打开、识别与记录：启动页、`+` Tab、目录选择与校验、同一目录判定、最近 Projects。
  - 顶栏中的 Project Tabs：顺序、切换、关闭与关闭确认、注意力点的渲染、关闭最后一个 Tab。
  - Project 级 UI 状态的保存与恢复，以及 Project 之间的状态隔离（AC-01）。
  - 窗口级布局规则：区域尺寸、范围与空间不足时的压缩顺序（Shell 第 2 节）。
  - 与 session、chat、navigation、project-view、tools 模块的接口约定（第 5 节）。
- 不负责：
  - Session 状态的含义、来源与清除规则，Session 持久化，关闭 Project 时“停止当前一轮”的实现 → `specs/session/spec.md`、`specs/agent-adapter/spec.md`。
  - New Chat 草稿、Default CLI 的取值与设置规则、CLI 菜单 → `specs/chat/spec.md`。
  - 左侧导航的内部行为（Project Views 列表、Session History、折叠）→ `specs/navigation/spec.md`。
  - Project View 的内容、Conversation 列的内部行为与 Preview → `specs/project-view/spec.md`（后续 task）。
  - Files / Diff / Browser / Terminal 的内容与资源生命周期 → [tools spec](../tools/spec.md)；工具内容待实现。
  - 色值、字体、图标等视觉参数（Visual Direction 第 1 节）。
- V1 范围外（文档未要求，本 spec 不设计）：Tab 拖拽排序与拖出窗口（PROJ-Q10）、多窗口（PROJ-Q16）、Project 重命名与目录迁移（PROJ-Q5）。

## 3. 行为细则

本节 3.1～3.3 依次对应 FR-PROJ-001～003，3.4 为窗口布局规则；正文中的 3.x.y 指本节小节。

### FR-PROJ-001 打开本地 Project

#### 3.1.1 入口与启动页

1. 应用没有打开任何 Project 时显示启动页；启动页位于 Main Canvas 区域，内容为居中的产品名、“打开本地目录”主按钮、最近 Projects 列表（03 第 6 节“启动页与新增 Project”；Shell 第 10 节）。
2. Project Tab Bar 的 `+` 在新 Tab 中打开同一启动页（03 第 6 节；D-09）。该 Tab 称为“启动页 Tab”，它不绑定任何 Project。
3. 启动页 Tab 激活时左侧导航与右侧边栏的呈现、同时存在多个启动页 Tab、应用启动时是否恢复上次的 Tab 集合：见 PROJ-Q1、PROJ-Q2。
4. 打开 Project 的入口只有两个：“打开本地目录”（目录选择器）和最近 Projects 列表项。两者走同一流程（3.1.4）。

#### 3.1.2 目录选择与校验

“打开本地目录”调用系统目录选择器，单选，只能选目录（技术方案，待实现确认：Electron `dialog.showOpenDialog`，`openDirectory`，不开启多选，在主进程调用）。取消选择不产生任何变化。

对选中的路径（含从最近列表点击的路径）依次校验，任一项失败即中止，停留在启动页并显示错误提示（提案：启动页内联提示，不使用模态框；文案见下表）：

| 校验 | 通过条件 | 失败时的提示（提案） | 来源 |
|---|---|---|---|
| 存在 | 路径存在 | “目录不存在。” | 02 FR-PROJ-001“合法本地目录” |
| 是目录 | 路径（跟随符号链接后）指向目录 | “所选路径不是目录。” | 同上 |
| 可读 | 当前用户对该目录有读取与遍历权限 | “无法读取该目录，请检查访问权限。”macOS 因隐私保护（如桌面、文档、外置卷）被拒绝时附带“可在系统设置的隐私与安全性中允许访问”（技术方案，待实现确认） | 同上 |

- 不要求目录是 Git 仓库；非 Git 目录同样可以作为 Project 打开（Diff 的非 Git 处理见 02 FR-TOOL-002，属 `specs/tools/`）。
- 不要求目录可写；是否可写不影响打开。
- 打开 Project 本身不向该目录写入任何内容；Project Knowledge 是否存放在 Project 内隐藏目录尚未确定（04 第 1 节第 2 项），确定前客户端数据一律存放在应用数据目录（04 第 3 节：SQLite）。
- 一次只打开一个目录；V1 不支持拖拽文件夹到窗口、Finder“打开方式”等其他入口（文档未提及，不设计）。

#### 3.1.3 Project 标识与“同一目录”判定

一个 Project 绑定一个本地目录（01 第 7、8 节；04 第 6 节）。是否“同一目录”按以下规则判定（FR-PROJ-001 要求“已在某个 Tab 中打开时切换到该 Tab，不重复打开”）：

1. 比较的是目录本身，而不是用户键入或选择的路径字符串。符号链接、`..`、末尾斜杠、大小写差异（macOS 默认大小写不敏感）、Unicode 归一化差异、macOS 上 `/Users/...` 与 `/System/Volumes/Data/Users/...` 这类别名，只要指向同一目录，即视为同一 Project。
2. 实现方式：以解析符号链接后的绝对路径（`canonical_path`）为 Project 的唯一键；当字符串比较不能确定时，用目录的设备号加 inode（`dev` + `ino`）作为补充判据（技术方案，待实现确认；别名与大小写行为须在 macOS 上实测）。
3. 选中的是符号链接时，Project 绑定其目标目录；标签名取用户所选路径的最后一段（提案，见 3.1.4 第 5 步），CLI 的工作目录取 `canonical_path`。
4. 不同目录互相独立，包括父子关系：打开 `~/code/app` 与 `~/code/app/packages/web` 是两个 Project，互不合并（01 第 8 节原则 3 一个 Project 一个目录；见 PROJ-Q15）。

#### 3.1.4 打开流程

用户选择目录并通过 3.1.2 校验后：

1. 计算 `canonical_path`（3.1.3）。
2. **已在某个 Tab 中打开**：切换到该 Tab，不新建 Tab，不重复打开（FR-PROJ-001；D-09）。如果操作发起于启动页 Tab，该启动页 Tab 是否保留见 PROJ-Q2。更新该 Project 的 `last_opened_at`（见 3.1.5）。
3. **已存在 Project 记录但没有打开**（此前打开过、后来关闭）：复用该记录，不创建新记录；其 Session 与 UI 状态保持；在当前启动页 Tab 中打开，并按 FR-PROJ-003 恢复上次状态（3.3）。
4. **没有记录**：创建新的 Project 记录（字段见第 4 节），`default_cli` 的初值由 chat 模块给出（03 第 6 节 New Chat 第 3 条：沿用最近一次设置的默认值，首次为检测到的第一个可用 CLI；规则归 `specs/chat/`），首次进入 Overview（2.3.3）。
5. 打开动作发生在启动页 Tab 中时，该 Tab **原位转为**该 Project 的 Tab，Tab 位置不变；Tab 标题为 Project 名称，`name` 默认取所选路径最后一段（提案；同名目录的区分见 PROJ-Q9）。
6. 通知 session 模块该 Project 已打开，以加载其 Session 数据（第 5 节）。

“重新打开”与“已打开”的区别：前者读取已保存的记录并恢复状态（FR-PROJ-001“同一个 Project 后续可以重新打开”），后者只是切换 Tab。

#### 3.1.5 最近 Projects

来源只有 03 第 6 节与 Shell 第 10 节：列表项显示名称、路径、最近打开时间。其余为提案，其中存在分歧的项见 PROJ-Q4。

| 项 | 规则 |
|---|---|
| 数据来源 | 所有 `last_opened_at` 非空且未被用户移除的 Project 记录 |
| 排序 | 按 `last_opened_at` 倒序（提案） |
| `last_opened_at` 更新时机 | 通过 3.1.4 打开或切换到已打开 Tab 时更新；单纯点击顶栏 Tab 切换、应用重启时按 PROJ-Q1 恢复 Tab 不更新（提案） |
| 显示条数 | 提案：显示最近 10 条，超出部分不显示（记录仍保留） |
| 已打开的 Project | 提案：仍列出并标注“已打开”，点击即切换到对应 Tab（3.1.4 第 2 步），而不是隐藏 |
| 点击列表项 | 与“打开本地目录”走同一流程（3.1.2 起） |
| 移除条目 | 提案：悬停列表项显示移除按钮，只把该条目从最近列表隐藏；不删除 Project 记录、Session 与 UI 状态；用户之后重新选择同一目录时，记录复用并重新出现在列表（FR-PROJ-001 要求同一 Project 可重新打开） |
| 时间格式 | 提案：当天显示相对时间，其余显示日期（与 Session History 的日期分组口径一致，见 `specs/navigation/spec.md` FR-NAV-003） |
| 空列表 | 仅显示“打开本地目录”按钮，不显示列表区域（提案） |

#### 3.1.6 目录失效

两种情形均为文档未规定，建议行为见 PROJ-Q5：

- 最近列表中的 Project，其目录已不存在或不可读：条目仍显示，名称与路径弱化并标注“目录不存在”或“无法访问”；点击时不打开，提示原因，并提供“从列表移除”。
- 已打开 Tab 的 Project，其目录在运行中被删除、移动或卸载：不自动关闭 Tab；不轮询目录（避免后台开销）；该 Project 的 Session 历史保持可读；目录失效由使用目录的操作（发送消息、Files、Diff、Terminal）在失败时各自报错，具体呈现归对应模块。

### FR-PROJ-002 多 Project Tab

#### 3.2.1 Tab 条结构

顶栏高 40，所有模式一致（Shell 第 2.2 节）。从左到右：窗口控制区 → 左侧导航折叠按钮 →（导航折叠时）New Chat 按钮 → Project Tabs → `+` → 右侧边栏按钮（Shell 第 3 节；03 第 3 节）。折叠按钮与 New Chat 按钮归 `specs/navigation/spec.md`，右侧边栏按钮的状态归第 4 节 `ui_state` 与 `specs/tools/`。顶栏的空白区域用作窗口拖拽区（技术方案，待实现确认；Shell 第 1 节要求在 Electron 骨架中复核）。

| 组件 | 尺寸与结构 | 状态 | 来源 |
|---|---|---|---|
| Project Tab | 高 32，最大宽 200；内容依次为注意力点（仅非当前 Tab）、Project 名称（单行，超出截断）、关闭按钮 | Default / Hover / Selected / Focus | Shell 第 3 节；FR-PROJ-002 |
| 关闭按钮 | 尺寸见 [Shell Spec v02](../../design/components/shell-spec-v02.md) 第 3 节；×，当前 Tab 常显，其他 Tab 悬停时显示（键盘聚焦到 Tab 时也应显示，提案） | Default / Hover / Focus | Shell Spec v02 第 3 节（2026-10-11 确认） |
| 注意力点 | 7px 圆点，色同对应 Session 状态色 | — | Shell 第 5 节 |
| `+` 按钮 | 尺寸见 [Shell Spec v02](../../design/components/shell-spec-v02.md) 第 3 节；紧随最后一个 Tab | Default / Hover / Focus | Shell Spec v02 第 3 节（2026-10-11 确认）；D-09 |

- 名称截断：单行，尾部省略号；悬停显示完整名称与路径的提示（提案，用于区分同名目录，PROJ-Q9）。
- Tab 过多、宽度不足时的收缩与溢出规则文档未规定，见 PROJ-Q9。
- Tab 的可访问名称包含 Project 名称和注意力状态（如“my-saas，有等待你输入的对话”）（技术方案，待实现确认）。

#### 3.2.2 顺序、新增、切换

1. Tab 顺序即打开顺序；新 Tab（含 `+` 创建的启动页 Tab）追加在最右侧，位于 `+` 之前（提案，PROJ-Q10）。V1 不提供拖拽排序（文档未提及）。
2. 支持多个 Project 同时保持打开（FR-PROJ-002）；每个 Tab 对应一个独立本地目录，同一目录不会出现两个 Tab（3.1.3）。
3. 点击 Tab 切换 Project：切换整个 Workspace Context，恢复该 Project 的状态，不停止其他 Project 中已在运行的 Session（03 第 6 节“Project 切换”）。切换应保持即时响应（04 第 7 节）；切换过程不显示全屏遮罩或加载页（Shell 第 10 节“加载中”）。
4. 切换后，原当前 Tab 变为非当前，开始显示注意力点（若有）；新当前 Tab 的注意力点隐藏（3.2.3）。

#### 3.2.3 非当前 Tab 的注意力点

规则来自 FR-PROJ-002、03 第 7 节“Project Tab 注意力点”、D-07、Shell 第 5 节：

1. 仅**非当前**的 Project Tab 显示；当前 Tab 不显示，相关状态已在左侧 Session History 可见。
2. 一个 Tab 只显示**一个**点，取该 Project 中优先级最高的注意力状态：Needs Input > Error > Completed Unread。点色分别为橙、红、绿（Shell 第 5 节）。
3. 不显示数量，不显示 Running，不提供跨 Project 的统一列表（Attention Inbox 为 V1 非目标，01 第 4 节）。
4. 启动页 Tab 与已关闭的 Project 不显示。
5. 数据由 session 模块提供（5.1）；project 模块只负责订阅并渲染，不自行推导状态。状态变化后 Tab 上的点应随之更新，无需切换 Tab。
6. 点消失的时机：对应状态被 session 模块清除（如用户在该 Project 内查看了 Session），或该 Tab 变为当前 Tab。回到该 Project 后，展示中的 Session 是否因此被视为“已查看”，见 PROJ-Q13。

#### 3.2.4 关闭 Tab 与确认

1. 每个 Project Tab 都可以关闭；启动页 Tab 也可以关闭，其规则见 3.2.5。
2. 点击关闭按钮时，查询该 Project 的 Running / Needs Input Session 及所有未退出的用户 Terminal（5.1、5.5）：
   - 两类数量均为 0：进入资源释放流程，不弹窗。Error 与 Completed Unread 不单独触发确认。
   - 任一类数量大于 0：显示一次合并确认；终端只停在 Shell 提示符也计入，不依赖前台命令检测决定是否提示（FR-PROJ-002；2026-10-13 确认，DEC-14）。
3. 关闭确认对话框（Shell 第 10 节；D-10），应用级模态，不切换当前 Tab（即使被关闭的是非当前 Tab，也不先切过去）：

| 元素 | 内容 |
|---|---|
| 标题 | “关闭 <Project 名称>？” |
| 说明 | 列明受影响的 Running / Needs Input Session 与未退出 Terminal；说明对话当前一轮停止但历史保留、终端及其受管进程结束。仅有终端时也显示确认（2026-10-13 确认） |
| 按钮 | 取消 / 关闭并停止；默认焦点在“取消”，Esc 等同取消，“关闭并停止”为主按钮（提案） |

4. 点击“关闭并停止”后：
   1. 重新查询 Session 与 Terminal 状态，冻结所属 Project 的新资源创建，再执行清理（AI 技术细化，待实现验证）。
   2. 调用 session 模块停止所属活动回合，再由工具服务释放所属 PTY / Browser 等资源；不扩大 Session Stop 的清理范围，不叠加逐终端确认，不影响其他 Project（04 第 5 节；tools spec §4.3）。
   3. 清理期间显示进行中状态；全部所需释放成功后才移除 Tab。失败或超时保留 Project、诊断与重试 / 取消入口，不宣称成功；确认前取消不改变任何实例（2026-10-13 确认）。部分清理已成功时如实展示，不自动重跑被结束的命令。
   4. “CLI Conversation 保留，重新打开该 Project 后可继续”（FR-PROJ-002）：关闭不删除任何 Session 记录。
5. 关闭 Tab 前保存该 Project 的 UI 状态（3.3.4）；关闭后释放该 Project 的内存态（技术方案，待实现确认）。
6. 关闭当前 Tab 后哪个 Tab 成为当前：文档未规定，见 PROJ-Q10。关闭非当前 Tab 不改变当前 Tab。
7. 关闭一个 Project 不影响其他 Project 的 Session 运行（04 第 7 节稳定性）。
8. ⌘Q 退出应用时跨 Project 汇总同类 Session 与 Terminal，复用一次合并确认；失败不静默退出。关闭窗口但不退出应用沿用 PROJ-Q7 / Session §3.14 的后台运行规则（2026-10-13 确认，DEC-14）。

#### 3.2.5 关闭最后一个 Tab 与启动页 Tab

文档只规定“没有打开任何 Project 时显示启动页”（03 第 6 节），未规定顶栏是否仍显示 Tab。建议行为与分歧见 PROJ-Q2，本 spec 暂按提案描述：

- 最后一个 Project Tab 关闭后，窗口不关闭，回到启动页，顶栏显示一个启动页 Tab。
- 窗口中只剩一个启动页 Tab 时，其关闭按钮不可用，避免出现没有任何 Tab 的状态。
- 已有启动页 Tab 时再点击 `+`，切换到已有的启动页 Tab，不再新增。
- 启动页 Tab 激活时：左侧导航、导航折叠按钮、New Chat 按钮与右侧边栏按钮不显示内容（按钮保持位置但处于 Disabled，用提示说明“打开 Project 后可用”）；导航折叠状态（窗口级偏好）保持不变，仅在 Project Tab 激活时生效。

#### 3.2.6 Project 间状态隔离（AC-01）

- 以下状态按 `project_id` 隔离，切换 Tab 时不得混淆（FR-PROJ-002 验收标准；AC-01）：
  - Session：Session History 列表、各 Session 状态与 Conversation、New Chat 草稿。
  - Project View：当前选中的 View、Project View Mode 下左侧 Conversation 与 Preview 状态。
  - Context Panel：展开状态、当前工具、宽度；各工具内部状态（Files 展开的目录、Terminal 的工作目录与会话、Browser 地址）。
- 下列为窗口级、跨 Project 共享的状态：Tab 集合与顺序、当前 Tab、左侧导航折叠偏好（D-14）、最近 Projects 列表、CLI 可用性检测。Default CLI 属 Project，但其初值沿用“最近一次设置”，该跨 Project 偏好归 `specs/chat/`。
- 实现约束（技术方案，待实现确认）：渲染进程的所有 Project 相关 store 以 `project_id` 为键，组件通过当前 `project_id` 取值，不使用单例“当前 Project 状态”；切换 Tab 只改变当前 `project_id`。IPC 请求与事件均携带 `project_id`。已关闭的 Project 不保留渲染态。

### FR-PROJ-003 Project 状态恢复

#### 3.3.1 保存内容

按 02 FR-PROJ-003（至少三项）、01 第 6 节、03 第 5 节与 D-13、D-15、Shell 第 2.2 节整理。属于 Project 的状态随 Project 保存；窗口级偏好不属于 Project。

| 状态 | 归属 | 说明 | 来源 |
|---|---|---|---|
| Main Canvas 当前内容 | Project | 以下三种之一：某个 Session 的 Conversation；New Chat 草稿；某个 Project View（含该 View 下左侧 Conversation 所显示的对话：某个 Session，或草稿） | FR-PROJ-003；D-15 |
| 右侧边栏展开状态 | Project | Session Mode 下是否展开；Project View Mode 下右侧区域显示 Preview 还是某个工具（两种模式是否独立，见 PROJ-Q3） | FR-PROJ-003；03 第 5 节；P-B |
| 当前工具 | Project | 最近一次选择的工具（Files / Diff / Browser / Terminal），展开时默认显示它（P-C） | FR-PROJ-003；P-C |
| 右侧边栏宽度 | Project | Session Mode 下，范围 320–560，默认 400 | D-13；Shell 第 2.2 节 |
| Conversation 列宽度 | Project | Project View Mode 下，范围 360–560，默认 440 | Shell 第 2.2 节 |
| 左侧导航折叠 | **窗口级** | 切换 Project 时保持不变，不属于任何 Project | 03 第 8 节；D-14 |
| Tab 集合、顺序、当前 Tab | **窗口级** | 应用重启后是否恢复，见 PROJ-Q1 | — |

不保存、也不恢复的内容：

- Conversation 的滚动位置不写入 Project 持久化数据；首次 / 重启恢复及从 History 显式打开时定位底部。运行中 Tab 返回保留上滚位置或底部跟随状态，具体规则统一见 [Session §3.2](../session/spec.md)（PROJ-Q12 待确认建议）。
- 新 Chat 草稿中的文字：是否保存与恢复归 `specs/chat/`，见 PROJ-Q11。
- 终端输出、Browser 页面内容等工具内部状态：归 `specs/tools/`。
- AI 执行任务不得改变上述任何状态（Product Definition 第 8 节原则 21、22；02 Context Panel 操作原则）：Agent 完成、报错或需要输入时，不自动切换 View / Session，不自动展开右侧边栏或切换工具。

#### 3.3.2 两类恢复场景

1. **运行中切换 Tab 后返回**：按 D-15 恢复“离开时的完整状态”，包括正在显示的对话。“完整状态”的范围见 PROJ-Q12。不适用 P-A 的“进入 View 显示新草稿”规则，该规则只用于从左侧导航进入 View。
2. **重新打开 Project**（关闭后重新打开，或应用重启后恢复 Tab）：按 3.3.1 已保存的内容恢复，同样不适用 P-A。

两类场景恢复出的 Main Canvas 与右侧边栏必须与离开时一致，不得回落到 Overview（首次打开除外）。

#### 3.3.3 首次打开

Project 记录是新创建的（3.1.4 第 4 步），或没有任何已保存 UI 状态时，Main Canvas 进入 Overview（FR-PROJ-003；01 第 6 节）。具体为：Project View Mode，选中 Overview，左侧 Conversation 为新草稿并列出该 View 的最近对话（P-A，内容归 `specs/project-view/`），右侧为 Preview。Overview 的 Knowledge 尚未生成时显示空状态（FR-VIEW-003），那是 project-view 的职责。

右侧边栏的初始状态与默认工具：文档未规定，见 PROJ-Q14。建议：初始收起，默认工具为 Files，宽度取默认值。

#### 3.3.4 保存时机

文档未规定，为技术方案，待实现确认：

- 每次状态变更后由渲染进程通知主进程，主进程合并后短延迟（建议 500 ms 量级）写入 SQLite；拖拽宽度时只在拖拽结束写入，不在拖动过程中写入。
- 在关闭 Tab、窗口关闭、应用退出前强制写入（flush）；应用异常退出最多丢失最近一次未落盘的变更。
- 写入失败不阻塞界面，下次变更时重试；记录日志，不向用户弹窗。
- `ui_state` 带版本号，读取时对未知版本、缺失字段、非法取值回落到默认值（3.3.5）。

#### 3.3.5 恢复失败的回落

文档未规定，建议行为见 PROJ-Q8。回落规则（提案）：

| 失败情形 | 回落 |
|---|---|
| 上次选中的 Session 已不存在（记录被删除、数据损坏） | 回落到该 Project 的 Overview，不弹窗；本次回落不覆盖其他已保存的状态 |
| 上次选中的 Project View 已不存在（自定义 View，FR-VIEW-002 为 P1） | 回落到 Overview |
| 上次 Project View 的左列 Session 已不存在 | 保持该 View，左列改为新草稿 |
| 当前工具取值无法识别 | 回落到默认工具（3.3.3），右侧边栏展开状态保持 |
| 保存的宽度超出有效范围或大于当前窗口可容纳 | 按有效范围钳制后使用；仅在用户再次拖拽时才覆盖已保存的值，不因窗口变小而改写（5.3） |
| `ui_state` 整体损坏 | 视同首次打开，进入 Overview |

“Session 已不存在”仅指应用自身的 Session 记录缺失。CLI 侧的原生会话文件丢失不属于恢复失败：Session 仍可打开，在用户再次发送消息、恢复 CLI Conversation 失败时由 session 模块按 Error 处理（FR-STATE-003）。

### 3.4 窗口布局规则（Shell 第 2 节）

本节为窗口骨架的唯一出处，navigation、project-view、tools 各 spec 引用本节，不重复尺寸。数值随 Shell 于 2026-10-09 确认；Shell 第 1 节要求按 1024 / 1280 / 1440 宽度复核，在[已归档的 T20261009-prototype-alignment](../../tasks/archive/T20261009-prototype-alignment/task.md)中完成。

#### 3.4.1 区域与尺寸

| 区域 | 默认 | 范围 | 规则 |
|---|---|---|---|
| 窗口 | 设计基准 1280×800，复核 1440×900 | 最小 1024×640 | 达到最小后不再缩小（Shell 第 2.3 节第 3 条） |
| 顶栏（Project Tab Bar） | 高 40 | 固定 | 所有模式一致 |
| 左侧导航 | 宽 248 | 固定；折叠后为 0 | 不提供拖拽调整宽度；折叠为窗口级偏好 |
| 主画布顶栏 | 高 48 | 固定 | 显示当前 Session 或 View 信息，内容归 session / project-view |
| Session Mode：Conversation 区 | 随窗口伸缩 | 最小 400；正文最大宽 720，居中 | |
| Session Mode：右侧边栏 | 宽 400 | 320–560，可拖拽 | 按 Project 记忆；收起时宽度为 0，Conversation 区占满 |
| Project View Mode：Conversation 列 | 宽 440 | 360–560，可拖拽分隔线 | 按 Project 记忆 |
| Project View Mode：右侧区域 | 剩余宽度 | 最小 400 | Preview 与工具共享（P-B） |

#### 3.4.2 空间不足时的压缩顺序

规则来自 Shell 第 2.3 节：

1. 先把右侧区域（View Mode）或右侧边栏（Session Mode）压缩到其最小宽度，再把 Conversation 区或列压缩到其最小宽度。
2. 不因空间不足自动折叠左侧导航，也不自动关闭右侧边栏或把工具切回 Preview：布局变化只由用户操作触发（对应 Product Definition 第 8 节原则 21、22 与 task 验收标准）。
3. 最小窗口按最小值核算，均不超过 1024：View Mode 为 248 + 360 + 400 = 1008；Session Mode 打开右侧边栏为 248 + 400 + 320 = 968（Shell 第 2.3 节）。导航折叠时可用宽度增大 248。
4. 保存的宽度（用户拖拽值）与实际生效宽度分离：窗口缩小时生效值按上述顺序压缩，保存值不变；窗口恢复变大时回到保存值（技术方案，待实现确认）。
5. 拖拽调整时的上下限取各自范围与另一侧最小值共同决定的较小者，不允许把另一侧挤到最小值以下（提案）。
6. 在 1024 以上的任何窗口宽度，Shell 的最小值组合均可容纳，因此不需要“窗口宽度不足”的降级布局；该判断需在 1024 / 1280 / 1440 复核中确认（Shell 第 1 节）。

## 4. 状态与数据

### 4.1 Project 记录

以 04 第 6 节概念模型为基础。该节明确“不代表最终数据库结构”；下列字段中标注“提案”的是为本模块行为补充的字段。

| 字段 | 说明 | 来源 |
|---|---|---|
| `id` | Project 唯一标识，创建时生成，不随目录路径变化 | 04 第 6 节 |
| `name` | 显示名；默认取所选路径最后一段；V1 不提供重命名 | 04 第 6 节；提案：默认值与不可改 |
| `local_path` | 用户首次选择的路径，用于展示 | 04 第 6 节 |
| `canonical_path` | 解析符号链接后的绝对路径；唯一；用作同一目录判定与 CLI 工作目录 | 提案（3.1.3） |
| `default_cli` | Project 的 Default CLI；取值与更新规则归 `specs/chat/` | 04 第 6 节；D-11 |
| `active_view` / `active_session` | 04 中的两个单值字段；因 D-15 要求恢复 Project View 下左列的对话，本 spec 将其合并进 `ui_state.main_canvas`（见 4.2），不再单独存放 | 04 第 6 节；D-15 |
| `ui_state` | 见 4.2 | 04 第 6 节 |
| `last_opened_at` | 最近一次通过 3.1.4 打开的时间，用于最近列表排序 | 提案 |
| `hidden_from_recent` | 用户已把该条目从最近列表移除 | 提案 |
| `created_at` | 记录创建时间 | 提案 |

### 4.2 `ui_state`（Project 级，提案）

| 字段 | 取值 | 说明 |
|---|---|---|
| `schema_version` | 整数 | 读取时校验，未知版本回落默认 |
| `main_canvas` | `{ mode: "session", session_id }` / `{ mode: "draft" }` / `{ mode: "view", view_id, conversation: { kind: "draft" } 或 { kind: "session", session_id } }` | 对应“上一次选中的 Project View 或 Session”与 D-15；`draft` 表示 New Chat 草稿（其文字不在此保存，PROJ-Q11） |
| `sidebar_open` | 布尔 | Session Mode 下右侧边栏是否展开 |
| `view_right_area` | `"preview"` / `"files"` / `"diff"` / `"browser"` / `"terminal"` | Project View Mode 下右侧区域显示什么；PROJ-Q3 确认后可能与 `sidebar_open` 合并 |
| `last_tool` | `"files"` / `"diff"` / `"browser"` / `"terminal"` / 空 | 右侧边栏展开时默认显示的工具；空时用默认工具（PROJ-Q14） |
| `sidebar_width` | 数值，空表示默认 | 320–560 |
| `view_conversation_width` | 数值，空表示默认 | 360–560 |

`ui_state` 只保存 ID 与取值，不保存 Session 内容；各工具的内部状态由对应模块在自己的字段中保存。

### 4.3 窗口级状态（提案）

| 字段 | 说明 |
|---|---|
| `tabs` | 有序列表，元素为 `{ kind: "project", project_id }` 或 `{ kind: "launcher" }` |
| `current_tab` | 当前 Tab |
| `nav_collapsed` | 左侧导航是否折叠（D-14，归 navigation spec，此处仅列出存放位置） |

窗口级状态是否持久化到下次启动，见 PROJ-Q1。

### 4.4 存储位置（2026-10-09 实现回写，文档仍为草稿）

Project 记录与 `ui_state` 存入应用 SQLite 的 `projects` 表，窗口级状态存入 `shell_window_state`，迁移见 [`2026100902_project_core.ts`](../../apps/desktop/src/main/services/database/migrations/2026100902_project_core.ts)（04 第 3 节本地持久化）。渲染进程不直接读写，经 Preload Bridge 的类型化 IPC 访问；乐观 UI 按动作顺序串行保存，保存期间的新修改通过 revision 保留，关闭 / 退出前等待 Session 草稿与 Project 状态 flush。

## 5. 接口与事件

主进程正式接缝见 [`MainSessionPort`](../../apps/desktop/src/main/services/project/session-port.ts)，Renderer 槽位与接缝见 [`features/project/integration.tsx`](../../apps/desktop/src/renderer/src/features/project/integration.tsx)，IPC 见 [`shared/ipc/project.ts`](../../apps/desktop/src/shared/ipc/project.ts)。2026-10-09 已接入 Session；Project View / 工具内容仍为后续 task 的槽位。

### 5.1 本模块需要 session 模块提供

| 需要 | 形状 | 用途 |
|---|---|---|
| Project 注意力状态 | `getProjectAttention(project_id) → "needs_input" \| "error" \| "completed_unread" \| null`；加订阅：状态变化时推送 | 非当前 Tab 的注意力点（3.2.3）；导航折叠按钮的注意力点（navigation）。优先级汇总（Needs Input > Error > Completed Unread）由 session 模块完成，本模块不自行汇总；不含 Running |
| 阻止关闭的 Session 计数 | `getBlockingSessionCounts(projectId) → { running, needsInput }` | 判断是否需要确认以及对话框中的数量（3.2.4） |
| 停止当前一轮 | `stopProjectTurns(projectId) → { stopped: SessionId[], failed: { sessionId, reason }[] }`，异步；仅停止该 Project 内 Running 与 Needs Input 的 Session | 关闭确认后调用；不得影响其他 Project、其他 Session 与用户 Terminal（04 第 5 节）；关闭后 CLI Conversation 保留 |
| Project 生命周期 | Renderer `onProjectOpened(projectId)` / `onProjectClosed(projectId)`；主进程 `projectClosed(projectId)` | Renderer 加载 / 释放 UI 数据；可信关闭流程通过停止检查后在主进程释放空闲 Runtime，成功才允许移除 Tab；历史记录与原生 ID 保留 |
| Session 存在性 | Renderer `sessionExists(projectId, sessionId) → boolean` | 恢复时校验（3.3.5）；来源 View 从 Session 摘要读取 |
| Session 列表与状态 | 见 `specs/navigation/spec.md` 5.1 | Session History |

### 5.2 本模块提供给 session 模块

| 提供 | 形状 | 用途 |
|---|---|---|
| 查看信号 | `setViewing(projectId, sessionId \| null)`、`setWindowForeground(foreground)`、`userOpenedSession(projectId, sessionId)` | Session integration 合并当前 Tab 展示上下文后发送 `updateViewing`；“打开 Session”（含切换 Tab 返回、启动恢复）另发 `opened`。窗口前台变化不发 `opened`，主进程在事件发生时核实 focused / visible / 非 minimized（`specs/session/spec.md` 第 3.11 节，S-Q1 2026-10-09 确认） |
| 当前 Project 标志 | `current_project_id` 变更事件 | 供 session 模块判断哪个 Project 的状态要在 Tab 上显示 |
| 关闭确认结果 | “用户已确认关闭并停止”事件 | 触发 `stopProjectTurns` |

### 5.3 与 navigation

- 本模块提供 `project_id`、Main Canvas 当前内容、左侧导航折叠偏好的存放位置；navigation 提供“进入某 View”“打开某 Session”的动作，并在动作发生时通过本模块更新 `ui_state.main_canvas`。
- 导航区域宽度、折叠按钮、New Chat 按钮的行为归 `specs/navigation/spec.md`；窗口尺寸与压缩顺序归本 spec 3.4。

### 5.4 与 chat

- 创建 Project 记录后、打开回复前调用 `MainSessionPort.initializeProject(projectId)`，由 Session 服务快照 `default_cli`；正式 Provider ID 为 `codex` / `claude-code`，显示名分别为 Codex CLI / Claude Code。存储与继承规则统一见 [chat §4 / §5.1](../chat/spec.md)。
- 草稿 UI 状态（`main_canvas.mode = "draft"`）的内容与保存归 chat；Tab 切换期间草稿文字应保持（D-15），重启后的行为见 PROJ-Q11。

### 5.5 与 project-view、tools（后续 task）

- project-view 读取 `ui_state.main_canvas` 中 `view` 分支，写入左列 `conversation`、`view_right_area`；使用 `view_conversation_width`。
- tools 读取 `sidebar_open`、`view_right_area`、`last_tool`、`sidebar_width`，写入 `last_tool`；右侧边栏容器（开关、图标切换、宽度拖拽）由本 task 提供，工具内容为占位（task 范围）。
- 工具实例与缓存按 [tools spec](../tools/spec.md#4-状态与接口) 管理；壳层隐藏 / 卸载内容时不能销毁用户 PTY 或丢失输出状态，Project 的可信关闭流程负责调用工具清理。壳层不持有历史补丁或网页权限（DEC-10，2026-10-12 确认）。
- 关闭编排新增工具端口：查询所属未退出 Terminal、阻止新实例创建、释放所属资源并返回逐项成功 / 失败；与 Session 计数合并生成 §3.2.4 的确认信息。接口名称由实现确定（AI 技术细化，2026-10-13）；现有仅 Session 的 close-flow 尚未覆盖，不能作为工具关闭验收证据。
- 两者都通过本模块的 `updateUiState(project_id, patch)` 写入，由本模块统一落盘（3.3.4）；不得各自存储同一事实。

### 5.6 事件小结

| 事件 | 方向 | 触发 |
|---|---|---|
| `project.opened` | project → session / tools | 3.1.4 完成 |
| `project.closing` | project → session | 用户点击关闭，数量大于 0 时进入确认 |
| `project.closed` | project → session / tools | Tab 已移除 |
| `tab.switched` | project → 全部 | 当前 Tab 变化 |
| `attention.changed` | session → project | Project 注意力状态变化 |
| `viewing.changed` | project → session | 当前 Tab 或展示中的 Session 变化 |
