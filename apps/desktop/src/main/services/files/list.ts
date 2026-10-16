// Directory reads use a verified, isolated cwd so pathname replacement cannot redirect enumeration.
import type { FileHandle } from 'node:fs/promises'
import type { ProjectPath } from '@shared/tools/files'
import { readAnchoredDirectory, type DirectoryReadOutcome } from './directory-reader'
import { classifyError, openNoFollow, resolveEntry, sameIdentity } from './safe-path'

export interface ListOptions {
  limit?: number
  /** Locale of the name ordering; undefined uses the runtime default. */
  locale?: string
  /** Checked while the reader is running; cancellation kills the isolated reader. */
  shouldStop?: () => boolean
  /** Test seam: runs after the safe directory descriptor is open, before enumeration. */
  afterOpen?: (absolute: string) => Promise<void>
}

export type ListOutcome = Exclude<DirectoryReadOutcome, 'changed'>

/** Lists direct children only. A changed directory is retried once, then refused. */
export async function listDirectory(root: string, path: ProjectPath, options: ListOptions = {}): Promise<ListOutcome> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (options.shouldStop?.()) return { ok: false, reason: 'timeout' }
    const before = await resolveEntry(root, path, 'directory')
    if (!before.ok) return before
    let handle: FileHandle | undefined
    try {
      // O_NOFOLLOW_ANY on macOS binds this identity without crossing any swapped-in link.
      handle = await openNoFollow(before.value.absolute)
      const opened = await handle.stat({ bigint: true })
      if (!opened.isDirectory()) return { ok: false, reason: 'not_directory' }
      if (!sameIdentity(opened, before.value.stats)) continue
      await options.afterOpen?.(before.value.absolute)
      const read = await readAnchoredDirectory(before.value.absolute, opened, {
        path,
        ...(options.limit === undefined ? {} : { limit: options.limit }),
        ...(options.locale === undefined ? {} : { locale: options.locale }),
        ...(options.shouldStop ? { shouldStop: options.shouldStop } : {})
      })
      if (read === 'changed') continue
      if (!read.ok) return read
      const after = await resolveEntry(root, path, 'directory')
      if (!after.ok || !sameIdentity(opened, after.value.stats)) continue
      return read
    } catch (error) {
      return { ok: false, reason: classifyError(error) }
    } finally {
      await handle?.close().catch(() => {})
    }
  }
  return { ok: false, reason: 'unreadable' }
}
