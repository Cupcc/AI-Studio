# Wireframes

存放页面布局草图、低保真线框图、信息架构和交互流程图。

## 1. 首批内容

- Session 主界面：Project Tabs、导航、Conversation 和输入区。
- Project View 主界面：左 Conversation、右 Preview。
- Context Panel：收起、展开与四类工具切换。

后续补充全局信息架构、Project 打开、New Chat、Session 生命周期与状态转换、Project View 使用流程。交互依据见 [UX Specification](<../../docs/03. UX Specification.md>)。

## 2. 文件说明

保存可编辑源文件及便于查看的 PNG / SVG / PDF 导出。每份方案除[设计索引](../README.md)第 5 节的通用记录外，还说明布局和关键操作路径。

## 3. 方案索引

| 方案 | 版本 | 状态 | 画布 | 覆盖 | 链接 |
|---|---|---|---|---|---|
| 已采用方案组合（A2 + B1 图标切换 + 单一右侧边栏 + D2） | v02 | 已确认（2026-10-08） | 1280×800 窗口 × 3：Project View 新草稿、Project View 打开 Diff 且导航折叠、Session Mode 右侧边栏 | FR-NAV-001 ~ FR-NAV-003、FR-VIEW-005 ~ FR-VIEW-008、FR-TOOL-001 ~ FR-TOOL-004、FR-PROJ-003；AC-06、AC-07 | [Design 画布](https://claude.ai/artifact/GHT3YmT2hh1bmtG3mxm3GA)（顶部 v02 行） |
| 原型决策选项（P-A ~ P-D） | v01 | 已归档（已选定） | 1280×800 窗口；D 为 1280×760 组件对比 | FR-VIEW-005 ~ FR-VIEW-008、FR-TOOL-001 ~ FR-TOOL-004、FR-NAV-003、FR-STATE-001 ~ FR-STATE-006；AC-04 ~ AC-07 | 同一画布 A ~ D 行 |

说明：

- 四组选项（P-A ~ P-D）的结论见 [UX Specification](<../../docs/03. UX Specification.md>) 第 10 节。
- v02 同时示意左侧导航折叠（按钮在顶栏左侧，折叠后保留 New Chat 与注意力点），以及右侧边栏默认打开上次选择的工具。
- 线框图同时示意其他已确认规则：New Chat 位置、Project Tab 注意力点、Needs Input 等待卡片、当前 View 作为上下文。
- 窗口外观按 macOS 绘制（首发平台见 [Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 2 节）。
- 架构、对话、文件与 Diff 均为示例数据。
