// Project-confined path resolution and opening for the Files tool (FR-TOOL-001; specs/tools/spec.md §3 item 3).
//
// Rules: the renderer only ever names a Project-relative path. Every component is lstat-ed, a symbolic link is
// refused (never followed), the real path must stay inside the Project's canonical root, `.git` is invisible, and
// the final open uses O_NOFOLLOW(_ANY) so the kernel refuses a link swapped in after the check. A file is only
// trusted when the opened descriptor and the path still name the same dev/ino.
import { constants as fsConstants, type BigIntStats } from 'node:fs'
import { lstat, open, realpath, type FileHandle } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { FILES_WATCH_IGNORED, type FileUnavailableReason, type ProjectPath } from '@shared/tools/files'

/** Reasons shared by every path-confined operation (all are members of the public reason unions). */
export type PathFailure = Extract<FileUnavailableReason,
  'invalid_path' | 'project_unavailable' | 'missing' | 'not_directory' | 'not_file' | 'symlink_refused' | 'excluded'
  | 'permission_denied' | 'unreadable'>
/** Internal: the entry changed identity between two checks; callers retry a bounded number of times. */
export type PathFailureOrChanged = PathFailure | 'changed'

export type Resolution<T> = { ok: true; value: T } | { ok: false; reason: PathFailure }

export interface ResolvedEntry {
  /** Canonical root joined with the requested components (no link was crossed). */
  absolute: string
  /** realpath of `absolute`; inside the Project. */
  real: string
  /** lstat of the leaf at resolution time. */
  stats: BigIntStats
}

/**
 * macOS O_NOFOLLOW_ANY (sys/fcntl.h): no component of the path may be a symlink. Node exposes no named constant.
 * The kernel rejects it together with O_NOFOLLOW (EINVAL), so it replaces O_NOFOLLOW on darwin (spike SP2).
 */
export const O_NOFOLLOW_ANY = 0x20000000
const NONBLOCKING_READ = fsConstants.O_RDONLY | fsConstants.O_NONBLOCK
let darwinNoFollowAny = process.platform === 'darwin'

/** `.git` at any depth, any letter case: APFS is case-insensitive, so `.GIT/config` reaches the real repository. */
export function isExcludedName(name: string): boolean {
  return FILES_WATCH_IGNORED.anywhere.some((item) => name.length === item.length && name.toLowerCase() === item)
}
export function hasExcludedSegment(segments: readonly string[]): boolean {
  return segments.some(isExcludedName)
}

/** Maps an fs error to the public reason; `fallback` covers codes without a more specific meaning. */
export function classifyError(error: unknown, fallback: PathFailure = 'unreadable'): PathFailure {
  switch ((error as NodeJS.ErrnoException | undefined)?.code) {
    case 'ENOENT': case 'ENOTDIR': case 'ENAMETOOLONG': return 'missing'
    case 'ELOOP': return 'symlink_refused'
    case 'EACCES': case 'EPERM': return 'permission_denied'
    default: return fallback
  }
}

export function sameIdentity(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino
}

/** The Project root must still be the canonical directory recorded at Project open (not moved or replaced by a link). */
export async function rootIsCanonical(root: string): Promise<boolean> {
  try {
    if ((await realpath(root)) !== root) return false
    return (await lstat(root)).isDirectory()
  } catch { return false }
}

function inside(root: string, real: string): boolean {
  const prefix = root.endsWith(sep) ? root : root + sep
  return real === root || real.startsWith(prefix)
}

/**
 * Resolves a validated ProjectPath to an existing entry of the expected kind. Never follows a link, never leaves the
 * root. `path` must already have passed `parseProjectPath`.
 */
export async function resolveEntry(root: string, path: ProjectPath, expect: 'directory' | 'file'): Promise<Resolution<ResolvedEntry>> {
  const segments = path === '' ? [] : path.split('/')
  if (hasExcludedSegment(segments)) return { ok: false, reason: 'excluded' }
  if (!(await rootIsCanonical(root))) return { ok: false, reason: 'project_unavailable' }
  let current = root
  let stats: BigIntStats
  try {
    stats = await lstat(root, { bigint: true })
    for (let index = 0; index < segments.length; index++) {
      current = join(current, segments[index]!)
      stats = await lstat(current, { bigint: true })
      if (stats.isSymbolicLink()) return { ok: false, reason: 'symlink_refused' }
      // A file in the middle of the path means the requested path does not exist.
      if (index < segments.length - 1 && !stats.isDirectory()) return { ok: false, reason: 'missing' }
    }
  } catch (error) { return { ok: false, reason: classifyError(error) } }
  if (expect === 'directory' && !stats.isDirectory()) return { ok: false, reason: 'not_directory' }
  if (expect === 'file' && !stats.isFile()) return { ok: false, reason: 'not_file' }
  let real: string
  try { real = await realpath(current) } catch (error) { return { ok: false, reason: classifyError(error) } }
  if (!inside(root, real)) return { ok: false, reason: 'symlink_refused' }
  // The on-disk spelling may differ from the requested one (case-insensitive volumes): check it again.
  if (real !== root && hasExcludedSegment(real.slice(root.endsWith(sep) ? root.length : root.length + 1).split(sep))) {
    return { ok: false, reason: 'excluded' }
  }
  return { ok: true, value: { absolute: current, real, stats } }
}

/** Opens read-only without blocking and without following links (the kernel enforces it, whatever was checked before). */
export async function openNoFollow(absolute: string): Promise<FileHandle> {
  if (darwinNoFollowAny) {
    try { return await open(absolute, NONBLOCKING_READ | O_NOFOLLOW_ANY) } catch (error) {
      // Kernels without O_NOFOLLOW_ANY answer EINVAL; the component walk above still refused links.
      if ((error as NodeJS.ErrnoException).code !== 'EINVAL') throw error
      darwinNoFollowAny = false
    }
  }
  return open(absolute, NONBLOCKING_READ | fsConstants.O_NOFOLLOW)
}

export interface OpenedFile {
  handle: FileHandle
  /** fstat of the descriptor right after open. */
  stats: BigIntStats
  entry: ResolvedEntry
}

/**
 * Resolves and opens a regular file for reading. A FIFO, device or socket is rejected by the lstat in `resolveEntry`
 * before any open, so a pipe without a writer can never block. The caller closes the handle.
 */
export async function openRegularFile(root: string, path: ProjectPath): Promise<{ ok: true; file: OpenedFile } | { ok: false; reason: PathFailureOrChanged }> {
  const resolved = await resolveEntry(root, path, 'file')
  if (!resolved.ok) return resolved
  let handle: FileHandle
  try { handle = await openNoFollow(resolved.value.absolute) }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    // ENXIO: a socket or device appeared at the path after the lstat.
    return { ok: false, reason: code === 'ENXIO' ? 'not_file' : classifyError(error) }
  }
  try {
    const stats = await handle.stat({ bigint: true })
    if (!stats.isFile()) { await handle.close(); return { ok: false, reason: 'not_file' } }
    if (!sameIdentity(stats, resolved.value.stats)) { await handle.close(); return { ok: false, reason: 'changed' } }
    return { ok: true, file: { handle, stats, entry: resolved.value } }
  } catch (error) {
    await handle.close().catch(() => {})
    return { ok: false, reason: classifyError(error) }
  }
}
