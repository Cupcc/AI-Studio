// Bounded text read for the Files viewer (FR-TOOL-001 items 1 and 5): size limit, binary and encoding detection,
// BOM and line-ending handling, a version token for cheap re-checks, and a before/after identity check so a file
// that changed (or was swapped for a link) while being read is never presented as current content.
import type { BigIntStats } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import { FILES_LIMITS, type FileEncoding, type FileReadResult, type FileUnavailableReason, type ProjectPath } from '@shared/tools/files'
import { openRegularFile, resolveEntry, sameIdentity, type PathFailureOrChanged } from './safe-path'

const MAX_ATTEMPTS = 3

export interface ReadOptions {
  readBytes?: number
  /** Checked between reads so a timed-out request stops and closes its descriptor. */
  shouldStop?: () => boolean
  /** Test seams: run right after the open and right after the bytes are read. */
  afterOpen?: (absolute: string) => Promise<void>
  afterRead?: (absolute: string) => Promise<void>
}

/** The read result without the service-issued `revision`. */
export type ReadOutcome =
  | Omit<Extract<FileReadResult, { status: 'ok' }>, 'revision' | 'path'>
  | Omit<Extract<FileReadResult, { status: 'unchanged' }>, 'revision' | 'path'>
  | { status: 'unavailable'; reason: FileUnavailableReason; size?: number }

type Attempt = ReadOutcome | 'retry'

export function fileVersion(stats: BigIntStats): string {
  return `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeNs}`
}

const unavailable = (reason: FileUnavailableReason, size?: number): ReadOutcome =>
  size === undefined ? { status: 'unavailable', reason } : { status: 'unavailable', reason, size }

function fromFailure(reason: PathFailureOrChanged): Attempt {
  return reason === 'changed' ? 'retry' : unavailable(reason)
}

async function readInto(handle: FileHandle, capacity: number, shouldStop?: () => boolean): Promise<Buffer | 'stopped'> {
  const bytes = Buffer.allocUnsafe(capacity)
  let length = 0
  while (length < capacity) {
    if (shouldStop?.()) return 'stopped'
    const { bytesRead } = await handle.read(bytes, length, capacity - length, length)
    if (bytesRead === 0) break
    length += bytesRead
  }
  return bytes.subarray(0, length)
}

function lineEnding(text: string): 'lf' | 'crlf' | 'mixed' | 'none' {
  let crlf = 0, lf = 0, cr = 0
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    if (code === 13) { if (text.charCodeAt(index + 1) === 10) { crlf++; index++ } else cr++ }
    else if (code === 10) lf++
  }
  if (cr > 0 || (crlf > 0 && lf > 0)) return 'mixed'
  return crlf > 0 ? 'crlf' : lf > 0 ? 'lf' : 'none'
}

type Decoded = { ok: true; encoding: FileEncoding; bom: boolean; text: string } | { ok: false; reason: 'binary' | 'unsupported_encoding' }

/** UTF-8 (with or without BOM) and BOM-marked UTF-16 only; anything else is reported, never guessed. */
export function decodeText(bytes: Buffer): Decoded {
  const decode = (label: string, start: number) => {
    try { return new TextDecoder(label, { fatal: true, ignoreBOM: true }).decode(bytes.subarray(start)) } catch { return null }
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    // FF FE 00 00 is the UTF-32LE BOM, not a UTF-16 text starting with U+0000.
    if (bytes.length >= 4 && bytes[2] === 0 && bytes[3] === 0) return { ok: false, reason: 'unsupported_encoding' }
    const text = decode('utf-16le', 2)
    return text === null ? { ok: false, reason: 'unsupported_encoding' } : { ok: true, encoding: 'utf-16le', bom: true, text }
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const text = decode('utf-16be', 2)
    return text === null ? { ok: false, reason: 'unsupported_encoding' } : { ok: true, encoding: 'utf-16be', bom: true, text }
  }
  // A NUL byte outside a BOM-marked UTF-16 file means binary content (the whole buffer, at most readBytes).
  if (bytes.includes(0)) return { ok: false, reason: 'binary' }
  const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  const text = decode('utf-8', bom ? 3 : 0)
  return text === null ? { ok: false, reason: 'unsupported_encoding' } : { ok: true, encoding: 'utf-8', bom, text }
}

async function attempt(root: string, path: ProjectPath, ifVersion: string | undefined, options: ReadOptions): Promise<Attempt> {
  const opened = await openRegularFile(root, path)
  if (!opened.ok) return fromFailure(opened.reason)
  const { handle, stats: before, entry } = opened.file
  try {
    await options.afterOpen?.(entry.absolute)
    const version = fileVersion(before)
    const cap = options.readBytes ?? FILES_LIMITS.readBytes
    const size = Number(before.size)
    let outcome: ReadOutcome
    if (ifVersion !== undefined && ifVersion === version) {
      outcome = { status: 'unchanged', version }
    } else if (before.size > BigInt(cap)) {
      // Never allocate for the file size (a sparse file can claim terabytes): look at the sniff window only.
      const head = await readInto(handle, Math.min(size, FILES_LIMITS.binarySniffBytes), options.shouldStop)
      if (head === 'stopped') return unavailable('timeout')
      const utf16 = head.length >= 2 && ((head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff))
      outcome = unavailable(head.includes(0) && !utf16 ? 'binary' : 'too_large', size)
    } else {
      // One byte of slack detects growth without reading beyond the limit.
      const bytes = await readInto(handle, size + 1, options.shouldStop)
      if (bytes === 'stopped') return unavailable('timeout')
      await options.afterRead?.(entry.absolute)
      if (bytes.length !== size) return 'retry'
      const decoded = decodeText(bytes)
      outcome = decoded.ok
        ? { status: 'ok', version, size, encoding: decoded.encoding, bom: decoded.bom, lineEnding: lineEnding(decoded.text), text: decoded.text }
        : unavailable(decoded.reason, size)
    }
    // The descriptor must be unchanged and the path must still name it, inside the same Project root.
    const after = await handle.stat({ bigint: true })
    if (after.size !== before.size || after.mtimeNs !== before.mtimeNs || !sameIdentity(after, before)) return 'retry'
    const again = await resolveEntry(root, path, 'file')
    if (!again.ok) return unavailable(again.reason)
    if (!sameIdentity(again.value.stats, before)) return 'retry'
    return outcome
  } finally { await handle.close().catch(() => {}) }
}

/** Reads `path` (already a valid ProjectPath) as text. `ifVersion` of the current file answers `unchanged`. */
export async function readTextFile(root: string, path: ProjectPath, ifVersion?: string, options: ReadOptions = {}): Promise<ReadOutcome> {
  for (let tries = 0; tries < MAX_ATTEMPTS; tries++) {
    const result = await attempt(root, path, ifVersion, options)
    if (result !== 'retry') return result
  }
  return unavailable('changed_while_reading')
}
