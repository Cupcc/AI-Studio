import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ATTACHMENT_ORPHAN_GRACE_MS, ATTACHMENT_SWEEP_INTERVAL_MS, PastedAttachments, type PastedAttachmentReference } from './pasted-attachments'
import { SessionStore } from './store'
import { runMigrations } from '../database/migrator'
import { coreAppMeta } from '../database/migrations/2026100901_core_app_meta'
import { projectCore } from '../database/migrations/2026100902_project_core'
import { sessionCore } from '../database/migrations/2026100903_session_core'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { vi.useRealTimers(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const bytes = new TextEncoder().encode('private pasted contents')
const folder = (root: string, project = 'p') => join(root, 'attachments', createHash('sha256').update(project).digest('hex'))
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'studio-attachments-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  let now = Date.now()
  const references: PastedAttachmentReference[] = []
  const cache = new PastedAttachments(root, () => references, () => now)
  cleanups.push(() => cache.dispose())
  return { root, cache, references, expire: () => { now += ATTACHMENT_ORPHAN_GRACE_MS + 1000 } }
}

describe('pasted attachment lifecycle', () => {
  it('keeps recent staging / in-flight use, then removes only unreferenced pairs', async () => {
    const h = await setup()
    const kept = await h.cache.stage('p', 'keep.txt', 'text/plain', bytes)
    const orphan = await h.cache.stage('p', 'remove.txt', 'text/plain', bytes)
    h.references.push({ projectId: 'p', id: kept.id })
    expect(await h.cache.collect()).toBe(0)
    h.expire()
    expect(await h.cache.collect()).toBe(1)
    expect(await h.cache.resolve('p', kept)).toMatchObject({ kind: 'file', name: 'keep.txt' })
    await expect(h.cache.resolve('p', orphan)).rejects.toThrow()
    expect(await readdir(folder(h.root))).toHaveLength(2)
    h.references.length = 0
    expect(await h.cache.collect()).toBe(0) // a just-resolved input can still be going to the CLI
    h.expire()
    expect(await h.cache.collect()).toBe(1)
    await expect(readdir(folder(h.root))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('restores old persisted references after restart, isolates Project identity and validates metadata', async () => {
    const h = await setup()
    const upload = await h.cache.stage('p', '画面.png', 'image/png', bytes)
    const restarted = new PastedAttachments(h.root, () => [{ projectId: 'p', id: upload.id }], () => Date.now() + ATTACHMENT_ORPHAN_GRACE_MS * 2)
    cleanups.push(() => restarted.dispose())
    expect(await restarted.collect()).toBe(0)
    expect(await restarted.resolve('p', upload)).toMatchObject({ kind: 'image' })
    await expect(restarted.resolve('other', upload)).rejects.toThrow()
    await expect(restarted.resolve('p', { ...upload, name: 'forged.png' })).rejects.toThrow('不匹配')
    await expect(restarted.resolve('p', { ...upload, id: '../escape' })).rejects.toThrow('标识无效')
  })

  it('recovers interrupted writes without following symlinks or deleting unknown files', async () => {
    const h = await setup()
    await h.cache.stage('p', 'seed.txt', '', bytes)
    const dir = folder(h.root), partial = join(dir, `${randomUUID()}.data.png`)
    const target = join(h.root, 'outside.txt'), link = join(dir, `${randomUUID()}.data.txt`)
    await writeFile(partial, bytes)
    await writeFile(target, bytes)
    await symlink(target, link)
    await writeFile(join(dir, 'user-file.txt'), bytes)
    h.expire()
    expect(await h.cache.collect()).toBe(2)
    expect(await readFile(target)).toEqual(Buffer.from(bytes))
    expect(await readdir(dir)).toEqual(expect.arrayContaining(['user-file.txt', link.split('/').at(-1)!]))
  })

  it('does not expire a half-written pair while either part is fresh', async () => {
    const h = await setup()
    const upload = await h.cache.stage('p', 'a.txt', '', bytes)
    const old = new Date(Date.now() - ATTACHMENT_ORPHAN_GRACE_MS * 2)
    await utimes(join(folder(h.root), `${upload.id}.json`), old, old)
    const restarted = new PastedAttachments(h.root)
    cleanups.push(() => restarted.dispose())
    expect(await restarted.collect()).toBe(0)
  })

  it('fails closed if references cannot be read, and a failed sweep does not poison later writes', async () => {
    const h = await setup()
    const upload = await h.cache.stage('p', 'a.txt', '', bytes)
    const broken = new PastedAttachments(h.root, () => { throw new Error('database unavailable') }, () => Date.now() + ATTACHMENT_ORPHAN_GRACE_MS * 2)
    cleanups.push(() => broken.dispose())
    await expect(broken.collect()).rejects.toThrow('database unavailable')
    expect(await broken.resolve('p', upload)).toMatchObject({ name: 'a.txt' })
  })

  it('serializes concurrent staging and sweeps, handles empty roots and rejects after disposal', async () => {
    const h = await setup()
    expect(await h.cache.collect()).toBe(0)
    const [upload] = await Promise.all([h.cache.stage('p', 'a.txt', '', bytes), h.cache.collect()])
    expect(await h.cache.resolve('p', upload)).toMatchObject({ name: 'a.txt' })
    await h.cache.dispose()
    await expect(h.cache.stage('p', 'a.txt', '', bytes)).rejects.toThrow('已关闭')
  })

  it('schedules startup / hourly sweeps once and stops the timer on disposal', async () => {
    const h = await setup()
    vi.useFakeTimers()
    const collect = vi.spyOn(h.cache, 'collect').mockResolvedValue(0)
    h.cache.start(); h.cache.start()
    expect(collect).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(ATTACHMENT_SWEEP_INTERVAL_MS)
    expect(collect).toHaveBeenCalledTimes(2)
    await h.cache.dispose()
    await vi.advanceTimersByTimeAsync(ATTACHMENT_SWEEP_INTERVAL_MS)
    expect(collect).toHaveBeenCalledTimes(2)
  })
})

it('retains database references across all draft types, old transcript pages and failed retry input', () => {
  const db = new DatabaseSync(':memory:')
  try {
    runMigrations(db, [coreAppMeta, projectCore, sessionCore])
    db.prepare('INSERT INTO projects(id,name,local_path,canonical_path,dev,ino,created_at) VALUES (?,?,?,?,?,?,?)').run('p', 'P', '/tmp', '/tmp', '1', '1', '')
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?)').run('s', 'p', 'codex', null, 1, 1, '{}')
    const store = new SessionStore(db)
    const upload = (id: string) => ({ type: 'upload' as const, id, name: `${id}.txt`, image: false })
    for (const [id, key] of [
      ['draft', { projectId: 'p', kind: 'new_chat' as const }],
      ['view', { projectId: 'p', kind: 'new_chat' as const, viewId: 'overview' }],
      ['session', { projectId: 'p', kind: 'session' as const, sessionId: 's' }]
    ] as const) store.saveDraft(key, { cli: 'codex', model: null, text: '', contextItems: [upload(id)] })
    store.startTurn('t', 's', 1, null, { text: 'retry', contextItems: [upload('failed')] })
    store.endTurn('t', 'failed', 2)
    store.saveItem({ id: 'old', sessionId: 's', turnId: 't', sequence: 1, at: 1, kind: 'user_message', text: 'old', contextItems: [upload('history')] })
    for (let index = 2; index < 150; index++) store.saveItem({ id: `${index}`, sessionId: 's', turnId: 't', sequence: index, at: index, kind: 'agent_message', text: '', complete: true, nativeItemId: `${index}` })
    expect(store.pastedAttachmentReferences()).toEqual(expect.arrayContaining(['draft', 'view', 'session', 'failed', 'history'].map(id => ({ projectId: 'p', id }))))
    store.deleteDraft({ projectId: 'p', kind: 'new_chat' })
    expect(store.pastedAttachmentReferences().map(ref => ref.id)).not.toContain('draft')
  } finally { db.close() }
})
