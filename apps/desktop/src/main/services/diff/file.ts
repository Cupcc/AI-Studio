// One file of the project Diff: its entry, the patch Git prints for it, and the two sides for the two-sided editor.
// Blob ids are only ever taken from Git's own `--raw` / `ls-files` output (never from the renderer) and are
// re-validated before they reach a command line; the modified side is read from the Project with the bounded safe
// reader and checked against a fingerprint so a file that changes while being read is reported, not shown torn.
import { DIFF_LIMITS, type DiffFileEntry, type DiffFileRequest, type DiffSide } from '@shared/tools/diff'
import { GIT_DIFF_ARGS } from './git-env'
import { parseDiffListing, parseNameList, parseStageList } from './parse'
import { failureOfExit, gitStep, probeRepository, type QueryContext, type RepoProbe } from './query'
import { fingerprintProjectFile, readProjectFileBounded } from './safe-read'
import { sideOf } from './side'
import { entryFromRaw, kindOf, specialOf, untrackedEntry } from './snapshot'

export type FileQueryResult =
  | { status: 'unchanged' }
  | { status: 'ok'; settled: boolean; entry: DiffFileEntry; original: DiffSide; modified: DiffSide; patch: { text: string; truncated: boolean } | null }

interface Located {
  entry: DiffFileEntry
  /** Blob of the HEAD side, from Git's output. */
  oldSha: string | null
  /** Known to `git diff HEAD` (as opposed to untracked / unborn, which are compared with empty content). */
  tracked: boolean
}

const SHA = /^[0-9a-f]{40,64}$/
const ZERO = /^0+$/
const RETRIES = 2
const PATCH_ARGS = ['--patch', '--unified=3', '--src-prefix=a/', '--dst-prefix=b/'] as const
const UNTRACKED_ARGS = ['ls-files', '-o', '--exclude-standard', '-z', '--no-empty-directory'] as const

const validSha = (sha: string | null): sha is string => sha !== null && SHA.test(sha) && !ZERO.test(sha)
const listOptions = { maxBytes: DIFF_LIMITS.rawOutputBytes, timeoutMs: DIFF_LIMITS.fileTimeoutMs }
const fileOptions = { timeoutMs: DIFF_LIMITS.fileTimeoutMs }

async function locateEntry(context: QueryContext, probe: RepoProbe, request: DiffFileRequest): Promise<Located | null> {
  const { path } = request
  const untracked = async (): Promise<Located | null> => {
    const result = await gitStep(context, [...UNTRACKED_ARGS, '--', path], fileOptions)
    if (result.code !== 0) throw failureOfExit(result, context.root)
    const found = parseNameList(result.stdout).names.find((name) => name.valid && (name.path === path || name.path === `${path}/`))
    if (!found) return null
    return { entry: await untrackedFileEntry(context.root, path, found.path.endsWith('/')), oldSha: null, tracked: false }
  }
  if (!probe.hasHead) {
    // Unborn HEAD: every file is new. A staged file only counts while it still exists.
    const staged = await gitStep(context, ['ls-files', '-s', '-z', '--', path], fileOptions)
    if (staged.code !== 0) throw failureOfExit(staged, context.root)
    const record = parseStageList(staged.stdout).records.find((item) => item.valid && item.path === path)
    if (record) {
      const kind = await kindOf(context.root, path)
      return kind === 'missing' ? null : { entry: untrackedEntry(path, specialOf(null, record.mode), record.mode), oldSha: null, tracked: false }
    }
    return untracked()
  }
  const pathspec = request.oldPath !== null && request.oldPath !== path ? [request.oldPath, path] : [path]
  const [diff, unmerged] = await Promise.all([
    gitStep(context, ['diff', 'HEAD', ...GIT_DIFF_ARGS, '--raw', '--numstat', '-z', '--no-abbrev', '--relative', '--ignore-submodules=dirty', '--', ...pathspec], listOptions),
    gitStep(context, ['ls-files', '-u', '-z', '--', path], fileOptions)
  ])
  for (const result of [diff, unmerged]) if (!result.truncated && result.code !== 0) throw failureOfExit(result, context.root)
  const listing = parseDiffListing(diff.stdout)
  const record = listing.raw.find((item) => item.valid && item.path === path)
  const stages = parseStageList(unmerged.stdout).records.filter((item) => item.valid && item.path === path)
  if (record) {
    const entry = entryFromRaw(record, listing.numstat.find((item) => item.path === path))
    if (entry) {
      if (stages.length) entry.kind = 'conflicted'
      return { entry, oldSha: validSha(record.oldSha) ? record.oldSha : null, tracked: true }
    }
  }
  if (stages.length) {
    // Modify/delete conflicts can leave the file equal to HEAD: HEAD's side is the "ours" stage.
    const ours = stages.find((item) => item.stage === 2)
    const first = ours ?? stages[0]!
    return {
      entry: {
        path, oldPath: null, kind: 'conflicted', untracked: false, binary: null, additions: null, deletions: null,
        oldMode: null, newMode: first.mode, renameScore: null, special: specialOf(null, first.mode)
      },
      oldSha: ours && validSha(ours.sha) ? ours.sha : null, tracked: true
    }
  }
  return untracked()
}

async function untrackedFileEntry(root: string, path: string, nested: boolean): Promise<DiffFileEntry> {
  if (nested) return untrackedEntry(path, 'submodule', '160000')
  return (await kindOf(root, path)) === 'symlink' ? untrackedEntry(path, 'symlink', '120000') : untrackedEntry(path, null)
}

