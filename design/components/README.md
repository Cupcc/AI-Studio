# Components

存放复用组件的视觉规范、状态示例和确认后的样式参数。

## 人工审阅入口

- [Shell Spec v02 待确认项](shell-spec-v02.md#1-待确认)。
- [组件与原型差异的待决问题](../../tasks/T20261009-prototype-alignment/report.md#待人决定)。

## 1. 组件范围

- Project Tab 与新增 / 关闭入口。
- Project View 导航项与 Session History 列表项。
- Session 状态指示：Running、Needs Input、Completed Unread、Error。
- Conversation 消息、代码块与当前轮次完成标识。
- 输入框、Context / Attachment、Model Selector、Send / Stop。
- Context Panel 的工具入口、展开 / 收起控件。
- Empty、Loading、Error 等状态组件。

## 2. 规范内容

每个组件记录用途、结构、尺寸、颜色、字体、间距和适用的 Default / Hover / Selected / Focus / Disabled 状态，并引用相关 FR。

视觉参数的当前基线见 [Visual Direction](../visual-direction.md) 第 1 节。

## 3. 组件索引

| 规范 | 版本 | 状态 | 内容 |
|---|---|---|---|
| [Shell Layout & Components](shell-spec-v01.md) | v01 | 已确认（2026-10-09），保留作历史依据 | 窗口布局与组件基线；后续工具调整见 v02 |
| [Shell Layout & Components](shell-spec-v02.md) | v02 | 探索中（diff 待审阅；工具行为依据见 FR-TOOL-002、FR-TOOL-004） | 继承 v01，补充项目 / 本轮 Diff、Terminal Tabs 与 v01 对齐后的组件修订；不包含交互原型 v02 的 Conversation 探索 |

新增规范时在此登记文件链接、版本与状态。
