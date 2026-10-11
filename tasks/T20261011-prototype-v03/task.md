---
id: T20261011-prototype-v03
status: verifying
fr: [FR-VIEW-001, FR-VIEW-003, FR-VIEW-004, FR-VIEW-005, FR-VIEW-007, FR-TOOL-002, FR-TOOL-004]
ac: [AC-06, AC-07]
specs: [specs/project-view/spec.md]
created: 2026-10-11
---

# 交互原型 v03：Project View 组件化呈现与 Diff / Terminal

## 签收

- 状态：Q1～Q6 已确认（2026-10-11），v03 其余变更待人工评审 [在线原型](https://claude.ai/artifact/DnWzpmbXGAJF6gP7KBL7Hz)；任务保持 `verifying`。
- 审阅依据：下方未决问题、[验收标准](#验收标准)与[原型说明](../../design/prototypes/README.md#studio-灰度交互原型-v03)。
- Q1、Q2、Q3、Q6 已写入 [Project View spec](../../specs/project-view/spec.md)；Q4、Q5 记入[工程工具任务](../T20261009-context-tools/task.md#已确认事项)，起草 `specs/tools/spec.md` 时写入。整体采用后再更新 Shell Spec，并另建任务实现到桌面端。

## 未决问题

| 问题 | 推荐答案 |
|---|---|
| v03 的其余变更是否整体采用并签收本任务？清单见[原型说明](../../design/prototypes/README.md#studio-灰度交互原型-v03) | 采用。采用后把 Preview 状态、Diff 范围标题与 Terminal Tabs 的组件结构写入 Shell Spec，再另建任务实现到桌面端 |

## 目标

2026-10-11 用户在对话中要求“继续设计原型”，并在建议的方向中选择“两块都放进 v03”。本任务在交互原型 v02 的副本上做出 v03 供评审，覆盖两块尚未在原型中体现的已确认行为：

1. Project View：用 [Project View spec](../../specs/project-view/spec.md) §4.2 的受信组件重新呈现五个默认 View，补齐 Preview 状态、缩放与“当前 View”标签，为规格审阅（[路线图](<../../docs/06. Development Roadmap.md>)第 1 节第 1 项）提供可操作的依据。
2. 工程工具：Diff 的项目 / 本轮两种范围及降级、Terminal Tabs（FR-TOOL-002、FR-TOOL-004；[Shell Spec v02](../../design/components/shell-spec-v02.md) 第 6、9 节），为 `specs/tools/spec.md` 起草提供依据。

## 范围

- 做：
  - `design/prototypes/studio-prototype-v03.html` 与 `studio-prototype-v03/`：从 v02 复制，v02 文件不改（[design README](../../design/README.md) 第 5 节）。
  - 五个 View 均由“Knowledge + View Definition → 受信组件”渲染；Overview 的 Session 区块由客户端固定渲染（spec §3 FR-VIEW-001、§4.2）。
  - 组件清单：12 个组件及其 JSON 示例；查看当前 View 的 Knowledge / Definition 及大小、节点数（PV-Q7 校准）。
  - Preview 的 `empty`、`loading`、`ready`、`stale`、`error` 状态，演示控制可触发不完整写入、不受支持的组件和有效写入（spec §4.3）。
  - Preview 缩放候选（PV-Q9 交给设计确认）。
  - 可移除的“当前 View”标签及对话记录中的折叠标签（FR-VIEW-007、PV-Q11）。
  - Diff：项目变更（M / A / D、未跟踪文件）、本轮变更（从完成行进入、定位文件、保存后不变）、本轮变更不可用、非 Git 说明（FR-TOOL-002、UX 第 5 节）。
  - Terminal：Project 内多个 Tab，新建 / 切换 / 关闭，隐藏面板与 Session Stop 不影响终端（FR-TOOL-004）。
  - 发布在线链接并登记到原型索引。
- 不做：
  - 改写 Shell Spec、Project View spec、UX 或 FR（等评审结果）。
  - 桌面端实现、`specs/tools/spec.md` 起草。
  - Files、Browser 的行为调整（规格草稿未起草，见路线图第 6 项）；高保真视觉参数。

## 依据

- Project View：FR-VIEW-001～008；[Project View spec](../../specs/project-view/spec.md) §3、§4.2、§4.3、§4.4，PV-Q7、PV-Q9、PV-Q11；DEC-04～07；Shell Spec v02 第 8 节。
- 工具：FR-TOOL-002、FR-TOOL-004；[UX 第 5 节](<../../docs/03. UX Specification.md#5-context-panel-交互模型>)；DEC-08、DEC-09；AC-07 补充验收；Shell Spec v02 第 6、9 节。
- 布局：Shell Spec v02 第 2.2、2.3 节（窄窗口先压缩右侧区域，再压缩 Conversation）、第 8 节（关闭右侧工具 ×）。v02 原型未实现这两点，v03 按已确认规格补上。
- 原型约定：[prototypes README](../../design/prototypes/README.md) 第 2 节。

## 验收标准

- [x] 五个 View 只用 spec §4.2 的 12 个组件呈现，组件清单与数据 / 定义查看可用（spec §4.2）。证据：[Overview](evidence/W1-overview-1440.png)、[拆分后的 Architecture](evidence/W1-architecture-split-1440.png)、[组件清单](evidence/W1-component-gallery-1280.png)。
- [x] Preview 五种状态可在原型中触发，错误时保留上一版并显示提示条（spec §4.3；Shell Spec v02 第 8 节）。证据：[更新中](evidence/W1-architecture-updating-1280.png)、[错误提示条](evidence/W1-preview-error-bar-1280.png)、[无上一版时的错误](evidence/W1-preview-error-empty-1280.png)。
- [x] 从 View 草稿发送时可移除“当前 View”标签；发送后对话记录显示折叠标签，后续轮次不再附加（FR-VIEW-007；PV-Q11）。证据：[移除后从 + 菜单重新附加](evidence/W1-view-tag-removed-1280.png)、[已发送的标签](evidence/W1-view-tag-sent-1280.png)。
- [x] Diff 的项目变更、本轮变更、本轮不可用与非 Git 四种情形可操作（FR-TOOL-002；UX 第 5 节）。证据：[项目变更](evidence/W1-project-diff-1280.png)、[本轮变更](evidence/W1-turn-diff-1280.png)、[本轮不可用](evidence/W1-turn-unavailable-1280.png)、[非 Git](evidence/W1-non-git-1280.png)。
- [x] Terminal 可同时保留两个以上实例，新建 / 切换 / 关闭可用，收起面板或停止 Session 后输出与进程保留（FR-TOOL-004）。证据：[关闭运行中的终端前确认](evidence/W1-terminal-close-confirm-1280.png)。
- [x] Chrome 中 1024 / 1280 / 1440 宽度走查无控制台错误（自查）。1024 时 Conversation 375、右侧区域 401，页面无横向滚动：[1024 布局](evidence/W1-layout-1024.png)。
- [x] 人评审 Q1～Q6：全部采用推荐答案（2026-10-11，见下节）。
- [ ] 人评审 v03 其余变更是否整体采用。

## 已确认事项

2026-10-11 用户回复“accept your recommanded”，Q1～Q6 均采用推荐答案。

| 问题 | 回答（确认日期） |
|---|---|
| Q1 Preview 缩放控件用哪种？ | 方案 A：顶栏常驻“− 比例 +”，点击比例恢复 100%，右侧区域变窄时只保留比例；另支持 ⌘ / Ctrl + 滚轮、触控板捏合和 Preview 内 ⌘ + / − / 0（2026-10-11）。已写入 Project View spec FR-VIEW-005 第 4 条；比例范围与步长另列 PV-Q13 |
| Q2 关系图宽于 Preview 时怎么办？ | 在图内横向滚动，不自动缩小（2026-10-11）。已写入 spec §4.2 第 4 条 |
| Q3 Preview 中的代码路径点击后在 Files 中定位？ | 采用，属于用户主动打开工具（2026-10-11）。已写入 spec §4.2 第 2 条 |
| Q4 关闭仍在运行进程的 Terminal Tab 时是否确认？ | 在面板内确认；收起面板不确认（2026-10-11）。已记入工程工具任务 |
| Q5 关闭最后一个 Terminal Tab 后显示什么？ | 空状态和“新建终端”，不自动收起面板（2026-10-11）。已记入工程工具任务 |
| Q6 加载骨架何时显示？ | 读取超过 200 ms 才显示，之前不显示内容（2026-10-11）。已写入 spec §4.3 |

## 执行记录

- 2026-10-11：在 `task/prototype-v03` 分支（worktree `../AI Stduio.worktrees/prototype-v03`）开始；从 v02 复制原型。
- 2026-10-11：新增 `views.js`（受信组件 Renderer、关系图布局、校验、示例 Knowledge / Definition）；改写 `data.js`、`render.js`、`app.js` 与样式。发布[在线原型](https://claude.ai/artifact/DnWzpmbXGAJF6gP7KBL7Hz)，登记到原型索引；同步[工程工具任务](../T20261009-context-tools/task.md)的引用。路线图第 1 节正由 T20261011-review-boundaries 改写（主 checkout 中未提交），合入时未加 v03 的引用，待其提交后补充。
- 自查（W1 为实现者，不是独立验收）：本地静态服务 + agent-browser 0.38.2（Chrome），从界面入口操作：五个 View 切换、Architecture 拆分流程（更新中 → 新关系图 → 本轮变更 2 个 `.ai-studio/` 文件）、演示控制中的四种 Preview 写入、缩放按钮、两个对话框、Diff 四种情形、Terminal 新建 / 运行 / 关闭确认 / 收起后恢复、admin-console 生成 Architecture、“当前 View”标签移除与重新附加、Preview 路径在 Files 中定位。停止运行中的“支付模块开发”后，my-saas 的 `pnpm dev` 终端仍在运行。缩放：顶栏按钮与焦点在 Preview 内时的 ⌘ + / − / 0 均按预期变化（1 → 1.1 → 1.2 → 1.1 → 1）；⌘ + 滚轮只用合成的 `ctrlKey` 滚轮事件验证（1 → 1.1），真实触控板捏合未验证。`agent-browser errors` 无输出。
- 走查中修正：同层关系图连线的标签放不下，改为只画箭头、标签放入悬停提示；表格路径改为只在“/”后换行；本地预览缺少字符集声明导致乱码，HTML 首行加 `<meta charset="utf-8">`。
- 2026-10-11：按 Q1～Q6 的确认更新原型并重新发布到同一链接（第 2 版）：移除缩放方案 B；骨架改为读取超过 200 ms 才显示。自查：打开 Agent Team 后 100 ms 无骨架、300 ms 显示骨架、600 ms 显示内容，期间不出现空状态；admin-console 生成 Overview 正常；`agent-browser errors` 无输出。同步更新 Project View spec（新增未决问题 PV-Q13）、工程工具任务与原型说明。
