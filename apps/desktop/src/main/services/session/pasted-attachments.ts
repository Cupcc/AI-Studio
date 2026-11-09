import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readFile, readdir, rmdir, rm, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { InputAttachment } from '@ai-studio/agent-adapter'
import { PASTED_ATTACHMENT_MAX_BYTES } from '@shared/ipc/session'
import type { ContextItem } from '@shared/session/types'

type Upload = Extract<ContextItem, { type: 'upload' }>
export interface PastedAttachmentReference { projectId: string; id: string }
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const validId = new RegExp(`^${uuid}$`)
const ownedFile = new RegExp(`^(${uuid})(?:\\.json|\\.data(?:\\.[a-zA-Z0-9]{1,12})?)$`)
export const ATTACHMENT_ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000
export const ATTACHMENT_SWEEP_INTERVAL_MS = 60 * 60 * 1000
const projectDirectory = (projectId: string) => createHash('sha256').update(projectId).digest('hex')
const referenceKey = (projectId: string, id: string) => `${projectDirectory(projectId)}/${id}`

/** Only unreferenced app-owned copies expire. Drafts, history and failed turns stay restorable. */
export class PastedAttachments {
  private pending: Promise<unknown> = Promise.resolve()
  private timer?: ReturnType<typeof setInterval>
  private disposed = false
  private readonly recentlyUsed = new Map<string, number>()

  constructor(private readonly userData: string, private readonly references: () => readonly PastedAttachmentReference[] = () => [], private readonly now: () => number = Date.now) {}

  private directory(projectId: string) {
    return join(this.userData, 'attachments', projectDirectory(projectId))
  }

  private run<T>(work: () => Promise<T>): Promise<T> {
    if (this.disposed) return Promise.reject(new Error('附件服务已关闭'))
    const result = this.pending.then(work)
    this.pending = result.catch(() => {})
    return result
  }

  /** Start once per application, including cleanup of interrupted writes from an earlier run. */
  start(): void {
    if (this.timer || this.disposed) return
    const sweep = () => { void this.collect().catch(error => console.error('[pasted-attachments] cleanup failed', error)) }
    sweep()
    this.timer = setInterval(sweep, ATTACHMENT_SWEEP_INTERVAL_MS)
    this.timer.unref()
  }

  async dispose(): Promise<void> {
    this.disposed = true
    clearInterval(this.timer)
    this.timer = undefined
    await this.pending
    this.recentlyUsed.clear()
  }

  stage(projectId: string, name: string, mime: string, bytes: Uint8Array): Promise<Upload> {
    return this.run(async () => {
      if (!bytes.length || bytes.length > PASTED_ATTACHMENT_MAX_BYTES) throw new Error('附件为空或超过 10 MiB')
      const safeName = basename(name.replace(/[\x00-\x1f\x7f/\\]/g, '_')).slice(0, 160) || 'attachment'
      const extension = extname(safeName).match(/^\.[a-zA-Z0-9]{1,12}$/)?.[0] ?? ''
      const id = randomUUID(), image = imageTypes.has(mime), dir = this.directory(projectId)
      const file = join(dir, `${id}.data${extension}`), metadata = join(dir, `${id}.json`)
      await mkdir(dir, { recursive: true, mode: 0o700 })
      try {
        await writeFile(file, bytes, { flag: 'wx', mode: 0o600 })
        await writeFile(metadata, JSON.stringify({ name: safeName, image, extension }), { flag: 'wx', mode: 0o600 })
      } catch (error) {
        await Promise.allSettled([rm(file, { force: true }), rm(metadata, { force: true })])
        throw error
      }
      this.recentlyUsed.set(referenceKey(projectId, id), this.now())
      return { type: 'upload', id, name: safeName, image }
    })
  }

  resolve(projectId: string, upload: Upload): Promise<InputAttachment> {
    return this.run(async () => {
      if (!validId.test(upload.id)) throw new Error('粘贴附件标识无效')
      const dir = this.directory(projectId)
      const data: unknown = JSON.parse(await readFile(join(dir, `${upload.id}.json`), 'utf8'))
      if (!data || typeof data !== 'object') throw new Error('粘贴附件信息无效')
      const meta = data as Record<string, unknown>
      if (meta.name !== upload.name || meta.image !== upload.image || typeof meta.extension !== 'string' || !/^(\.[a-zA-Z0-9]{1,12})?$/.test(meta.extension)) throw new Error('粘贴附件信息不匹配')
      const path = join(dir, `${upload.id}.data${meta.extension}`)
      const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      try {
        const info = await handle.stat()
        if (!info.isFile() || info.size < 1 || info.size > PASTED_ATTACHMENT_MAX_BYTES) throw new Error('粘贴附件不可读取')
      } finally { await handle.close() }
      this.recentlyUsed.set(referenceKey(projectId, upload.id), this.now())
      return upload.image ? { kind: 'image', path } : { kind: 'file', path, name: upload.name }
    })
  }

  collect(): Promise<number> {
    return this.run(async () => {
      const cutoff = this.now() - ATTACHMENT_ORPHAN_GRACE_MS
      const root = join(this.userData, 'attachments')
      let projects
      try {
        if (!(await lstat(root)).isDirectory()) return 0
        projects = await readdir(root, { withFileTypes: true })
      } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw error }
      const candidates: { key: string; paths: string[] }[] = []
      const directories: string[] = []
      for (const project of projects) {
        // Never recurse into symlinks, user directories or names we do not own.
        if (!project.isDirectory() || !/^[0-9a-f]{64}$/.test(project.name)) continue
        const dir = join(root, project.name), groups = new Map<string, { newest: number; paths: string[] }>()
        directories.push(dir)
        for (const file of await readdir(dir, { withFileTypes: true })) {
          const match = ownedFile.exec(file.name)
          if (!match || !file.isFile()) continue
          const path = join(dir, file.name), info = await lstat(path)
          if (!info.isFile()) continue
          const group = groups.get(match[1]!) ?? { newest: 0, paths: [] }
          group.newest = Math.max(group.newest, info.mtimeMs)
          group.paths.push(path)
          groups.set(match[1]!, group)
        }
        for (const [id, group] of groups) if (group.newest <= cutoff) candidates.push({ key: `${project.name}/${id}`, paths: group.paths })
      }
      // Read current references after filesystem IO. If the database cannot be read, delete nothing.
      const retained = new Set(this.references().map(ref => referenceKey(ref.projectId, ref.id)))
      for (const [key, at] of this.recentlyUsed) {
        if (at > cutoff) retained.add(key)
        else this.recentlyUsed.delete(key)
      }
      let removed = 0
      for (const candidate of candidates) {
        if (retained.has(candidate.key)) continue
        for (const path of candidate.paths) await rm(path, { force: true })
        removed++
      }
      for (const dir of directories) {
        try { await rmdir(dir) } catch (error) {
          if (!['ENOTEMPTY', 'ENOENT', 'EEXIST'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
        }
      }
      return removed
    })
  }
}
