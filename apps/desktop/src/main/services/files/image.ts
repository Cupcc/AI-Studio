// Image preview for the Files viewer (FR-TOOL-001 2026-10-26): bounded, link-refusing read of a known image type.
import { FILES_OPERATION_LIMITS, imageTypeOf, type FileImageResult, type ProjectPath } from '@shared/tools/files'
import { openRegularFile } from './safe-path'

export type ImageOutcome = Omit<Extract<FileImageResult, { status: 'ok' }>, 'path'> | Omit<Extract<FileImageResult, { status: 'unavailable' }>, 'path'>

export async function readImageFile(root: string, path: ProjectPath, limit: number = FILES_OPERATION_LIMITS.imageBytes): Promise<ImageOutcome> {
  const mime = imageTypeOf(path)
  if (!mime) return { status: 'unavailable', reason: 'not_image' }
  for (let attempt = 0; attempt < 2; attempt++) {
    const opened = await openRegularFile(root, path)
    if (!opened.ok) {
      if (opened.reason === 'changed') continue
      return { status: 'unavailable', reason: opened.reason }
    }
    const { handle, stats } = opened.file
    try {
      const size = Number(stats.size)
      if (size > limit) return { status: 'unavailable', reason: 'too_large', size }
      const bytes = Buffer.alloc(size)
      let read = 0
      while (read < size) {
        const { bytesRead } = await handle.read(bytes, read, size - read, read)
        if (bytesRead === 0) break
        read += bytesRead
      }
      if (read !== size) return { status: 'unavailable', reason: 'changed_while_reading' }
      return { status: 'ok', mime, size, base64: bytes.toString('base64') }
    } catch { return { status: 'unavailable', reason: 'unreadable' } }
    finally { await handle.close().catch(() => {}) }
  }
  return { status: 'unavailable', reason: 'changed_while_reading' }
}
