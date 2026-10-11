---
id: T20261010-prototype-v02-alignment
status: done
fr: [FR-SESSION-001, FR-CHAT-001, FR-INPUT-001]
ac: [AC-02]
specs: [specs/session/spec.md, specs/chat/spec.md, specs/input/spec.md]
created: 2026-10-10
---

# 桌面端按交互原型 v02 对齐 Conversation

## 目标

2026-10-10 用户要求“推进和 v2 原型设计的对齐工作”，并在对话中确认全部采用交互原型 v02 的 A1、A2、B1（[T20261010-prototype-v02](../T20261010-prototype-v02/task.md#已确认事项)）。本任务把这三项实现到桌面端：Agent 回复按 Markdown 渲染、Session Mode 新对话草稿居中、消息列与输入框等宽。

## 范围

- 做：
  - A1：Agent 消息按 Markdown 渲染；代码块带语言标签、语法高亮、`diff` 增删行底色与“复制”按钮；链接用系统浏览器打开。用户消息保持纯文本。
  - A2：Session Mode 新对话草稿的顶栏、问候语、执行位置（`~` 缩写）与输入框居中；发送第一条消息后输入框回到底部。
  - B1：消息列与输入框内容宽度相同，左右边缘对齐。
  - 为 A1 所需的主进程能力补充安全策略：只允许 http(s) 链接交给系统浏览器；只放行剪贴板写入权限。
  - 单元测试、E2E 与 1024 / 1280 / 1440 三种宽度截图。
- 不做：
  - Project View 左列（尚未实现，[T20261009-project-view](../../T20261009-project-view/task.md)）；实现时沿用 Shell Spec v02 第 2.2、8 节，草稿不居中。
  - [候选调整](../../T20261010-conversation-layout/research.md)中的 A3、A4、B2～B6。
  - 启动页等其他位置的路径显示方式。

## 依据

- 设计：[交互原型 v02](../../../design/prototypes/README.md#studio-灰度交互原型-v02)（已确认，2026-10-10）；[Shell Spec v02](../../../design/components/shell-spec-v02.md) 第 2.2、6、7 节。
- 行为：[session spec](../../../specs/session/spec.md) 第 3.2 节第 5 条、第 4.4 节；[chat spec](../../../specs/chat/spec.md) FR-CHAT-001 第 4 条；[input spec](../../../specs/input/spec.md) FR-INPUT-001 布局第 1 条。
- 安全：[DEC-02](<../../../docs/07. Decisions.md>)（默认拒绝新窗口、外部导航与权限请求）。

## 验收标准

由 AC-02“Agent 输出以流式方式显示”与 FR-SESSION-001“类似 ChatGPT 的阅读体验”细化，按 Shell Spec v02 收紧：

- [x] Agent 消息渲染标题、列表（含嵌套）、表格（右对齐列）、引用、分隔线、行内代码、加粗、链接与代码块；原始 HTML 按原文显示，图片与数学公式不渲染；用户消息保持纯文本（Shell Spec v02 第 6 节）：`markdown.test.tsx` “Agent reply Markdown”；E2E `session.spec.ts` Markdown 用例；[截图 1280](evidence/W1-markdown-1280.png)。
- [x] 代码块显示语言标签（未标注为 text）、关键字 / 字符串 / 数字 / 注释四类高亮与 `diff` 增删行底色；“复制”把代码原文写入系统剪贴板并显示“已复制”（Shell Spec v02 第 6 节）：`markdown.test.tsx` “Code block”；E2E 从主进程读回剪贴板内容并在结束后恢复原剪贴板。
- [x] 点击 http(s) 链接用系统浏览器打开，应用窗口不跳转、不新开窗口；其他协议不生成链接（Shell Spec v02 第 6 节；DEC-02）：`policy.test.ts`；E2E 中替换 `shell.openExternal` 记录调用，页面 URL 与窗口数不变。
- [x] 新对话草稿顶栏只有 CLI 标识与“新对话”；问候语、执行位置（`~` 缩写）与输入框一起居中；发送第一条消息后输入框在底部、首条消息在顶部（Shell Spec v02 第 6 节；chat spec FR-CHAT-001 第 4 条；AC-02）：`session.test.tsx` “New chat draft”、`project-service.test.ts` “display path”；E2E `alignment.spec.ts` 草稿用例与 `session.spec.ts` AC-02 用例；[截图](evidence/W1-draft-1280.png)（E2E 目录在系统临时目录下，不在主目录内，因此显示完整路径）。
- [x] 1024 / 1280 / 1440 宽度下消息列与输入框左右边缘对齐，布局不变量保持（Shell Spec v02 第 2.2 节）：`alignment.spec.ts` 对每个会话状态断言左右边缘差 ≤ 0.5px，1440 下为 484 / 1204，与原型 v02 一致；[边缘数据](evidence/W1-layout-edges.json)、[1024](evidence/W1-markdown-1024.png)、[1440](evidence/W1-markdown-1440.png)。
- [x] `pnpm typecheck`、`pnpm test`、`pnpm test:e2e` 通过：E2E 26 / 26（[日志](evidence/W1-e2e.log)，屏幕未锁定时运行）。

## 实现记录

- 依赖：`react-markdown` 10.1.0、`remark-gfm` 4.0.1（表格等 GFM 语法）、`lowlight` 3.3.0（highlight.js 常用 37 种语言）。原始 HTML 由 react-markdown 转为文本；高亮只把 highlight.js 的关键字、字面量、字符串、正则、数字、注释映射到 `tokens.css` 的四个颜色，其余保持正文色；`diff` / `patch` 按行着底色，`+++` / `---` 文件头不着色。
- 链接：Renderer 只为 http(s) 生成 `target="_blank"` 链接；主进程 `setWindowOpenHandler` 校验后调用 `shell.openExternal`，仍拒绝新窗口。复制：保持默认拒绝权限，只对 Renderer 来源放行 `clipboard-sanitized-write`；自查时去掉该例外，E2E 复制用例失败，说明例外是必要的。剪贴板不可用时退回到选中代码并提示按 ⌘C。
- `~` 缩写：Project 记录新增 `displayPath`，由主进程按主目录计算，只用于显示；`localPath` 不变。
- 宽度对齐：消息列最大宽改为 720 加两侧内边距。macOS 设为始终显示滚动条时，对话滚动区两侧各预留 15px 滚动条槽（`scrollbar-gutter: stable both-edges`），输入区按实测槽宽增加同样的内边距，否则 1024 宽度下左右边缘相差 11px。浮动滚动条下槽宽为 0，布局不变。
- 草稿：`justify-content: safe center`，窗口过矮时从顶部开始，不会被裁掉。

## 已确认事项

| 问题 | 回答（确认日期） |
|---|---|
| A1、A2、B1 是否实现到桌面端？ | 是，用户要求“推进和 v2 原型设计的对齐工作”（2026-10-10） |
| 是否签收本任务？ | 审阅签收，并要求合并（2026-10-11） |

## 合并记录

- 2026-10-11 合并前把分支 rebase 到本地 main（含 `411ce12` 对滚动跟随的修复与 `1a22396` 的 v01 签收文档），`Conversation.tsx`、`session.test.tsx` 与设计索引、Shell Spec v02、路线图的冲突两边保留；rebase 后重新验证：类型检查通过，单元测试 Adapter 181 项、桌面端 148 项通过，完整 E2E 26 / 26 通过（[日志](evidence/W1-e2e-rebased.log)，屏幕未锁定）。
