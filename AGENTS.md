# Repository Guidelines

This repository contains the V1.0 specifications, design workspace, development records, and application source for AI Developer Studio, a desktop client built around local projects and CLI agent sessions.

This file holds repository-wide rules only. Branch, commit, pull request, and merge rules live in [CONTRIBUTING.md](CONTRIBUTING.md); read it before starting work. Each directory's naming, metadata, status, and review rules live in the index listed below; read it before editing there.

## Project Structure & Module Organization

| Path | Contents | Index and rules |
|---|---|---|
| `docs/` | Numbered product and technical specifications, development roadmap, and decision log | `docs/00. Documentation Index.md` |
| `specs/` | Long-lived module specs and their FR mapping | `specs/README.md` |
| `tasks/` | Task records; applicability and organization are defined in the task protocol | `tasks/README.md` |
| `templates/` | Templates for task, plan, acceptance, report, and spec documents | Used as described in `tasks/README.md` and `specs/README.md` |
| `design/` | Visual direction, references, wireframes, screens, components, and prototypes | `design/README.md` |
| `apps/desktop/` | Electron + React + TypeScript desktop client (electron-vite) | `apps/desktop/README.md` |
| `packages/` | Workspace packages without Electron dependencies, e.g. `packages/agent-adapter/` (CLI Adapter) | Module spec in `specs/` |
| `scripts/` | Git hooks, CI, and the real-CLI preflight script | `scripts/README.md` |
| `.runtime/` | Local scratch output such as logs, caches, and temporary runs; git-ignored and safe to delete | — |

## Authorship & Review

All documents are drafted and maintained by AI agents. Humans communicate decisions in conversation and review changes.

- A decision made in conversation takes effect only after it is written into the responsible document and the human has reviewed the diff. Record the confirmation date next to it, e.g. `（2026-10-08 确认）`.
- Never mark a document human-confirmed or a product delivery human-accepted without explicit human confirmation in conversation. Cite that confirmation in the commit message. Task completion and archiving are owned by the main agent under [Task Protocol](tasks/README.md#lifecycle); they do not imply human acceptance.
- Humans decide product goals, scope, priorities, user-visible behavior, acceptance criteria, and material cost, compatibility or data-safety tradeoffs. AI agents handle implementation choices within that authority, technical review, verification and task closure. Judge the boundary by the decision's impact, not its directory. This division follows the user's 2026-10-11 confirmation “apply, update related docs”; the resulting policy diff remains subject to human review.
- Never silently change confirmed content; present the change as a diff with a summary. Drafts may be revised freely.
- Keep each fact in one document and link to it elsewhere. Indexes, templates, and summaries point to the owning document instead of restating its rules or status. Cite the source of every requirement: an upstream document section or a dated confirmation.
- Record anything unclear as an open question (`未决问题`), with its owner and whether it blocks work. AI resolves technical questions within the authorized scope; product decisions go to the human. Do not present assumptions or AI decisions as human confirmation.

The review each area needs is defined in its index (see the table above).

## Working on Tasks

Read `tasks/README.md` before creating or executing a task.

AI 执行任务最后，注意检查并更新相关文档，避免文档漂移。

## Build, Test, and Development Commands

The repository is a pnpm workspace (`pnpm-workspace.yaml`); Node and pnpm versions are pinned by `engines` and `packageManager` in the root `package.json`. Dependency build scripts must be allow-listed under `allowBuilds` in `pnpm-workspace.yaml`. Run commands from the repository root; paths containing spaces are supported.

- `pnpm install`: install dependencies, the Electron binary, and local Git hooks.
- `pnpm dev`: start the desktop app in development mode.
- `pnpm typecheck`: type-check every workspace package.
- `pnpm test`: run workflow-script tests and every package's unit tests (Vitest); no real CLI or model calls.
- `pnpm test:scripts`: test documentation checks and workflow scope selection only.
- `pnpm check:docs`: check local Markdown link regressions against HEAD; options and manual review boundaries are in `scripts/README.md`.
- `pnpm check:code`: build the Adapter once, type-check all packages and run all script/unit tests regardless of the changed files.
- `pnpm check:commit`: check staged documentation and select documentation-only or full basic checks; also run by the `pre-commit` hook. Scope rules are in `scripts/README.md`.
- `pnpm test:e2e`: build the desktop app and run Playwright Electron tests with simulated Session Providers; no model calls.
- `pnpm package`: build an unsigned macOS arm64 app directory.
- `pnpm smoke:packaged`: launch the packaged app and check its native dependencies.

Command options, outputs, and runtime conventions: `apps/desktop/README.md`. Git hooks, CI, and the real-CLI preflight (sends real model requests; not an application test): `scripts/README.md`. No formatter, linter, or coverage threshold is configured. Keep this list current when root scripts change.

To locate a requirement, its acceptance references, and covering specs: `rg 'FR-PROJ-001|AC-01' docs specs`. Task queries and the evidence search exclusion: `tasks/README.md`. Quote paths containing spaces when reading individual files.

## Validation Guidelines

- Preview edited Markdown tables and headings, and check local links.
- After moving or renaming a file or heading, search for the old path or anchor and fix every link.
- Run the checks the owning index requires, e.g. the cross-document checks in `docs/00. Documentation Index.md`.

## Commit & Pull Request Guidelines

Follow [CONTRIBUTING.md](CONTRIBUTING.md) for branch workflow, Conventional Commits, PR contents, human review, and merging into `main`. That document owns these rules and distinguishes proposed policy from enabled remote enforcement.
