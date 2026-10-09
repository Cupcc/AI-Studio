# Task Protocol

Every unit of work lives in `tasks/T<YYYYMMDD>-<slug>/`. All task documents are written by AI agents; humans discuss in conversation and review. Templates are in `templates/`.

## Files

| File | Required | Single writer | Purpose |
|---|---|---|---|
| `task.md` | Yes | Planning or main agent | Goal, scope, FR/AC basis, acceptance criteria, open questions, status |
| `research.md` | No | Assigned worker or main agent | Investigation findings; free form |
| `plan.md` | No | The task's main agent only | Approach, workers table, progress and decisions log |
| `acceptance.md` | No | Verification worker, never an implementer | Verdict per criterion with evidence links |
| `evidence/` | No | The worker that produced each file | Screenshots, logs, JSON |
| `report.md` | No | Main agent | Conclusions and write-backs to `docs/` or `specs/` |

Small tasks need only `task.md`. There are no handoff or subtask files: handoff content lands in the responsible file above or returns to the main agent, and subagents spawned inside a worker are not persisted.

## Lifecycle

`draft` → `ready` → `in_progress` → `verifying` → `done`, or `blocked` at any point. Status lives in the `task.md` frontmatter and is changed only by the main agent.

- `draft` → `ready`: no unanswered open questions. Humans answer in conversation; move each answered question from `未决问题` to `已确认事项` with its answer and date, and in the same change update every document that still shows it as pending (roadmap next steps, `04` section 7, decision status).
- `verifying` → `done`: only after a human signs off the acceptance result in conversation.
- There is no shared task index; parallel edits to one would conflict. Query frontmatter with `rg` instead.

## Writing task.md

- Cite FR, AC, spec, or decision locations for every goal and criterion. Do not introduce requirements.
- Derive acceptance criteria from `docs/05. Acceptance Criteria.md`; they may be stricter, never looser.
- Put anything unclear under open questions; do not fill gaps with assumptions.
- When one requirement becomes several tasks, a single planning agent does the split to avoid gaps, duplicates, and ID collisions.

## Parallel Workers

- The main agent lists workers in `plan.md` and assigns them before starting them; workers never claim work themselves.
- Each worker has a declared write scope. Scopes must not overlap; overlapping work becomes a dependency and runs in sequence.
- Workers that change code concurrently use separate git branches or worktrees.
- Workers write only inside their scope and never edit `task.md` or `plan.md`.
- A worker ends with a report to the main agent in this order: done; outputs (file paths); findings and pitfalls; not done; decisions needed from a human.
- The main agent appends to the `plan.md` progress log at each milestone. Anything of lasting value also goes into `acceptance.md`, `report.md`, a spec, a decision, or a numbered doc.

## Recovery

A new main agent resumes from `task.md` and the `plan.md` progress log alone. If that is not enough to continue, the log was not updated often enough.

## Evidence

- Name files `W<n>-<description>.<ext>` after the producing worker, lowercase and descriptive. Records created before this protocol keep their original names.
- Never store credentials, authentication responses, email addresses, or full user configuration.
- `.ignore` excludes `tasks/*/evidence/` from default searches. Link evidence from `acceptance.md`, `report.md`, or docs; use `rg --no-ignore-dot` when it must be searched.
- Scratch output goes to `.runtime/`; copy into `evidence/` only what supports a conclusion. CLI test projects stay outside the repository (for example under `/tmp`) so they do not inherit this repository's `AGENTS.md`.
- Task directories are never moved or archived, so links into them stay valid; status distinguishes finished work.

## Queries

- `rg -l '^status: in_progress' tasks/*/task.md`: active tasks.
- `rg -l '^status: verifying' tasks/*/task.md`: tasks waiting for human sign-off.
- `rg -l 'FR-STATE-002' tasks/*/task.md`: tasks covering a requirement.
