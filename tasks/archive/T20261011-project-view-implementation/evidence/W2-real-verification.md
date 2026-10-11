# W2 AC-06 real CLI verification

Date: 2026-10-11. Independent reviewer W2 did not implement/fix application code. Baseline: `d49fec3ad6092058ceb3cc90130bf415da3bf76f`; only task documentation edits followed. macOS 15.6 arm64, built development Electron, agent-browser named session `pv-real-w2` over CDP 9337.

## Authority and environment

User-authorized scope: AC-06 only, Codex `gpt-6-luna` low and Claude Haiku 5.5 low, at most two user turns per CLI. W2 exclusively owned the complete budget; W1 did not submit turns. Reported installed native versions: Codex 0.162.1, Claude Code 2.1.296. Availability/login checks were available before testing; quota was unknown until successful real calls. No credentials, auth response, account address, userData or full native transcript are retained here.

The unmodified application used real Providers, not `STUDIO_E2E_PROVIDERS`. W2 inspected the temporary harness: it configured the authorized model/low effort, guarded the exact canonical fixture directories and persistent two-turn counter, and recorded sanitized adapter events. Codex low was configured by provider effort/config; Claude low by `CLAUDE_CODE_EFFORT_LEVEL=low`, with Haiku alias pinned to `claude-haiku-5-5`. Low is a configuration assertion, not claimed as provider-reported reasoning telemetry. No responses, Knowledge or application Session state were injected. The native folder picker alone was stubbed to isolated synthetic Project paths.

## User flows and results

From visible UI entry, W2 opened each Project, entered Architecture, selected the authorized CLI/model, retained the View tag, typed exactly `重新整理支付模块架构。`, and clicked Send. Both actual CLIs read the synthetic payment source and created valid architecture Knowledge; the read-only Preview refreshed to matching summaries, graphs and module tables, retaining the left ordinary Conversation. No permission prompts requiring additional approval occurred.

After each first turn, W2 closed and reopened its Project, returned to that same ordinary Session and sent only a summary-marker edit. The native runtime resumed the same native session ID. Both Preview summaries updated with their distinct marker. Both Projects were open together; changing tabs showed the corresponding Project data without mixing them. Four key screenshots were captured and visually inspected.

| Provider/turn | Actual completion model | Outcome / duration | View Context | Native operation / ID |
|---|---|---|---|---|
| Codex 1 | `gpt-6-luna` | completed / 18,598 ms | attached | create / `01a129db-73bc-7a71-9903-42308a7d47b7` |
| Codex 2 | `gpt-6-luna` | completed / 9,362 ms | not attached | resume / same ID |
| Claude 1 | `claude-haiku-5-5` | completed / 22,563 ms | attached | create / `bd0bed25-7f0f-4af1-9afb-2447698fda67` |
| Claude 2 | `claude-haiku-5-5` | completed / 6,535 ms | not attached | resume / same ID |

Final persistent budget: `{"codex":2,"claude-code":2}`. All authorized turns were consumed; no retry, alternative-model or extra model requests were sent. Second-turn summaries contain `AC06-CODEX-R2` and `AC06-CLAUDE-R2`, respectively. The first-turn context flag and second-turn absence are recorded at the actual adapter send boundary, not inferred only from the visual transcript.

## Setup failures and boundaries

Two harness-only setup issues occurred before any model call: initial Electron evaluate dynamic-import incompatibility; then `/tmp` versus `/private/tmp` string guard mismatch. The latter produced one visible failed client Session before provider creation. W1 corrected only the harness canonical allowlist and restarted; W2 used a new View draft rather than retrying that failed Session. Both failures occurred before the adapter send counter or native model calls, so neither consumed a real user-turn allowance. The failed client Session remained as evidence rather than being deleted.

This verification covers real AC-06 creation, file update/automatic Preview refresh, Project close/reopen native resume and first-only View Context for both CLIs. It does not claim packaged-app validation, native folder-picker interaction, full real CLI milestone scenarios (Stop/Needs Input/concurrency failures), future model compatibility, or human product acceptance.

## File integrity and evidence

W2 independently computed final SHA-256 for each of the three source files in both fixture Projects. All six match the initial hashes supplied by W1 (W2 did not independently capture the initial state):

- `api.ts`: `7d03354f01bea800410b7c412eefbb024a267a70b5cc8dfb89ae5e14eaebdeae`
- `service.ts`: `0be06895e09db0ada350b51dfbe55cea8d6abcbbf35597aa97ad93956b87e00a`
- `store.ts`: `b2d95c51e4803d6c3d2cb10d76850f0347e35685a65da652fbe0b8ebcaf1ad4a`

Artifacts: [sanitized send/completion audit](W2-real-audit.jsonl), [synthetic source/README and final Knowledge](W2-real-fixtures.json), [Codex R1](W2-real-codex-r1.png), [Codex R2](W2-real-codex-r2.png), [Claude R1](W2-real-claude-r1.png), [Claude R2](W2-real-claude-r2.png).

W2 conclusion: **Pass for the authorized AC-06 real CLI scope**. Browser session disconnected after final screenshots and reads; no further requests are authorized by this exhausted budget.
