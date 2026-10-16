// Runs in an isolated process whose cwd was set before JavaScript started. Only direct child paths are used.
import type { FileEntry } from '@shared/tools/files'

/** Self-contained so Node unit tests can run the identical worker without an Electron runtime. */
export async function directoryReaderWorker(raw: string): Promise<void> {
  const fs = process.getBuiltinModule('node:fs/promises') as typeof import('node:fs/promises')
  type Request = {
    dev: string; ino: string; path: string; absolute: string; limit: number; locale?: string
    pathBytes: number; nameBytes: number; darwin: boolean
  }
  type Outcome = { ok: true; entries: FileEntry[]; truncated: boolean; omittedPaths?: boolean }
    | { ok: false; reason: string } | 'changed'
  const send = (value: Outcome) => {
    const serialized = JSON.stringify(value)
    if (process.parentPort) {
      // Wait for the parent's acknowledgement so process exit cannot overtake the result message.
      process.parentPort.once('message', () => process.exit(0))
      process.parentPort.postMessage(serialized)
    } else process.stdout.write(serialized, () => process.exit(0))
  }
  const reason = (error: unknown): string => {
    switch ((error as NodeJS.ErrnoException)?.code) {
      case 'ENOENT': case 'ENOTDIR': case 'ENAMETOOLONG': return 'missing'
      case 'ELOOP': return 'symlink_refused'
      case 'EACCES': case 'EPERM': return 'permission_denied'
      default: return 'unreadable'
    }
  }
  try {
    const request = JSON.parse(raw) as Request
    const cwd = await fs.stat('.', { bigint: true })
    // The parent's safe descriptor stays open, so this identity cannot be reused while we check it.
    if (!cwd.isDirectory() || cwd.dev.toString() !== request.dev || cwd.ino.toString() !== request.ino) {
      send('changed'); return
    }
    const collator = new Intl.Collator(request.locale, { numeric: true })
    const compare = (a: FileEntry, b: FileEntry) => {
      const kind = Number(b.kind === 'directory') - Number(a.kind === 'directory')
      return kind || collator.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    }
    // Max-heap: retain only the first `limit` rows while draining the directory completely.
    const entries: FileEntry[] = []
    let count = 0, omittedPaths = false
    const keep = (entry: FileEntry) => {
      count++
      if (request.limit === 0) return
      if (entries.length < request.limit) {
        entries.push(entry)
        for (let at = entries.length - 1; at > 0;) {
          const parent = (at - 1) >> 1
          if (compare(entries[parent]!, entries[at]!) >= 0) break
          ;[entries[parent], entries[at]] = [entries[at]!, entries[parent]!]
          at = parent
        }
      } else if (compare(entry, entries[0]!) < 0) {
        entries[0] = entry
        for (let at = 0;;) {
          const left = at * 2 + 1, right = left + 1
          if (left >= entries.length) break
          const larger = right < entries.length && compare(entries[right]!, entries[left]!) > 0 ? right : left
          if (compare(entries[at]!, entries[larger]!) >= 0) break
          ;[entries[at], entries[larger]] = [entries[larger]!, entries[at]!]
          at = larger
        }
      }
    }
    const wellFormed = (name: string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(name)
    const directory = await fs.opendir('.')
    try {
      for await (const dirent of directory) {
        const name = dirent.name
        if (name.toLowerCase() === '.git') continue
        const relative = request.path === '' ? name : `${request.path}/${name}`
        if (!wellFormed(name) || name.includes('/') || name.includes('\0')
          || Buffer.byteLength(name) > request.nameBytes || Buffer.byteLength(relative) > request.pathBytes
          // The Files reader still addresses entries by an absolute macOS pathname.
          || (request.darwin && Buffer.byteLength(`${request.absolute}/${name}`) >= 1024)) {
          omittedPaths = true; continue
        }
        let kind: FileEntry['kind']
        if (dirent.isDirectory()) kind = 'directory'
        else if (dirent.isFile()) kind = 'file'
        else if (dirent.isSymbolicLink()) kind = 'symlink'
        else if (dirent.isBlockDevice() || dirent.isCharacterDevice() || dirent.isFIFO() || dirent.isSocket()) kind = 'other'
        else {
          try {
            const stats = await fs.lstat(`./${name}`)
            kind = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : stats.isSymbolicLink() ? 'symlink' : 'other'
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
            throw error
          }
        }
        keep({ name, kind })
      }
    } finally {
      // for-await closes automatically; a thrown error may also have closed the handle.
      await directory.close().catch(() => {})
    }
    entries.sort(compare)
    for (const entry of entries) {
      if (entry.kind !== 'symlink') continue
      // readlink never follows the final component; the cwd itself remains bound across pathname replacement.
      try { entry.linkTarget = (await fs.readlink(`./${entry.name}`)).slice(0, 256) }
      catch { /* A disappearing/changing symlink still has a useful name; no target is shown. */ }
    }
    send({ ok: true, entries, truncated: count > request.limit, ...(omittedPaths ? { omittedPaths: true } : {}) })
  } catch (error) { send({ ok: false, reason: reason(error) }) }
}

// The regular main process imports the function for its Node test fallback; only the dedicated entry runs it.
const workerFlag = process.argv.indexOf('--studio-directory-reader-worker')
if (process.type === 'utility' && workerFlag >= 0) void directoryReaderWorker(process.argv[workerFlag + 1] ?? '')
