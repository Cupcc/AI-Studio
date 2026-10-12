# Prototypes

存放可交互原型、外部原型链接及操作说明。

## 1. 场景覆盖

| 场景 | 验证重点 | 依据 |
|---|---|---|
| 打开与切换 Project | 首次 Overview、状态恢复与 Project 独立性 | FR-PROJ-001、FR-PROJ-002、FR-PROJ-003；AC-01 |
| New Chat 与 Session 切换 | 创建后进入历史记录，切换后到最新 Conversation | FR-CHAT-001、FR-CHAT-002、FR-SESSION-001；AC-02 |
| 多 Session 状态 | 并发状态、完成提醒清除、等待用户内容 | FR-SESSION-003、FR-STATE-002、FR-STATE-004、FR-STATE-005；AC-03、AC-04、AC-05 |
| Project View | 左右布局，通过普通 CLI Session 更新 Preview | FR-VIEW-005、FR-VIEW-006、FR-VIEW-007、FR-VIEW-008；AC-06 |
| Context Panel | 用户主动打开、切换与收起工具 | FR-TOOL-001、FR-TOOL-002、FR-TOOL-003、FR-TOOL-004；AC-07 |

## 2. 原型说明

每份原型除[设计索引](../README.md)第 5 节的通用记录外，还记录入口链接或本地文件、起始画面、操作步骤、预期表现，以及模拟数据和当前未实现的行为。

本地原型需要运行环境时，补充实际启动命令。原型用于评审交互，产品验收仍遵循 [Acceptance Criteria](<../../docs/05. Acceptance Criteria.md>)。

## 3. 原型索引

