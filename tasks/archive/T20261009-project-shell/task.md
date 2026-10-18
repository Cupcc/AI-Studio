---
id: T20261009-project-shell
status: done
fr: [FR-PROJ-001, FR-PROJ-002, FR-PROJ-003, FR-NAV-001, FR-NAV-002]
ac: [AC-01]
specs: [specs/project/spec.md, specs/navigation/spec.md]
created: 2026-10-09
---

# Project 壳层与导航结构

## 当前收尾（2026-10-19）

- 状态：`done`；Main Agent 按 Task Protocol 核对当前授权范围、完成条件、独立评审与证据后收尾，并在本次变更中整体归档。依据为用户要求路线图已完成事项移除、未完成继续推进及后续「continue」；真实 CLI 和发布范围遵循 DEC-16～22。
- 十一条壳层标准按 W3 独立证据、当前完整焦点回归、W28 原生布局与真实 Project 关闭超时 / 重试核对完成。真实 Session、View 和四工具接缝由各负责记录补充，历史占位测试仍保留原基线。
- 基线：应用源码 `9cd17ef`，随后仅更新文档及归档路径。W27 / W28 独立评审、最终包指纹与真实 UI 结果见[总体验收](../T20261009-v1-foundation-slice/acceptance.md)；Main Agent 最终完整 Electron **49 / 49**、基础门禁 **36 / 257 / 1172**、`1.0.0` arm64 打包和 open 冒烟见[最终报告](../T20261009-v1-foundation-slice/report.md)。此前锁屏条件已解除，没有遗留的技术收尾阻塞。
- 人工接受与技术收尾分开：既有体验确认保留；新增本轮 Diff、推理控制 / 公开输出及图片 / Skill 仍待人工验收。Claude 后续、未观察后代 / 共享 MCP 的证明边界、macOS 13 实机和暂不发布边界继续由总体验收及路线图维护；不改写历史验证或把草稿标成人工确认。

## 历史签收入口（当前收尾见上）

- 人工体验：已随现有 V1 功能验收通过（2026-10-18），范围与确认依据见[总体验收](../T20261009-v1-foundation-slice/acceptance.md#人工功能验收)；当时任务保持 `verifying`，技术收尾按 Lifecycle 执行。
- 审阅依据：[验收记录](acceptance.md)、[交付报告](report.md)。

## 待审阅规格

非阻塞问题留在 [Project](../../../specs/project/spec.md#11-未决问题)、[Navigation](../../../specs/navigation/spec.md#11-未决问题) 的未决问题章节待确认，先按推荐实现。

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
  - 临时视觉参数：在高保真评审前使用中性色占位 Token，集中定义，便于替换（[Visual Direction](../../../design/visual-direction.md) 第 1 节）。
- 不做：Session History 列表内容与 Session 状态来源、New Chat 草稿与 Session 创建（见 [T20261009-session-slice](../T20261009-session-slice/task.md)）；四类工具内容（见 [T20261009-context-tools](../T20261009-context-tools/task.md)）。

## 与 session-slice 的接口

- Tab 注意力点与关闭确认需要“某 Project 的最高优先级注意力状态”和“Running / Needs Input Session 数量”，由 session-slice 提供；本 task 以接口占位实现渲染与流程。
- 关闭确认后的“停止当前一轮”由 session-slice 实现。
- SESSIONS 区容器由本 task 提供，列表内容由 session-slice 填充。

## 依据

- 功能：[02. Functional Requirements](<../../../docs/02. Functional Requirements.md>) FR-PROJ-001～003、FR-NAV-001～002。
- 界面：[03. UX Specification](<../../../docs/03. UX Specification.md>) 第 3、5、6、7、8 节；第 10 节 D-07、D-09、D-10、D-13、D-14、D-15、P-C；[Shell Spec v01](../../../design/components/shell-spec-v01.md) 第 2、3、4、9、10、11 节；线框图 v02。
- 数据模型：[04. Technical Requirements](<../../../docs/04. Technical Requirements.md>) 第 6 节 Project。
- 验收：[05. Acceptance Criteria](<../../../docs/05. Acceptance Criteria.md>) AC-01。

## 验收标准

细则见 [specs/project/spec.md](../../../specs/project/spec.md) 与 [specs/navigation/spec.md](../../../specs/navigation/spec.md)（草稿）；阻塞问题 PROJ-Q1～Q3 已于 2026-10-09 确认，其余问题按 spec 推荐实现、保持待确认（2026-10-09 对话指示）。

- [x] 同时打开三个本地目录，通过 Tabs 切换；各 Project 的 Main Canvas 选择（View / 草稿 / Session 占位）与右侧边栏状态（开关、工具、宽度）互不影响（AC-01；project spec 3.2.6）。
- [x] 启动页以 Tab 呈现：打开本地目录、最近 Projects；`+` 新建或切换到启动页 Tab；关闭最后一个 Project Tab 回到启动页，窗口不关闭；选择已打开目录时切换到对应 Tab 并关闭该启动页 Tab（FR-PROJ-001；D-09；PROJ-Q2 确认）。
- [x] 同一目录判定：符号链接、等价路径打开同一 Project，不重复打开（FR-PROJ-001；project spec 3.1.3）；非目录、不存在、不可读的路径给出说明，不创建 Project。
- [x] 重启应用后恢复 Tab 集合、顺序与当前 Tab；重新打开 Project 恢复上次的 Main Canvas 内容与右侧边栏状态；首次打开进入 Overview；恢复目标不存在时回落 Overview（FR-PROJ-003；PROJ-Q1 确认；PROJ-Q8）。
- [x] 右侧区域状态在 Session Mode 与 Project View Mode 下分开保存，`last_tool` 共享；从导航进入 View 时右侧显示 Preview（PROJ-Q3 确认；AC-06 前提）。
- [x] 非当前 Tab 显示单个注意力点（Needs Input > Error > Completed Unread，不显示 Running），数据来自 session 模块接口；本 task 以可替换的数据源实现并测试渲染（FR-PROJ-002；D-07）。
- [x] 关闭有 Running / Needs Input Session 的 Tab 前显示确认对话框，确认后调用 session 模块的停止接口；无此类 Session 时直接关闭（FR-PROJ-002；D-10）。停止接口由 session-slice 实现，本 task 以接口占位验证流程。
- [x] 左侧导航：New Chat 位置、PROJECT VIEWS 默认五项与 SESSIONS 区容器、分隔线；只高亮当前 View；折叠后顶栏保留展开按钮与 New Chat，并显示当前 Project 注意力点；折叠状态为窗口级且跨重启保留（FR-NAV-001、FR-NAV-002；D-14；navigation spec 3.2、3.4）。
- [x] 窗口布局：区域尺寸与范围符合 Shell Spec v01 第 2.2 节；空间不足时按第 1.3 节压缩，不自动折叠或关闭任何区域；在 1024 / 1280 / 1440 宽度下截图留证。
- [x] Agent 或后台事件不改变 Workspace 布局：Session 状态变化不切换 Tab、View、Session 或右侧工具（01 第 8 节原则 21、22；project spec 3.3.1）。
- [x] 单元测试覆盖 Project 识别、状态保存与恢复、Tab 规则；Playwright 覆盖三 Project 切换与重启恢复（AC-01）。

## 已确认事项

| 问题 | 回答（确认日期） |
|---|---|
| spec 阻塞问题 PROJ-Q1～Q3 | 已回答，见 `specs/project/spec.md` 第 1.2 节（2026-10-09 确认） |
