# 对照 ChatGPT / Claude 桌面端的候选调整

## 1. 候选调整

2026-10-10 整理。对照对象：ChatGPT macOS 桌面端、Claude 桌面端（Chat 模式；Code 模式与本产品最接近，一并参考）。当前状态取自本任务与 [T20261009-prototype-alignment](../T20261009-prototype-alignment/evidence/) 的截图和代码。

参考产品的描述来自公开资料和使用经验，**尚未截图留档**；标“待核实”的条目在两款产品的不同版本间有变化，采用前应补截图到 `design/references/`（[references 索引](../../design/references/README.md)目前为空）。

“冲突”列指与已确认内容不一致、需要人确认后改写对应文档的条目。A1、A2、B1 已在交互原型 v02 中探索（[T20261010-prototype-v02](../T20261010-prototype-v02/task.md)），评审通过后再写入 Shell Spec。

### 1.1 对阅读体验影响大

| # | 项目 | ChatGPT / Claude | 当前 | 建议 | 涉及文档 | 冲突 |
|---|---|---|---|---|---|---|
| A1 | Agent 消息 Markdown 渲染 | 两者都渲染标题、列表、表格、行内代码；代码块带语言标签、复制按钮和语法高亮 | `white-space: pre-wrap` 纯文本；Codex / Claude Code 的输出基本是 Markdown，列表、代码块、表格都按原文显示 | 渲染 Markdown（不渲染原始 HTML；链接用系统浏览器打开，遵循 `apps/desktop/src/main/security/policy.ts`）；代码块带复制按钮 | Shell Spec 第 6 节“Agent 消息”；session spec 4.4 | 否：FR-SESSION-001 要求“类似 ChatGPT 的阅读体验” |
| A2 | 新对话草稿 | 问候语与输入框一起在画布中部居中；发送第一条后输入框落到底部 | 标题在中部，输入框在底部；副标题显示完整本地路径（长路径会换行）；顶栏写“Codex CLI · 发送第一条消息后创建 Session” | 标题 + 输入框整体居中，发送后输入框回到底部；路径缩短为 Project 名或 `~/…` 形式；顶栏只保留 CLI 标识与“新对话” | Shell Spec 第 6、7 节；原型说明 | 否 |
| A3 | 消息复制 | 悬停消息显示操作栏：用户消息有复制、编辑；Agent 消息有复制、反馈、重新生成 | 无任何消息操作 | 只加“复制”（用户消息与 Agent 消息，悬停 / 键盘焦点时显示）；不做编辑、重新生成——CLI Session 不能改写已提交的轮（FR-SESSION-002；session spec 3.1 第 1 条） | Shell Spec 第 6 节 | 否（新增交互，需确认） |
| A4 | 工具活动的折叠 | ChatGPT 把推理折叠为“已思考 Xs”；Claude 把工具调用折叠成一行摘要，点开看细节；最终回答始终在显眼位置 | 每个工具一行等宽文字，始终展开；长任务中工具行会淹没回答 | 运行中显示最新动作；本轮结束后把工具行折叠进“Worked for … · N 个操作 ▸”，点击展开 | Shell Spec 第 6 节“工具活动行”“轮次完成行” | 是：Shell Spec 写“每行一个动作”，需改写 |

### 1.2 视觉细节（Visual Direction 第 1 节允许在高保真阶段调整）

| # | 项目 | ChatGPT / Claude | 当前 | 建议 |
|---|---|---|---|---|
| B1 | 输入框与消息列对齐 | 消息列与输入框左右边缘对齐 | 宽窗口下消息列内容宽 672（720 减两侧 24 内边距），输入框宽 720，右边缘错开 24px（[截图](evidence/W1-needs-input-top-anchored-1280.png)） | 两者使用同一内容宽度 |
| B2 | 正文字号 | 正文约 16px | 14px，行高 1.7 | 提到 15px，在 1024 / 1280 / 1440 复核 |
| B3 | 轮次间距 | 同一轮内部紧凑，用户消息前留更大间距 | 所有条目统一 14px | 用户消息前加大到约 28px |
| B4 | “回到最新” | 输入框上方居中的圆形 ↓ 图标按钮 | 文字胶囊“回到最新 ↓” | 改为圆形图标按钮，保留无障碍名称“回到最新” |
| B5 | 主画布顶栏 | ChatGPT 顶栏无分隔线；Claude 只显示对话标题，点击标题出现重命名等菜单 | 有底部分隔线；CLI 标识（CX）与 CLI 名称（Codex CLI）重复 | 去掉分隔线，去掉重复的 CLI 名称（悬停 CLI 标识显示全名）。**冲突**：session spec 3.2 第 6 条要求显示 CLI 名称 |
| B6 | New Chat 按钮 | 两者都是导航顶部的无边框行（图标 + New chat） | 带边框的分裂按钮 + CX 标识 | 保留分裂按钮（CLI 选择是本产品特有，D-11），弱化边框与底色 |

### 1.3 建议保持现状

| # | 项目 | 参考产品 | 理由 |
|---|---|---|---|
| C1 | 发送后的滚动 | ChatGPT 发送后把这条用户消息滚到视口顶部，回复在下方展开、超过一屏不强制跟随；Claude 跟随到底部（待核实，两者都有用户反馈争议） | 两款参考产品做法不同；Agent 一轮常持续数分钟、输出很长，跟随最新内容更符合 Codex / Claude Code 的使用习惯。保持 Shell Spec 第 6 节“位于底部时自动跟随” |
| C2 | Session History 日期分组 | Claude 为不分组的 Recents；ChatGPT 是否保留日期分组有相互矛盾的报告（待核实） | 已确认 D-12，且参考产品本身不一致 |
| C3 | 深色模式 | 两者都跟随系统 | 01 原则 23 与原型 v01 只做浅色主题 |
| C4 | 对话搜索、快捷键 | 两者都有搜索对话和 ⌘N / ⌘K 等快捷键 | 搜索在 V1 范围外（navigation spec 第 2 节）；快捷键已列为 NAV-Q11、PROJ-Q17，待回答 |

## 2. 已处理

| 项目 | ChatGPT / Claude | 当前 → 调整后 |
|---|---|---|
| 短对话的位置 | 首条消息在顶部，下方留空 | 贴底 → 从顶部开始（本任务） |

## 3. 资料来源

- assistant-ui 的仿制示例（社区作品，非官方规格，仅作旁证）：[Claude Clone](https://www.assistant-ui.com/examples/claude)、[ChatGPT Clone](https://www.assistant-ui.com/examples/chatgpt)。
- Claude 桌面端 2026-04 改版（侧栏会话管理、终端、文件、Diff、Preview 面板）：[Thurrott](https://www.thurrott.com/?p=334911)。
- ChatGPT 发送后把用户消息置顶的实现讨论：[Medium](https://medium.com/@disgcfrguy/the-scroll-problem-nobody-talks-about-when-building-ai-chat-interface-987c223cafc0)；自动滚动的用户反馈：[OpenAI Community](https://community.openai.com/t/screen-auto-scrolls-as-the-response-being-generated/782378)。
- ChatGPT 侧栏日期分组的矛盾报告：[OpenAI Community](https://community.openai.com/t/please-bring-back-the-chronological-sidebar-grouping/1280889)、[Northlab](https://northlabapps.com/blog/chatgpt-conversation-dates/)。
