---
id: T20261009-v1-foundation-slice
status: done
fr: [FR-PROJ-001, FR-PROJ-002, FR-PROJ-003, FR-NAV-001, FR-NAV-002, FR-NAV-003, FR-CHAT-001, FR-CHAT-002, FR-CHAT-003, FR-SESSION-001, FR-SESSION-002, FR-SESSION-003, FR-STATE-001, FR-STATE-002, FR-STATE-003, FR-STATE-004, FR-STATE-005, FR-STATE-006, FR-STATE-007, FR-INPUT-001, FR-INPUT-002]
ac: [AC-01, AC-02, AC-03, AC-04, AC-05]
specs: []
created: 2026-10-09
---

# V1 地基与首个可用切片（总体拆分）

## 当前收尾（2026-10-19）

- 状态：`done`；Main Agent 按 Task Protocol 核对当前授权范围、完成条件、独立评审与证据后收尾，并在本次变更中整体归档。依据为用户要求路线图已完成事项移除、未完成继续推进及后续「continue」；真实 CLI 和发布范围遵循 DEC-16～22。
- 四条总体标准：FR 拆分及责任完整；历史 dev/v1 集成与当前基础命令 / 最终门禁通过；当前 Codex AC-01～05 已有真实 UI 及独立技术证据；需人确认事项已归负责文档。
- 基线：应用源码 `9cd17ef`，随后仅更新文档及归档路径。W27 / W28 独立评审、最终包指纹与真实 UI 结果见[总体验收](acceptance.md)；Main Agent 最终完整 Electron **49 / 49**、基础门禁 **36 / 257 / 1172**、`1.0.0` arm64 打包和 open 冒烟见[最终报告](report.md)。此前锁屏条件已解除，没有遗留的技术收尾阻塞。
- 人工接受与技术收尾分开：既有体验确认保留；新增本轮 Diff、推理控制 / 公开输出及图片 / Skill 仍待人工验收。Claude 后续、未观察后代 / 共享 MCP 的证明边界、macOS 13 实机和暂不发布边界继续由总体验收及路线图维护；不改写历史验证或把草稿标成人工确认。

## 2026-10-18 当前范围与本轮边界

同日后续用户「continue to implement」恢复 V1 实施；新增 Codex 原生文件引用、本轮 Diff 与持久化由[工程工具任务](../T20261009-context-tools/task.md)负责，不改变本任务的历史基线。当前 V1 的真实验收范围、发布目标及保留事项统一见 [DEC-16～22](<../../../docs/07. Decisions.md#v1-验收与发布>)；后续工作见[路线图](<../../../docs/06. Development Roadmap.md>)。下文保留 2026-10-09 的任务拆分与验收基线，不单独构成新范围授权。

## 历史签收入口（当前收尾见上）

- 人工产品验收：[路线图现有功能体验全部通过](acceptance.md#人工功能验收)（2026-10-18 确认），接受范围与基线见该记录；现有功能不再等待人工体验签收。
- AI 收尾：当前 Codex 真实技术复核已通过，当时任务保持 `verifying`，等待解锁后完成最终完整 Electron 回归及文档同步；通过后由 Main Agent 按[任务协议](../../README.md#lifecycle)核对[总体验收](acceptance.md)并归档。Claude 历史未覆盖与新增体验人工验收继续分别保留。
- 审阅依据：[验收记录](acceptance.md)、[交付报告](report.md)。

## 目标

把本轮范围拆成可并行执行的 task，并负责排期、集成与跨 task 接口对齐。本轮范围（2026-10-09 确认）：

- 地基：macOS 应用骨架（[04. Technical Requirements](<../../../docs/04. Technical Requirements.md>) 第 3 节技术栈）与 CLI Adapter（04 第 4、5 节；[CLI Integration Preflight](../../T20261008-cli-preflight/report.md) 第 5、6 节）。
- 首个可用切片：Project 壳层与 Session 对话，实现 AC-01～AC-05 所涉行为；本轮只做实现与验收记录，签收另行进行。
- Project View：本轮只调研 04 第 1 节相关待决事项并起草决定记录，交人确认。

## 范围

- 做：拆分与排期；`dev/v1` 集成分支上的合并与冲突处理；跨 task 接口对齐；在 `AGENTS.md` 记录实际构建与测试命令。
- 不做：Context 工具（Files / Diff / Browser / Terminal）与 Project View 的实现；打包、签名与公证；AC 签收。

## 拆分

FR 按层归属：Adapter 层只负责 CLI 原生能力的统一与进程管理，产品状态与 UI 由切片 task 负责，因此同一 FR 可出现在两个 task，但工作内容不重叠。

| Task | 波次 | 内容 | 依赖 | 初始状态 |
|---|---|---|---|---|
| [T20261009-app-skeleton](../T20261009-app-skeleton/task.md) | 1 | Electron 应用骨架、分层与 IPC、SQLite、node-pty、测试框架、GUI 启动环境 | — | ready |
| [T20261009-agent-adapter](../T20261009-agent-adapter/task.md) | 1 | 统一事件模型、Codex / Claude Provider、Stop 与进程管理 | — | ready |
| [T20261009-project-view](../T20261009-project-view/task.md) | 1（仅调研） | 04 第 1 节第 1、2、3、10、11 项的决定草稿 | — | draft |
| [T20261009-project-shell](../T20261009-project-shell/task.md) | 2 | 启动页、Project Tabs、状态恢复、左侧导航结构、右侧边栏容器 | app-skeleton | draft |
| [T20261009-session-slice](../T20261009-session-slice/task.md) | 2 | Session 管理与状态、Session History、Conversation、输入区 | app-skeleton、agent-adapter；与 project-shell 有接口约定 | draft |
| [T20261009-context-tools](../T20261009-context-tools/task.md) | 后续轮次 | Files、Diff、Browser、Terminal | project-shell | draft |

## 依据

- 本轮范围、`main` 基线提交与分支开发方式、真实 CLI 限量调用：2026-10-09 对话确认。
- 技术栈与分层：04 第 3 节；CLI 原生能力复用：04 第 4 节；Runtime 隔离与 Stop：04 第 5 节。
- Adapter 映射与剩余校验：[CLI 校验报告](../../T20261008-cli-preflight/report.md) 第 5、6 节。
- 功能与验收：[02. Functional Requirements](<../../../docs/02. Functional Requirements.md>)；[05. Acceptance Criteria](<../../../docs/05. Acceptance Criteria.md>) AC-01～AC-05。
- 界面：[03. UX Specification](<../../../docs/03. UX Specification.md>)；[Shell Spec v01](../../../design/components/shell-spec-v01.md)（探索中）；线框图 v02（已确认）。

## 验收标准

- [x] 本轮范围内每个 FR 都有负责的子 task，拆分表无遗漏、无重复工作。
- [x] 各子 task 分支合并到 `dev/v1` 后，安装、类型检查、单元测试与应用启动冒烟全部通过，命令记录在 `AGENTS.md`。
- [x] AC-01～AC-05 所涉行为可在 `dev/v1` 上演示，验收 worker 写出各子 task 的 `acceptance.md`（AC-01～AC-05）。
- [x] 需要人确认的决定与问题都已写入对应文档的未决问题或决定草稿。

## 当前外部条件

无阻塞。2026-10-18 锁屏曾使 11 项测试停在原生前台前置；2026-10-19 只读确认系统已解锁后，Main Agent 保持原断言运行完整 49 项并全部通过。旧失败日志和诊断保留为历史证据，详见最终报告。
