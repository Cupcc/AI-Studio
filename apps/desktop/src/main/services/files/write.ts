// Saving the Files viewer's text (FR-TOOL-001 2026-11-14, TOOLS-Q13; specs/tools/spec.md §5.5).
//
// The same confinement as reading (safe-path.ts): Project-relative path, no link crossed or followed (the open itself
// uses O_NOFOLLOW_ANY), `.git` invisible, regular files only. The write is optimistic like VS Code's: it happens only
// while the file still has the version the edit started from, so a change made meanwhile by a CLI, an editor or the
// user is reported as a conflict and never silently overwritten. The file is written in place (same inode, permissions,
// extended attributes and hard links), new bytes first and the tail truncated after, as VS Code does by default.
import { constants as fsConstants } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import {
  FILES_LIMITS, projectPathName, projectPathParent,
  type FileEncoding, type FileWriteFailure, type FileWriteResult, type ProjectPath
} from '@shared/tools/files'
import { fileVersion } from './read'
import { classifyError, isExcludedName, openNoFollowForWrite, resolveEntry, sameIdentity, type PathFailure } from './safe-path'

export interface WriteOptions {
  /** Test seam: runs after the version check, right before the bytes are written. */
  beforeWrite?: (absolute: string) => Promise<void>
}

const BOMS: Record<FileEncoding, Buffer> = {
  'utf-8': Buffer.from([0xef, 0xbb, 0xbf]),
  'utf-16le': Buffer.from([0xff, 0xfe]),
  'utf-16be': Buffer.from([0xfe, 0xff])
}

/** The bytes of `text` in the encoding the file was read with. UTF-16 is only ever read with its BOM, so it keeps one. */
export function encodeText(text: string, encoding: FileEncoding, bom: boolean): Buffer {
  let body: Buffer
  if (encoding === 'utf-8') body = Buffer.from(text, 'utf8')
  else {
    body = Buffer.from(text, 'utf16le')
    if (encoding === 'utf-16be') body.swap16()
  }
  return bom || encoding !== 'utf-8' ? Buffer.concat([BOMS[encoding], body]) : body
}

function asWriteFailure(reason: PathFailure): FileWriteFailure {
  switch (reason) {
    case 'invalid_path': case 'project_unavailable': case 'missing': case 'not_file': case 'symlink_refused':
    case 'excluded': case 'permission_denied': return reason
    case 'not_directory': return 'missing'
    default: return 'failed'
  }
}

async function writeAll(handle: FileHandle, bytes: Buffer): Promise<void> {
  let offset = 0
  while (offset < bytes.length) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset, offset)
    if (bytesWritten === 0) throw new Error('write made no progress')
    offset += bytesWritten
  }
}

/** Opening failed: ENXIO is a FIFO or device swapped in after the lstat; EEXIST only happens for a new file. */
function openFailure(path: ProjectPath, error: unknown): FileWriteResult {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  if (code === 'ENXIO' || code === 'EISDIR') return { status: 'failed', path, reason: 'not_file' }
  if (code === 'ENOENT') return { status: 'conflict', path, version: null }
  return { status: 'failed', path, reason: asWriteFailure(classifyError(error, 'unreadable')) }
}

async function writeExisting(root: string, path: ProjectPath, bytes: Buffer, expected: string, options: WriteOptions): Promise<FileWriteResult> {
  const resolved = await resolveEntry(root, path, 'file')
  if (!resolved.ok) return resolved.reason === 'missing' ? { status: 'conflict', path, version: null } : { status: 'failed', path, reason: asWriteFailure(resolved.reason) }
  let handle: FileHandle
  try { handle = await openNoFollowForWrite(resolved.value.absolute) } catch (error) { return openFailure(path, error) }
  try {
    const before = await handle.stat({ bigint: true })
    if (!before.isFile()) return { status: 'failed', path, reason: 'not_file' }
    // Another file now has the name (replaced after the check): whatever it is, it is not the one that was edited.
    const version = fileVersion(before)
    if (!sameIdentity(before, resolved.value.stats) || version !== expected) return { status: 'conflict', path, version }
    await options.beforeWrite?.(resolved.value.absolute)
    await writeAll(handle, bytes)
    await handle.truncate(bytes.length)
    const after = await handle.stat({ bigint: true })
    // The name must still lead to the file that was written (as read.ts checks); otherwise the text is not where the user
    // looks for it, and the save is reported as a conflict so the changes stay in the editor.
    const again = await resolveEntry(root, path, 'file')
    if (!again.ok || !sameIdentity(again.value.stats, after)) return { status: 'conflict', path, version: again.ok ? fileVersion(again.value.stats) : null }
    return { status: 'ok', path, version: fileVersion(after), size: Number(after.size) }
  } catch (error) {
    return { status: 'failed', path, reason: asWriteFailure(classifyError(error, 'unreadable')) }
  } finally { await handle.close().catch(() => {}) }
}

/** The edited file was deleted: create it again, exclusively, so nothing that appeared meanwhile is replaced. */
async function createFile(root: string, path: ProjectPath, bytes: Buffer, options: WriteOptions): Promise<FileWriteResult> {
  const name = projectPathName(path)
  if (isExcludedName(name)) return { status: 'failed', path, reason: 'excluded' }
  const parent = await resolveEntry(root, projectPathParent(path), 'directory')
  if (!parent.ok) return { status: 'failed', path, reason: asWriteFailure(parent.reason) }
  const absolute = join(parent.value.absolute, name)
  let handle: FileHandle
  try { handle = await openNoFollowForWrite(absolute, fsConstants.O_CREAT | fsConstants.O_EXCL) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') return openFailure(path, error)
    // Something took the name. A regular file is a conflict the user can compare and overwrite; anything else is refused.
    const existing = await resolveEntry(root, path, 'file')
    return existing.ok ? { status: 'conflict', path, version: fileVersion(existing.value.stats) } : { status: 'failed', path, reason: asWriteFailure(existing.reason) }
  }
  try {
    await options.beforeWrite?.(absolute)
    await writeAll(handle, bytes)
    const after = await handle.stat({ bigint: true })
    return { status: 'ok', path, version: fileVersion(after), size: Number(after.size) }
  } catch (error) {
    return { status: 'failed', path, reason: asWriteFailure(classifyError(error, 'unreadable')) }
  } finally { await handle.close().catch(() => {}) }
}

/** Writes `text` to `path` (already a valid, non-root ProjectPath) when the file still has `expectedVersion`. */
export async function writeTextFile(
  root: string, path: ProjectPath, text: string, expectedVersion: string | null, encoding: FileEncoding, bom: boolean, options: WriteOptions = {}
): Promise<FileWriteResult> {
  if (path === '') return { status: 'failed', path, reason: 'invalid_path' }
  const bytes = encodeText(text, encoding, bom)
  // The viewer reads at most this much; a larger file would no longer open in it.
  if (bytes.length > FILES_LIMITS.readBytes) return { status: 'failed', path, reason: 'too_large' }
  return expectedVersion === null ? createFile(root, path, bytes, options) : writeExisting(root, path, bytes, expectedVersion, options)
}
