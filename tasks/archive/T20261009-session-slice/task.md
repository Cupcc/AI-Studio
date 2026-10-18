---
id: T20261009-session-slice
status: done
fr: [FR-NAV-003, FR-CHAT-001, FR-CHAT-002, FR-CHAT-003, FR-SESSION-001, FR-SESSION-002, FR-SESSION-003, FR-STATE-001, FR-STATE-002, FR-STATE-003, FR-STATE-004, FR-STATE-005, FR-STATE-006, FR-STATE-007, FR-INPUT-001, FR-INPUT-002]
ac: [AC-02, AC-03, AC-04, AC-05]
specs: [specs/session/spec.md, specs/chat/spec.md, specs/input/spec.md]
created: 2026-10-09
---

# Session 对话切片

## 当前收尾（2026-10-19）

- 状态：`done`；Main Agent 按 Task Protocol 核对当前授权范围、完成条件、独立评审与证据后收尾，并在本次变更中整体归档。依据为用户要求路线图已完成事项移除、未完成继续推进及后续「continue」；真实 CLI 和发布范围遵循 DEC-16～22。
- 四条 AC 场景和十三条行为标准逐项核对：当前 Codex 真实创建 / 并发 / 单方 Stop / 提醒 / Needs Input / 原 ID 恢复，以及模拟历史、分页、草稿、关闭和隔离回归通过。原 Codex + Claude 真实并发条款留待后续；新强杀和旧版历史条目恢复经 W28 最终包独立复验。
- 基线：应用源码 `9cd17ef`，随后仅更新文档及归档路径。W27 / W28 独立评审、最终包指纹与真实 UI 结果见[总体验收](../T20261009-v1-foundation-slice/acceptance.md)；Main Agent 最终完整 Electron **49 / 49**、基础门禁 **36 / 257 / 1172**、`1.0.0` arm64 打包和 open 冒烟见[最终报告](../T20261009-v1-foundation-slice/report.md)。此前锁屏条件已解除，没有遗留的技术收尾阻塞。
- 人工接受与技术收尾分开：既有体验确认保留；新增本轮 Diff、推理控制 / 公开输出及图片 / Skill 仍待人工验收。Claude 后续、未观察后代 / 共享 MCP 的证明边界、macOS 13 实机和暂不发布边界继续由总体验收及路线图维护；不改写历史验证或把草稿标成人工确认。

## 2026-10-11 原生能力对齐补充（历史要求）

