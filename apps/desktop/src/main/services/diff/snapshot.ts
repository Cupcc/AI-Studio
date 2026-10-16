// One snapshot query: the changes of the working tree relative to HEAD (staged, unstaged and untracked), read through
// the Git CLI only. The file list comes from Git's own machine output; nothing is inferred from file system walks
// except the kind of an untracked entry (symlink) and, for an unborn HEAD, whether a staged file still exists.
import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { DIFF_LIMITS, type DiffChangeKind, type DiffFileEntry, type DiffHead } from '@shared/tools/diff'
import type { ProjectPath } from '@shared/tools/files'
import { GIT_DIFF_ARGS } from './git-env'
import { parseDiffListing, parseNameList, parseStageList, toProjectPath, type NumstatRecord, type RawRecord } from './parse'
import { failureOfExit, gitStep, probeRepository, type QueryContext } from './query'

export interface SnapshotParts {
  status: 'ready' | 'clean' | 'no_head'
  head: DiffHead | null
  repoPrefix: ProjectPath
  files: DiffFileEntry[]
  truncated: boolean
  detail: string | null
}

const KINDS: Record<string, DiffChangeKind> = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed', C: 'copied', T: 'typechange', U: 'conflicted' }
const UNTRACKED_ARGS = ['ls-files', '-o', '--exclude-standard', '-z', '--no-empty-directory'] as const
const mode = (value: string) => (value === '000000' ? null : value)

export function specialOf(oldMode: string | null, newMode: string | null): 'symlink' | 'submodule' | null {
  if (oldMode === '160000' || newMode === '160000') return 'submodule'
  if (oldMode === '120000' || newMode === '120000') return 'symlink'
  return null
}

export function entryFromRaw(record: RawRecord, stat: NumstatRecord | undefined): DiffFileEntry | null {
  const path = toProjectPath(record.path)
  const oldPath = record.oldPath === null ? null : toProjectPath(record.oldPath)
  if (!record.valid || path === null || (record.oldPath !== null && oldPath === null)) return null
  const oldMode = mode(record.oldMode), newMode = mode(record.newMode)
  return {
    path, oldPath, kind: KINDS[record.letter] ?? 'modified',
    // A file that HEAD does not have is compared with empty content.
    untracked: record.letter === 'A',
    binary: stat ? stat.additions === null : null,
    additions: stat?.additions ?? null, deletions: stat?.deletions ?? null,
    oldMode, newMode, renameScore: record.score, special: specialOf(oldMode, newMode)
  }
}

export function untrackedEntry(path: ProjectPath, special: DiffFileEntry['special'], newMode: string | null = null): DiffFileEntry {
  return {
    path, oldPath: null, kind: 'added', untracked: true, binary: null, additions: null, deletions: null,
    oldMode: null, newMode, renameScore: null, special
  }
}

const byPath = (a: { path: string }, b: { path: string }) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)

export type Kind = 'file' | 'symlink' | 'directory' | 'other' | 'missing'
export async function kindOf(root: string, path: string): Promise<Kind> {
  try {
    const info = await lstat(join(root, path))
    return info.isSymbolicLink() ? 'symlink' : info.isFile() ? 'file' : info.isDirectory() ? 'directory' : 'other'
  } catch { return 'missing' }
}

/** Bounded-concurrency map: lstat storms stay polite on slow volumes. */
async function mapLimited<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let index = next++; index < items.length; index = next++) results[index] = await task(items[index]!)
  }))
  return results
}

/** Untracked names from `ls-files -o`: a trailing '/' is a nested repository directory, shown as a submodule-like entry. */
export async function untrackedEntries(context: QueryContext, names: { path: string; valid: boolean }[]): Promise<{ entries: DiffFileEntry[]; skipped: number }> {
  let skipped = 0
  const candidates: { path: ProjectPath; nested: boolean }[] = []
  for (const name of names) {
    const nested = name.path.endsWith('/')
    const path = name.valid ? toProjectPath(nested ? name.path.slice(0, -1) : name.path) : null
    if (path === null) skipped++
    else candidates.push({ path, nested })
  }
  candidates.sort(byPath)
  // Only the entries that can fit are inspected; the rest is dropped by the cap anyway.
  const kept = candidates.slice(0, DIFF_LIMITS.files + 1)
  const kinds = await mapLimited(kept, 32, (item) => (item.nested ? Promise.resolve<Kind>('directory') : kindOf(context.root, item.path)))
  const entries: DiffFileEntry[] = []
  kept.forEach((item, index) => {
    const kind = kinds[index]!
    if (kind === 'missing') return // vanished between listing and inspection
    entries.push(untrackedEntry(item.path, item.nested ? 'submodule' : kind === 'symlink' ? 'symlink' : null, kind === 'symlink' ? '120000' : item.nested ? '160000' : null))
  })
  return { entries, skipped: skipped + Math.max(0, candidates.length - kept.length) }
}

