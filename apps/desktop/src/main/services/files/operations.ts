// File management for the Files tool (FR-TOOL-001 2026-10-26, TOOLS-Q11): create, rename, move, copy and move to the
// Trash. Contents are never edited here.
//
// Every request names Project-relative paths. Directories on the way are resolved with `resolveEntry` (no symbolic link
// is crossed, the real path stays inside the Project, `.git` is invisible); the entry acted on may itself be a link, which
// is then renamed, moved, copied or trashed as a link, never followed. Nothing is overwritten: an existing destination
// is reported as `exists`. The operations are the user's own, started from the trusted app renderer.
import { constants as fsConstants, type BigIntStats } from 'node:fs'
import { cp, lstat, mkdir, mkdtemp, open, rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  FILES_LIMITS, joinProjectPath, parseProjectPath, projectPathName, projectPathParent,
  type FileOperationFailure, type FileOperationResult, type ProjectPath
} from '@shared/tools/files'
import { classifyError, isExcludedName, resolveEntry, sameIdentity } from './safe-path'
import { renameExclusive } from './rename-exclusive'

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F\u0085\u2028\u2029]/
const encoder = new TextEncoder()

type Resolved<T> = { ok: true; value: T } | { ok: false; reason: FileOperationFailure }

/** A single new name: no separators, no control characters, not `.` / `..` / `.git`, within the APFS limits. */
export function nameProblem(name: string): FileOperationFailure | null {
  if (name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\0') || CONTROL.test(name)) return 'invalid_name'
  if (name.trim() !== name && name.trim() === '') return 'invalid_name'
  if ([...name].length > 255 || encoder.encode(name).length > FILES_LIMITS.nameBytes) return 'invalid_name'
  if (isExcludedName(name)) return 'excluded'
  return null
}

function asOperationFailure(reason: string): FileOperationFailure {
  switch (reason) {
    case 'invalid_path': case 'project_unavailable': case 'missing': case 'not_directory': case 'excluded':
    case 'symlink_refused': case 'permission_denied': return reason
    default: return 'failed'
  }
}

function failure(error: unknown): FileOperationFailure {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  if (code === 'EEXIST' || code === 'ENOTEMPTY') return 'exists'
  if (code === 'EINVAL' || code === 'ENAMETOOLONG') return 'invalid_name'
  return asOperationFailure(classifyError(error, 'unreadable'))
}

async function directory(root: string, path: ProjectPath): Promise<Resolved<string>> {
  const resolved = await resolveEntry(root, path, 'directory')
  return resolved.ok ? { ok: true, value: resolved.value.absolute } : { ok: false, reason: asOperationFailure(resolved.reason) }
}

interface Entry { path: ProjectPath; name: string; parent: ProjectPath; parentAbsolute: string; absolute: string; stats: BigIntStats }

/** An existing entry of any kind (file, directory, link, special). Its parent chain contains no link. */
async function entry(root: string, path: ProjectPath): Promise<Resolved<Entry>> {
  try { parseProjectPath(path) } catch { return { ok: false, reason: 'invalid_path' } }
  if (path === '') return { ok: false, reason: 'root' }
  const name = projectPathName(path), parent = projectPathParent(path)
  if (isExcludedName(name)) return { ok: false, reason: 'excluded' }
  const dir = await directory(root, parent)
  if (!dir.ok) return dir
  const absolute = join(dir.value, name)
  try {
    return { ok: true, value: { path, name, parent, parentAbsolute: dir.value, absolute, stats: await lstat(absolute, { bigint: true }) } }
  } catch (error) { return { ok: false, reason: failure(error) } }
}

async function exists(absolute: string): Promise<BigIntStats | null> {
  try { return await lstat(absolute, { bigint: true }) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

const ok = (paths: ProjectPath[]): FileOperationResult => ({ status: 'ok', paths })
const failed = (reason: FileOperationFailure, path: ProjectPath, done: ProjectPath[] = []): FileOperationResult => ({ status: 'failed', reason, path, done })

/** Creates a file or folder. `name` may hold `/` to create missing folders on the way, as in VS Code. */
export async function createEntry(root: string, parent: ProjectPath, name: string, kind: 'file' | 'directory'): Promise<FileOperationResult> {
  const segments = name.split('/')
  for (const segment of segments) {
    const problem = nameProblem(segment)
    if (problem) return failed(problem, parent)
  }
  let path: ProjectPath
  try { path = joinProjectPath(parent, segments[0]!); for (const segment of segments.slice(1)) path = joinProjectPath(path, segment) }
  catch { return failed('invalid_name', parent) }
  const dir = await directory(root, parent)
  if (!dir.ok) return failed(dir.reason, parent)
  let current = dir.value, currentPath = parent
  try {
    for (const segment of segments.slice(0, -1)) {
      current = join(current, segment); currentPath = joinProjectPath(currentPath, segment)
      try { await mkdir(current) } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        // Only an existing real folder may be reused; a file or link with that name stops the creation.
        const stats = await lstat(current)
        if (!stats.isDirectory()) return failed(stats.isSymbolicLink() ? 'symlink_refused' : 'exists', currentPath)
      }
    }
    const target = join(current, segments.at(-1)!)
    if (kind === 'directory') await mkdir(target)
    else await (await open(target, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW, 0o666)).close()
    return ok([path])
  } catch (error) { return failed(failure(error), path) }
}

/** Renames in place. A change of letter case only (same file on a case-insensitive volume) is allowed. */
export async function renameEntry(root: string, path: ProjectPath, name: string): Promise<FileOperationResult> {
  const problem = nameProblem(name)
  if (problem) return failed(problem, path)
  const source = await entry(root, path)
  if (!source.ok) return failed(source.reason, path)
  if (name === source.value.name) return ok([path])
  const destination = join(source.value.parentAbsolute, name)
  const next = joinProjectPath(source.value.parent, name)
  try {
    const existing = await exists(destination)
    if (existing && !sameIdentity(existing, source.value.stats)) return failed('exists', next)
    await renameExclusive(source.value.absolute, destination)
    return ok([next])
  } catch (error) { return failed(failure(error), path) }
}

const within = (path: ProjectPath, ancestor: ProjectPath) => path === ancestor || path.startsWith(`${ancestor}/`)

/** Moves each entry into `target`. Entries already there are left alone; nothing is overwritten. */
export async function moveEntries(root: string, paths: readonly ProjectPath[], target: ProjectPath): Promise<FileOperationResult> {
  const dir = await directory(root, target)
  if (!dir.ok) return failed(dir.reason, target)
  const done: ProjectPath[] = []
  for (const path of paths) {
    const source = await entry(root, path)
    if (!source.ok) return failed(source.reason, path, done)
    if (source.value.parent === target) { done.push(path); continue }
    if (within(target, path)) return failed('into_itself', path, done)
    const next = joinProjectPath(target, source.value.name)
    try {
      if (await exists(join(dir.value, source.value.name))) return failed('exists', next, done)
      await renameExclusive(source.value.absolute, join(dir.value, source.value.name))
      done.push(next)
    } catch (error) { return failed(failure(error), path, done) }
  }
  return ok(done)
}

/** `name copy.ext`, `name copy 2.ext`, … — VS Code's naming for a copy pasted next to its original. */
export function copyName(name: string, attempt: number): string {
  const dot = name.lastIndexOf('.')
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
  return `${stem} copy${attempt > 1 ? ` ${attempt}` : ''}${extension}`
}

/** Copies each entry into `target`; a name already taken gets the VS Code "copy" suffix. Links are copied as links. */
export async function copyEntries(root: string, paths: readonly ProjectPath[], target: ProjectPath): Promise<FileOperationResult> {
  const dir = await directory(root, target)
  if (!dir.ok) return failed(dir.reason, target)
  const done: ProjectPath[] = []
  for (const path of paths) {
    const source = await entry(root, path)
    if (!source.ok) return failed(source.reason, path, done)
    if (source.value.stats.isDirectory() && within(target, path)) return failed('into_itself', path, done)
    let staging: string | undefined
    try {
      let name = source.value.name
      for (let attempt = 1; await exists(join(dir.value, name)); attempt++) {
        if (attempt > 100) return failed('exists', joinProjectPath(target, name), done)
        name = copyName(source.value.name, attempt)
      }
      if (nameProblem(name)) return failed('invalid_name', path, done)
      // Copy into a private sibling first. Publishing with RENAME_EXCL prevents an external mkdir / writer from
      // turning the checked-missing destination into a directory merge or an overwrite during a long copy.
      staging = await mkdtemp(join(dir.value, '.studio-copy-'))
      const staged = join(staging, 'entry')
      await cp(source.value.absolute, staged, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true })
      await renameExclusive(staged, join(dir.value, name))
      done.push(joinProjectPath(target, name))
    } catch (error) { return failed(failure(error), path, done) }
    finally { if (staging) await rm(staging, { recursive: true, force: true }) }
  }
  return ok(done)
}

/** Moves each entry to the system Trash (recoverable), never deletes. */
export async function trashEntries(root: string, paths: readonly ProjectPath[], trash: (absolute: string) => Promise<void>): Promise<FileOperationResult> {
  const done: ProjectPath[] = []
  for (const path of paths) {
    const source = await entry(root, path)
    if (!source.ok) return failed(source.reason, path, done)
    try { await trash(source.value.absolute); done.push(path) } catch (error) { return failed(failure(error), path, done) }
  }
  return ok(done)
}

/** The absolute path of an existing entry for revealing / opening it in another application. */
export async function absoluteOf(root: string, path: ProjectPath, kind: 'any' | 'directory' = 'any'): Promise<Resolved<string>> {
  if (path === '') return { ok: true, value: root }
  if (kind === 'directory') return directory(root, path)
  const resolved = await entry(root, path)
  return resolved.ok ? { ok: true, value: resolved.value.absolute } : resolved
}
