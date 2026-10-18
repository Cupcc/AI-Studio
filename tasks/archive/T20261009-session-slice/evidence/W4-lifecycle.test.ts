import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from '../../../../apps/desktop/node_modules/vitest/dist/index.js'
import { deferred } from '../../../../packages/agent-adapter/dist/index.js'
import { FakeProvider } from '../../../../packages/agent-adapter/dist/testing/index.js'
import { runMigrations } from '../../../../apps/desktop/src/main/services/database/migrator'
import { migrations } from '../../../../apps/desktop/src/main/services/database/migrations'
import { createProjectService } from '../../../../apps/desktop/src/main/services/project/project-service'
import { closeProjectWithSessions } from '../../../../apps/desktop/src/main/services/project/close-flow'
import { createShutdownHandler } from '../../../../apps/desktop/src/main/shutdown'
import { SessionService } from '../../../../apps/desktop/src/main/services/session/session-service'
import { SessionStore } from '../../../../apps/desktop/src/main/services/session/store'

const releases: (() => Promise<void>)[] = []
afterEach(async () => { for (const release of releases.splice(0).reverse()) await release() })
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))

function setup(codex = new FakeProvider('codex')) {
  const db = new DatabaseSync(':memory:')
  runMigrations(db, migrations)
  for (const id of ['p', 'other']) db.prepare('INSERT INTO projects(id,name,local_path,canonical_path,dev,ino,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, id, '/tmp', `/tmp/${id}`, '1', id, '2026-10-09')
  const projects = createProjectService(() => db)
  const store = new SessionStore(db)
  const service = new SessionService({ store, projects, providers: [codex, new FakeProvider('claude-code')], environment: async () => ({ env: { PATH: '/usr/bin' } }) })
  releases.push(async () => { await service.dispose().catch(() => {}); if (db.isOpen) db.close() })
  const create = async (projectId = 'p') => {
    const session = await service.create({ projectId, cli: 'codex', text: 'lifecycle test' })
    await tick()
    return session
  }
  return { service, db, codex, store, create }
}

describe('W4 lifecycle confirmation · close/resume/isolation/shutdown', () => {
  it('confirmed close stops only its Project, releases runtime, and reopens the same native ID', async () => {
    const h = setup()
    const a = await h.create(), b = await h.create('other')
    const nativeId = h.service.getConversation(a.id).session.nativeSessionId
    expect(await closeProjectWithSessions(h.service, 'p', false)).toMatchObject({ status: 'confirmation_required' })
    expect(h.codex.sessions[0]!.driver.callsTo('interruptTurn')).toHaveLength(0)
    expect(await closeProjectWithSessions(h.service, 'p', true)).toEqual({ status: 'closed' })
    expect(h.codex.sessions[0]!.driver.disposed).toBe(true)
    expect(h.service.getConversation(b.id).session.status).toBe('running')
    h.service.list('p')
    h.service.send(a.id, { text: 'continue' }); await tick()
    expect(h.codex.sessions[2]!.options).toMatchObject({ nativeSessionId: nativeId, cwd: '/tmp/p' })
    expect(h.service.getConversation(a.id).session.nativeSessionId).toBe(nativeId)
  })

  it('idle close releases its runtime without confirmation and preserves transcript', async () => {
    const h = setup()
    const a = await h.create()
    const runtime = h.codex.sessions[0]!.controller
    runtime.sink.nativeTurnEnded(runtime.activeTurn!.turnId, { status: 'completed' })
    const before = h.service.getConversation(a.id).items
    expect(await closeProjectWithSessions(h.service, 'p', false)).toEqual({ status: 'closed' })
    expect(h.codex.sessions[0]!.driver.disposed).toBe(true)
    expect(h.service.getConversation(a.id).items).toEqual(before)
  })

  it('explicit Stop cleanup failure keeps Project usable for retry and records a single Error', async () => {
    const codex = new FakeProvider('codex', { behavior: { cleanup: () => ({ status: 'failed', scope: 'turn' }) } })
    const h = setup(codex)
    const a = await h.create()
    const nativeId = h.service.getConversation(a.id).session.nativeSessionId
    expect(await closeProjectWithSessions(h.service, 'p', true)).toMatchObject({ status: 'failed' })
    expect(h.service.getConversation(a.id).items.filter(item => item.kind === 'error')).toHaveLength(1)
    h.service.retry(a.id); await tick()
    expect(codex.sessions[1]!.options).toMatchObject({ nativeSessionId: nativeId })
    codex.sessions[1]!.driver.behavior.cleanup = () => ({ status: 'confirmed', scope: 'turn' })
  })

  it('repeated will-quit requests wait for cleanup and close DB only once afterwards', async () => {
    const cleanup = deferred<{ status: 'confirmed'; scope: 'turn' }>()
    const h = setup(new FakeProvider('codex', { behavior: { cleanup: () => cleanup.promise } }))
    await h.create()
    const disposeCore = vi.fn(() => h.db.close()), quit = vi.fn(), onError = vi.fn()
    const disposeFeatures = vi.fn(() => h.service.dispose())
    const shutdown = createShutdownHandler({ disposeCore, disposeFeatures, quit, onError })
    const event = { preventDefault: vi.fn() }
    shutdown(event); shutdown(event); await tick()
    expect(disposeFeatures).toHaveBeenCalledTimes(1)
    expect(disposeCore).not.toHaveBeenCalled()
    expect(h.db.isOpen).toBe(true)
    cleanup.resolve({ status: 'confirmed', scope: 'turn' })
    await tick(); await tick()
    expect(disposeCore).toHaveBeenCalledTimes(1)
    expect(quit).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })
})

describe('W4 lifecycle risk regressions · formerly reproduced defects', () => {
  it('R1: timed-out Project close unlocks only after Stop eventually succeeds', async () => {
    const cleanup = deferred<{ status: 'confirmed'; scope: 'turn' }>()
    const h = setup(new FakeProvider('codex', { behavior: { cleanup: () => cleanup.promise } }))
    const a = await h.create()
    expect(await closeProjectWithSessions(h.service, 'p', true, 1)).toMatchObject({ status: 'failed', failed: [{ reason: '停止超时' }] })
    expect(() => h.service.send(a.id, { text: 'cleanup still pending' })).toThrow('Project 正在关闭')
    cleanup.resolve({ status: 'confirmed', scope: 'turn' })
    await tick()
    expect(h.service.getBlockingSessionCounts('p')).toEqual({ running: 0, needsInput: 0 })
    h.service.list('p')
    expect(() => h.service.send(a.id, { text: 'continue after timeout' })).not.toThrow()
    await tick()
  })

  it('R2: late secret card answer performs no SQLite writes after shutdown', async () => {
    const response = deferred<void>()
    const h = setup(new FakeProvider('codex', { behavior: { onRespond: () => response.promise } }))
    const a = await h.create()
    const runtime = h.codex.sessions[0]!.controller
    const requestId = runtime.sink.inputRequested(runtime.activeTurn!.turnId, {
      kind: 'question', nativeType: 'test', questions: [{ id: 'q', prompt: 'Secret?', options: [], multiSelect: false, allowFreeText: true, secret: true }]
    }, null)!
    const answer = h.service.answer(a.id, requestId, { kind: 'answers', answers: { q: { text: 'simulation-only' } } })
    const result = answer.then(() => null, error => error)
    await h.service.dispose()
    h.db.close()
    response.resolve()
    expect(await result).toBeNull()
  })
})
