---
id: T20261026-claude-adapt
status: done
fr: [FR-INPUT-001, FR-INPUT-002, FR-CHAT-002, FR-CHAT-003, FR-STATE-002, FR-SESSION-003]
ac: [AC-02, AC-03, AC-05]
specs: [specs/agent-adapter/spec.md, specs/input/spec.md]
created: 2026-10-26
---

# Claude Code 适配推进

## 收尾

2026-10-28 Main Agent 核对已批准的 effort / 开发入口 / Needs Input 真实应用路径、W4 / W6 / W7 独立验收和 W5 测试修正后完成本轮技术收尾，完成归档。2026-10-29 用户明确「验收通过，合入main」，本轮人工验收已通过并获准合入，入口与范围见 [acceptance](acceptance.md#人工功能验收)；Claude 仍按 DEC-19 不随当前 V1 发布。Running 排队和结构化附件没有新增产品行为授权，不计入本轮交付；历史 I-Q2 超时、macOS 13 与其他未覆盖范围保留在验收记录中。

## 依据与范围

用户 2026-10-26 指示「推进适配claude cli的工作」。此前 [DEC-16](<../../../docs/07. Decisions.md#dec-16-v1-真实-cli-验收范围>) / [DEC-19](<../../../docs/07. Decisions.md#dec-19-claude-code-暂不随-v1-发布>) 将 Claude Code 的真实验收与发布暂缓，实现、模拟验证和历史证据保留。本指示开始 Claude Code 的适配开发；不改变 V1 真实验收范围、AC 结论，也不构成发布决定。

- 真实模型回合会消耗用户 Claude 额度，Main Agent 先询问，用户同日回答「现在跑」（对话选项）后才执行。
- 随后 Main Agent 提出三项建议：下一步优先应用内 Claude 路径与 Needs Input 真实语义、保持 DEC-19、暂不升级 SDK；Running 中追加需先由用户定行为。用户回复「approve , implement」（2026-10-26），据此实施前两项及不升级 SDK；Running 中追加未获行为定义，未开始。本记录写入后的规格 diff 仍待审阅。

## 缺口盘点与进展

| 缺口 | 现状与依据 | 归属 | 结果 |
|---|---|---|---|
| 推理强度 | 驱动丢弃 SDK 档位、无 `setReasoningEffort`；桌面端 Composer 与 Session 服务还各自写死只对 `codex` 开放 | AI | **已实现并在真实应用验证** |
| CLI 版本漂移 | 2026-10-26 原基线为 2.1.310；后续真实测试固定 2.1.311，当前 2.1.312 仅补目录与草稿 UI | AI | 仅 2.1.310 在 `testedVersions`；2.1.312 回合未测；SDK 按批准保持 0.3.293 |
| 真实回合（Adapter 层） | 历史上被 session quota 阻断 | 用户确认调用 | **通过**：流式、Rule / Skill、恢复、模型切换、命令 Stop、effort、AskUserQuestion、I-Q2 文字拒绝、两会话并发，见 [W2](evidence/W2-real-claude-2.1.310.md) 与 Adapter §3.12 |
| 应用内路径 | 生产 Provider 列表自 `d2a3f59` 起只含 Codex，应用里没有 Claude 入口 | AI；不随 V1 发布仍归 DEC-19 | **开发开关已加**；真实应用验证通过，见 [W3](evidence/W3-app-real-claude.md) |
| 应用内授权卡 | 2026-10-27 使用隔离项目的 `default` / ask 设置触发真实卡片，拒绝后回合完成且文件未创建；W6 独立核对保留 SQLite 和截图 | AI | 通过，见 [独立验收](acceptance.md) |
| 打包边界、Claude + Codex 混合并发、macOS 13 | 包原生冒烟与打包菜单双入口通过；Claude 等待审批时 Codex 独立完成已复核 | AI | macOS 13 未覆盖；混合并发仅证明等待审批不阻塞 Codex |
| 多请求并存答复 | 仅有模拟 | AI | 未覆盖 |
| Running 中追加 | `inputWhileRunning: none`，Claude 式排队未建模（A-Q2 / I-Q3），行为属产品决定 | 人决定行为 | 未做 |
| 结构化附件 | 前置 `unsupported`，桌面端发送文本路径清单 | AI，需先确认原生输入块行为 | 未做 |

## 本轮实现

- **推理强度（Adapter）**：`listModels()` 报告原生 `supportedEffortLevels`（不增补档位），CLI 自己的 `default` 行标记 `isDefault`，应用据此在未手动选模型时解析档位；`setReasoningEffort` 经 `applyFlagSettings` 设置，下一轮生效，`null` 回到所选模型原生默认；真实 CLI 对目录外档位也返回成功，所以按所选（含暂存）模型的目录校验；Runtime 替换后重新应用。
- **版本分类**：`2.1.310` 加入 `testedVersions`，仅表示 W2 的 Adapter 场景通过。
- **桌面端**：Composer 与 Session 服务去掉按 `codex` 写死的限制，effort 控件由所选模型的目录决定；模拟 Claude 模型带五档，新增 [`claude-effort.spec.ts`](../../../apps/desktop/e2e/claude-effort.spec.ts)；新增未打包开发开关 `STUDIO_ENABLE_CLAUDE_CODE=1`，才在 Codex 之外注册 `ClaudeProvider`（Runtime 同样交宿主归属登记），打包产物忽略，生产默认仍只有 Codex（见 [桌面端 README](../../../apps/desktop/README.md)）。
- **集成用例**：Stop 用例追踪命令进程及所有带标记的后代（2.1.310 的 Bash 工具经包装 shell）；新增 effort、AskUserQuestion、I-Q2 文字拒绝、两会话并发用例；拒绝用例用必须授权的 `touch` 并断言被拒命令没有执行。

## 验收场景

| 场景与来源 | 前置条件与用户操作 | 预期结果 | 验证方式与环境 | 结论 |
|---|---|---|---|---|
| 目录含档位、可设置、可复位、非法拒绝（FR-INPUT-001、Adapter §3.8） | 读取目录；空闲 / Running 中改档位；`null`；目录外档位 | 见 Adapter §3.12 第 8 条 | 模拟 Query；真实 CLI 2.1.310 | 通过 |
| 档位真实生效 | `low` → `max` → `null` 各一轮 | Bash 内 `CLAUDE_EFFORT` 依次为 `low`、`max`、`medium`（haiku 默认） | 真实 CLI，Adapter 层 | 通过 |
| 应用内 effort（FR-INPUT-001） | 真实应用，未选模型时打开 effort 菜单，选 `low` 后发送 | 菜单列出真实目录五档（无 `ultra`）；Bash 内为 `low` | 真实应用 + 真实 CLI（W3） | 通过 |
| 流式 / Rule / Skill / 恢复 / 模型切换（AC-02） | 临时项目含 `CLAUDE.md` 与项目 Skill | 标记被回答、增量、原 ID 恢复、模型变化 | 真实 CLI，Adapter 层（W2） | 通过（user / local 来源未验证） |
| Needs Input 真实语义（AC-05、I-Q2） | `AskUserQuestion` 卡片作答 / 文字作答；审批用文字拒绝 | 作答被 Agent 使用；被拒命令未执行 | W2 / W3 历史通过；W4 / W6 真实应用卡片拒绝通过；文字拒绝复验见 W5 | 当前结果与历史不稳定边界见 [独立验收](acceptance.md) |
| 并发与 Stop（AC-03） | 一个 Session 等待 / 运行长命令时另一个完成；Stop 前者 | 另一 Session 不受影响；命令进程消失；原 Session 可继续 | 真实 CLI，Adapter 层与真实应用；W4 / W6 补混合等待审批 | 通过已执行场景；不外推为 Claude + Codex 同时执行长命令 |
| 应用内 Provider 入口 | 开发开关开启，打开新建对话 CLI 菜单 | 检测为可用并可选；关闭开关时不出现 | W3 / W7 开启；W4 / W6 关闭；W7 打包开关边界真实界面 | 开启 / 关闭及打包忽略开关路径通过 |
| 版本分类 | 2.1.295 / 2.1.310 / 2.1.311 | `tested` / `tested` / `untested` | 模拟 exec | 通过 |

## 执行记录

- Main Agent（自检，不是独立评审），基线为工作树未提交 diff（同一工作树另有 CLI 默认与 Codex 检测修复的未提交改动；Composer 与 Session 服务本轮只各改一处，未触碰其余改动）。
- 模拟与静态检查：Adapter 286 项、桌面端 1200 项、脚本 36 项通过，Adapter 与桌面端类型检查通过，`check:docs` 无新增问题；Claude 新用例均先确认失败再实现（含服务层 Claude effort 用例，先失败于原写死限制）。
- Playwright（受影响范围）：`claude-effort`、`composer`、`cli-default`、`alignment`、`session` 共 31 项，批量运行 29 通过；`session.spec.ts` 中焦点相关的 AC-02 草稿流式完成与重启后草稿恢复各 1 项在批量运行中失败，单独重跑通过，未做基线对照，按既有记录归因于焦点 / 时序，不作通过证明。未跑完整套件。
- 真实回合：[W1](evidence/W1-effort-free-check.json)（不发输入）、[W2](evidence/W2-real-claude-2.1.310.md)（Adapter 层）、[W3](evidence/W3-app-real-claude.md)（真实应用，含截图）。无配额 / 限流错误。W2 的 Adapter 集成用例在本日后续又增加了 AskUserQuestion、I-Q2、并发三项（均通过，其中拒绝用例首版因选用只读命令 `echo` 不触发授权而超时，改用必须授权的命令后通过）。
- 发现的问题：应用内 Claude 不可用的原因有四层（Adapter 未标默认行、Composer 写死、Session 服务写死、生产未注册），前三项已修，第四项按 DEC-19 保持默认关闭并提供开发开关。另：应用按 A-Q5 继承用户设置的 `bypassPermissions`，Claude Session 在该设置下执行命令不经应用内确认，属原生配置对齐的结果，是否需要应用侧提示留给用户。
- 2026-10-26 复核补修：当 `STUDIO_E2E_PROVIDERS=1` 与 `STUDIO_ENABLE_CLAUDE_CODE=1` 同时存在时，E2E Provider 已包含 Claude，若再注册真实 Provider 会触发重复 ID 启动失败；现仅在普通未打包运行且未提供自定义 Provider 时注册真实 Claude。`claude-effort` E2E 已用双开关回归覆盖，桌面端类型检查通过。
- 当日未覆盖：见当时缺口表；当日无独立评审。2026-10-27～28 的 W4 / W6 独立结果由 [acceptance](acceptance.md) 负责，不覆盖本段历史基线。

## 未决问题

| 问题 | 推荐答案与依据 | 决策方（人 / AI） | 是否阻塞 |
|---|---|---|---|
| 当用户的 Claude 设置为 `bypassPermissions` 时，应用是否需要提示或限制 | 先保持原生配置对齐（A-Q5），仅在发布 Claude 前再评估是否加提示；这是安全与产品权衡 | 人 | 不阻塞开发；阻塞 Claude 发布评估 |
| Running 中追加的行为（A-Q2 / I-Q3） | 需先定义产品行为再实现 Claude 排队 | 人 | 否 |

DEC-19 已由用户批准保持，不再列为待决问题；本轮授权卡、混合等待与打包边界的开发验证不改变 Claude Code 的发布决定。

## 文档影响自检

已核对并更新：[Adapter spec 头注、A-Q5、§3.8 第 3 条、§3.12 第 7～10 条、§3.13 能力验证句](../../../specs/agent-adapter/spec.md)、[Input spec setModel 行](../../../specs/input/spec.md)、[AC 文档 V1 真实验收范围句](<../../../docs/05. Acceptance Criteria.md>)（仅加指向本任务的说明，范围不变）、[DEC-16 / DEC-19 后续说明](<../../../docs/07. Decisions.md>)、[路线图](<../../../docs/06. Development Roadmap.md>)的 §1.1 Claude Code 行与模块进度 Claude Code 行、[桌面端 README](../../../apps/desktop/README.md) 的运行时约定。核对后保留不改：Input spec §2 第 6 条与 Session spec（推理强度来自原生目录对 Claude 同样成立；应用层授权语义仍属后续）、`docs/04` 第 6 项（「Claude 真实链路后续」对授权卡等应用层仍成立）、`scripts/README.md`（预检脚本与 V1 验收范围说明未变）、`docs/08` 架构快照（静态快照，Claude 节点对 V1 仍成立，下次同步快照时再带上本任务）、各 AC 状态（应用层证据不全，不改 AC-02 / 03 / 05 结论）。

## 2026-10-26 提交整理

用户在提交整理时明确「如果是大改动且没有完成，先保留。不要并入 main 了」。本任务保留于 `feat/claude-adaptation` 的独立 worktree；依赖尚未合入的 `fix/cli-management`，不并入 main、不标记完成。已有真实 / 模拟证据与未覆盖项保持原基线；独立评审、应用内授权卡等剩余工作仍按本任务跟踪。本次核对 Adapter / Input、桌面端说明、DEC-16 / DEC-19、AC 及路线图各节，保留开发验证与 V1 发布 / 人工验收的区分。

## 2026-10-28 续推

应用内授权卡 / 拒绝、Claude 等待审批期间的 Codex 并发、开发开关默认关闭已由 W4 执行，W6 独立核对截图与保留数据库补齐记录；打包 Provider 菜单与最终独立收尾仍在进行。W5 修正 I-Q2 合成场景，把拒绝后的行为要求放入初始人类消息，拒绝文字仅承载原因数据，保留拒绝状态、文字传递、完成和未执行断言，并增加精确命令断言；生产代码未改。固定 CLI 2.1.311 的修正场景完整套件 6/6、最终 I-Q2 定向 1/1 通过，具体基线见 [W5 调查](evidence/W5-iq2-investigation.md)；原两次超时仍未完全归因，不宣称所有上游时序均稳定，当前 2.1.312 未测且不增加 testedVersions。

上述为续推中间状态；W7 随后独立补齐打包开关为 1 时 New Chat / Settings 仅 Codex 的双入口，以及开发态真实目录五档、low 选择与恢复原生默认。两次测试应用均已退出，隔离数据库没有创建 Session，未发送模型消息。2.1.312 仅目录与草稿 UI 通过，真实回合仍未测。W7 结论为本轮已授权开发范围可技术收尾；历史 I-Q2 两次超时未唯一归因、最终精确命令增强后仅定向复验的边界保持原样。

最终文档复核：更新本任务的当前缺口 / 验收 / 未决问题与收尾；Adapter §3.12 增加后续独立验收入口并保留旧基线；技术要求事项 5 / 6 链接开发路径结果；路线图下一步、整体概况、Claude 模块、阶段边界与 AC-02 / 03 / 05 均区分当前开发验证和 V1 发布范围。核对 Input、Session、桌面 README、AC、DEC-16 / DEC-19，沿用已确认行为与开发开关规则，不新增产品取舍；静态架构快照 / 历史验证不回填。同步 CLI 管理依赖的文档与归档记录时核对生产源码保持相同，规格 diff 仍待人工审阅。

## 2026-10-29 依赖同步复核

本分支已从 CLI 管理旧依赖 `53baac0` 同步至其技术收尾提交 `9c678a6`，继承 CLI 管理的归档、独立验收与当前文档。rebase 仅在路线图发生文本冲突，保留双方的下一步、整体概况、模块、阶段与验收状态，不扩大功能或发布范围。同步前提交 `757baad` 通过正常提交门禁（脚本 36 / Adapter 286 / Desktop 1200 项及工作区类型检查）；同步后的 `apps/` 与 `packages/` 全树（含集成测试）与同步前本地备份 `refs/backup/claude-before-cli-sync` 相同（目录树标识见 plan），因此沿用对应测试和包验证证据，不重复模型调用。最终只读复核和文档检查结果见 [plan](plan.md)；历史独立验收基线保留原提交号。

## 2026-10-29 人工验收与合入准备

人工接受范围与原始 `4eea8ab` 基线由 [acceptance](acceptance.md#人工功能验收)负责。Main 仅重放旧 CLI 依赖之后的 Claude 改动，接到已整理的 CLI main 基线；源码全树与验收版本相同，冲突仅为路线图文字。同步下一步、整体、模块、阶段及 AC 子场景中的人工状态，保留 DEC-19 与真实版本边界；按贡献指南压成一个目标提交并快进合入。

本任务已于 2026-10-29 快进合入本地 main；最终组合验证入口见[主线记录](../T20261026-tools-vscode-parity/plan.md#2026-10-29-main-组合验证)。
