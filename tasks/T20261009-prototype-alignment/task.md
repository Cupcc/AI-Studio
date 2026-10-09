---
id: T20261009-prototype-alignment
status: in_progress
fr: [FR-PROJ-001, FR-PROJ-002, FR-NAV-001, FR-NAV-002, FR-NAV-003, FR-CHAT-001, FR-SESSION-001, FR-STATE-001, FR-STATE-002, FR-STATE-003, FR-STATE-004, FR-INPUT-001, FR-INPUT-002, FR-TOOL-001]
ac: [AC-01, AC-02, AC-04, AC-05, AC-07]
specs: [specs/project/spec.md, specs/navigation/spec.md, specs/chat/spec.md, specs/session/spec.md, specs/input/spec.md]
created: 2026-10-09
---

# 桌面端界面按交互原型 v01 对齐

## 目标

2026-10-09 确认交互原型 v01 与 Shell Spec v01，并要求“下一步按照 v01 的原型对齐设计”。本任务把阶段 1 已实现的界面（[T20261009-project-shell](../T20261009-project-shell/task.md)、[T20261009-session-slice](../T20261009-session-slice/task.md)）的外观与组件结构对齐到原型 v01，使阶段 1 签收有已确认的界面依据。

## 范围

- 做：
  - 视觉参数：以原型 v01 的色值、字体（IBM Plex Sans / Mono，随应用打包，不从网络加载）、圆角、阴影和图标替换 `tokens.css` 中的临时值；只保留浅色主题（01 原则 23、原型 v01）。
  - 组件外观与结构：顶栏与 Project Tab、New Chat 与 CLI 菜单、左侧导航与 Session 列表项、Conversation 顶栏与草稿页、消息与工具活动、Needs Input / Error 卡片、输入区（圆角输入框、图标式 Send / Stop、Model Selector 外观）、右侧区域顶栏、关闭确认对话框、启动页、悬停提示。
  - 1024 / 1280 / 1440 三种宽度截图复核（Shell Spec v01 第 11 节）。
- 不做：
  - 行为变化。原型与 spec 冲突时以 spec 为准（例如 [session spec](../../specs/session/spec.md) S-Q1(c)）。
  - 尚未实现的内容：Preview 与五个默认 View、View 左侧的最近对话块、四类工具内容、文件上下文、“修改了 N 个文件”链接。它们由 [T20261009-project-view](../T20261009-project-view/task.md)、[T20261009-context-tools](../T20261009-context-tools/task.md) 实现，届时同样以原型 v01 为界面依据。
  - 原型中的“演示控制”面板与模拟数据。

## 依据

- 设计：[交互原型 v01](../../design/prototypes/README.md)（已确认，2026-10-09）；[Shell Spec v01](../../design/components/shell-spec-v01.md)（已确认，2026-10-09）；[Visual Direction](../../design/visual-direction.md) 第 5 节。
- 产品：[01. Product Definition](<../../docs/01. Product Definition.md>) 第 8 节原则 23；[03. UX Specification](<../../docs/03. UX Specification.md>) 第 7、8 节。
- 行为：上方 frontmatter 所列 spec。
- 差异清单：[research.md](research.md)。

## 验收标准

- [ ] research.md 差异清单中标为“本任务”的每一项已对齐，或注明保留差异及原因。
- [ ] 1024 / 1280 / 1440 宽度下 Session Mode、Project View Mode 及 Needs Input、Error 状态的截图存入 `evidence/`，并与原型对照（Shell Spec v01 第 1、11 节；AC-01、AC-05）。
- [ ] 不改变行为：`pnpm typecheck`、`pnpm test`、`pnpm test:e2e` 通过；测试只因可见文案或结构调整而修改选择器，不放宽断言。
- [ ] 字体随应用打包，CSP 不放开外部字体来源（04 第 2 节；DEC-02）。

## 未决问题

| 问题 | 回答（确认日期） |
|---|---|
| “按照 v01 的原型对齐设计”是否包含原型的色值与字体（原型 README 原把视觉参数列为“待高保真”）？ | 按包含执行：用户确认原型 v01 后要求按其对齐（2026-10-09）；高保真阶段仍可调整，见 Visual Direction 第 5 节 |
