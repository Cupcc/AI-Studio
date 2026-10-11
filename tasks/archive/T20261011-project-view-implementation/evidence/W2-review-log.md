# W2 independent review log

Reviewer: `/root/review_project_view`, not involved in implementation. Date: 2026-10-11. Worktree: `feat/project-view`, HEAD `810d230fc341697ecb850f40ea63eac20fee9767` plus uncommitted Project View implementation and integration diff. Platform: macOS 15.6 (24G84), arm64.

## Requirements and method

Read the confirmed Project View specification from the main checkout (including 2026-10-11 PV-Q8–12 decisions), Task Protocol Acceptance, desktop README and actual source changes independently. React and Vitest skills informed lifecycle/schema/test review. Browser skill is reserved for the separate GUI evidence below.

No real CLI/model calls were made in the initial review recorded below. Unit tests use FakeProvider. Missing-path and enum probes use only local data. Independent probe source and config are retained next to this log. A later user-authorized real verification consumed exactly 2+2 calls and passed; see [W2 real verification](W2-real-verification.md) for the separate baseline, scope and audit.

## Executed commands and results

1. `pnpm typecheck && pnpm test` at 14:14:41–14:14:48: exit 0; Adapter 15 files / 181 tests passed; desktop 24 files / 172 tests passed. This is the first-review baseline, before subsequent fixes/tests.
2. `pnpm --filter @ai-studio/desktop exec vitest run --root ../.. --config tasks/archive/T20261011-project-view-implementation/evidence/W2-review.config.ts` at 14:15:48: 1 passed / 2 failed. Non-string enum accepted; missing Project root synchronously throws. Pending snapshot after close already passed the implementer's concurrent epoch fix.
3. Same independent command at 14:17:32, after implementer fixes and stronger missing-root assertion: 3/3 passed, exit 0. Missing root now produces a View-local `error` without exposing its absolute path; non-string direction rejected; late load response after close ignored.
4. `pnpm typecheck && pnpm test` at 14:18:55–14:19:01 after fixes and new renderer tests: exit 0; Adapter 181 tests and desktop 177 tests passed. Independently inspected added first/second/resumed-turn context checks for both FakeProviders and injected renderer failure / last-good / next-good recovery check before executing them.
5. Independent boundary probes rerun at 14:28:36 after diagram bound-limit changes: 3/3 passed. Source/test inspection confirms a 501-node bound diagram now fails publication with `Diagram exceeds 500 nodes` and keeps last-good; renderer no longer silently slices nodes or edges.

6. Main Agent reports the final exclusive Electron suite completed 28/28 with exit 0 in 55.3s after removing concurrent GUI interference. This is W1-reported evidence, not an independent W2 run; the earlier W2 agent-browser workflow remains the independent UI evidence. The prior foreground-session failure was attributed to another worktree's simultaneous Playwright/Electron window stealing native focus; no product workaround or source change was accepted for that unrelated interference.

## Findings handed to implementer

- Missing or moved restored Project directory caused `ProjectViewService.open()` to throw from `realpathSync`; the new bootstrap loop could fail the entire shell bootstrap. Fixed by deferring path validation into local scan error handling; independently reproduced and rechecked.
- `String(props.direction)` / `String(props.variant)` accepted JSON arrays as enum values. For example `direction: ["vertical"]` passed validation but rendered horizontally because renderer compares to the string `vertical`. Fixed with strict string checks; independently reproduced and rechecked.
- Requested additional explicit resume/no-context-reinjection and render-exception/last-good tests. Implementer added them; W2 independently inspected and reran successfully at 14:18:55–14:19:01. These were coverage requests, not demonstrated failures.

## Review observations

- Fixed trusted registry, React text output, own-property bindings and application-owned schema prevent dynamic code/HTML/network execution by definitions.
- File service tests cover partial JSON, unknown versions, invalid definitions, oversized files, symlink escapes, client-helper hardlinks, watcher creation, Project isolation, close/reopen, and last-good recovery.
- View Session creation uses ordinary SessionService; first-turn context is constructed in main and stored as metadata, not full template. Later sends and simulated native resume do not rebuild it, as verified by both FakeProvider tests. This does not establish real CLI compatibility.
- Overview Session blocks are independently rendered client components, not definition bindings. Recent View Sessions filter Project and origin.
- This review does not claim immunity to all filesystem races or full security audit coverage.

## Independent Electron interaction (simulated Provider)

Using named `agent-browser` session `pv-w2` connected to the implementer's Electron CDP port 9337, W2 opened the visible “打开本地目录” entry with the native chooser stub targeting an isolated temporary Project. No renderer state or IPC was injected. The following user-visible paths passed:

- Architecture empty state and “生成 Architecture” filled the left draft without creating `.ai-studio` until send.
- Normal simulated Codex send created a regular Session; View Context appeared as a collapsible `当前 View`; fixture files were written and Preview showed the calculated diagram and table. Zoom changed to 110% while the two-column layout remained.
- While Files tool was visible, an external Knowledge update did not switch the tool; closing it returned to Preview. Invalid View Definition showed a safe error and retained the prior diagram/table; a valid Definition then rendered “W2 恢复后的 Definition”.
- Removing the Architecture View tag and sending through simulated Claude produced a normal transcript with no `当前 View` block; the session remained in the View history and its View CLI selector showed Claude Code.
- Overview showed the fixed Recent Sessions / Needs Input / Recently Completed blocks. Switching through all five Views preserved the View shell. Closing the Project returned to Launcher; reopening it from Recent Projects restored the Project without cross-project leakage.

Screenshots: [empty](W2-architecture-empty.png), [ready](W2-ac06-ready.png), [tool stability](W2-tool-stability.png), [last-good error](W2-last-good-error.png), [Claude detached](W2-claude-detached.png), [Overview](W2-overview-client-sessions.png), [reopen](W2-reopen-project.png).
