# Task Protocol

复杂或跨会话工作的进行中记录位于 `tasks/T<YYYYMMDD>-<slug>/`，已完成记录位于 `.agents/archive/tasks/T<YYYYMMDD>-<slug>/`，归档规则见 Archiving。日期型 ID 避免并行 agent 冲突；任务模板位于 `tasks/templates/`。任务总览、排队与待人处理的事项由 `node scripts/tasks.mjs` 从任务头部生成，见 [Queue](#queue)。

## 待审阅事项

- [Acceptance](#acceptance) 中的分层验收、界面操作、真实 CLI 验证与独立验收要求。
- 人类与 AI 的职责、任务收尾及功能验收边界，见[职责边界任务](../.agents/archive/tasks/T20261011-review-boundaries/task.md)。

## When to Create a Task

- Small, self-contained changes such as wording edits or localized fixes need no task directory when the diff and commit message adequately explain the work and validation.
- Create or continue a task for work that spans sessions, introduces or revises product requirements or architectural decisions, needs several implementation or verification stages, or coordinates multiple workers. File count alone does not determine complexity.
- Exemption from a task record does not waive the owning document's review rules or required checks. If a small change grows beyond these limits, add a task before continuing.

## Files

| File | Required | Single writer | Purpose | Human review |
|---|---|---|---|---|
| `task.md` | Yes | Planning or main agent | Goal, scope, FR/AC basis, acceptance criteria, open questions, status | Decide product questions and changes to authorized scope; no routine task sign-off |
| `research.md` | No | Assigned worker or main agent | Investigation findings; free form | None; process record |
| `plan.md` | No | The task's main agent only | Approach, workers table, progress and decisions log | None; process record |
| `acceptance.md` | No | Independent review agent; main agent records human feedback separately | Verdict per criterion with evidence links | Accept a complete feature or milestone, not every internal task |
| `evidence/` | No | The worker that produced each file | Screenshots, logs, JSON | None; process record |
| `report.md` | No | Main agent | Conclusions and write-backs to `docs/` or `specs/` | Each write-back follows the review rule of its target directory |

Tasks that need a record may use only `task.md`; add other files when they help or when Acceptance requires independent verification. Solo work can record implementation notes and self-check results there without creating a separate plan, report, or acceptance file; self-checks are not independent verification. There are no handoff or subtask files: handoff content lands in the responsible file above or returns to the main agent, and subagents spawned inside a worker are not persisted.

## Queue

任务头部是任务状态的唯一数据源。`node scripts/tasks.mjs` 读取 dev 与各任务 worktree 中的任务头部，生成总览、排队和待人处理的清单，命令行为见[脚本说明](../scripts/README.md#任务总览与归档)。不维护手写的任务索引或看板，多个 worktree 同时改同一份索引会冲突，也会过时。

| 字段 | 取值 | 含义 |
|---|---|---|
| `status` | 见 [Lifecycle](#lifecycle) | 任务状态 |
| `next` | `ai` / `human` / `none` | 下一步由谁行动；`done` 时为 `none` |
| `waiting` | 一行文字 | 下一步行动方要做的事；进行中且没有阻塞时可留空 |
| `paths` | 仓库根相对路径或 glob 的列表 | 写入范围，用于判断任务能否并行 |
| `evidence` | 一行文字 | 证明任务完成的命令或界面场景 |
| `risk` | `normal` / `review` | `review` 表示集成前需要独立评审，适用情形见[验收范围与独立性](#验收范围与独立性) |

状态每次变化时同步更新 `next` 与 `waiting`。提交门禁检查头部：`done` 的任务必须已归档，`ready` 的任务必须写明 `paths` 与 `evidence`。

多个 Agent 并行时按以下流程推进，人只在入口和出口批量参与：

1. 入口：人给出目标并回答产品问题。规划 Agent 把目标拆成任务，写明 `paths`、`evidence`、`risk` 和未决问题的推荐答案，再标为 `ready`。说不出完成证据的任务留在 `draft`。
2. 派工：协调会话运行 `node scripts/tasks.mjs`，从“排队”中取标为“可并行”的任务，每个任务交给一个 owner，同时进行的 owner 不超过 5 个。新流程或新类型的任务先让一个走完全程，再放开并行。协调会话不写代码。派工说明包含目标、`paths`、`evidence` 和不得执行的操作。
3. 执行：一个 owner 从头到尾负责一个任务。它在自己的 worktree 把任务改为 `in_progress`，完成实现、自检、适用的 CI 与验收，在任务分支的最后一次提交里把任务标为 `done` 并归档，然后集成 dev。
4. 疑问：执行中出现产品疑问时，可逆的事按推荐答案继续，并把问题记入任务的“未决问题”，由 `node scripts/tasks.mjs` 汇总给人批量回答。删除用户数据、改变已确认的规格或范围、发布等不可逆的事不按默认值执行：owner 把任务改为 `blocked`、`next: human`，在 `waiting` 写明要人决定什么，然后交回协调会话去做别的任务。
5. 出口：人按 `node scripts/acceptance.mjs` 的清单在主目录体验 dev，通过后推进 main，见[贡献指南](../CONTRIBUTING.md#人工验收与推进-main)。没通过的反馈成为新的修复任务，进入队列。

## Lifecycle

`draft` → `ready` → `in_progress` → `verifying` → `done`, or `blocked` at any point. Status lives in the `task.md` frontmatter and is changed only by the main agent.

- `draft` → `ready`: authorized scope and completion criteria are clear, with no blocking open questions. Humans decide product questions; AI resolves technical questions within its authority. Record each resolution with its source, owner and date, distinguishing human confirmation from AI decisions; update every document that still shows it as pending. Non-blocking questions retain their owner and impact. A `ready` task states its `paths` and `evidence`, see [Queue](#queue).
- `verifying` → `done`: the main agent checks that the agreed deliverables are complete, required checks and any required independent review have passed, blocking findings are resolved, and related documents and evidence are current. Record who reviewed, the applicable baseline, evidence and the closure date. No additional human task sign-off is required.
- 文档同步的触发时机、影响追踪及收尾记录按 [贡献指南的文档同步与收尾复核](../CONTRIBUTING.md#文档同步与收尾复核) 执行。
- `done` means this task's deliverables are complete; it does not mean the feature has been human-accepted, a draft specification is human-confirmed, or further work is authorized. A draft-delivery task can finish while the draft awaits product review. If human review is an explicit prerequisite of the deliverable, it must still be completed; do not silently redefine scope to close a task. 例：文档回写任务提交后即可 `done`，不因“diff 待人审阅”或“功能待人工验收”停在 `verifying`；这两件事分别由负责文档和 `node scripts/acceptance.mjs` 跟踪。
- Incomplete required checks or unresolved blocking findings keep the task in `verifying` or `blocked`. A later human acceptance issue reopens the task or creates a linked fix task. Acceptance of partial delivery does not automatically satisfy the task's remaining criteria.
- 一项交付集成 dev 后即收尾。之后的修复与补测另开任务（小修复不建任务），不在已交付的任务里追加评审轮次或验收记录。
- 标记 `done` 后，在同一次变更中按 Archiving 将任务目录移入归档。
- There is no hand-written task index; parallel edits to one would conflict. `node scripts/tasks.mjs` derives the overview from frontmatter, see [Queue](#queue).

### 人工功能验收

功能集成与稳定晋级遵循[贡献指南](../CONTRIBUTING.md#5-合并与收尾)，人工体验入口为主目录，体验前先切到待验收的 dev 提交。人工按完整功能或阶段集中验收。人工验收状态为“待人工验收 / 已验收 / 需调整”，记录在负责该交付的 `acceptance.md`，没有该文件时记在负责任务的 `task.md`；其他任务和路线图链接该记录，不逐份签收。每次记录接受范围、版本或证据基线、未覆盖项及对话日期；AI 不得自行写成“已验收”。规格审阅、AI 技术验收、人工产品验收分开记录，互不替代。

## Archiving

- 将 `status: done` 的任务归档到 `.agents/archive/tasks/`；其余状态的任务保留在 `tasks/`。提交门禁拒绝留在 `tasks/` 的 `done` 任务。待人工验收的交付由 `node scripts/acceptance.mjs` 列出。
- 归档用 `node scripts/tasks.mjs archive <id>`。它整体移动任务目录，保留原 ID、目录名、状态、任务记录与 `evidence/`，并修正仓库内指向旧路径的链接和任务内部因目录深度变化而失效的相对链接；不另建归档索引。
- 命令列出的“需手动核对”是代码块、行内代码或脚本里的旧路径，逐条处理后运行 `pnpm check:docs`。
- 已归档任务需要恢复工作时，由主 agent 将完整目录移回 `tasks/`，更新状态并记录重开原因，同时修正相关引用。

## Writing task.md

- For product goals and criteria, cite FR, AC, spec, or decision locations. Repository tooling and workflow tasks describe the authorized scope and may link existing records when useful. Do not introduce requirements.
- Derive product acceptance criteria from `docs/05. Acceptance Criteria.md`; they may be stricter, never looser.
- When one requirement becomes several tasks, a single planning agent does the split to avoid gaps, duplicates, and ID collisions.

## Acceptance

本节负责验收方法与执行流程；产品预期仍由 [V1 核心验收场景](<../docs/05. Acceptance Criteria.md>)、对应 FR 与模块 spec 定义。适用于后续验收及进行中任务的下一轮验收，不追改既有验收结论。

### 验收准备与分层

- 实现前按验收标准列出场景：来源、前置条件、用户操作、预期结果、验证方式及运行环境。覆盖正常流程、失败恢复和相关边界；可直接写在 `task.md`，不要求另建计划文件。
- 任务按「开发者自检 → 所需 AI 评审 / 验收 → Main Agent 收尾」执行；完整功能或阶段再提交人工产品验收。文档审阅按负责目录规则执行，是否需要独立 AI 验收由下节规定。

| 层次 | 执行方式 | 检查内容 |
|---|---|---|
| 自动化检查 | 类型检查、单元测试、Playwright Electron E2E，以及适用的数据库／进程检查；E2E 默认在[本机 VM CI](../scripts/README.md#本机-vm-ci) 运行 | 逻辑、边界、异常与回归；命令和门禁遵循 [桌面端说明](../apps/desktop/README.md)与[贡献指南](../CONTRIBUTING.md) |
| AI 交互验收 | 涉及用户界面的改动，必须用 agent-browser 操作实际 Electron 应用，并查看关键步骤截图；默认在虚拟机里进行，见[本机 VM 界面检查](../scripts/README.md#本机-vm-界面检查) | 从用户入口执行点击、输入、滚动、切换等相关操作，核对流程、反馈、布局与可用性 |
| 人工产品验收 | 查看功能或阶段结论、未覆盖项与关键证据，体验核心流程 | 判断是否符合预期、是否接受交付；状态按 Lifecycle 单独记录，不逐项签收内部 task |

界面验收须从用户可见入口执行被验收行为，不能以直接调用内部接口、注入状态或仅阅读代码代替。测试准备可使用 fixture，但须说明注入范围；Playwright 回归通过不能替代 AI 本轮的界面操作与截图检查。agent-browser 无法执行的原生系统交互须使用可用的原生自动化补充，或列为待人工检查；未执行的步骤记为未覆盖。

AI 交互验收默认在虚拟机里做。`node scripts/vm-ui.mjs start` 起一台带应用的虚拟机，之后用 `ab` 子命令操作并截图，几个 worktree 可以同时进行。它检查已提交的 HEAD，默认使用模拟 Provider；需要验证真实 CLI 链路时加 `--real`，在应用的设置里填入自定义连接。原生系统交互仍在本机进行，沿用[贡献指南](../CONTRIBUTING.md#主目录与-worktree)的本机限制；虚拟机里的目录选择框用 `open-project` 绕过。截图存到 `.runtime/vm-ui/<label>/`，需要留证的再复制到任务的 `evidence/`。命令与名额见[本机 VM 界面检查](../scripts/README.md#本机-vm-界面检查)。

### 验收范围与独立性

- 默认由实现者自检后集成：执行适用的自动化检查并取得通过的 CI 运行，涉及界面时做交互验收。小改动、文档、过程任务及一般功能和修复都按此收尾，不安排独立评审，也不强制新增任务或验收文件；功能由人在 dev 体验验收。文档人工审阅规则仍适用。
- 数据迁移或删除用户数据、权限与安全边界、进程隔离的改动，集成前另由未参与实现的 Review Agent 独立检查受影响范围，在 `acceptance.md` 留证。新增或修改类型化 IPC 本身不构成独立评审的理由。独立评审不能只认可实现者的报告。
- 里程碑交付：由独立 AI 验收已纳入本次交付的完整核心场景，补充真实 CLI 链路与打包应用检查；明确尚未交付的范围。
- 评审发现分阻断与非阻断。阻断指结果错误、数据丢失或损坏、安全或权限问题、与已确认规格不符；其余为非阻断，记入任务的后续项，不在本分支修，也不触发复验。
- 只有阻断项交回实现者修复。复验由同一评审者续做，只检查阻断项的修复 diff 及其直接影响，不重新全面审查。评审者只报告，不修改被评审的代码；安排 worker 时遵循 Parallel Workers。
- 最多两轮：首轮评审加一轮复验。复验后仍有阻断项时停止评审，交给用户决定先集成再跟进修复，还是继续修改。
- 按改动影响选择检查范围；同一代码基线已有有效结果可引用，注明来源与适用范围。修复后更新基线，重跑受影响检查，避免把旧版本证据当作新版本通过。

### 模拟环境与真实 CLI

- 模拟 Provider 用于可重复的界面、状态与异常场景；真实 Codex / Claude CLI 用于验证实际集成。每条结果注明模拟或真实环境，模拟通过不能认定真实链路通过。
- 涉及 CLI 集成的功能验收，须验证受影响的真实链路；里程碑按本次已确认的交付范围覆盖纳入验收的 CLI 的创建 Session、流式输出、并发、Stop、恢复及 Needs Input 等适用场景。若本次只验收部分 CLI，必须列出未覆盖的 CLI、影响和后续复测条件，不能以模拟或历史证据补记为通过。
- 真实验证前记录 CLI 版本、登录 / 可用性状态和本次验证场景，不记录凭据。遇到 CLI 返回的配额、限流、环境或服务错误，记录未覆盖项、原因与复测条件；应用不自行设置调用次数、费用上限或自动重试，也不能以模拟结果补记通过。
- 需要接受部分交付时，将范围与影响提交人工决定，并记录对话日期；阶段性签收不改变未覆盖 AC 的结论，也不自动缩减原任务范围。

### 结论与证据

- 验收记录开头先列未覆盖与边界、待决事项及适用的人工功能验收入口，再给出 AI 总体结论（通过／部分通过／不通过）、阻断项与复验、后续项。逐场景结果只在里程碑验收中列出；其他评审不复述实现者已有的测试结果。探针脚本只有转为正式测试时才提交。使用 [验收模板](templates/acceptance.md)；无内容的可选区块删除。
- 记录验收者及是否参与实现、代码基线（commit；有未提交改动时标明 diff 范围）、平台、应用形态（开发／构建／打包）、Provider 类型与相关 CLI 版本。阻断项与里程碑的逐项结果关联来源、操作、预期与实际结果、结论及证据。
- 关键交互保留截图，自动化保留结果或日志，CI 记录证据目录或 run 链接与提交；失败项记录复现步骤、修复与复验结果。证据文件遵循 Evidence，使用隔离测试数据，原生窗口检查的并行限制遵循贡献指南。
- Review Agent 给出独立结论，Main Agent 核对 Lifecycle 完成条件、更新任务状态并归档；不另加一次形式化签收。功能或阶段准备就绪后，提供可运行版本、核心操作、关键证据与已知限制供人验收。AI 评审通过、任务完成、提交和合并均不等同于人工产品验收。

## Parallel Workers

- The main agent lists workers in `plan.md` and assigns them before starting them; workers never claim work themselves.
- Each worker has a declared write scope; a queued task declares it in `paths`. Scopes must not overlap; overlapping work becomes a dependency and runs in sequence.
- Workers that change code concurrently each work in their own worktree, as defined in [CONTRIBUTING.md](../CONTRIBUTING.md) section 2.
- Workers write only inside their scope and never edit `task.md` or `plan.md`.
- A worker ends with a report to the main agent in this order: done; outputs (file paths); findings and pitfalls; not done; decisions needed from a human.
- Code handoff follows [the committed-branch integration workflow](../CONTRIBUTING.md#集成到-dev). Include the final commit SHA and source worktree status in the report; a file path alone is not a code handoff.
- The main agent appends to the `plan.md` progress log at each milestone. Anything of lasting value also goes into `acceptance.md`, `report.md`, a spec, a decision, or a numbered doc.

## Recovery

A new main agent resumes from `task.md` and, if present, the `plan.md` progress log alone. Single-file tasks keep their recovery notes in `task.md`. If that is not enough to continue, the record was not updated often enough.

## Evidence

- Name files `W<n>-<description>.<ext>` after the producing worker, lowercase and descriptive. Records created before this protocol keep their original names.
- Never store credentials, authentication responses, email addresses, or full user configuration.
- `.ignore` 将 `tasks/*/evidence/` 和 `.agents/archive/tasks/*/evidence/` 排除出默认搜索。证据由 `acceptance.md`、`report.md` 或 docs 链接；需要搜索时使用 `rg --no-ignore-dot`。
- Scratch output goes to `.runtime/`; copy into `evidence/` only what supports a conclusion. CLI test projects stay outside the repository (for example under `/tmp`) so they do not inherit this repository's `AGENTS.md`.

## Queries

- `node scripts/tasks.mjs`: 待人处理、进行中与排队的任务；`node scripts/tasks.mjs --stale` 只列 AI 负责且多日没有变化的任务。
- `rg -l '^status: done' .agents/archive/tasks --glob task.md`: archived tasks.
- `rg -l 'FR-STATE-002' tasks .agents/archive/tasks --glob task.md`: tasks covering a requirement, including archived tasks.
