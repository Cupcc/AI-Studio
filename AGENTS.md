# Repository Guidelines

This repository contains the V1.0 specifications, design workspace, development records, and application source for AI Developer Studio, a desktop client built around local projects and CLI agent sessions.

This file holds repository-wide rules only. Each directory's naming, metadata, status, and review rules live in the index listed below; read it before editing there.

## Project Structure & Module Organization

| Path | Contents | Index and rules |
|---|---|---|
| `docs/` | Numbered product and technical specifications, development roadmap, and decision log | `docs/00. Documentation Index.md` |
| `specs/` | Long-lived module specs and their FR mapping | `specs/README.md` |
| `tasks/` | Every unit of work, one directory per task | `tasks/AGENTS.md` |
| `templates/` | Templates for task, plan, acceptance, report, and spec documents | Used as described in `tasks/AGENTS.md` and `specs/README.md` |
| `design/` | Visual direction, references, wireframes, screens, components, and prototypes | `design/README.md` |
| `apps/desktop/` | Electron + React + TypeScript desktop client (electron-vite) | `apps/desktop/README.md` |
| `packages/` | Workspace packages without Electron dependencies, e.g. `packages/agent-adapter/` (CLI Adapter) | Module spec in `specs/` |
| `scripts/` | Git hooks, CI, and the real-CLI preflight script | `scripts/README.md` |
| `.runtime/` | Local scratch output such as logs, caches, and temporary runs; git-ignored and safe to delete | — |

## Authorship & Review

All documents are drafted and maintained by AI agents. Humans communicate decisions in conversation and review changes.

- A decision made in conversation takes effect only after it is written into the responsible document and the human has reviewed the diff. Record the confirmation date next to it, e.g. `（2026-10-08 确认）`.
- Never mark a document confirmed, or a task `done`, without explicit human confirmation in conversation. Cite that confirmation in the commit message.
- Never silently change confirmed content; present the change as a diff with a summary. Drafts may be revised freely.
- Keep each fact in one document and link to it elsewhere. Indexes, templates, and summaries point to the owning document instead of restating its rules or status. Cite the source of every requirement: an upstream document section or a dated confirmation.
- Record anything unclear as an open question (`未决问题`) instead of filling it with assumptions.

The review each area needs is defined in its index (see the table above).

## Working on Tasks

Read `tasks/AGENTS.md` before creating or executing a task.

## Build, Test, and Development Commands

The repository is a pnpm workspace (`pnpm-workspace.yaml`); Node and pnpm versions are pinned by `engines` and `packageManager` in the root `package.json`. Dependency build scripts must be allow-listed under `allowBuilds` in `pnpm-workspace.yaml`. Run commands from the repository root; paths containing spaces are supported.

- `pnpm install`: install dependencies, the Electron binary, and local Git hooks.
- `pnpm dev`: start the desktop app in development mode.
- `pnpm typecheck`: type-check every workspace package.
- `pnpm test`: run every package's unit tests (Vitest); no real CLI or model calls.
- `pnpm check:commit`: type-check and run unit tests; also run by the `pre-commit` hook.
- `pnpm test:e2e`: build the desktop app and run Playwright Electron tests with simulated Session Providers; no model calls.
- `pnpm package`: build an unsigned macOS arm64 app directory.
- `pnpm smoke:packaged`: launch the packaged app and check its native dependencies.

Command options, outputs, and runtime conventions: `apps/desktop/README.md`. Git hooks, CI, and the real-CLI preflight (sends real model requests; not an application test): `scripts/README.md`. No formatter, linter, or coverage threshold is configured. Keep this list current when root scripts change.

To locate a requirement, its acceptance references, and covering specs: `rg 'FR-PROJ-001|AC-01' docs specs`. Task queries and the evidence search exclusion: `tasks/AGENTS.md`. Quote paths containing spaces when reading individual files.

## Writing Conventions

Write in the existing Chinese prose with English product terminology such as Project, Session, Project View, and Project Knowledge (defined in `docs/01. Product Definition.md` section 7). Use Markdown headings, short lists, and tables for structured content; match surrounding list indentation and avoid tabs. Preserve each document's metadata table and section numbers, because other documents cite sections by number.

## Validation Guidelines

- Preview edited Markdown tables and headings, and check local links.
- After moving or renaming a file or heading, search for the old path or anchor and fix every link.
- Run the checks the owning index requires, e.g. the cross-document checks in `docs/00. Documentation Index.md`.

## Commit & Pull Request Guidelines

Use Conventional Commits: `<type>[optional scope][!]: <description>`. Common types include `docs`, `feat`, `fix`, `refactor`, `test`, and `chore`. Write concise imperative descriptions, e.g., `docs(requirements): clarify session completion behavior`. Mark breaking changes with `!` or a `BREAKING CHANGE:` footer.

Agents work on branches or worktrees; `main` holds human-reviewed content. Commit messages and pull requests state what changed, why, and the affected FR/AC identifiers, because reviewers read that summary alongside the diff. Pull requests should also link relevant tasks or issues, describe validation performed, include screenshots for layout or interaction proposals, and call out unresolved decisions explicitly.
