---
id: T20261010-prototype-v02
status: verifying
fr: [FR-SESSION-001, FR-CHAT-001, FR-INPUT-001]
ac: [AC-02]
specs: [specs/session/spec.md, specs/chat/spec.md, specs/input/spec.md]
created: 2026-10-10
---

# 交互原型 v02：Conversation 向 ChatGPT / Claude 对齐

## 签收

- 状态：待人工签收；任务保持 `verifying`。
- 审阅依据：[验收标准与自查结果](#验收标准)。

## 未决问题

采用 v02 前需要回答，不影响评审原型本身。

| 问题 | 推荐答案 |
|---|---|
| 代码高亮在灰度界面中引入了三种低饱和色（关键字、字符串、数字），是否接受？ | 接受。代码块是工程内容，ChatGPT / Claude 都有高亮；颜色只出现在代码块内，不影响状态色的可辨识度 |
| Markdown 支持到什么程度？ | 按 v02：标题、列表、表格、引用、行内代码、加粗、链接、代码块。嵌套列表、图片、数学公式暂不支持；链接用系统浏览器打开 |
| 新对话问候语用什么文案？ | “今天要在 <Project> 中做什么？”，下方一行说明 CLI 与执行目录（`~` 缩写） |
| Project View 左列草稿是否也居中？ | 不居中。左列上方已有“最近对话”（P-A），居中会把它挤到一边 |

## 目标

2026-10-10 在对话中要求“先按照你的建议，设计出原型”。建议指 [对照 ChatGPT / Claude 的候选调整](../T20261010-conversation-layout/research.md) 中先做的三项：A1 Markdown 渲染、A2 新对话居中、B1 消息列与输入框对齐。本任务在交互原型 v01 的副本上做出 v02 供评审；评审通过后，再改写 Shell Spec 并另建任务实现到桌面端。

## 范围

- 做：
  - `design/prototypes/studio-prototype-v02.html` 与 `studio-prototype-v02/`：从 v01 复制，v01 文件不改（[design README](../../design/README.md) 第 5 节：已确认版本的调整保留旧文件）。
  - A1：Agent 回复按 Markdown 渲染，代码块带语言标签、语法高亮和复制按钮；用户消息保持纯文本。
  - A2：Session Mode 新对话草稿的问候语与输入框居中，发送第一条消息后输入框回到底部。
  - B1：消息列与输入框同为 720 内容宽度。
  - 同时带上已确认的“对话从顶部开始”（[T20261010-conversation-layout](../T20261010-conversation-layout/task.md)）。
  - 演示控制中提供“对比 v01”开关；发布在线链接并登记到原型索引。
- 不做：
  - Shell Spec、session / chat / input spec 的改写（等 v02 评审结果）。
  - 桌面端实现。
  - research.md 中的其他候选调整（A3、A4、B2～B6）。
  - Project View 左列草稿（P-A）的布局。

## 依据

- FR-SESSION-001“保持类似 ChatGPT 的阅读体验”。
- [research.md](../T20261010-conversation-layout/research.md) 第 1.1、1.2 节 A1、A2、B1。
- Shell Spec v01 第 2 节（Conversation 正文最大宽 720）、第 6 节、第 7 节。

## 验收标准

- [x] v02 的三项变更可在原型中直接看到，“对比 v01”能切回 v01 的呈现（自查截图：[Markdown 会话](evidence/W1-markdown-session-1440.png)、[diff 代码块与等待卡片](evidence/W1-markdown-diff-needs-input-1280.png)、[新对话居中](evidence/W1-draft-centered-1280.png)、[发送第一条后](evidence/W1-after-first-send-1280.png)、[对比 v01](evidence/W1-compare-v01-session-1440.png)）。
- [x] Chrome 中走查无控制台错误；代码块复制后显示“已复制”；1440 宽度下消息列与输入框左右边缘都在 484 / 1204（自查，脚本输出未留档）。
- [ ] 人评审 [在线原型](https://claude.ai/artifact/7i4ULjj3vEo16mqqXYm5E1)，决定 A1、A2、B1 是否采用。

## 已确认事项

| 问题 | 回答（确认日期） |
|---|---|
| 先做哪几项？ | A1、A2、B1，先做原型（2026-10-10） |

## 提交归位记录

- 2026-10-10 用户要求“提交归位，需要我验收的地方停下”；原型源文件、设计索引与截图证据归入 `task/prototype-v02`，基于 `task/conversation-layout`，保留其任务引用与已确认的顶部排列规则。
- 保持 `verifying`；v02 仍为探索稿，等待人工评审 A1、A2、B1 和上方未决问题后再决定是否采用。