/** `undefined` = the file vanished while Git was asked about it (the caller retries). */
async function readPatch(context: QueryContext, located: Located, readable: boolean): Promise<{ text: string; truncated: boolean } | null | undefined> {
  const { entry } = located
  if (located.tracked) {
    const result = await gitStep(context, [
      'diff', 'HEAD', ...GIT_DIFF_ARGS, ...PATCH_ARGS, '--submodule=short', '--relative', '--ignore-submodules=dirty',
      '--', ...(entry.oldPath === null ? [] : [entry.oldPath]), entry.path
    ], { maxBytes: DIFF_LIMITS.patchBytes, timeoutMs: DIFF_LIMITS.fileTimeoutMs })
    if (!result.truncated && result.code !== 0) throw failureOfExit(result, context.root)
    return result.stdout.length ? { text: result.stdout.toString('utf8'), truncated: result.truncated } : null
  }
  // Untracked / unborn: compare with empty content. A nested repository, a FIFO or a vanished file has no patch.
  if (!readable) return null
  const result = await gitStep(context, [
    'diff', '--no-index', '--no-ext-diff', '--no-textconv', '--no-color', ...PATCH_ARGS, '--', '/dev/null', entry.path
  ], { maxBytes: DIFF_LIMITS.patchBytes, timeoutMs: DIFF_LIMITS.fileTimeoutMs })
  // `--no-index` exits 1 when the files differ. Exit 1 with nothing printed is an error (for example "Could not
  // access" for a file that disappeared), so a difference is only accepted together with patch text.
  if (result.truncated || (result.code === 1 && result.stdout.length > 0)) {
    return result.stdout.length ? { text: result.stdout.toString('utf8'), truncated: result.truncated } : null
  }
  if (result.code === 0) return null
  if (result.code === 1) return undefined
  throw failureOfExit(result, context.root)
}

async function readOriginal(context: QueryContext, located: Located): Promise<DiffSide> {
  const { entry, oldSha } = located
  if (entry.special !== null) return { status: 'omitted', reason: entry.special }
  if (entry.kind === 'added' || entry.untracked || oldSha === null) return { status: 'absent' }
  if (!validSha(oldSha)) return { status: 'omitted', reason: 'unreadable' }
  const size = await gitStep(context, ['cat-file', '-s', oldSha], fileOptions)
  if (size.code !== 0) return { status: 'omitted', reason: 'unreadable' }
  const bytes = Number(size.stdout.toString('utf8').trim())
  if (!Number.isSafeInteger(bytes)) return { status: 'omitted', reason: 'unreadable' }
  if (bytes > DIFF_LIMITS.sideBytes) return { status: 'omitted', reason: 'too_large', size: bytes }
  const blob = await gitStep(context, ['cat-file', 'blob', oldSha], { maxBytes: DIFF_LIMITS.sideBytes + 1, timeoutMs: DIFF_LIMITS.fileTimeoutMs })
  if (blob.code !== 0 || blob.truncated) return { status: 'omitted', reason: 'unreadable' }
  return sideOf(blob.stdout, bytes)
}

export async function queryFile(context: QueryContext, request: DiffFileRequest): Promise<FileQueryResult> {
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    // The fingerprint is taken before Git looks at the file and compared after every read of it.
    const before = await fingerprintProjectFile(context.root, request.path)
    const probe = await probeRepository(context)
    const located = await locateEntry(context, probe, request)
    if (!located) return { status: 'unchanged' }
    const { entry } = located
    const needsWorktree = entry.kind !== 'deleted' && entry.special === null
    // A symlink has a patch (its target text) even though it is never read as a file.
    const readable = before.status === 'ok' || before.status === 'symlink'
    const [patch, original] = await Promise.all([readPatch(context, located, readable), readOriginal(context, located)])
    let modified: DiffSide
    // `patch === undefined`: Git could not read the file any more. It is retried like any other change under the read.
    let stable = patch !== undefined
    if (!needsWorktree) {
      modified = entry.kind === 'deleted' ? { status: 'absent' } : { status: 'omitted', reason: entry.special! }
    } else {
      const read = await readProjectFileBounded(context.root, request.path, DIFF_LIMITS.sideBytes)
      if (read.status === 'ok' || read.status === 'too_large') {
        stable = stable && before.status === 'ok' && read.fingerprint === before.fingerprint
        modified = read.status === 'ok' ? sideOf(read.bytes, read.size) : { status: 'omitted', reason: 'too_large', size: read.size }
      } else if (read.status === 'not_file' || read.status === 'unreadable') {
        modified = { status: 'omitted', reason: 'unreadable' }
      } else {
        // missing / replaced by a link / changed under the reader: the entry Git reported no longer matches the disk.
        stable = false
        modified = { status: 'omitted', reason: 'changed_while_reading' }
      }
    }
    if (stable || attempt === RETRIES) {
      // Out of retries and still moving: the patch and the file may no longer describe the same bytes, so the modified side is withheld.
      if (!stable) modified = { status: 'omitted', reason: 'changed_while_reading' }
      const sides = [original, modified]
      const binary = sides.some((side) => side.status === 'omitted' && side.reason === 'binary')
        ? true
        : entry.binary ?? (sides.every((side) => side.status !== 'omitted') ? false : null)
      return { status: 'ok', settled: stable, entry: { ...entry, binary }, original, modified, patch: patch ?? null }
    }
  }
  // Unreachable: the last attempt always returns.
  return { status: 'unchanged' }
}
