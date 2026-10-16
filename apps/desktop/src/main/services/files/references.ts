// File references for "add to conversation" and send-time re-validation (FR-TOOL-001 item 4; specs/tools/spec.md §4.1).
// A reference names a regular file inside the Project; it is not a content snapshot, so binary and large files are
// fine, while links, `.git`, directories and names that would break the textual reference are not.
import {
  FILES_LIMITS, isReferenceablePath, parseProjectPath,
  type FileReferenceFailureReason, type FileReferenceRejection, type ProjectPath, type ResolvedFileReference
} from '@shared/tools/files'
import { openRegularFile, type PathFailureOrChanged } from './safe-path'
import { fileVersion } from './read'

export type ResolveOutcome = { status: 'ok'; files: ResolvedFileReference[] } | FileReferenceRejection

type Inspected = { ok: true; file: ResolvedFileReference } | { ok: false; reason: FileReferenceFailureReason }

function failureReason(reason: PathFailureOrChanged): FileReferenceFailureReason {
  // A directory in the middle of the path cannot happen for a file target; the rest map one to one.
  return reason === 'not_directory' || reason === 'changed' ? 'unreadable' : reason
}

async function inspect(root: string, path: ProjectPath): Promise<Inspected> {
  try { parseProjectPath(path) } catch { return { ok: false, reason: 'invalid_path' } }
  if (path === '') return { ok: false, reason: 'not_file' }
  if (!isReferenceablePath(path)) return { ok: false, reason: 'name_unsupported' }
  // The file must be openable for reading right now; one retry absorbs an editor's atomic replace.
  for (let attempt = 0; attempt < 2; attempt++) {
    const opened = await openRegularFile(root, path)
    if (!opened.ok) {
      if (opened.reason === 'changed') continue
      return { ok: false, reason: failureReason(opened.reason) }
    }
    const { handle, stats, entry } = opened.file
    await handle.close().catch(() => {})
    return {
      ok: true,
      file: {
        path, name: path.slice(path.lastIndexOf('/') + 1), size: Number(stats.size), version: fileVersion(stats), absolutePath: entry.real
      }
    }
  }
  return { ok: false, reason: 'unreadable' }
}

/**
 * Validates every path against the Project at call time. All-or-nothing: one failing path rejects the whole message
 * so the renderer keeps the draft and names the offender. Exact duplicates are checked once; different spellings
 * only collapse after the filesystem resolves them to the same real path. Hard links with different paths stay separate.
 */
export async function resolveFileReferences(root: string, paths: readonly ProjectPath[], shouldStop?: () => boolean): Promise<ResolveOutcome> {
  const failures: FileReferenceRejection['failures'] = []
  const files: ResolvedFileReference[] = []
  const seenSpelling = new Set<string>()
  const seenReal = new Map<string, ResolvedFileReference>()
  let accepted = 0
  for (const path of paths) {
    if (seenSpelling.has(path)) continue
    seenSpelling.add(path)
    if (++accepted > FILES_LIMITS.referencesPerMessage) { failures.push({ path, reason: 'too_many' }); continue }
    if (shouldStop?.()) { failures.push({ path, reason: 'timeout' }); continue }
    const result = await inspect(root, path)
    if (!result.ok) { failures.push({ path, reason: result.reason }); continue }
    const previous = seenReal.get(result.file.absolutePath)
    if (previous) {
      previous.aliases = [...(previous.aliases ?? []), path]
      continue
    }
    seenReal.set(result.file.absolutePath, result.file)
    files.push(result.file)
  }
  return failures.length ? { status: 'rejected', failures } : { status: 'ok', files }
}

/** Rejects every distinct path for a Project-level reason (unavailable, closing). */
export function rejectAll(paths: readonly ProjectPath[], reason: FileReferenceFailureReason): FileReferenceRejection {
  const failures = [...new Set(paths)].map((path) => ({ path, reason }))
  return { status: 'rejected', failures }
}
