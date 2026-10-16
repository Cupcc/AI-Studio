/**
 * Size limits of the code viewers (FR-TOOL-001 item 5, FR-TOOL-002 item 5; T20261009-context-tools stage 1 design).
 *
 * Monaco's worker is blocked by the production CSP, so its editor worker (diff, tokenisation helpers) runs on the main
 * thread. The limits bound that cost: opening a file and diffing two sides must stay interactive. They count UTF-16
 * code units (`string.length`), which is O(1) and never larger than the byte limit of the services that produce the
 * text (`FILES_LIMITS.readBytes`, `DIFF_LIMITS.sideBytes`): every decoded code unit comes from at least one source byte.
 * `limits.test.ts` guards that relation, so a service limit raised above the viewer limit fails a test instead of
 * silently reaching Monaco.
 */
export const CODE_VIEWER_MAX_CHARS = 1_048_576
export const CODE_DIFF_SIDE_MAX_CHARS = 524_288

/**
 * `maxComputationTime` of the diff editor in ms; Monaco returns an approximate diff when the budget runs out. The diff
 * runs on the main thread (workers stay blocked by the CSP), so the budget is the longest the UI can freeze: measured
 * with two completely different 512 KiB sides, 1500 froze it for 1.5 s while 250 blocks 230-530 ms and still reports the
 * same single change; typical edits compute in well under 50 ms and are unaffected.
 */
export const CODE_DIFF_MAX_COMPUTATION_MS = 250

export const CODE_VIEWER_TOO_LARGE = '文件内容超过 1 MiB，不在查看器中显示。'
export const CODE_DIFF_TOO_LARGE = '对比内容的一侧超过 512 KiB，不在查看器中显示。'

export function viewerTextTooLarge(text: string): boolean {
  return text.length > CODE_VIEWER_MAX_CHARS
}

export function diffTooLarge(original: string, modified: string): boolean {
  return original.length > CODE_DIFF_SIDE_MAX_CHARS || modified.length > CODE_DIFF_SIDE_MAX_CHARS
}
