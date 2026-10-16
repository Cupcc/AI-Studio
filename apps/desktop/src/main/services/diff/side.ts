// Turns the bytes of one side of a file into the text shown by the two-sided editor, or says why that is not possible.
// Both sides use the same function so a BOM or a line ending never shows up as a difference of its own.
import { FILES_LIMITS } from '@shared/tools/files'
import type { DiffSide } from '@shared/tools/diff'

const utf8 = new TextDecoder('utf-8', { fatal: true })
const utf16le = new TextDecoder('utf-16le', { fatal: true })

export type DecodedSide =
  | { status: 'text'; text: string }
  | { status: 'omitted'; reason: 'binary' | 'unsupported_encoding' }

export function decodeSide(bytes: Buffer): DecodedSide {
  try {
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return { status: 'text', text: utf16le.decode(bytes.subarray(2)) }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      const swapped = Buffer.from(bytes.subarray(2))
      if (swapped.length % 2) return { status: 'omitted', reason: 'unsupported_encoding' }
      swapped.swap16()
      return { status: 'text', text: utf16le.decode(swapped) }
    }
    // Same NUL window as Git's own binary heuristic.
    if (bytes.subarray(0, FILES_LIMITS.binarySniffBytes).includes(0)) return { status: 'omitted', reason: 'binary' }
    const body = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes
    return { status: 'text', text: utf8.decode(body) }
  } catch {
    return { status: 'omitted', reason: 'unsupported_encoding' }
  }
}

export function sideOf(bytes: Buffer, size = bytes.length): DiffSide {
  const decoded = decodeSide(bytes)
  return decoded.status === 'text' ? { status: 'text', text: decoded.text, size } : { status: 'omitted', reason: decoded.reason, size }
}
