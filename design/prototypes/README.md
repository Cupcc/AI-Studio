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

### Studio 灰度交互原型 v01

- **起始画面**：my-saas 的 Overview（首次打开 Project），左侧为新对话草稿。
- **运行方式**：在线链接直接打开；本地查看需通过任意静态服务器访问 `design/prototypes/`，例如 `python3 -m http.server`，再打开 `studio-prototype-v01.html`。窗口宽度需不小于 1024px。
- **操作步骤**：左下角“演示控制”列出 AC-01 ~ AC-07 的操作步骤，并可触发后台完成、后台请求确认、后台出错、CLI 未登录和重置。
- **预置事件**：约 10 秒后“支付模块开发”在后台完成（AC-04）；约 25 秒后 admin-console 的 Session 请求确认，Tab 出现橙点（D-07）；约 40 秒后 landing-page 的 Session 完成。
- **模拟数据**：所有 Project、Session、代码、Diff 与终端输出均为示例；Agent 回复由原型脚本生成，不调用真实 CLI。
- **未实现**：真实目录选择与文件读取、Session Resume、图片附件、Terminal 多实例、窗口尺寸以外的平台差异、最终视觉参数（当前基线见 [Visual Direction](../visual-direction.md) 第 1 节）。
- **工程工具差异**：项目 / 本轮 Diff 与 Terminal Tabs 的行为依据见 FR-TOOL-002、FR-TOOL-004，组件修订见 [Shell Spec v02](../components/shell-spec-v02.md) 第 6、9 节；现有原型 v01 / v02 均未覆盖，不作为这些能力的验收证据。
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
