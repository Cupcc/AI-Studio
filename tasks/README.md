# Task Protocol

复杂或跨会话工作的进行中记录位于 `tasks/T<YYYYMMDD>-<slug>/`，已完成记录位于 `tasks/archive/T<YYYYMMDD>-<slug>/`，归档规则见 Archiving。日期型 ID 避免并行 agent 冲突；模板位于 `templates/`。

## 待审阅事项

- [Acceptance](#acceptance) 新增分层验收、界面操作、真实 CLI 验证与独立验收要求，依据用户 2026-10-11 对话指令「apply 增加验收规范」；本次 diff 待审阅。

## When to Create a Task

- Small, self-contained changes such as wording edits or localized fixes need no task directory when the diff and commit message adequately explain the work and validation.
- Create or continue a task for work that spans sessions, introduces or revises product requirements or architectural decisions, needs several implementation or verification stages, or coordinates multiple workers. File count alone does not determine complexity.
- Exemption from a task record does not waive the owning document's review rules or required checks. If a small change grows beyond these limits, add a task before continuing.
- This scope follows the user's 2026-10-10 request to simplify the workflow for solo development; see [contributing task](T20261010-contributing/task.md).

## Files

| File | Required | Single writer | Purpose | Human review |
|---|---|---|---|---|
| `task.md` | Yes | Planning or main agent | Goal, scope, FR/AC basis, acceptance criteria, open questions, status | Answer open questions and check scope |
| `research.md` | No | Assigned worker or main agent | Investigation findings; free form | None; process record |
| `plan.md` | No | The task's main agent only | Approach, workers table, progress and decisions log | None; process record |
| `acceptance.md` | No | Verification worker, never an implementer | Verdict per criterion with evidence links | Sign off before the task becomes `done` |
| `evidence/` | No | The worker that produced each file | Screenshots, logs, JSON | None; process record |
| `report.md` | No | Main agent | Conclusions and write-backs to `docs/` or `specs/` | Each write-back follows the review rule of its target directory |

Tasks that need a record may use only `task.md`; add other files when they help or when Acceptance requires independent verification. Solo work can record implementation notes and self-check results there without creating a separate plan, report, or acceptance file; self-checks are not independent verification. There are no handoff or subtask files: handoff content lands in the responsible file above or returns to the main agent, and subagents spawned inside a worker are not persisted.

## Lifecycle

`draft` → `ready` → `in_progress` → `verifying` → `done`, or `blocked` at any point. Status lives in the `task.md` frontmatter and is changed only by the main agent.

- `draft` → `ready`: no unanswered open questions. Humans answer in conversation; move each answered question from `未决问题` to `已确认事项` with its answer and date, and in the same change update every document that still shows it as pending (roadmap next steps, `04` section 1, decision status).
- `verifying` → `done`: only after a human signs off the acceptance result in conversation.
- 标记 `done` 后，在同一次变更中按 Archiving 将任务目录移入归档。
- There is no shared task index; parallel edits to one would conflict. Query frontmatter with `rg` instead.

## Archiving

依据：用户 2026-10-10 对话请求「tasks 里面应该有归档文件夹，完成的任务进入归档文件夹」；本次规则修订待 diff 审阅。

- `tasks/archive/` 存放 `status: done` 的任务；其余状态的任务保留在 `tasks/` 下。归档不代替 Lifecycle 要求的人工验收。
- 归档时整体移动任务目录，保留原 ID、目录名、状态、任务记录与 `evidence/`；不另建归档索引。
- 移动时同步修正仓库内指向旧路径的引用，以及任务内部因目录深度变化而失效的相对链接和路径；检查链接目标，并搜索旧路径，确保没有遗漏。
- 已归档任务需要恢复工作时，由主 agent 将完整目录移回 `tasks/`，更新状态并记录重开原因，同时修正相关引用。

## Writing task.md

- Cite FR, AC, spec, or decision locations for every goal and criterion. Do not introduce requirements.
- Derive acceptance criteria from `docs/05. Acceptance Criteria.md`; they may be stricter, never looser.
- When one requirement becomes several tasks, a single planning agent does the split to avoid gaps, duplicates, and ID collisions.

## Acceptance

本节负责验收方法与执行流程；产品预期仍由 [V1 核心验收场景](<../docs/05. Acceptance Criteria.md>)、对应 FR 与模块 spec 定义。适用于后续验收及进行中任务的下一轮验收，不追改既有验收结论。依据见本文件顶部待审阅事项。

### 验收准备与分层

- 实现前按验收标准列出场景：来源、前置条件、用户操作、预期结果、验证方式及运行环境。覆盖正常流程、失败恢复和相关边界；可直接写在 `task.md`，不要求另建计划文件。
- 按「开发者自检 → AI 验收 → 人工审阅或签收」执行。每层按下表产出证据，是否需要独立验收由下节规定。

| 层次 | 执行方式 | 检查内容 |
|---|---|---|
| 自动化检查 | 类型检查、单元测试、Playwright Electron E2E，以及适用的数据库／进程检查 | 逻辑、边界、异常与回归；命令和门禁遵循 [桌面端说明](../apps/desktop/README.md)与[贡献指南](../CONTRIBUTING.md) |
| AI 交互验收 | 涉及用户界面的改动，必须用 agent-browser 操作实际 Electron 应用，并查看关键步骤截图 | 从用户入口执行点击、输入、滚动、切换等相关操作，核对流程、反馈、布局与可用性 |
| 人工审阅或签收 | 查看结论、未覆盖项与关键证据，按需体验核心流程 | 判断是否符合预期、是否接受交付；有 task 时按 Lifecycle 签收，普通小改动按贡献指南审阅 diff |

界面验收须从用户可见入口执行被验收行为，不能以直接调用内部接口、注入状态或仅阅读代码代替。测试准备可使用 fixture，但须说明注入范围；Playwright 回归通过不能替代 AI 本轮的界面操作与截图检查。agent-browser 无法执行的原生系统交互须使用可用的原生自动化补充，或列为待人工检查；未执行的步骤记为未覆盖。

### 验收范围与独立性

- 小改动：执行相关门禁及受影响流程检查；涉及界面仍须交互验收。可由实现者自检，遵循 When to Create a Task，不强制新增任务或独立验收文件。
- 功能完成：开发者自检后，由未参与该功能实现的 AI 独立验收，在 `acceptance.md` 记录结果。验收者读取需求、独立执行场景并检查证据，不能只转述实现者报告。
- 里程碑交付：由独立 AI 验收已纳入本次交付的完整核心场景，补充真实 CLI 链路与打包应用检查；明确尚未交付的范围。
- 缺陷交回实现者修复，再由验收者复验失败场景及受影响回归。验收者若参与修复，修复部分须交给另一位未参与实现的验收者；安排 worker 时遵循 Parallel Workers。
- 按改动影响选择检查范围；同一代码基线已有有效结果可引用，注明来源与适用范围。修复后更新基线，重跑受影响检查，避免把旧版本证据当作新版本通过。

### 模拟环境与真实 CLI

- 模拟 Provider 用于可重复的界面、状态与异常场景；真实 Codex / Claude CLI 用于验证实际集成。每条结果注明模拟或真实环境，模拟通过不能认定真实链路通过。
- 涉及 CLI 集成的功能验收，须验证受影响的真实链路；里程碑按交付范围覆盖两个 CLI 的创建 Session、流式输出、并发、Stop、恢复及 Needs Input 等适用场景。
- 真实验证前记录 CLI 版本、账号／额度可用性及已授权的调用范围或预算，不记录凭据。遇到配额、环境或预算阻断，记录未覆盖项、原因与复测条件，不以模拟结果补记通过。
- 需要接受部分交付时，将范围与影响提交人工决定，并记录对话日期；阶段性签收不改变未覆盖 AC 的结论，也不自动缩减原任务范围。

### 结论与证据

- 验收记录开头先列未覆盖与边界、待决事项及待签收内容，再给出总体结论（通过／部分通过／不通过）和逐项结果。使用 [验收模板](../templates/acceptance.md)；无内容的可选区块删除。
- 记录验收者及是否参与实现、代码基线（commit；有未提交改动时标明 diff 范围）、平台、应用形态（开发／构建／打包）、Provider 类型与相关 CLI 版本。逐项关联来源、操作、预期与实际结果、结论及证据。
- 关键交互保留截图，自动化保留结果或日志；失败项记录复现步骤、修复与复验结果。证据文件遵循 Evidence，使用隔离测试数据，原生窗口检查的并行限制遵循贡献指南。
- AI 完成验收后提交结果供人审阅；有 task 时保持 `verifying`，只有 Lifecycle 要求的人工签收才能进入 `done`。提交、合并或自动化通过均不等同于签收。

## Parallel Workers

- The main agent lists workers in `plan.md` and assigns them before starting them; workers never claim work themselves.
- Each worker has a declared write scope. Scopes must not overlap; overlapping work becomes a dependency and runs in sequence.
- Workers that change code concurrently each work in their own worktree, as defined in [CONTRIBUTING.md](../CONTRIBUTING.md) section 2.
- Workers write only inside their scope and never edit `task.md` or `plan.md`.
- A worker ends with a report to the main agent in this order: done; outputs (file paths); findings and pitfalls; not done; decisions needed from a human.
- The main agent appends to the `plan.md` progress log at each milestone. Anything of lasting value also goes into `acceptance.md`, `report.md`, a spec, a decision, or a numbered doc.

## Recovery

A new main agent resumes from `task.md` and, if present, the `plan.md` progress log alone. Single-file tasks keep their recovery notes in `task.md`. If that is not enough to continue, the record was not updated often enough.

## Evidence

- Name files `W<n>-<description>.<ext>` after the producing worker, lowercase and descriptive. Records created before this protocol keep their original names.
- Never store credentials, authentication responses, email addresses, or full user configuration.
- `.ignore` 将 `tasks/*/evidence/` 和 `tasks/archive/*/evidence/` 排除出默认搜索。证据由 `acceptance.md`、`report.md` 或 docs 链接；需要搜索时使用 `rg --no-ignore-dot`。
- Scratch output goes to `.runtime/`; copy into `evidence/` only what supports a conclusion. CLI test projects stay outside the repository (for example under `/tmp`) so they do not inherit this repository's `AGENTS.md`.

## Queries

- `rg -l '^status: in_progress' tasks/*/task.md`: active tasks.
- `rg -l '^status: verifying' tasks/*/task.md`: tasks waiting for human sign-off.
- `rg -l '^status: done' tasks/archive --glob task.md`: archived tasks.
- `rg -l 'FR-STATE-002' tasks --glob task.md`: tasks covering a requirement, including archived tasks.
