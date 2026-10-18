import type { NativeDiffFile, NativeTurnDiff } from '../types.js';

// Bound each native snapshot before retaining it or crossing the Adapter boundary.
export const NATIVE_DIFF_LIMIT = 512 * 1024;
export const NATIVE_DIFF_FILES = 2000;

function bounded(text: string, bytes: number): string {
  const buffer = Buffer.from(text);
  if (buffer.length <= bytes) return text;
  // Avoid replacement characters when the limit lands in a multibyte code point.
  let end = bytes;
  while (end > 0 && (buffer[end]! & 0xc0) === 0x80) end--;
  return buffer.subarray(0, end).toString('utf8');
}

export function boundNativeDiff(record: NativeTurnDiff): NativeTurnDiff {
  const patch = record.patch === null ? null : bounded(record.patch, NATIVE_DIFF_LIMIT);
  const patchTruncated = record.patchTruncated === true || patch !== record.patch;
  const fileListTruncated = record.fileListTruncated === true || record.files.length > NATIVE_DIFF_FILES;
  let remaining = NATIVE_DIFF_LIMIT;
  const files: NativeDiffFile[] = record.files.slice(0, NATIVE_DIFF_FILES).map(file => {
    const text = bounded(file.patch, remaining);
    remaining -= Buffer.byteLength(text);
    const path = bounded(file.path, 8192), oldPath = file.oldPath === undefined ? undefined : bounded(file.oldPath, 8192);
    const truncated = file.truncated === true || text !== file.patch || path !== file.path || oldPath !== file.oldPath;
    return { ...file, path, ...(oldPath === undefined ? {} : { oldPath }), patch: text, truncated };
  });
  return { ...record, patch, files, patchTruncated, fileListTruncated, truncated: patchTruncated || fileListTruncated || files.some(file => file.truncated) };
}
