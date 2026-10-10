# Task Protocol

复杂或跨会话工作的进行中记录位于 `tasks/T<YYYYMMDD>-<slug>/`，已完成记录位于 `tasks/archive/T<YYYYMMDD>-<slug>/`，归档规则见 Archiving。日期型 ID 避免并行 agent 冲突；模板位于 `templates/`。

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

Tasks that need a record may use only `task.md`; add other files when they help. Solo work can record implementation notes and self-check results there without creating a separate plan, report, or acceptance file; self-checks are not independent verification. There are no handoff or subtask files: handoff content lands in the responsible file above or returns to the main agent, and subagents spawned inside a worker are not persisted.

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
