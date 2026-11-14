# Screens

存放高保真界面图及其可编辑源文件，用于评审产品的具体外观。

## 1. 画面清单

| 画面 | 重点 | 当前状态 |
|---|---|---|
| Session 主界面 | 对话、导航、输入区；Context Panel 收起 | Conversation 区域的轮次呈现已有设计稿，见第 3 节；整页待设计 |
| Project View — Overview | 左 Conversation、右项目概况 Preview | 待设计 |
| Project View — Architecture | 左 Conversation、右架构 Preview | 待设计 |
| Project View — Progress / Agent Team / Business Flow | 各 View 的代表性内容与呈现 | 待设计 |
| Context Panel | Files、Diff、Browser、Terminal 展开状态 | 待设计 |
| 关键状态 | Empty、Loading、Running、Needs Input、Completed Unread、Error | 待设计 |

先完成 Session 与 Project View 两类核心主界面，再补齐其他画面。

## 2. 交付说明

- 使用 [Visual Direction](../visual-direction.md) 与 [UX Specification](<../../docs/03. UX Specification.md>) 作为依据。
- 命名、源文件与记录内容按[设计索引](../README.md)第 5 节；采用的版本登记在其第 3 节。
- Project View 中的示例数据标为演示内容，便于区分产品呈现与真实项目事实。

## 3. 方案索引

Session 与 Project View 主界面的整页高保真设计稿尚无；Conversation 区域见下表。

| 方案 | 版本 | 状态 | 覆盖 | 入口 |
|---|---|---|---|---|
| 工作台界面规范化 · 定稿 | v01 | 已确认（2026-11-12）：用户选择“单行标题 + 更多菜单”与悬浮流程条，并回复“按照你的设计执行”；与实现的差异见下方说明 | 工作台宿主标题栏、“更多操作”菜单、关于面板，正常 / 加载 / 出错 / 草稿 / 已停用状态变体，选品画布悬浮条与窄宽度；FR-WB-001、006、008；规格见[工作台 §9.7](../../specs/workbench/spec.md#生命周期与通用呈现)、[§9.9](../../specs/workbench/spec.md#选品模板) | [设计画布](https://claude.ai/artifact/FPDmPyEpuydS67DQWKCXM4)“定稿”页：终稿画面、规格表、细节与状态变体 |
| 工作台宿主候选方案 A / B / C | v01 | 已归档（已选定“单行标题 + 更多菜单”） | 宿主信息行的三种精简方向 | 同一画布“上一轮方案”页 |
| Conversation 轮次呈现 · 方案 A | v01 | 已确认（2026-11-14）：用户在方案 A / B 中选定 A，回复“implement A，执行，完善设计和相关功能” | 一轮的过程行、步骤行与步骤详情、中间说明、回答、页脚；已结束（收起 / 展开）与运行中；浅色与深色毛玻璃；FR-SESSION-001、FR-STATE-001、FR-STATE-007；规格见 [Shell Spec v02 第 6 节](../components/shell-spec-v02.md#6-conversation) | [设计画布](https://claude.ai/artifact/GUTN7Xf1CYumydSvTwcZng)“方案对比”页的方案 A（可点击）与“方案 A 深色”页 |
| Conversation 轮次呈现 · 方案 B 与现状还原 | v01 | 已归档（已选定方案 A） | 步骤始终可见、只折叠详情的时间线；改动前样式的还原与问题清单 | 同一画布“方案对比”页 |

说明：

- 画布在 claude.ai 上默认私有，需所有者在页面 Share 菜单中共享后他人才能访问。
- 设计稿是[界面规范化任务](../../.agents/archive/tasks/T20261112-workbench-ui-polish/task.md)的设计依据，不是应用已实现或已验收的证据；实现与验收状态见该任务。
- 与实现的差异：思考强度指示与设置入口保持应用原样，设计稿中的差异按用户说明属于画稿错误；操作沿用现有名称（如“添加至当前项目”“编辑工作台”）；设计稿中的已停用状态与停用操作已按 [DEC-32](<../../docs/07. Decisions.md#dec-32-取消工作台停用移除先确认>) 取消；草稿说明与模板升级提示保留为标题栏下方的单行提示；选品画布保留纯色底，不采用点阵。理由见[工作台规格 §9.7、§9.9](../../specs/workbench/spec.md#生命周期与通用呈现)的技术决定。

Conversation 轮次呈现的说明：

- 设计稿中的对话内容是示例数据。实现与验证状态见[任务记录](../../.agents/archive/tasks/T20261114-conversation-turns/task.md)，设计稿不是应用已实现或已验收的证据。
- 与实现的差异：步骤行右侧不显示“14 项通过”这类结果摘要，CLI 不提供这项数据；连续的编辑不合并成一行，只合并连续的读取、列出与搜索；失败的命令默认不展开，行上以错误色和退出码标出；没有步骤的轮也保留过程行，只显示时长，这样回答在运行中和结束后位置不变；没有公开内容的思考不显示；已答复的 Needs Input 请求成为过程中的一行。这些是 AI 在实现中作出的决定，理由见任务记录的技术决定。

应用图标见 [Icons](../icons/README.md)。
