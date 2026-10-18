---
id: T20261011-project-view-implementation
status: done
fr: [FR-VIEW-001, FR-VIEW-002, FR-VIEW-003, FR-VIEW-004, FR-VIEW-005, FR-VIEW-006, FR-VIEW-007, FR-VIEW-008]
ac: [AC-06]
specs: [specs/project-view/spec.md]
created: 2026-10-11
---

# Project View 实现

## 授权与基线

用户 2026-10-11 请求“按 Project View 规格实现 Knowledge、Renderer、Preview 与 View Context，完成 AC-06 验证.推进”。
依据：[Project View spec](../../../specs/project-view/spec.md)、[AC-06](<../../../docs/05. Acceptance Criteria.md#ac-06-project-view>)。
实现基线 main `810d230`；主 checkout 存在已确认规格与治理规则的未提交 diff，开工时已读取，保留且不混入代码提交。独立 worktree `feat/project-view`。

## 范围

Knowledge / Definition 内置 Schema、五类 JSON 默认定义、安全读取与监视、版本快照与 last-good、受信 Renderer、Preview、普通 View Session、首条 View Context 和元数据。
不做 P1 自定义 View、任意 HTML、自动生成/修复、工程工具内容。

## 验收场景（实现前）

| 来源 | 前置条件与操作 | 预期 | 方式 |
|---|---|---|---|
| FR-VIEW-001/003/007 | 空项目点击五类 View；点击生成 | 不落 Knowledge、不建 Session；仅填草稿 | 单测、Electron、AI 界面 |
| AC-06 | Architecture 输入“重新整理支付模块架构。”并发送 | 普通 CLI Session、保留左右布局、文件更新后 Preview 刷新 | 模拟 Provider E2E + AI 界面；真实链路单独记录 |
| §3.3/4.3 | 完整数据后半写、坏版本、非法组件再修复 | last-good 保留，错误局部且自动恢复 | 单测、Electron |
| §3.4/4.2 | symlink 越界、超限、脚本/CSS、恶意绑定 | 拒绝并不执行；不泄露内容 | 单测 |
| DEC-06 | 保留/移除标签；第二轮与恢复 | 两 CLI 同模板且仅首条；保留 origin、元数据不存模板 | 单测、Electron |
| FR-VIEW-005/008 | 切工具、导航、最近 Session、跨项目、关闭重开 | 预览更新不改布局/对话；数据隔离；watcher 释放 | 单测、Electron、AI 界面 |
| FR-VIEW-001 | Overview 无 Knowledge 且已有 Session | 客户端固定摘要独立显示 | Renderer、AI 界面 |

## 验证与收尾

- [x] 类型检查、359 项单测（Adapter 181 + Desktop 178）。
- [x] Electron 全量回归：28/28 通过（55.3s）；此前并行 Electron 焦点干扰消除后原断言通过。
- [x] agent-browser 操作实际 Electron 并检查关键截图。
- [x] 未参与实现的 W2 Review Agent 独立验证，见 [acceptance.md](acceptance.md)；模拟与真实 AC-06 均通过。
- [x] 真实 CLI 版本/账号可用性/调用范围及受影响链路证据，见 [真实验收](evidence/W2-real-verification.md)。指定模型各两轮完成，预算耗尽。
- [x] 更新负责文档与实现约定；归档后的链接、表格、探针路径及检查结果见 [收尾记录](evidence/W1-closure.md)。

人工产品验收结论与范围见 [acceptance.md](acceptance.md#人工功能验收)。

## 进度与恢复

- 2026-10-11：完成范围核对；main 与 origin/main 一致；已建立独立 worktree 并安装依赖。
- 技术决定：View 草稿独立键；扩展现有 Session JSON 存储的可选元数据，无新增数据库枚举；沿用 Shell 插槽。依据 §4～5，由 Main Agent 决定，不标为人工确认。
- 2026-10-11：Knowledge / Definition、12 类受信组件、五默认 View、Preview、View Context 与普通 Session 接入完成。W2 发现的缺失项目根目录及 enum 类型漏洞已修复，并独立复验。
- 2026-10-11：W1、W2 分别完成 agent-browser 实际交互与截图检查；两种 Provider 均为模拟。最终回归记录及恢复入口见 [report.md](report.md)。主 checkout 原有治理/规格 diff 未修改，分支尚未合入。
- 2026-10-11 收尾：模拟与独立技术验证完成；真实 CLI 授权是剩余阻断，状态 `blocked`、不归档。该状态不以通用人工 task 签收为条件；按主 checkout 已读取的新治理规则区分任务完成与人工产品接受。
- 2026-10-11 真实补验与最终收尾：用户追加授权后恢复 `verifying`，W2 在 `d49fec3` 完成两 CLI 真实四轮及独立截图检查，结论通过。Main Agent 核对交付、359 单测 / 28 Electron 既有有效结果、独立评审、真实证据与文档，按已读取的新 Task Protocol 置 `done` 并同次归档。人工产品验收仍待进行；分支尚未合入，主 checkout 原有改动保留。

## 已确认事项（真实验证续行）

- 用户对“Codex、Claude 各最多 2 轮真实调用”明确回复“允许，gpt-6-luna low, haiku-5.5 low”（2026-10-11 确认）。该额度只用于 AC-06 补验；不得切换其他模型/effort 或超额重试。
- 计划每 CLI 第一轮在 Architecture 发送 AC-06 原句；第二轮验证同一 Session 的更新/恢复。真实输入计数由验收 harness 限制，工具执行属于对应用户回合；出现额度、模型或环境错误即记录，不自动换模型。
- 版本与安全过滤的登录探测：Codex `0.162.1`、Claude `2.1.296` 均 available / logged_in；登录状态不证明剩余额度，实际调用结果负责说明。

## 剩余边界

本任务无未解决的技术阻断。原生系统目录选择器、打包应用未覆盖；非 AC-06 的真实 CLI 专项不因本次验证改变结论。功能验收入口及范围由 [acceptance.md](acceptance.md) 负责。分支集成情况见下。

## 2026-10-11 分支集成

用户授权“commit all，执行所有分支的并入”。Main Agent 将本分支 rebase 到包含治理修订的 main，保留主目录已确认的规格来源和精简后的路线图，合入本分支当前实现、独立验收及归档证据。冲突只涉及路线图与规格来源；与原始 `746d409` 比较，`apps/desktop/src`、`apps/desktop/e2e` 和 `packages` 无差异，原独立界面及真实 CLI 证据的代码范围继续有效。本次不新增真实模型调用或人工验收结论。两个同目标过程提交整理为一个实现提交，按 CONTRIBUTING 仅快进合入。

历史限制来源：[Adapter 验收](../T20261009-agent-adapter/acceptance.md#未覆盖与边界)。历史预算与失败证据不变；本次新授权不扩展 AC-02～05 的补验范围。

## 2026-10-11 人工功能验收记录

用户确认“PV-Q13 采纳答案，进行 Project View 人工功能验收。验收通过。update doc”。Main Agent 将 PV-Q13 移至规格已确认事项，并更新 [人工功能验收](acceptance.md#人工功能验收)、报告及路线图；本次仅更新文档，不新增运行验证。任务保持 `done` 与归档状态。
