---
id: T20261114-conversation-turns
status: done
next: none
waiting:
paths: [apps/desktop/src/renderer/src/features/session/**, apps/desktop/src/renderer/src/app/Icon.tsx, apps/desktop/src/renderer/src/styles/tokens.css, apps/desktop/src/shared/session/**, apps/desktop/src/main/services/session/session-service.ts, apps/desktop/src/main/services/session/e2e-providers.ts, apps/desktop/e2e/*.spec.ts, packages/agent-adapter/src/types.ts, packages/agent-adapter/src/codex/mapping.ts, packages/agent-adapter/src/claude/messages.ts, packages/agent-adapter/src/core/session-controller.ts, design/components/shell-spec-v02.md, design/screens/README.md, design/README.md, specs/session/spec.md, specs/agent-adapter/spec.md, specs/tools/spec.md, "docs/03. UX Specification.md"]
evidence: 发送 [e2e:process] 后一轮结束收成“已处理 … · 8 步”，点击展开并逐项打开思考、读取分组、编辑补丁与失败命令；[e2e:process][e2e:slow] 运行中展开并显示当前动作，停止后收起
risk: normal
fr: [FR-SESSION-001, FR-STATE-001, FR-STATE-002, FR-STATE-007, FR-TOOL-002]
ac: [AC-02, AC-05]
specs: [specs/session/spec.md, specs/agent-adapter/spec.md, specs/tools/spec.md, design/components/shell-spec-v02.md]
created: 2026-11-14
---

# Conversation 按轮次呈现：过程收成一行

## 收尾（2026-11-14）

- 复核：Main Agent 自检后集成。按 [Task Protocol](../../../../tasks/README.md#验收范围与独立性)，本次是一般界面与功能改动，不涉及数据迁移、删除用户数据、权限或进程隔离，不安排独立评审。对话记录条目只新增可选字段，旧记录照常读取。
- 自动化：桌面类型检查；Adapter 全部单测；桌面 `features/session`、`main/services/session`、`shared/session` 单测；提交门禁选中的相关单测。新增 [turns.test.tsx](../../../../apps/desktop/src/renderer/src/features/session/turns.test.tsx)（轮次划分、步骤行文案、展开与收起、页脚）、Adapter 的 `item-details.test.ts`（说明 / 回答标注、文件补丁）和 `session.spec.ts` 的过程场景。本机 VM CI affected 的运行编号记在集成提交的 `CI-Run`。
- AI 界面检查：VM 中模拟 Provider、开发构建，用 `open-project` 注入目录选择结果，宽度由 agent-browser 的 `set viewport` 模拟；深色只把 `<html data-scheme>` 改为 `dark` 核对颜色，其余操作都从界面入口执行。场景与结果：
  - `[e2e:process]`：结束后只显示“已处理 不到 1 秒 · 8 步”、回答与页脚“2 个文件 +3 −3”（[截图](evidence/W1-finished-folded.png)）；点击过程行展开，思考、读取分组、中间说明、编辑、失败命令、工具、命令各一行；逐项打开后思考为正文、分组列出三步、编辑显示两个文件的补丁、失败命令显示输出并标出退出码 1、工具显示参数与结果（[上半](evidence/W1-steps-open.png)、[下半](evidence/W1-steps-open-2.png)）。
  - `[e2e:process][e2e:slow]`：运行中过程行为“正在运行 pnpm vitest run settings · N 秒”并保持展开，运行中的命令自动显示输出（[深色](evidence/W1-running-dark.png)）；点 Stop 后收起为“已停止 · 8 秒 · 6 步”，没有回答（[截图](evidence/W1-stopped.png)）。
  - `[e2e:approval]`：等待时过程行为橙色点“等待你的确认”，卡片在过程下方；点“允许”后请求成为过程中的一行，展开为只读卡片（[截图](evidence/W1-request-answered.png)）。
  - `[e2e:error]`，1024 宽并打开右侧边栏：过程行为“已中断 · 1 步”，已流出的文字保留，Error 卡片照常；对话列 370 宽时无横向滚动、无内容溢出（[截图](evidence/W1-error-1024-sidebar.png)）。
  - 键盘：Tab 聚焦到的控件有全局焦点环；过程行聚焦后按 Enter 可展开。
  - 第一次检查发现四处问题并已修复后重测：不足 1 秒显示成“0 秒”；补丁末尾多一个空行；停止的轮把中间说明当成了回答；失败或停止的轮丢失已流出的文字（见技术决定第 6 条）。
- 文档同步：核对并更新 [Shell Spec v02 第 1、6 节](../../../../design/components/shell-spec-v02.md#6-conversation)、[Session spec](../../../../specs/session/spec.md) 的 S-Q9 / S-Q10 / S-Q12、第 2 节范围、第 3.2 节第 5 条、第 3.10 节、第 4.4 节，[Adapter spec](../../../../specs/agent-adapter/spec.md) 的条目字段，[Tools spec](../../../../specs/tools/spec.md) 的本轮变更入口，[UX 第 5、10 节](<../../../../docs/03. UX Specification.md#10-原型阶段决策记录>)（新增 D-17），[设计索引](../../../../design/README.md)与 [screens](../../../../design/screens/README.md#3-方案索引)。[FR-STATE-007](<../../../../docs/02. Functional Requirements.md>) 允许“同等语义形式”，未修改。Shell Spec v01 是历史基线，保留原文。路线图的模块状态与阶段没有变化，未修改。
- 未覆盖：真实 Codex / Claude CLI 链路未运行，说明 / 回答标注、文件补丁与每步用时在真实 CLI 下的表现只由映射单测覆盖；纯色（降低透明度）外观未单独截图；窗口较矮时很长的过程只靠对话区滚动，未做专门走查。
- 人工功能验收：待用户在 dev 体验，体验步骤见集成提交。本条不代表已验收。

## 未决问题

| 问题 | 推荐答案与依据 | 决策方（人 / AI） | 是否阻塞 |
|---|---|---|---|
| 没有公开内容的思考结束后不显示，是否保留一条“思考过”的痕迹？ | 不保留。这类行点开没有内容，是本次要解决的问题之一；用时已计入整轮。用户想保留时改成不可点击的弱化行 | 人 | 否 |
| Claude Code 没有原生的说明 / 回答标注，流式输出的文字先按回答显示，后面出现新步骤时转为中间说明，是否接受？ | 接受。按位置判断与 sst/opencode 的做法一致，另一种做法是等这一轮结束才显示文字，会失去流式输出 | 人 | 否 |
| 没有步骤的轮是否显示“已处理 3 秒”？ | 显示。回答在运行中与结束后位置不变，时长也只有这一处；嫌多余时可改为不显示 | 人 | 否 |

## 目标

Conversation 区域里，推理、工具活动、中间说明和最终回答原先是同一种文字，推理与工具行看不出能展开，一轮几十步时无法整体收起。目标是按用户选定的设计稿方案 A 重做：一轮的过程收成回答上方的一行，可以展开看每一步，回答、中间说明与步骤能一眼分开。

## 范围

- 做：对话按轮次渲染；过程行、步骤行与详情、中间说明、页脚；支撑它们的数据（说明 / 回答标注、每步结束时间、文件补丁、本轮变更统计）；模拟 Provider 的过程场景；规格与设计索引同步。
- 不做：用户消息气泡、输入区、Needs Input 与 Error 卡片本身的样式；对话搜索、消息编辑或重新生成；过程展开状态的持久化；“全部展开 / 收起”。

## 依据

- 用户 2026-11-14 要求参考开源项目重新设计 Conversation 区域，指出摘要与思考内容无法折叠、与具体内容没有视觉区分，并要求先出设计稿。
- 设计稿见 [screens 方案索引](../../../../design/screens/README.md#3-方案索引)；参考项目的做法（一轮一个折叠、流式时展开结束后收起、读取与搜索合并计数、按位置区分说明与回答）于 2026-11-14 读源码核实：vercel/ai-elements、assistant-ui、sst/opencode、cline、LibreChat，以及本机竞品源码 Octop、QwenPaw。
- [FR-SESSION-001、FR-STATE-001、FR-STATE-007](<../../../../docs/02. Functional Requirements.md>)；[Shell Spec v02 第 6 节](../../../../design/components/shell-spec-v02.md#6-conversation)。

## 验收标准

- [x] 结束的轮只显示过程行、回答与页脚；过程行可展开，步骤各占一行，有详情的行可单独展开
- [x] 运行中过程保持展开并显示当前动作与已用时间；结束后自动收起，用户自己的展开或收起优先
- [x] 回答、中间说明、步骤三层文字可区分；等宽字体只用于路径、命令与输出
- [x] Needs Input、Error、Stop、排队输入的既有行为不变

| 场景与来源 | 前置条件与用户操作 | 预期结果 | 验证方式与环境 |
|---|---|---|---|
| 结束的轮收起（Shell Spec v02 §6） | 发送含多种步骤的消息，等待结束 | 只见过程行、回答、页脚；过程行写明时长与步数 | E2E `session.spec.ts` 过程场景；VM 界面检查；模拟 Provider |
| 展开过程与步骤（同上） | 点击过程行，再点击思考、分组、编辑、失败命令 | 各自显示正文、分组内各步、补丁、输出与退出码 | 同上 |
| 运行中与停止（FR-STATE-001、S-Q9） | 发送慢速场景，随后点 Stop | 运行中展开并显示当前动作；停止后收起为“已停止 …”，不出现回答 | 同上 |
| 请求答复后（FR-STATE-002） | 审批场景中点“允许”，或在输入框回复 | 请求成为过程中的一行并带所选项，展开为只读卡片 | E2E `session.spec.ts`、`alignment.spec.ts`；VM 界面检查 |
| 失败的轮（FR-STATE-003） | 发送出错场景 | 过程行“已中断 …”，已流出的文字保留，Error 卡片可重试 | VM 界面检查；Adapter 单测 |
| 说明与回答的划分（Session spec §3.2） | — | 有原生标注按标注，没有时按位置；完成的轮总有回答，停止的轮不凑回答 | `turns.test.tsx` |

## 已确认事项

| 问题 | 回答（确认日期） |
|---|---|
| 采用哪套方案 | 方案 A：过程收成一行。用户在看过方案 A / B 设计稿后回复“implement A，执行，完善设计和相关功能”（2026-11-14） |

## 技术决定

AI 在授权范围内作出，决策者 Main Agent，2026-11-14。

1. 轮次按用户消息划分，不按 `turnId`。运行中追加的输入和对请求的文字回复都是用户消息，各自开始新的一段，之前的过程随即收起，新步骤出现在新消息之下。
2. 没有步骤的轮也显示过程行（只有时长）。过程行若只在有步骤时出现，流式回答会在出现第一个步骤或结束时上下跳动。
3. 只合并连续的读取、列出、搜索；编辑与命令各占一行。前者数量多、单条价值低，后者是用户要核对的动作，做法与 sst/opencode、cline 一致。
4. 失败的命令默认不展开，行上用错误色与退出码标出。运行中的思考与命令输出自动展开，结束后收起。
5. 步骤行不显示“N 项通过”这类结果摘要。CLI 不提供这项数据，从输出里猜会出错。
6. 回合提前结束时保留已流出的文字。Adapter 关闭未完成条目时原先只在开始快照没有 `text` 字段时才使用已累积的文字，Codex 以空字符串开始消息，停止或失败的轮因此丢失已输出的部分，与 [Session spec 第 3.12 节](../../../../specs/session/spec.md)“已输出的部分 Agent 文本保留”不符。现在开始快照的文字为空时使用已累积的文字。
7. 展开状态放在渲染进程的内存里，不持久化。它是阅读时的临时状态，重启后回到默认更可预期。
8. 每步用时取条目创建到离开进行中状态的时间，由 Session Manager 记录 `endedAt`，各 CLI 一致，不依赖原生是否提供耗时。
9. 文件补丁随条目保存，每个文件上限 12,000 字符，超出截断并提示到本轮变更查看。完整补丁仍以回合 Diff 为准。
