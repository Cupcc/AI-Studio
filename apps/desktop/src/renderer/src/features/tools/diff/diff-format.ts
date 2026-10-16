import { displayName } from '../../../lib/display-path'
// Pure presentation rules of the project Diff panel: what to show for an entry or a single-file result.
import type { DiffFileEntry, DiffSide, DiffSnapshot } from '@shared/tools/diff'
import { projectPathName, projectPathParent } from '@shared/tools/files'
import { D, KIND_LABEL, OMITTED } from './strings'

export const SHORT_COMMIT_LENGTH = 7

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1_048_576) return `${(size / 1024).toFixed(1)} KiB`
  return `${(size / 1_048_576).toFixed(1)} MiB`
}

export function splitPath(path: string): { name: string; dir: string } {
  return { name: projectPathName(path), dir: projectPathParent(path) }
}

/** A mode change with no content change (chmod): it stays in the list and is labelled as such. */
export function isModeOnly(entry: DiffFileEntry): boolean {
  return entry.kind === 'modified' && entry.oldMode !== null && entry.newMode !== null && entry.oldMode !== entry.newMode
    && entry.additions === 0 && entry.deletions === 0 && entry.binary !== true
}

/** "相对 HEAD (main @ abc1234)": the baseline of the list, or what is known about it. */
export function baselineLabel(snapshot: DiffSnapshot | null): string {
  if (!snapshot) return D.baselineUnknown
  if (snapshot.status === 'no_head') return D.baselineNoHead
  const head = snapshot.head
  if (!head) return D.baselineUnknown
  const commit = head.commit?.slice(0, SHORT_COMMIT_LENGTH) ?? null
  if (head.detached && commit) return D.baselineDetached(commit)
  if (head.branch && commit) return D.baseline(head.branch, commit)
  if (head.branch) return D.baselineBranchOnly(head.branch)
  return D.baselineUnknown
}

/** Totals of the listed files; binary and unknown counts (null) add nothing. Only meaningful for a complete list. */
export function totals(files: DiffFileEntry[]): { additions: number; deletions: number } {
  let additions = 0, deletions = 0
  for (const file of files) { additions += file.additions ?? 0; deletions += file.deletions ?? 0 }
  return { additions, deletions }
}

/** Accessible name of a list row: the visible badge and counts are decorative duplicates of this. */
export function entryLabel(entry: DiffFileEntry, showUntracked: boolean): string {
  const parts: string[] = [KIND_LABEL[entry.kind], entry.oldPath ? `${displayName(entry.oldPath)} ${D.renameArrow} ${displayName(entry.path)}` : displayName(entry.path)]
  if (isModeOnly(entry)) parts.push(D.modeOnly)
  else if (entry.binary) parts.push(D.binary)
  else {
    if (entry.additions) parts.push(D.additionsLabel(entry.additions))
    if (entry.deletions) parts.push(D.deletionsLabel(entry.deletions))
  }
  if (entry.special) parts.push(D[entry.special])
  if (entry.untracked && showUntracked) parts.push(D.untracked)
  return parts.join('，')
}

const sideText = (side: DiffSide): string | null => side.status === 'text' ? side.text : side.status === 'absent' ? '' : null

/** Both sides as editor text, or null when the file needs the stored patch (binary, special, omitted or absent sides). */
export function twoSidedTexts(entry: DiffFileEntry, original: DiffSide, modified: DiffSide): { original: string; modified: string } | null {
  if (entry.special || entry.binary === true) return null
  if (original.status === 'absent' && modified.status === 'absent') return null
  const before = sideText(original), after = sideText(modified)
  return before === null || after === null ? null : { original: before, modified: after }
}

function reasonText(side: Extract<DiffSide, { status: 'omitted' }>): string {
  const base = OMITTED[side.reason]
  if (side.reason !== 'too_large' || side.size === undefined) return base
  // "文件过大（2.0 MiB），超过…": the size goes after the subject, before the comma.
  return base.replace('文件过大', `文件过大${D.sizeSuffix(formatBytes(side.size))}`)
}

/** Why the two-sided editor is not used, as de-duplicated sentences (same reason on both sides is said once). */
export function omissionNotes(entry: DiffFileEntry, original: DiffSide, modified: DiffSide): string[] {
  const notes: string[] = []
  const add = (note: string) => { if (!notes.includes(note)) notes.push(note) }
  if (entry.special) add(OMITTED[entry.special])
  const before = original.status === 'omitted' ? reasonText(original) : null
  const after = modified.status === 'omitted' ? reasonText(modified) : null
  if (before && after && before === after) add(before)
  else {
    if (before) add(`${D.sideOriginal}：${before}`)
    if (after) add(`${D.sideModified}：${after}`)
  }
  if (entry.binary === true && !notes.some(note => note.includes(OMITTED.binary))) add(OMITTED.binary)
  return notes
}

export type PatchLineKind = 'add' | 'del' | 'hunk' | 'meta' | 'context'

/**
 * Colour class per line of a unified patch. Inside a hunk the first character decides; before the first `@@` of a file
 * everything is a header, so an added line that happens to start with "++" is not mistaken for `+++ b/file`.
 */
export function classifyPatch(lines: string[]): PatchLineKind[] {
  let inHunk = false
  return lines.map(line => {
    if (line.startsWith('diff ')) { inHunk = false; return 'meta' }
    if (line.startsWith('@@')) { inHunk = true; return 'hunk' }
    if (!inHunk || line.startsWith('\\')) return 'meta'
    return line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : 'context'
  })
}

/** Error text without Electron's "Error invoking remote method '…': Error:" wrapper. */
export function describeError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '').slice(0, 300)
}
