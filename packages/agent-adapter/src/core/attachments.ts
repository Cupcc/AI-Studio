import { open } from 'node:fs/promises';
import { basename } from 'node:path';
import { adapterError } from '../errors.js';
import type { InputAttachment } from '../types.js';

/**
 * Text that tells the model about a trusted local file without embedding its contents (Tools spec §4.1).
 * Shared by every provider so the model sees the same reference wording.
 */
export function attachedFileReference(attachment: Extract<InputAttachment, { kind: 'file' }>): string {
  const reference = JSON.stringify({ name: attachment.name ?? basename(attachment.path), path: attachment.path })
    .replace(/[\u0085\u2028\u2029]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `Attached file reference (local path; file contents are not embedded):\n${reference}`;
}

export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

/** The content type comes from the file header, never from the name. */
export function imageMediaType(header: Uint8Array): ImageMediaType | undefined {
  const starts = (...bytes: number[]) => bytes.every((byte, index) => header[index] === byte);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (starts(0x52, 0x49, 0x46, 0x46) && header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50) return 'image/webp';
  return undefined;
}

/** Reads a local image for providers that embed it (bounded; the type is checked from its header). */
export async function readImageAttachment(path: string, maxBytes: number): Promise<{ mediaType: ImageMediaType; data: Buffer }> {
  let handle;
  try { handle = await open(path, 'r'); }
  catch { throw adapterError('invalid_argument', `Image cannot be read: ${basename(path)}`); }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size === 0) throw adapterError('invalid_argument', `Image is empty or not a file: ${basename(path)}`);
    if (stat.size > maxBytes) throw adapterError('unsupported', `Image exceeds ${Math.round(maxBytes / 1024 / 1024)} MiB: ${basename(path)}`);
    const data = Buffer.alloc(stat.size);
    const { bytesRead } = await handle.read(data, 0, stat.size, 0);
    const mediaType = imageMediaType(data.subarray(0, Math.min(bytesRead, 16)));
    if (!mediaType) throw adapterError('unsupported', `Only PNG, JPEG, GIF and WebP images can be attached: ${basename(path)}`);
    return { mediaType, data: data.subarray(0, bytesRead) };
  } finally {
    await handle.close();
  }
}