按 [DEC-13](<../../../docs/07. Decisions.md#dec-13-原生-cli-能力对齐>) 与[对齐任务](../T20261011-native-cli-parity/task.md)，I-Q3 已确认按各 CLI 原生能力支持运行中输入，C-Q5 与 Adapter A-Q1 对齐；其他原生对话接入缺口不得作为产品禁用规则。当前 V1 Codex 的 Adapter → IPC → 持久化 → UI 接缝及独立真实验收已通过，结果与后续边界见上方当前收尾；当时在最终完整 Electron 回归通过前保持 `verifying`；该门禁现已通过。

## 历史签收入口（当前收尾见上）

- 人工体验：已随现有 V1 功能验收通过（2026-10-18），范围与确认依据见[总体验收](../T20261009-v1-foundation-slice/acceptance.md#人工功能验收)；新增体验仍待人工验收。2026-10-18 时 Codex 真实技术复核已通过，完整 Electron 回归等待解锁，任务为 `verifying`；2026-10-19 最终结果见上方收尾。
- 审阅依据：[验收记录](acceptance.md)、[交付报告](report.md)。

## 待审阅规格

非阻塞问题留在 [Session](../../../specs/session/spec.md#11-未决问题)、[New Chat](../../../specs/chat/spec.md#1-未决问题)、[Input](../../../specs/input/spec.md#11-未决问题)、[Navigation](../../../specs/navigation/spec.md#11-未决问题) 的未决问题章节待确认，先按推荐实现。

## 目标

在 Project 壳层与 CLI Adapter 之上实现 Session 的创建、对话、并行执行与注意力状态，使 AC-02～AC-05 所涉行为可在应用中完成。

## 范围

- 做：
  - Session Manager（主进程）：App Session 与 CLI Conversation 1:1 映射、持久化、恢复、并行、Stop、关闭 Project 时停止当前一轮（FR-SESSION-002、FR-SESSION-003、FR-CHAT-003、FR-PROJ-002 关闭部分）。
  - 状态：Running、Needs Input、Error、Completed Unread、无状态；查看与答复的清除规则；Project 注意力汇总供 Tab 与折叠按钮使用（FR-STATE-001～007；UX 第 7 节、D-03、D-04、D-05、D-07、D-14）。
  - New Chat：草稿、首条消息创建 Session、Default CLI、CLI 下拉菜单、设为默认、不可用 CLI 禁用并说明原因（FR-CHAT-001、FR-CHAT-002；UX 第 6 节 New Chat；D-01、D-11）。
  - Session History：日期分组、按最近用户消息排序、滚动、CLI 标识与状态点、Rename（FR-NAV-003；D-12；P-D）。
  - Conversation：打开即在底部、流式追加与跟随、工具活动行、轮次完成行、Needs Input 卡片、Error 卡片（FR-SESSION-001、FR-STATE-007；Shell Spec v01 第 6 节）。
  - 输入区：多行输入、Context / Attachment 入口（本轮只放入口与当前 View 标签位）、Model Selector、Send / Stop（FR-INPUT-001、FR-INPUT-002；Shell Spec v01 第 7 节）。
- 不做：Project View Mode 中的 Conversation 列与 View 上下文注入（见 [T20261009-project-view](../T20261009-project-view/task.md)）；轮次完成行中“修改了 N 个文件”与 Diff 联动（依赖 [T20261009-context-tools](../T20261009-context-tools/task.md) 与 04 第 1 节第 13 项）；从 Files 添加文件到上下文。

## 依据

- 功能：[02. Functional Requirements](<../../../docs/02. Functional Requirements.md>) 第 2 节对应 FR。
- 界面：[03. UX Specification](<../../../docs/03. UX Specification.md>) 第 6、7、8 节及第 10 节；[Shell Spec v01](../../../design/components/shell-spec-v01.md) 第 4～7、10 节；线框图 v02。
- 技术：[04. Technical Requirements](<../../../docs/04. Technical Requirements.md>) 第 5、6、7 节；Adapter 接口见 `specs/agent-adapter/spec.md`（[T20261009-agent-adapter](../T20261009-agent-adapter/task.md) 产出）；[CLI Integration Preflight](../../T20261008-cli-preflight/report.md) 第 5 节。
- 验收：[05. Acceptance Criteria](<../../../docs/05. Acceptance Criteria.md>) AC-02～AC-05；第 4 节列出的专项测试中与本 task 相关的部分（Resume、Rename、Model Selector、错误恢复、大量 Session 性能、New Chat 草稿、Needs Input / Error 清除规则、Tab 注意力点、关闭确认、Stop）。

## 验收标准

细则见 [specs/session/spec.md](../../../specs/session/spec.md)、[specs/chat/spec.md](../../../specs/chat/spec.md)、[specs/input/spec.md](../../../specs/input/spec.md)、[specs/navigation/spec.md](../../../specs/navigation/spec.md) 第 3.3 节（草稿）与 [specs/agent-adapter/spec.md](../../../specs/agent-adapter/spec.md)。阻塞问题 S-Q1、S-Q2、I-Q2、NAV-Q4 已于 2026-10-09 确认；其余问题按 spec 推荐实现、保持待确认（2026-10-09 对话指示）。

AC 场景（真实 CLI，限量运行）：

- [x] 在 Project 中创建 Codex New Chat，输入需求后 Codex 开始执行，Session 出现在左侧并显示 Running，Conversation 流式输出（AC-02）。
- [ ] 同一 Project 中一个 Codex Session 与一个 Claude Code Session 同时执行，切换 Session 不打断后台执行（AC-03）。 **当前范围：Codex 真实与双 Provider 模拟已验证；Claude 真实部分按 DEC-16 / 19 后续，不记为当前通过。**
- [x] 用户在 Session B 时 Session A 后台完成，A 出现绿色圆点；点击 A 直接显示最新 Conversation，圆点消失（AC-04）。
- [x] 后台 Agent 等待用户决定时 Session History 出现 Needs Input 状态；点击后直接看到等待内容（AC-05）。

行为细则：

- [x] New Chat 先进入草稿，发送第一条消息才创建 Session 并进入 Session History；Default CLI、CLI 菜单、“设为此 Project 默认”、不可用 CLI 禁用并说明原因（FR-CHAT-001、FR-CHAT-002；D-01、D-11；chat spec）。
- [x] Session 创建后 CLI 锁定；同一 Session 内可切换该 CLI 的模型，下一轮生效（FR-CHAT-003、FR-INPUT-002）。
- [x] 注意力状态按 session spec 第 4.1 节状态机：Running、Needs Input、Error、Completed Unread、无状态（不显示 Idle）；“正在查看”按第 2.11 节（S-Q1 确认：窗口失焦、最小化或后台不算查看，回到前台不清除，再次打开 S 才清除）（FR-STATE-001～006）。
- [x] Needs Input：卡片按钮答复，或在输入框回复（I-Q2 确认的语义）；仅打开查看不清除（FR-STATE-002；D-03）。
- [x] Error：错误卡片含摘要、详情与“重试”（S-Q2 确认：恢复 CLI Conversation 后重发失败那一轮的用户消息）；查看后清除列表提醒；再次发送时尝试恢复（FR-STATE-003；D-04）。
- [x] 打开 Session 直接显示最底部，不出现从顶部滚动的过程；流式输出在底部时跟随，向上滚动后停止并显示“回到最新”（FR-SESSION-001；Shell Spec 第 6 节）。
- [x] 轮次完成行 `Worked for … · Done`；停止的轮显示已停止（FR-STATE-007；S-Q9）。
- [x] Stop：作用于当前一轮且不影响其他 Session；关闭 Project 确认后停止该 Project 的当前一轮，对话保留，重新打开后可继续（FR-INPUT-001、FR-SESSION-003、FR-PROJ-002；04 第 5 节）。
- [x] Session History：按最近一次用户发送时间倒序、按日期分组，Agent 输出不改变排序；CLI 标识与单个状态点；Rename（P0，NAV-Q4 确认）（FR-NAV-003；D-12；P-D）。
- [x] 应用重启后 Session 列表、对话记录、完成行与提醒状态保留；Session 可按原生 ID 恢复继续对话（02 第 6 节 Session Resume；session spec 第 3.1、3.14 节）。
- [x] Project Tab 注意力点、折叠按钮注意力点与关闭 / 退出确认的数据来自本 task 的实现（D-07、D-10、D-14；project-shell 接入点）。
- [x] 单个 CLI 进程失败不导致应用崩溃，不影响其他 Session 与 Project（04 第 7 节稳定性）。
- [x] 单元测试覆盖状态机全部转移、排序与分组、草稿规则；Playwright 以模拟 Provider 覆盖 AC-02～AC-05 的界面流程；真实 CLI 只用于上述 AC 场景的验收运行。

## 已确认事项

| 问题 | 回答（确认日期） |
|---|---|
| spec 阻塞问题 S-Q1、S-Q2、I-Q2、NAV-Q4 | 已回答，见各 spec 第 1.2 节（2026-10-09 确认） |
| 非阻塞问题如何处理 | 参考 Claude Desktop 与 ChatGPT Desktop 修订推荐（见 research.md），保持待确认，先按推荐实现（2026-10-09 对话指示；W2 复核已落盘） |
