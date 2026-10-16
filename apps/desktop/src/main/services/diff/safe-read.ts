// Bounded, symlink-safe read of one Project file for the modified side of a Diff. This is the Diff service's own
// copy of the idea used by Files (separate write scopes): per-component lstat, O_NOFOLLOW, a regular-file check on the
// opened descriptor, a size cap, and a fingerprint so the caller can tell that the file changed while it was read.
import { constants, type BigIntStats } from 'node:fs'
import { lstat, open, type FileHandle } from 'node:fs/promises'
import { join } from 'node:path'

export type BoundedRead =
  | { status: 'ok'; bytes: Buffer; size: number; fingerprint: string }
  | { status: 'too_large'; size: number; fingerprint: string }
  | { status: 'missing' | 'symlink' | 'not_file' | 'unreadable' | 'changed' }

export type FingerprintResult =
  | { status: 'ok'; fingerprint: string; size: number }
  | { status: 'missing' | 'symlink' | 'not_file' | 'unreadable' }

interface Walked { path: string; identities: string[] }

const identity = (info: { dev: bigint; ino: bigint }) => `${info.dev}:${info.ino}`
const stamp = (info: { dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint }) => `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}`

function failure(error: unknown): 'missing' | 'unreadable' {
  const code = (error as NodeJS.ErrnoException).code
  return code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'unreadable'
}

/**
 * lstat every component. Intermediate components must be real directories; the last one is reported as is.
 * Returns the identities so a caller can detect a swapped directory after reading.
 */
async function walk(root: string, rel: string): Promise<{ status: 'ok'; walked: Walked; last: BigIntStats } | { status: 'missing' | 'symlink' | 'not_file' | 'unreadable' }> {
  try {
    const rootInfo = await lstat(root, { bigint: true })
    if (!rootInfo.isDirectory()) return { status: 'unreadable' }
    const identities = [identity(rootInfo)]
    const segments = rel.split('/')
    let current = root
    let last = rootInfo
    for (const [index, segment] of segments.entries()) {
      current = join(current, segment)
      last = await lstat(current, { bigint: true })
      identities.push(identity(last))
      const final = index === segments.length - 1
      if (last.isSymbolicLink()) return { status: 'symlink' }
      if (!final && !last.isDirectory()) return { status: 'not_file' }
    }
    if (!last.isFile()) return { status: 'not_file' }
    return { status: 'ok', walked: { path: current, identities }, last }
  } catch (error) {
    return { status: failure(error) }
  }
}

/** Size + mtime fingerprint without opening the file. */
export async function fingerprintProjectFile(root: string, rel: string): Promise<FingerprintResult> {
  const found = await walk(root, rel)
  if (found.status !== 'ok') return { status: found.status }
  return { status: 'ok', fingerprint: stamp(found.last), size: Number(found.last.size) }
}

export async function readProjectFileBounded(root: string, rel: string, cap: number): Promise<BoundedRead> {
  const found = await walk(root, rel)
  if (found.status !== 'ok') return { status: found.status }
  let handle: FileHandle | undefined
  try {
    // O_NONBLOCK: never hang on a FIFO that replaced the file between lstat and open.
    handle = await open(found.walked.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const before = await handle.stat({ bigint: true })
    if (!before.isFile() || identity(before) !== identity(found.last)) return { status: 'changed' }
    if (before.size > BigInt(cap)) return { status: 'too_large', size: Number(before.size), fingerprint: stamp(before) }
    const buffer = Buffer.allocUnsafe(Math.min(Number(before.size), cap) + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length)
      if (bytesRead === 0) break
      length += bytesRead
    }
    // The file grew past the cap after fstat: that is a change, not a larger file to accept.
    if (length > cap || length > Number(before.size)) return { status: 'changed' }
    const after = await handle.stat({ bigint: true })
    if (stamp(after) !== stamp(before) || length !== Number(after.size)) return { status: 'changed' }
    // A swapped directory component is a boundary change even when the file itself looks the same.
    const again = await walk(root, rel)
    if (again.status !== 'ok' || again.walked.identities.join() !== found.walked.identities.join()) return { status: 'changed' }
    return { status: 'ok', bytes: buffer.subarray(0, length), size: length, fingerprint: stamp(after) }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ELOOP') return { status: 'symlink' }
    return { status: failure(error) }
  } finally {
    await handle?.close().catch(() => {})
  }
}
