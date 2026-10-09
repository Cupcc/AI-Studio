# Repository Guidelines

## Project Structure & Module Organization

This repository contains the V1.0 specifications, design workspace, development records, and application source for AI Developer Studio, a desktop client built around local projects and CLI agent sessions.

| Path | Contents |
|---|---|
| `docs/` | Product-level baseline: the numbered specifications below, plus `docs/decisions/` for recorded product and technical decisions. |
| `specs/` | Long-lived module specs, one `specs/<module>/spec.md` per module. Module list and FR mapping: `specs/README.md`. |
| `tasks/` | Every unit of work as `tasks/T<YYYYMMDD>-<slug>/` with its task card, research, plan, acceptance, evidence, and report. Protocol: `tasks/AGENTS.md`. |
| `templates/` | Templates for task, plan, acceptance, report, spec, and decision documents. |
| `design/` | Design materials, described below. |
| `apps/desktop/` | Electron + React + TypeScript desktop client (electron-vite). Layout, IPC and runtime conventions: `apps/desktop/README.md`. |
| `packages/` | Workspace packages without Electron dependencies, e.g. `packages/agent-adapter/` (CLI Adapter). |
| `scripts/` | Reusable development scripts; execution notes in `scripts/README.md`. |
| `.runtime/` | Local scratch output such as logs, caches, and temporary runs. Git-ignored and safe to delete. |

Numbered specifications in `docs/`:

- `01. Product Definition.md`: product scope, concepts, and principles.
- `02. Functional Requirements.md`: stable `FR-*` identifiers, behaviors, and P0/P1 priorities.
- `03. UX Specification.md`: layout, navigation, and interaction rules.
- `04. Technical Requirements.md`: integration constraints, conceptual models, and unresolved technical decisions.
- `05. Acceptance Criteria.md`: `AC-01` through `AC-07` and the FR-to-AC traceability matrix.
- `06. CLI Integration Preflight.md`: macOS CLI integration conclusions and development gates; raw evidence lives in `tasks/T20261008-cli-preflight/evidence/`.

Design materials live in `design/`, with `README.md` as the index and `visual-direction.md` as the visual direction. Use `references/` for reference images, `wireframes/` for layouts and flows, `screens/` for high-fidelity designs, `components/` for component specifications, and `prototypes/` for interactive prototypes or links. Record versions and design status in the relevant index.

Keep specification changes in the document responsible for that topic; design proposals should reference the relevant FR/AC identifiers.

## Authorship & Review

All documents are drafted and maintained by AI agents. Humans communicate decisions in conversation and review changes.

- A decision made in conversation takes effect only after it is written into the responsible document and the human has reviewed the diff. Record the confirmation date next to it, e.g. `（2026-10-08 确认）`.
- Never set a document's `文档状态` to confirmed, or a task to `done`, without explicit human confirmation in conversation. Cite that confirmation in the commit message.
- Never silently change confirmed content; present the change as a diff with a summary. Drafts may be revised freely.
- Keep each fact in one document and reference it elsewhere. Cite the source of every requirement: an upstream document section or a dated confirmation.
- Record anything unclear as an open question (`未决问题`) instead of filling it with assumptions.

| Area | Human involvement |
|---|---|
| `docs/` numbered specifications and decisions | Review every change |
| `specs/` | Review when a spec moves from draft to confirmed; later changes are reviewed with the task that makes them |
| `task.md` | Answer open questions and check scope; tasks without open questions may start |
| `research.md`, `plan.md`, `evidence/` | No review required; these are process records |
| `acceptance.md` | Sign off before the task becomes `done` |

## Working on Tasks

Read `tasks/AGENTS.md` before creating or executing a task. In short:

- AI writes `task.md` from `docs/` and `specs/`; when one requirement becomes several tasks, a single planning agent does the split.
- The task's main agent is the only writer of `plan.md`, which lists parallel workers with non-overlapping write scopes and keeps the progress log used for recovery.
- Workers report back to the main agent; there are no handoff or subtask files.
- Long-lived conclusions are written back to `docs/` or `specs/` and link to task evidence. Task directories are never moved.

## Build, Test, and Development Commands

The repository is a pnpm workspace (`pnpm-workspace.yaml`: `apps/*`, `packages/*`; Node >= 24, pnpm 12). Run from the repository root; paths containing spaces are supported:

