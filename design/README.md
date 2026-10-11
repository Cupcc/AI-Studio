# Design

AI Developer Studio V1.0 的设计工作区，用于保存设计资料、参考图片、界面方案和交互原型，逐步确定产品的视觉与操作体验。

## 人工审阅入口

- [组件修订确认记录](components/shell-spec-v02.md#1-已确认与待确认)。
- [交互原型 v02 的采用问题](../tasks/T20261010-prototype-v02/task.md#未决问题)与[评审依据](../tasks/T20261010-prototype-v02/task.md#签收)。
- [视觉参数待确定项](visual-direction.md#1-高保真阶段待确定)。

## 1. 设计依据

| 规格 | 用途 |
|---|---|
| [Product Definition](<../docs/01. Product Definition.md>) | 产品定位、核心概念与设计原则 |
| [Functional Requirements](<../docs/02. Functional Requirements.md>) | 功能行为与稳定的 FR 编号 |
| [UX Specification](<../docs/03. UX Specification.md>) | 页面结构、交互规则与视觉约束 |
| [Acceptance Criteria](<../docs/05. Acceptance Criteria.md>) | 核心场景与 FR ↔ AC 追踪 |

设计资料引用这些规格。涉及功能或交互行为的调整，应同步更新负责该主题的规格文档。

## 2. 目录结构

```text
design/
├── README.md                 # 设计索引与当前方案
├── visual-direction.md       # 视觉方向
├── references/               # 参考截图、灵感图片和参考说明
├── wireframes/               # 布局草图、线框图和流程图
├── screens/                  # 高保真界面图及可编辑源文件
├── components/               # 组件规范与状态示例
└── prototypes/               # 可交互原型或原型链接
```

| 资料 | 入口 |
|---|---|
| 视觉方向 | [visual-direction.md](visual-direction.md) |
| 参考资料 | [references/README.md](references/README.md) |
| 线框图与流程 | [wireframes/README.md](wireframes/README.md) |
| 高保真界面 | [screens/README.md](screens/README.md) |
| 组件规范 | [components/README.md](components/README.md) |
| 交互原型 | [prototypes/README.md](prototypes/README.md) |

## 3. 当前采用的方案

| 项目 | 采用版本 |
|---|---|
| 视觉方向 | [Visual Direction](visual-direction.md)；当前视觉参数见其第 1 节 |
| 参考截图 | 尚无 |
| 线框图 | v02，见 [wireframes](wireframes/README.md) |
| 高保真界面 | 尚无 |
| 组件规范 | [Shell Spec v01](components/shell-spec-v01.md) 基线；工具行为与原型对齐后的已确认组件修订见 [Shell Spec v02](components/shell-spec-v02.md) |
| 交互原型 | [Studio 灰度交互原型 v01](prototypes/README.md)；桌面端按其对齐，见[已归档任务](../tasks/archive/T20261009-prototype-alignment/task.md) |

方案确认后，在本节添加所采用版本的文件链接或原型链接。各版本的状态、确认日期和探索中的版本只记录在对应目录索引；探索稿继续保留在对应目录。

## 4. 首批设计任务

| 顺序 | 交付物 | 重点 | 需求 / 验收依据 |
|---|---|---|---|
| 1 | 视觉参考整理 | 轻量对话、Workspace 布局、按需使用工程工具 | Product Definition 第 2 章；UX Specification 第 8 章 |
| 2 | Session 主界面线框图与高保真稿 | Project Tabs、导航、Conversation、输入区 | FR-PROJ-002、FR-NAV-001、FR-NAV-003、FR-SESSION-001、FR-INPUT-001、FR-INPUT-002；AC-01、AC-02 |
| 3 | Project View 主界面线框图与高保真稿 | 左 Conversation、右 Preview；先覆盖 Overview 与 Architecture | FR-VIEW-001、FR-VIEW-003、FR-VIEW-005、FR-VIEW-006、FR-VIEW-007、FR-VIEW-008；AC-06 |
| 4 | Context Panel 与关键状态 | 四类工具、Running、Needs Input、Completed Unread、Error、空页面与加载中 | FR-TOOL-001、FR-TOOL-002、FR-TOOL-003、FR-TOOL-004、FR-STATE-001、FR-STATE-002、FR-STATE-003、FR-STATE-004、FR-STATE-005、FR-STATE-006；AC-04、AC-05、AC-07 |

后续补齐 Progress、Agent Team、Business Flow 的代表性 Preview，以及 Project 打开、New Chat、Session 状态转换等流程。

## 5. 文件与版本约定

- 图片、原型和源文件使用可读的英文小写名称，例如 `session-main-v01.png`、`project-view-architecture-v01.svg`。
- 同一方案的图片与可编辑源文件使用相同名称主体，便于对应。
- 在各目录索引中记录版本、状态和简短说明；方案状态使用“探索中 / 已确认 / 已归档”。
- 新版本使用递增编号；已确认版本的调整保留旧文件并更新索引。
- 设计说明标注相关 FR / AC、画布尺寸和待确认问题；尚未确定的内容明确标为待确认。
- 外部设计工具中的文件记录访问链接；导出的预览图保存在对应目录，便于直接查看。
- claude.ai 上的在线画布与原型默认私有，需由所有者在页面 Share 菜单中共享后他人才能访问。