export async function querySnapshot(context: QueryContext): Promise<SnapshotParts> {
  const probe = await probeRepository(context)
  const base = { head: probe.head, repoPrefix: probe.repoPrefix }
  let truncated = false
  let skipped = 0
  let files: DiffFileEntry[]

  if (probe.hasHead) {
    const [diff, untracked, unmerged] = await Promise.all([
      gitStep(context, [
        'diff', 'HEAD', ...GIT_DIFF_ARGS, '--raw', '--numstat', '-z', '--no-abbrev', '--relative', '--ignore-submodules=dirty', '--', '.'
      ], { maxBytes: DIFF_LIMITS.rawOutputBytes, timeoutMs: DIFF_LIMITS.listTimeoutMs }),
      gitStep(context, UNTRACKED_ARGS, { maxBytes: DIFF_LIMITS.untrackedOutputBytes, timeoutMs: DIFF_LIMITS.listTimeoutMs }),
      gitStep(context, ['ls-files', '-u', '-z'], { maxBytes: DIFF_LIMITS.untrackedOutputBytes, timeoutMs: DIFF_LIMITS.listTimeoutMs })
    ])
    for (const result of [diff, untracked, unmerged]) if (!result.truncated && result.code !== 0) throw failureOfExit(result, context.root)
    const listing = parseDiffListing(diff.stdout)
    truncated = diff.truncated || listing.incomplete || untracked.truncated || unmerged.truncated
    const stats = new Map(listing.numstat.map((record) => [record.path, record]))
    const tracked = new Map<string, DiffFileEntry>()
    for (const record of listing.raw) {
      const entry = entryFromRaw(record, stats.get(record.path))
      if (entry) tracked.set(entry.path, entry)
      else skipped++
    }
    // Conflicts do not show up as `U` in `diff HEAD`, and a modify/delete conflict can leave the file equal to HEAD.
    const conflicts = parseStageList(unmerged.stdout).records
    for (const record of conflicts) {
      const path = record.valid ? toProjectPath(record.path) : null
      if (path === null) { skipped++; continue }
      const existing = tracked.get(path)
      if (existing) existing.kind = 'conflicted'
      else tracked.set(path, {
        path, oldPath: null, kind: 'conflicted', untracked: false, binary: null, additions: null, deletions: null,
        oldMode: null, newMode: record.mode, renameScore: null, special: specialOf(null, record.mode)
      })
    }
    const extra = await untrackedEntries(context, parseNameList(untracked.stdout).names)
    skipped += extra.skipped
    for (const entry of extra.entries) if (!tracked.has(entry.path)) tracked.set(entry.path, entry)
    files = [...tracked.values()]
  } else {
    const [cached, untracked] = await Promise.all([
      gitStep(context, ['ls-files', '-s', '-z'], { maxBytes: DIFF_LIMITS.untrackedOutputBytes, timeoutMs: DIFF_LIMITS.listTimeoutMs }),
      gitStep(context, UNTRACKED_ARGS, { maxBytes: DIFF_LIMITS.untrackedOutputBytes, timeoutMs: DIFF_LIMITS.listTimeoutMs })
    ])
    for (const result of [cached, untracked]) if (!result.truncated && result.code !== 0) throw failureOfExit(result, context.root)
    truncated = cached.truncated || untracked.truncated
    // Staged files of an unborn repository: every one is new, but only if it still exists in the work tree.
    const staged = new Map<string, { path: ProjectPath; mode: string }>()
    for (const record of parseStageList(cached.stdout).records) {
      const path = record.valid ? toProjectPath(record.path) : null
      if (path === null) skipped++
      else if (!staged.has(path)) staged.set(path, { path, mode: record.mode })
    }
    const ordered = [...staged.values()].sort(byPath).slice(0, DIFF_LIMITS.files + 1)
    const present = await mapLimited(ordered, 32, (item) => kindOf(context.root, item.path))
    const entries = new Map<string, DiffFileEntry>()
    ordered.forEach((item, index) => {
      if (present[index] === 'missing') return
      entries.set(item.path, untrackedEntry(item.path, specialOf(null, item.mode), item.mode))
    })
    const extra = await untrackedEntries(context, parseNameList(untracked.stdout).names)
    skipped += extra.skipped
    for (const entry of extra.entries) if (!entries.has(entry.path)) entries.set(entry.path, entry)
    files = [...entries.values()]
  }

  files.sort(byPath)
  if (files.length > DIFF_LIMITS.files) { files = files.slice(0, DIFF_LIMITS.files); truncated = true }
  if (skipped > 0) truncated = true
  const detail = skipped > 0 ? `${skipped} path${skipped === 1 ? '' : 's'} skipped: not valid UTF-8, too long, or beyond the list limit` : null
  // Nothing listed is only "no changes" when HEAD exists and nothing was cut off or skipped.
  const status = !probe.hasHead ? 'no_head' : files.length === 0 && !truncated ? 'clean' : 'ready'
  return { ...base, status, files, truncated, detail }
}
