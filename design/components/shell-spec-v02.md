# Shell Layout & Components v02

## 文档信息

| 项目 | 内容 |
|---|---|
| 产品 | AI Developer Studio |
| 版本 | v02 |
| 状态 | 已确认（2026-10-11）：继承 v01；工程工具行为已于 2026-10-10 确认，本版 v01 对齐修订与交互原型 v02 的 Conversation 修订随各自任务签收 |
| 依据 | [UX Specification](<../../docs/03. UX Specification.md>) 第 3–8、10 节；[Wireframes](../wireframes/README.md) v02；FR-TOOL-002、FR-TOOL-004；[工程工具任务](../../tasks/T20261009-context-tools/task.md) 的 2026-10-10 确认；用户 2026-10-11 对话确认的 v01 对齐界面决定，证据见[归档复验记录](../../tasks/archive/T20261009-prototype-alignment/acceptance.md#6-2026-10-11-复验)；[交互原型 v02](../prototypes/README.md#studio-灰度交互原型-v02) 与[其采用确认](../../tasks/archive/T20261010-prototype-v02/task.md#已确认事项)（2026-10-10） |
| 范围 | 窗口布局、区域尺寸、组件结构与交互状态 |
| 不含 | 色值、字体、图标库等视觉参数：见 [Visual Direction](../visual-direction.md) 第 1 节 |

## 1. 已确认与待确认

| 项目 | 说明 |
|---|---|
| 本轮对齐修订 | 第 3、4、8、11 节依据用户 2026-10-11 对话确认补充，并于 2026-10-11 随任务签收 |
| Conversation 修订 | 第 2.2、6、7 节依据交互原型 v02 的 2026-10-10 确认补充，并于 2026-10-11 随 [v02 对齐任务](../../tasks/archive/T20261010-prototype-v02-alignment/task.md)签收 |
| 视觉参数 | 当前基线与待定项见 [Visual Direction](../visual-direction.md) 第 1 节 |
| 窗口控制区 | macOS 左侧布局已确定；原生标题栏与拖拽区域需在 Electron 骨架中复核 |
| 尺寸复核 | 第 2 节尺寸需在交互原型中按 1024 / 1280 / 1440 宽度复核 |

本文件中的颜色仅用于区分状态语义，具体色值见交互原型 v01；代码块高亮色见交互原型 v02。尺寸单位为 px。

本版从 [v01](shell-spec-v01.md) 继承布局与节号，调整第 6、9 节的 Diff 与 Terminal 内容，并移除第 1 节已解决的 Terminal 实例问题。第 3、4、11 节按 2026-10-11 确认统一组件尺寸与 Session 选中字重，第 8 节补充工具关闭入口。第 2.2、6、7 节按交互原型 v02（2026-10-10 确认）修订消息列宽度、Agent 消息、代码块、新对话草稿与输入区位置。v01 保留作历史依据；交互原型 v01 / v02 尚未实现本次工具行为。

## 2. 窗口与区域

### 2.1 基准尺寸

- 设计基准窗口：1280×800；复核尺寸：1440×900。
- 最小窗口：1024×640。

### 2.2 区域尺寸

| 区域 | 默认 | 范围 | 规则 |
|---|---|---|---|
| 顶栏（Project Tab Bar） | 高 40 | 固定 | 所有模式一致 |
| 左侧导航 | 宽 248 | 固定；折叠后为 0 | 折叠状态为窗口级偏好（UX D-14） |
| 主画布顶栏 | 高 48 | 固定 | 显示当前 Session 或 View 信息 |
| Session Mode：Conversation 正文 | 最大宽 720，居中 | 最小 400 | 区域随窗口伸缩，正文不超过 720；消息列与输入框内容宽度相同，左右边缘对齐 |
| Session Mode：右侧边栏 | 宽 400 | 320–560，可拖拽 | 宽度按 Project 记忆 |
| Project View Mode：Conversation 列 | 宽 440 | 360–560，可拖拽分隔线 | 宽度按 Project 记忆；消息列与输入框左右边缘对齐 |
| Project View Mode：右侧区域 | 剩余宽度 | 最小 400 | Preview 与工具共享（UX P-B） |

### 2.3 空间不足时

1. 先将右侧区域或右侧边栏压缩到最小宽度，再压缩 Conversation 到最小宽度；
2. 不因空间不足自动折叠左侧导航或关闭右侧边栏，布局变化只由用户触发；
3. 达到最小窗口后不再缩小。

按最小值核算：Project View Mode 为 248 + 360 + 400 = 1008，Session Mode 打开右侧边栏为 248 + 400 + 320 = 968，均不超过 1024。

## 3. 顶栏

从左到右：窗口控制区 → 左侧导航折叠按钮 →（导航折叠时）New Chat 按钮 → Project Tabs → `+` → 右侧边栏按钮。

| 组件 | 尺寸 | 结构 | 状态 | 需求 |
|---|---|---|---|---|
| 导航折叠按钮 | 30×28 | 侧栏图标；导航折叠且当前 Project 有需关注的 Session 时，右上角显示 7px 注意力点 | Default / Hover / Focus | UX D-14 |
| Project Tab | 高 32，最大宽 200 | 注意力点（仅非当前 Tab）+ Project 名称（单行截断）+ 关闭按钮 | Default / Hover / Selected / Focus | FR-PROJ-002 |
| Tab 关闭按钮 | 18×18（2026-10-11 确认） | ×；当前 Tab 常显，其他 Tab 悬停时显示 | Default / Hover / Focus | FR-PROJ-002 |
| `+` 按钮 | 30×32（2026-10-11 确认） | 在新 Tab 中打开启动页 | Default / Hover / Focus | UX D-09 |
| 右侧边栏按钮 | 30×28 | 侧栏图标；展开时为 Selected | Default / Hover / Selected / Focus | UX P-C |

首发平台为 macOS，窗口控制区位于左侧（2026-10-08 确认）。Windows / Linux 的窗口控制按钮位于右侧，此时右侧边栏按钮位于其左侧，作为后续平台适配参考。

## 4. 左侧导航

| 组件 | 尺寸 | 结构 | 状态 | 需求 |
|---|---|---|---|---|
| New Chat 分裂按钮 | 高 36 | 主区：图标 + New Chat，使用 Default CLI；右区：▾ 打开 CLI 菜单 | Default / Hover / Focus | FR-CHAT-001、FR-CHAT-002 |
| CLI 菜单 | 宽 260 | 每项：CLI 名称、默认标记、“设为此 Project 默认”；不可用项禁用并说明原因 | Default / Hover / Disabled | FR-CHAT-002；UX D-11 |
| 区域标题 | 高 28 | PROJECT VIEWS / SESSIONS，小号大写 | — | FR-NAV-001 |
| Project View 项 | 高 32 | 图标 + 名称 | Default / Hover / Selected / Focus | FR-NAV-002 |
| 日期分组标题 | 高 24 | 今天 / 昨天 / 过去 7 天 / 更早 | — | FR-NAV-003 |
| Session 项 | 高 32 | CLI 标识 + 标题（单行截断）+ 右侧状态；悬停时在状态左侧显示 ⋯ | Default / Hover / Selected / Focus / Renaming | FR-NAV-003；UX P-D |
| CLI 标识 | 约 18×14 | 等宽小字 CX / CC，1px 描边，单色 | — | UX P-D |
| ⋯ 菜单 | 宽 160 | V1 仅含 Rename，点击后标题原位变为输入框，Enter 确认，Esc 取消 | Default / Hover | FR-NAV-003 |

Project View Mode 下只高亮当前 View；左侧 Conversation 所用 Session 不在 Session History 中重复高亮。

区域标题、日期分组标题与 CLI 菜单采用上表数值（2026-10-11 确认），替代原型 v01 的 30.5、28.5、225。

## 5. 状态指示

| 状态 | 形态 | 尺寸 | 清除时机 | 需求 |
|---|---|---|---|---|
| Running | 中性色 Spinner | 11 | 当前一轮结束 | FR-STATE-001 |
| Needs Input | 橙色圆点 | 7 | 用户作出答复 | FR-STATE-002 |
| Completed Unread | 绿色圆点 | 7 | 用户点击查看 | FR-STATE-004、FR-STATE-005 |
| Error | 红色圆点 | 7 | 用户点击查看 | FR-STATE-003 |
| 注意力点（Tab / 折叠按钮） | 同色圆点，取最高优先级 | 7 | 对应 Session 状态清除后 | UX D-07、D-14 |

注意力优先级：Needs Input > Error > Completed Unread。Running 不显示在 Tab 与折叠按钮上。

## 6. Conversation

| 组件 | 结构与规则 | 需求 |
|---|---|---|
| 用户消息 | 右对齐气泡，最大宽 80%；纯文本，不渲染 Markdown | FR-SESSION-001 |
| Agent 消息 | 左对齐正文，无气泡；按 Markdown 渲染：标题、列表（含嵌套）、表格（标注右对齐的列使用等宽数字，过宽时表格内横向滚动）、引用、分隔线、行内代码、加粗、链接、代码块。原始 HTML 按原文显示，图片与数学公式不渲染；链接只接受 http(s)，点击后用系统浏览器打开 | FR-SESSION-001 |
| 代码块 | 浅底圆角容器；顶部一行为语言标签（未标注时为 text）与“复制”按钮，复制成功后短暂显示“已复制”；正文等宽字体，不换行，过宽时横向滚动；关键字、字符串、数字使用三种低饱和色，注释为灰色，颜色只出现在代码块内；`diff` 的增删行整行加底色 | FR-SESSION-001 |
| 工具活动行 | 等宽字体，浅底；每行一个动作，如 Read / Edit / Run | FR-STATE-001 |
| 轮次完成行 | `Worked for 2m 18s · Done` 后可附本轮原生记录的文件数；点击打开该轮“本轮变更”，定位对应文件。原生记录不可用时显示“本轮变更不可用”及“查看项目变更”，不显示虚假的 0 | FR-STATE-007、FR-TOOL-002 |
| Needs Input 卡片 | 橙色点 + “等待你的确认” + CLI 原生内容 + 选项按钮（一个主按钮，其余为次按钮）+ “也可以在下方直接回复”；答复后变为只读记录，显示所选项 | FR-STATE-002；UX D-03 |
| Error 卡片 | 红色点 + 错误摘要 + “重试” + “查看详情”（展开原始输出） | FR-STATE-003；UX D-04 |
| 流式输出 | 逐段追加；用户位于底部时自动跟随，向上滚动后停止跟随并显示“回到最新” | FR-SESSION-001 |

对话从顶部开始排列：内容不足一屏时，首条消息位于顶部、下方留空，与 ChatGPT / Claude 桌面端一致（2026-10-10 确认，替代原型 v01 的底部对齐）。

打开 Session 时直接定位到底部，不出现从顶部滚动到底部的过程。

Session Mode 的新对话草稿：顶栏只显示 CLI 标识与“新对话”；问候语“今天要在 <Project> 中做什么？”、一行“<CLI 名称> 会直接在 <目录> 中执行”（主目录缩写为 `~`）与输入框作为一组，在画布中部略高于中线处居中。发送第一条消息后进入 Session，输入框回到底部，消息从顶部开始。Project View 左列的草稿不居中，见第 8 节（FR-CHAT-001；交互原型 v02，2026-10-10 确认）。

## 7. 输入区

| 部分 | 规则 | 需求 |
|---|---|---|
| 位置与宽度 | 固定在 Conversation 下方，内容宽度与消息列相同（第 2.2 节）；Session Mode 新对话草稿中与问候语一起居中（第 6 节） | FR-SESSION-001、FR-CHAT-001 |
| 文本输入 | 多行，自动增高至 8 行后滚动；Enter 发送，Shift+Enter 换行 | FR-INPUT-001 |
| `+` | 打开 Context / Attachment 菜单 | FR-INPUT-001 |
| 上下文标签 | 当前 View、从 Files 添加的文件；可单独移除 | FR-VIEW-007、FR-TOOL-001 |
| Model Selector | 位于输入区底行右侧，列出当前 Session CLI 支持的模型 | FR-INPUT-002 |
| Send / Stop | 输入为空时 Send 禁用；Running 时保留 Stop，并按 CLI 原生能力提供追加／排队发送；两者同时可用时不得用单一按钮隐藏发送 | FR-INPUT-001、input I-Q3 |

## 8. Project View

| 组件 | 结构与规则 | 需求 |
|---|---|---|
| Conversation 列顶栏 | 草稿：“新对话 · <View 名称>”；对话中：CLI 标识 + Session 标题 + 新建对话按钮 | UX P-A |
| 最近对话块 | 草稿上方显示该 View 最近 3 条对话（按最近用户消息排序）；更早的对话在 Session History 中查找 | UX P-A |
| 右侧区域顶栏 | 当前内容名称 + 更新时间 + 图标切换组：Preview ｜ Files、Diff、Browser、Terminal | UX P-B |
| 工具关闭入口 | 工具打开时，图标切换组右侧保留“关闭右侧工具”×；行为见 [UX 第 5 节](<../../docs/03. UX Specification.md#5-context-panel-交互模型>) | UX 第 5 节；2026-10-11 确认 |
| 图标提示 | 悬停 500ms 后在图标下方显示名称 | UX P-B |
| Preview 容器 | 只读，可滚动与缩放；显示“已更新 · 时间”；示例数据标注“示例数据” | FR-VIEW-003；UX D-06 |
| Preview 空状态 | 说明 + “生成 <View 名称>”按钮；点击后把可编辑的生成指令填入左侧输入框 | FR-VIEW-003 |
| Preview 渲染失败 | 保留上一版内容，顶部显示错误提示条 | UX D-06 |

## 9. 右侧边栏与工具

| 组件 | 结构与规则 | 需求 |
|---|---|---|
| 边栏顶栏 | 工具图标组 + 当前工具名 + 关闭按钮；默认打开该 Project 上次选择的工具 | UX P-C |
| Files | 目录树，可展开 / 折叠；选中文件后显示“添加到对话” | FR-TOOL-001 |
| Diff | 范围标题（“项目变更 · 相对 HEAD”或“本轮变更 · 关联轮次”）+ 文件列表（M / A / D、增删行数）+ 单文件 Diff。项目入口与轮次入口的数据来源见 UX 第 5 节；非 Git 项目显示说明与 Git 初始化指引；本轮记录不可用时提供“查看项目变更”入口 | FR-TOOL-002 |
| Browser | 地址栏 + 刷新 + 页面区域；默认打开上次地址 | FR-TOOL-003 |
| Terminal | Project 内的 Terminal Tabs + 新建 / 切换 / 关闭入口；首次打开创建一个实例，默认工作目录为 Project 目录。显示当前 Tab 的终端内容，不做分屏；隐藏面板、切换工具 / Session / Project 保留进程和输出，每个实例与 Agent Runtime 隔离 | FR-TOOL-004 |

## 10. 页面级组件

| 组件 | 结构与规则 | 需求 |
|---|---|---|
| 启动页 | 居中：产品名、“打开本地目录”主按钮、最近 Projects 列表（名称、路径、最近打开时间） | UX D-09 |
| 关闭确认对话框 | 标题“关闭 <Project>？”；说明受影响的 Session 数量及“当前一轮将停止，对话记录会保留”；按钮：取消 / 关闭并停止 | FR-PROJ-002；UX D-10 |
| 空状态 | Session History 为空：“还没有对话” + New Chat；Diff 无变更；Files 空目录 | — |
| 加载中 | Conversation 与 Preview 使用骨架行，不使用全屏遮罩 | — |
| CLI 不可用 | 说明未安装或未登录，并给出安装 / 登录指引 | FR-CHAT-002 |

## 11. 通用交互状态

| 状态 | 规则 |
|---|---|
| Hover | 背景轻微加深，不改变尺寸与布局 |
| Selected | 背景加深；Session 项保持字重 400，靠背景区分选中态（2026-10-11 确认）；其他组件字重 500 |
| Focus | 键盘导航时显示 2px 焦点环 |
| Disabled | 降低对比度，并通过提示或说明文字给出原因 |