| 原型 | 版本 | 状态 | 入口 | 依据 |
|---|---|---|---|---|
| Studio 灰度交互原型 | v01 | 已确认（2026-10-09），保留作历史依据；Conversation 部分由 v02 替代 | [在线原型](https://claude.ai/artifact/ANF4XoboMHvZjzn4tRT17c)；源文件 [studio-prototype-v01.html](studio-prototype-v01.html) + [studio-prototype-v01/](studio-prototype-v01/) | 线框图 v02；[Shell Spec v01](../components/shell-spec-v01.md)；AC-01 ~ AC-07 |
| Studio 灰度交互原型 | v02 | 已确认（2026-10-10） | [在线原型](https://claude.ai/artifact/7i4ULjj3vEo16mqqXYm5E1)；源文件 [studio-prototype-v02.html](studio-prototype-v02.html) + [studio-prototype-v02/](studio-prototype-v02/) | v01；[对照 ChatGPT / Claude 的候选调整](../../tasks/T20261010-conversation-layout/research.md) A1、A2、B1；FR-SESSION-001 |
| Studio 灰度交互原型 | v03 | 探索中：Q1～Q6 已确认（2026-10-11），其余变更待评审 | [在线原型](https://claude.ai/artifact/DnWzpmbXGAJF6gP7KBL7Hz)；源文件 [studio-prototype-v03.html](studio-prototype-v03.html) + [studio-prototype-v03/](studio-prototype-v03/) | v02；[Project View spec](../../specs/project-view/spec.md) §4.2～4.4；FR-TOOL-002、FR-TOOL-004；[T20261011-prototype-v03](../../tasks/T20261011-prototype-v03/task.md) |
| Studio 灰度交互原型 | v04 | 探索中：外观候选“统一毛玻璃”，待评审 | 在线原型待发布；源文件 [studio-prototype-v04.html](studio-prototype-v04.html) + [studio-prototype-v04/](studio-prototype-v04/) | v03；用户 2026-10-11～12 对话要求；[T20261012-prototype-v04-glass](../../tasks/T20261012-prototype-v04-glass/task.md) |

### Studio 灰度交互原型 v01

- **起始画面**：my-saas 的 Overview（首次打开 Project），左侧为新对话草稿。
- **运行方式**：在线链接直接打开；本地查看需通过任意静态服务器访问 `design/prototypes/`，例如 `python3 -m http.server`，再打开 `studio-prototype-v01.html`。窗口宽度需不小于 1024px。
- **操作步骤**：左下角“演示控制”列出 AC-01 ~ AC-07 的操作步骤，并可触发后台完成、后台请求确认、后台出错、CLI 未登录和重置。
- **预置事件**：约 10 秒后“支付模块开发”在后台完成（AC-04）；约 25 秒后 admin-console 的 Session 请求确认，Tab 出现橙点（D-07）；约 40 秒后 landing-page 的 Session 完成。
- **模拟数据**：所有 Project、Session、代码、Diff 与终端输出均为示例；Agent 回复由原型脚本生成，不调用真实 CLI。
- **未实现**：真实目录选择与文件读取、Session Resume、图片附件、Terminal 多实例、窗口尺寸以外的平台差异、最终视觉参数（当前基线见 [Visual Direction](../visual-direction.md) 第 1 节）。
- **工程工具差异**：项目 / 本轮 Diff 与 Terminal Tabs 的行为依据见 FR-TOOL-002、FR-TOOL-004，组件修订见 [Shell Spec v02](../components/shell-spec-v02.md) 第 6、9 节；原型 v01 / v02 均未覆盖；v03 已做出这些行为供评审（探索中），评审前不作为验收证据。
- **与 spec 的关系**：原型确定布局、组件外观与交互示意；行为与 spec 不一致时以 spec 为准，例如窗口失焦时不视为正在查看（[session spec](../../specs/session/spec.md) S-Q1）；原型中不足一屏的对话贴底显示，已改为从顶部开始（[Shell Spec v01](../components/shell-spec-v01.md) 第 6 节，2026-10-10 确认）。
- **对齐后的组件修订**：2026-10-11 确认并签收的组件尺寸与选中字重见 [Shell Spec v02](../components/shell-spec-v02.md) 第 3、4、11 节；View Mode 工具关闭入口见其第 8 节。原型源文件保留，复验截图见[归档验收](../../tasks/archive/T20261009-prototype-alignment/acceptance.md#6-2026-10-11-复验)。

### Studio 灰度交互原型 v02

在 v01 基础上让 Conversation 向 ChatGPT / Claude 桌面端对齐（[T20261010-prototype-v02](../../tasks/archive/T20261010-prototype-v02/task.md)），2026-10-10 评审通过、全部采用，规则写入 [Shell Spec v02](../components/shell-spec-v02.md) 第 2.2、6、7 节；桌面端实现见 [T20261010-prototype-v02-alignment](../../tasks/archive/T20261010-prototype-v02-alignment/task.md)（2026-10-11 签收）。未改动的部分与 v01 相同，上节说明继续适用。

- **变更**：
  - 对话从顶部开始排列（已确认，见 [Shell Spec v01](../components/shell-spec-v01.md) 第 6 节）；
  - Agent 回复按 Markdown 渲染：标题、有序 / 无序列表、表格（数字列右对齐）、引用、行内代码、加粗、链接，代码块带语言标签、轻量语法高亮（ts / js / bash）、`diff` 增删行底色和“复制”按钮；用户消息仍为纯文本；
  - Session Mode 的新对话草稿：问候语、执行位置与输入框一起居中；顶栏只保留 CLI 标识与“新对话”；发送第一条消息后输入框回到底部；
  - 消息列与输入框同为 720 内容宽度，左右边缘对齐；Project View 左列同样对齐。
- **运行方式**：同 v01；本地查看时打开 `studio-prototype-v02.html`。
- **起始画面**：my-saas 打开“运行测试并修复失败用例”（Markdown 示例）；landing-page 为新对话草稿（居中输入框）；admin-console 为 Overview。
- **对比 v01**：“演示控制”顶部列出 v02 变更，“对比 v01”按钮切回 v01 的呈现，再点一次恢复。
- **未改动**：Project View 左列的草稿（P-A，上方列出最近对话；确认不居中）、发送后的滚动跟随、消息复制等其他候选调整。
- **与确认结果的差异**：原型的 Markdown 解析为手写示意，不支持嵌套列表；确认范围包含嵌套列表，以 Shell Spec 为准（2026-10-10 确认）。

### Studio 灰度交互原型 v03

在 v02 基础上补齐 Project View 的组件化呈现与工程工具的已确认行为（[T20261011-prototype-v03](../../tasks/T20261011-prototype-v03/task.md)）。评审中提出的 Q1～Q6 于 2026-10-11 采用推荐答案，结论见该任务的已确认事项；其余变更待评审。未改动的部分与 v02 相同，上两节说明继续适用。

- **变更**：
  - Project View：五个 View 只用 [Project View spec](../../specs/project-view/spec.md) §4.2 的 12 个受信组件渲染，事实来自 Knowledge、排列来自 View Definition；关系图只给节点与边，布局由原型计算；Overview 的 Sessions 区块由客户端固定显示。
  - Preview 状态：没有上一版时读取超过 200 ms 才显示骨架；Agent 写入期间顶栏显示“更新中”并保留旧内容；稳定读取后仍失败时保留上一版并显示错误提示条，可复制错误摘要；没有上一版时显示错误空状态。
  - Preview 缩放：顶栏常驻“− 比例 +”，点击比例恢复 100%；⌘ + 滚轮 / 触控板捏合、焦点在 Preview 内时 ⌘ + / − / 0（PV-Q9）。
  - “当前 View”标签：View 左列草稿中可移除、可从 + 菜单重新附加；发送后在用户消息下折叠显示，展开只列出相关文件路径（PV-Q11）。
  - Preview 中的代码路径可点击，在 Files 中定位。
  - Diff：从工具入口打开为“项目变更”（M / A / D、未跟踪文件，不按 Session 区分）；从完成行“修改了 N 个文件”打开“本轮变更”（CLI 保存的补丁，之后的工作区修改不影响）；记录不可用时完成行显示“本轮变更不可用 · 查看项目变更”；非 Git 目录显示说明与 Terminal 入口。
  - Terminal：按 Project 保存多个 Tab，可新建、切换、关闭；关闭运行中的终端前在面板内确认；收起面板、切换 Project 或停止 Session 不影响终端。
  - Project View 右侧区域打开工具时，顶栏补上“关闭右侧工具”×（Shell Spec v02 第 8 节）；窗口变窄时按 Shell Spec v02 第 2.3 节先压缩右侧区域、再压缩 Conversation。
- **运行方式**：同 v01；本地查看时打开 `studio-prototype-v03.html`。
- **起始画面**：my-saas 的 Overview（组件化呈现）；landing-page 为新对话草稿；admin-console 没有 Knowledge，可演示生成与错误空状态。
- **演示控制**：顶部“v03 变更”按 Project View / Diff / Terminal 分组，提供跳转、组件清单、当前 View 的 Knowledge / Definition（含大小与节点数）和 Preview 写入模拟；原 v02 的“对比 v01”已移除。
- **未实现**：View Definition 的覆盖文件只在 Architecture 拆分示例中出现；Agent 对其他 View 的修改只更新时间，不改变内容；Browser、Files 行为同 v02；Terminal 命令为模拟输出。
- **与 spec 的关系**：原型把绑定路径直接写在组件的 `bind` 属性上，spec §4.1 中 `ViewDefinition.bindings` 的形状可据此细化；校验规则只示意未知组件、禁止属性和 HTML / 脚本 / 网络地址值，以 spec 为准。

### Studio 灰度交互原型 v04

v03 的副本，只换外观，用于和 v03 的白色原样式并排对比（[T20261012-prototype-v04-glass](../../tasks/T20261012-prototype-v04-glass/task.md)）。布局、交互、数据与演示场景同 v03，上节说明继续适用；两份 HTML 的差异只在样式表末尾的 `.skin-glass` 一节及版本标识。

- **变更**（待评审）：外观“统一毛玻璃”，参考 ChatGPT Desktop 的侧边栏。
  - 整个窗口是同一种毛玻璃，透出窗口后方的桌面并模糊，颜色随壁纸变化。顶栏、左侧导航和内容区四周的 8px 边距直接在玻璃上。
  - Conversation、右侧区域 / 边栏和启动页是叠在玻璃上的一层更浅的磨砂（圆角），浓淡分通透 / 适中 / 柔和三档，默认适中。
  - 消息气泡、代码块、表格、输入框、View 组件和工具面板是半透明白色面板；分隔线、Hover、选中和浅色底是半透明叠色。
  - Project Tab 改为胶囊形（高 32 不变），当前 Tab 为浅色凸起胶囊；菜单、对话框和演示控制面板是模糊背景的毛玻璃。
  - 文字改为中性灰，次要文字加深一档，玻璃上的对比度不低于 5.2:1。
- **与已确认基线的差异**：整体底色不再是白色（[Product Definition](<../../docs/01. Product Definition.md>) 第 8 章原则 23、[Visual Direction](../visual-direction.md) 第 2 节）；Project Tab 形状（[Shell Spec v02](../components/shell-spec-v02.md) 第 3 节）；内容区边距，1024 宽度时 Conversation 由 375 变为 367，仍不小于 360（Shell Spec v02 第 2 节）；灰色板由暖中性灰改为中性灰（Visual Direction 第 1 节）。模糊半径、透明度与色值是原型取值，不是最终视觉参数。
- **运行方式**：同 v01；本地查看时打开 `studio-prototype-v04.html`，与 `studio-prototype-v03.html` 对比。
- **演示控制**：顶部“v04 变更”说明外观并提供内容层浓淡与示例壁纸 A / B；其下为沿用的 v03 变更与验收场景。
- **未实现**：浏览器中没有真实桌面，原型以示例壁纸代替窗口后方的内容，并把模糊后的壁纸画成一层静态背景；真实的跟随桌面与其他窗口变化、窗口失焦时的变暗需在桌面端用 macOS 原生 vibrancy 实现。
