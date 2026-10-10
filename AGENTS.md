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
- Never mark a document confirmed, or a task `done`, without explicit human confirmation in conversation. Cite that confirmation in the commit message.
- Never silently change confirmed content; present the change as a diff with a summary. Drafts may be revised freely.
- Keep each fact in one document and link to it elsewhere. Indexes, templates, and summaries point to the owning document instead of restating its rules or status. Cite the source of every requirement: an upstream document section or a dated confirmation.
- Record anything unclear as an open question (`未决问题`) instead of filling it with assumptions.

The review each area needs is defined in its index (see the table above).

## Working on Tasks

Read `tasks/README.md` before creating or executing a task.

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

To locate a requirement, its acceptance references, and covering specs: `rg 'FR-PROJ-001|AC-01' docs specs`. Task queries and the evidence search exclusion: `tasks/README.md`. Quote paths containing spaces when reading individual files.

## Writing Conventions

有实际需要人类决策、确认、审阅或签收的内容时，将其放在文档开头：紧接标题、frontmatter（如有）和文档信息表（如有），先列未决问题与待签收事项，再进入正文。不为没有待决事项的文档添加“未决问题”等空章节，也不保留只写“无”的占位；已回答的问题移入确认记录。分散在正文中的提案在顶部提供对应章节链接，问题与答案仍只在负责文档维护。调整顺序后按阅读顺序重新排列章节编号，并同步正文引用、跨文档引用、锚点及“见下节”等位置引用；问题编号、FR / AC / DEC 编号、确认日期和状态保持不变。模板中的可选区块在无内容时删除（依据：用户 2026-10-10 对话请求及后续纠正；本次 diff 待审阅）。

Write in the existing Chinese prose with English product terminology such as Project, Session, Project View, and Project Knowledge (defined in `docs/01. Product Definition.md` section 7). Use Markdown headings, short lists, and tables for structured content; match surrounding list indentation and avoid tabs. Preserve each document's metadata table; when section numbers change, update every reference to them.

## Validation Guidelines

- Preview edited Markdown tables and headings, and check local links.
- After moving or renaming a file or heading, search for the old path or anchor and fix every link.
- Run the checks the owning index requires, e.g. the cross-document checks in `docs/00. Documentation Index.md`.

## Commit & Pull Request Guidelines

Follow [CONTRIBUTING.md](CONTRIBUTING.md) for branch workflow, Conventional Commits, PR contents, human review, and merging into `main`. That document owns these rules and distinguishes proposed policy from enabled remote enforcement.
