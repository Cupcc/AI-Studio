# 验收：T20261011-project-view-implementation

## 未覆盖与待决事项

- 独立 agent-browser 已完成开发 Electron 模拟与真实 CLI 验收；原生系统文件选择器使用隔离目录 stub，打包应用未检查。本任务不是完整 CLI 里程碑，未新增真实 Stop / Needs Input / 并发失败等专项覆盖。
- 真实 AC-06 已在后续用户授权范围补验：Codex `gpt-6-luna` low、Claude Haiku 5.5 low 各 2 用户回合，全部完成且预算耗尽。后续调用需新授权，详见 [真实验收记录](evidence/W2-real-verification.md)。

## 人工功能验收

- 状态：已验收（2026-10-11）。
- 范围与版本：本任务已集成 main 的 Project View 功能（Knowledge、五类默认 View、Renderer、Preview 与 View Context；AC-06 及相关 FR）。最终真实验收代码基线 `d49fec3`，集成时产品源码与测试保持一致，见 [分支集成记录](task.md#2026-10-11-分支集成)；其他证据基线见下。
- 人工记录：用户对话“PV-Q13 采纳答案，进行 Project View 人工功能验收。验收通过。update doc”（2026-10-11 确认）。PV-Q13 答案见 [Project View spec](../../../specs/project-view/spec.md#12-已确认)。
- 未覆盖项：上列原生系统文件选择器、打包应用与非本任务 CLI 里程碑专项未新增验证；本次确认不扩展为阶段 1 或 V1 整体验收。

## AI 结论与运行环境

- 总体结论：通过（本任务 Project View / AC-06 范围）；独立代码、边界单测、开发 Electron 模拟 UI，以及两种真实 CLI 的 Knowledge 更新与 Preview 刷新、同原生 Session 恢复、一次性 View Context 均通过。上列原生选择器、打包及非本任务里程碑场景不包含在该结论中。
- 验收者：W2 `/root/review_project_view`；未参与实现或修复，仅写本验收文件与 W2 证据。
- 日期与代码基线：2026-10-11，最初代码与模拟 UI 为 `810d230` 加未提交实现 diff；修复后代码已提交为 `d49fec3ad6092058ceb3cc90130bf415da3bf76f`，真实验收使用该提交构建，后续只有任务文档变化。
- 平台与应用形态：macOS 15.6 (24G84)、arm64；开发 Electron/CDP 9337 界面已由 W2 独立操作；打包应用未检查。
- Provider 与 CLI：模拟测试使用 FakeProvider；真实验收为 Codex 0.162.1 / Claude Code 2.1.296（版本由 W1 环境检查提供），真实完成事件确认 `gpt-6-luna` / `claude-haiku-5-5`，各 2 回合。low 由 harness 配置，不冒充原生完成事件返回的 effort 遥测。

## 验收结果

| 场景与来源 | 前置条件与操作 | 预期结果 | 实际结果 | 验证方式与环境 | 结论 | 证据 |
|---|---|---|---|---|---|---|
| Schema / 安全，spec §4.2、§6 | 恶意字段、非法路径、版本、组件、大小/节点限制 | 拒绝无效数据，不执行内容 | 原有测试通过；独立发现 enum 类型漏洞，修复复验通过 | 源码、Vitest、本地 fixture | 通过 | [W2 review log](evidence/W2-review-log.md)、[独立探针](evidence/W2-review.test.ts) |
| last-good / watcher，FR-VIEW-003 | 半写、非法定义、超限、跨项目、close/reopen | 局部错误保留旧版，恢复后刷新，关闭停止事件 | 自动测试通过；缺失根目录启动风险已修复并独立复验 | 源码、Vitest、本地 fixture | 通过 | [W2 review log](evidence/W2-review-log.md) |
| Renderer close 生命周期，spec §6 | load 未完成时关闭 Project，再返回旧快照 | 不恢复已关闭缓存 | 3 条独立边界探针中该项通过 | Vitest，mock IPC | 通过 | [独立探针](evidence/W2-review.test.ts) |
| 首条 Context，FR-VIEW-007 | 两 FakeProvider 保留/移除标签、发送第二轮、重启恢复 | 首条一次性注入、origin 保留、模板不入 transcript、恢复不重注入 | 两 CLI 模拟测试包含 resume 均通过 | Vitest，FakeProvider | 通过（模拟） | [W2 review log](evidence/W2-review-log.md) |
| Renderer 渲染失败，spec §4.3 | 成功快照后注入渲染异常，再发送有效快照 | 保留成功旧版，后续自动恢复 | 故障注入测试通过 | Vitest，mock Renderer | 通过 | [W2 review log](evidence/W2-review-log.md) |
| AC-06 用户界面 | 从可见入口打开隔离 Project，进入 Architecture、生成草稿、发送模拟 Codex；切换 Files、外部更新、恢复 Preview；缩放、最近对话、Overview 摘要、Claude 普通 Session、移除标签、View 切换和关闭重开 | 普通 Session 保持左右两列；Preview 显示空状态并由按钮填草稿；Session 写入 Knowledge 后自动刷新；工具切换不抢回 Preview；非法 Definition 显示错误并保留旧版，修复后恢复；Overview 固定摘要显示 | 全流程从界面入口通过；Codex 模拟回复写入隔离 Project，看到图表/表格；Files 停留期间外部更新，关闭工具回 Preview；非法组件错误 + last-good；Claude 移除标签后 transcript 无当前 View；Overview 显示 Recent Sessions/Needs Input/Recently Completed；关闭重开恢复 Project | agent-browser + `npx --no-install agent-browser --session pv-w2`; 开发 Electron/CDP 9337；临时 fixture | 通过（模拟 UI） | [empty](evidence/W2-architecture-empty.png)、[AC-06 ready](evidence/W2-ac06-ready.png)、[tool stability](evidence/W2-tool-stability.png)、[last-good error](evidence/W2-last-good-error.png)、[Claude detached](evidence/W2-claude-detached.png)、[Overview](evidence/W2-overview-client-sessions.png)、[reopen](evidence/W2-reopen-project.png) |
| AC-06 真实链路与 FR-VIEW-007 | 两独立 Project 从 Architecture 可见入口，选授权模型发送原始验收句；每个 Project 关闭重开，同 Session 续发 summary 标记 | 普通真实 Session 生成 Knowledge、自动刷新 Preview；原生恢复不重注入 Context | 四回合均 completed；实际模型为 gpt-6-luna / claude-haiku-5-5；首条 context=true、恢复条 false；每 CLI native ID 不变；Preview 显示对应事实和 R2 标记；6 个源码当前 hash 与 W1 提供初始 hash 一致 | 独立 agent-browser、真实 Providers、合成 fixture、审计事件 | 通过（真实） | [真实验收](evidence/W2-real-verification.md)、[审计](evidence/W2-real-audit.jsonl)、[文件证据](evidence/W2-real-fixtures.json) |

Main Agent additionally reports the final exclusive Electron suite as 28/28 passed (55.3s, exit 0). This result is retained as W1-reported regression evidence, not substituted for W2's independent simulated and real UI runs.

## 缺陷与复验

两项独立发现已交回实现者修复：缺失 Project 根目录导致同步异常影响 bootstrap；非字符串 enum 被强制转字符串后错误接受。W2 于 14:17:32 独立复跑 3 条边界探针全部通过；详情见 [W2 review log](evidence/W2-review-log.md)。
