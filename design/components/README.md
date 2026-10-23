# Components

存放复用组件的视觉规范、状态示例和确认后的样式参数。

## 人工审阅入口

- [Shell Spec v02 确认记录与待确认项](shell-spec-v02.md#1-已确认与待确认)。
- [组件与原型差异的记录](../../tasks/archive/T20261009-prototype-alignment/report.md#待人决定)。

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
| [Shell Layout & Components](shell-spec-v02.md) | v02 | 原基线已确认（2026-10-11）；后续修订见其第 1 节 | 继承 v01 和 v02 Conversation；当前底部 Composer、信号格 effort 与 v06 UI 采用按其第 6、7 节，历史居中稿保留在原型 v02 |

新增规范时在此登记文件链接、版本与状态。
