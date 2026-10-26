# Core Rules
1. **意图对齐**：当用户意图不清晰或容易产生歧义时，应先简要复述你理解的意图、执行计划和建议，由用户确认与自己的想法一致后再行动。
2.  **专业判断**：人类的知识可能有缺陷或不够专业，且往往意识不到自己的指令有误或不够好。AI应结合用户提供的信息、专业知识和项目背景，主动提出更优建议，而不是一味照指令执行和迎合项目背景。例如：用户的目标是A，指令是B，但C能更好地达成A——AI应指出C并说明理由，由用户决定，而不是直接执行B。

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

## Recommendations

Every suggestion, plan, review, and answer, whether about product, design, process, documentation, or code, aims at the best option for the project's goals, judged by current best practice. The existing setup and the user's instructions are inputs to weigh, not the limit of what to consider; the user may not know a better option exists.

- Give a clear recommended decision with its reasons and main tradeoffs, not just a list of options.
- When the existing setup or an instruction falls short of a better option in a way that matters, say so before acting: name the better option, why it fits this project, and what switching would cost. Do not silently inherit the current approach or carry out an instruction you believe is worse. If the existing approach holds up, keep it and say why briefly.
- The decision boundary in Authorship & Review still applies: within AI authority, choose the best option directly; for human-owned decisions or an explicit instruction, give the recommendation, then follow the human's final decision.
- If you follow a weaker option for consistency, scope, or a confirmed decision, label it as a constraint, not as the best option.
- Base best-practice claims on current official documentation or well-established sources, and cite them when the choice matters; check fast-moving tooling instead of relying on memory.
- Recommend a change only for a concrete benefit. When implementing, follow existing conventions and raise improvements separately instead of mixing them into unrelated work.

This rule follows the user's 2026-10-13 requests; the wording remains subject to human review.

## Working on Tasks

Read `tasks/README.md` before creating or executing a task.

### 文档同步与收尾复核

依据用户 2026-10-17 对文档漂移复盘建议的「apply」确认；本次规则 diff 待审阅。

- 触发时机：对话决定落稿、实现或验证结果改变现有事实时，检查文档影响；提交前和回复工作完成前，复核最终 diff。没有提交的工作也必须完成复核。
- 按决定或事实追踪影响，不只按修改文件检查。先明确本次改变了什么、哪些条件仍未解决，再核对负责文档、决定记录、路线图、验收要求和相关任务；按主题、编号、引用与同义表述搜索，不能只搜索原句。
- 路线图须同时核对“下一步、整体概况、模块状态、阶段计划、验收进度”；相关记录须检查下一步、负责人、阻塞条件、完成条件和状态摘要。已决定事项不得继续写成待人决定，同一文件不同章节也须一致。
- 保持事实的唯一负责文档，其他位置优先引用；历史验证记录保留原基线和结论，当前总结链接新决定。范围确认、代码实现、验证通过和人工验收分别记录，不互相代替。
- 链接、格式或语法检查通过不代表语义一致。复核发现的遗漏应在本轮修正；无法修正的列明原因和影响，不报告为全部同步完成。
- 收尾在已有任务记录中简述已核对的文档及章节、更新项和保留项理由；无需任务记录的小改动在最终回复中简述。检查没有影响的文档不必制造修改。
- Agent 修改文档后的自动提醒、收尾链接检查、性能边界与信任启用步骤见 [Agent 文档 Hook](scripts/README.md#agent-文档-hook)；hook 不代替上述语义复核。

## Build, Test, and Development Commands

The repository is a pnpm workspace (`pnpm-workspace.yaml`); Node and pnpm versions are pinned by `engines` and `packageManager` in the root `package.json`. Dependency build scripts must be allow-listed under `allowBuilds` in `pnpm-workspace.yaml`. Run commands from the repository root; paths containing spaces are supported.

- `pnpm install`: install dependencies, the Electron binary, and local Git hooks.
- `pnpm dev`: start the desktop app in development mode.
- `pnpm typecheck`: type-check every workspace package.
- `pnpm test`: run workflow-script tests and every package's unit tests (Vitest); no real CLI or model calls.
- `pnpm test:scripts`: test documentation checks, Agent document hooks, and workflow scope selection only.
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