- `pnpm install`: install dependencies; also downloads the Electron binary and fixes the node-pty `spawn-helper` executable bit. Build scripts are allow-listed in `pnpm-workspace.yaml` (`allowBuilds`).
- `pnpm dev`: start the desktop app in electron-vite development mode.
- `pnpm typecheck`: type-check every workspace package.
- `pnpm test`: run every package's unit tests (Vitest); no real CLI or model calls.
- `pnpm test:e2e`: build the desktop app and run Playwright Electron tests with simulated Session Providers (no model calls); native smoke still checks SQLite, PTY and CLI discovery. Screenshots default to `.runtime/desktop-e2e/`.
- `pnpm package`: build an unsigned macOS arm64 app directory under `apps/desktop/dist/mac-arm64/`.
- `pnpm smoke:packaged`: launch the packaged app with `open` and check SQLite, node-pty and login-shell environment resolution; each run uses a fresh temporary userData directory (retained for diagnosis), overridable with `-- --user-data-dir <dir>`; output defaults to `.runtime/desktop/packaged-smoke.json`.

Inspection commands from the repository root:

- `rg --files docs`: list specification files.
- `rg --files design`: list design documents and assets.
- `rg '^#{1,3} ' docs`: inspect heading structure.
- `rg 'FR-PROJ-001|AC-01' docs`: locate a requirement and its acceptance references.
- `rg -l 'FR-STATE-002' specs tasks/*/task.md`: find specs and tasks covering a requirement.
- `rg -l '^status: in_progress' tasks/*/task.md`: list active tasks.

`.ignore` excludes `tasks/*/evidence/` from default searches; add `--no-ignore-dot` to include it. Quote paths containing spaces when reading individual files. Keep the command list above current when tooling changes.

Development preflight commands (real CLI requests; not application tests):

- `node --check scripts/cli-preflight.mjs`: check the script syntax.
- `node scripts/cli-preflight.mjs --provider codex`: run checks in a new temporary directory.
- Claude SDK installation, execution, and the Codex native Stop re-check: see `scripts/README.md`.

## Documentation Style & Naming Conventions

Follow the existing Chinese prose and English product terminology, including Project, Session, Project View, and Project Knowledge. Use Markdown headings, short lists, and tables for structured requirements. Preserve document metadata and numbered sections; match surrounding list indentation and avoid tabs. Keep `FR-*` and `AC-*` identifiers stable. No formatter, linter, or language-specific coding style is configured.

Naming:

- Numbered specifications: `docs/NN. Topic.md`.
- Decisions: `docs/decisions/D<YYYYMMDD>-<slug>.md`.
- Module specs: `specs/<module>/spec.md`, with lowercase kebab-case module names.
- Tasks: `tasks/T<YYYYMMDD>-<slug>/`. Date-based IDs avoid collisions between parallel agents.
- Evidence: prefix files with the producing worker, e.g. `W1-session-list-dark.png`.

Numbered specifications, specs, and decisions keep a `文档信息` table with a `文档状态` row (`草稿` / `已确认（YYYY-MM-DD）`). Tasks use YAML frontmatter so agents can query status.

Design indexes use `README.md`; retain `design/visual-direction.md` as the visual direction entry point. Name design assets with lowercase descriptive names and version numbers, e.g., `session-main-v01.png`. Keep matching exports and editable source files identifiable by the same name stem.

## Validation Guidelines

Review changes against Product Definition and Functional Requirements. Update related UX, technical, and acceptance documents when behavior changes. Verify requirement references and the FR-to-AC matrix, and preview Markdown tables and headings. After moving or renaming a file, search for the old path and fix every link.

For design materials, verify local links, source attribution for reference images, and consistency with the UX Specification. Distinguish exploratory proposals from confirmed designs and update `design/README.md` when a version is adopted.

The acceptance scenarios describe future end-to-end validation; they are not executable tests. No coverage threshold is established. Reference relevant FR and AC identifiers when adding test cases or task acceptance criteria.

## Commit & Pull Request Guidelines

Use Conventional Commits: `<type>[optional scope][!]: <description>`. Common types include `docs`, `feat`, `fix`, `refactor`, `test`, and `chore`. Write concise imperative descriptions, e.g., `docs(requirements): clarify session completion behavior`. Mark breaking changes with `!` or a `BREAKING CHANGE:` footer.

Agents work on branches or worktrees; `main` holds human-reviewed content. Commit messages and pull requests state what changed, why, and the affected FR/AC identifiers, because reviewers read that summary alongside the diff. Pull requests should also link relevant tasks or issues, describe validation performed, include screenshots for layout or interaction proposals, and call out unresolved decisions explicitly.
