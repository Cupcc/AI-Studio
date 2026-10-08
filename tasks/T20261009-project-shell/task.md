---
id: T20261009-project-shell
status: draft
fr: [FR-PROJ-001, FR-PROJ-002, FR-PROJ-003, FR-NAV-001, FR-NAV-002]
ac: [AC-01]
specs: [specs/project/spec.md, specs/navigation/spec.md]
created: 2026-10-09
---

# Project 壳层与导航结构

## 目标

在应用骨架上实现 Project 的打开、多 Tab 切换、关闭与状态恢复，以及窗口四区域结构：顶栏、左侧导航（Project Views 区与 Session History 区的结构）、Main Canvas 容器、右侧边栏容器（FR-PROJ-001～003、FR-NAV-001～002；AC-01）。

## 范围

- 做：
  - 启动页、“打开本地目录”、最近 Projects；`+` Tab；已打开目录切换到对应 Tab（FR-PROJ-001；UX D-09）。
  - Project Tabs：切换、关闭、关闭确认对话框（UI 与流程）、非当前 Tab 注意力点（渲染）（FR-PROJ-002；UX D-07、D-10）。
  - 状态恢复：上次选中的 View 或 Session、右侧边栏展开状态与当前工具、宽度；首次进入为 Overview（FR-PROJ-003）。
  - 左侧导航：New Chat 位置、PROJECT VIEWS 区与默认五项、SESSIONS 区容器、分隔线、折叠（FR-NAV-001、FR-NAV-002；UX 第 8 节；D-14）。
  - 右侧边栏容器：开关、单一入口、按 Project 记忆宽度与上次工具，工具内容为占位（UX 第 5 节；D-13；P-C）。
  - Project View 项点击后切换 Main Canvas 至对应 View 的占位页；Project View 实现见 [T20261009-project-view](../T20261009-project-view/task.md)。
  - 临时视觉参数：在高保真评审前使用中性色占位 Token，集中定义，便于替换（[Visual Direction](../../design/visual-direction.md) 第 5 节）。
- 不做：Session History 列表内容与 Session 状态来源、New Chat 草稿与 Session 创建（见 [T20261009-session-slice](../T20261009-session-slice/task.md)）；四类工具内容（见 [T20261009-context-tools](../T20261009-context-tools/task.md)）。

## 与 session-slice 的接口

- Tab 注意力点与关闭确认需要“某 Project 的最高优先级注意力状态”和“Running / Needs Input Session 数量”，由 session-slice 提供；本 task 以接口占位实现渲染与流程。
- 关闭确认后的“停止当前一轮”由 session-slice 实现。
- SESSIONS 区容器由本 task 提供，列表内容由 session-slice 填充。

## 依据

- 功能：[02. Functional Requirements](<../../docs/02. Functional Requirements.md>) FR-PROJ-001～003、FR-NAV-001～002。
- 界面：[03. UX Specification](<../../docs/03. UX Specification.md>) 第 3、5、6、7、8 节；第 10 节 D-07、D-09、D-10、D-13、D-14、D-15、P-C；[Shell Spec v01](../../design/components/shell-spec-v01.md) 第 1、2、3、8、9、10 节；线框图 v02。
- 数据模型：[04. Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 5 节 Project。
- 验收：[05. Acceptance Criteria](<../../docs/05. Acceptance Criteria.md>) AC-01。

## 验收标准

由 spec 草稿完成后细化，至少包括：

- [ ] 同时打开三个本地目录，通过 Tabs 切换，各 Project 的 Project View 选择与右侧边栏状态保持独立（AC-01）。
- [ ] 重新打开 Project 恢复上次状态；首次打开进入 Overview（FR-PROJ-003）。
- [ ] 选择已打开的目录时切换到对应 Tab，不重复打开（FR-PROJ-001）。
- [ ] 布局变化只由用户触发，空间不足时按 Shell Spec v01 第 1.3 节压缩，不自动折叠或关闭区域。

## 未决问题

| 问题 | 回答（确认日期） |
|---|---|
| spec 草稿（`specs/project/`、`specs/navigation/`）完成后补充 |  |
