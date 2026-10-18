import { afterEach, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Harness, turn } from '../../../packages/agent-adapter/test/codex/harness'
import { EventRecorder, FakeProvider } from '../../../packages/agent-adapter/src/testing/index'
import { boundNativeDiff, NATIVE_DIFF_LIMIT } from '../../../packages/agent-adapter/src/core/turn-diff'
import { SessionStore } from '../../../apps/desktop/src/main/services/session/store'
import { SessionService } from '../../../apps/desktop/src/main/services/session/session-service'
import { createProjectService } from '../../../apps/desktop/src/main/services/project/project-service'
import { runMigrations } from '../../../apps/desktop/src/main/services/database/migrator'
import { coreAppMeta } from '../../../apps/desktop/src/main/services/database/migrations/2026100901_core_app_meta'
import { projectCore } from '../../../apps/desktop/src/main/services/database/migrations/2026100902_project_core'
import { sessionCore } from '../../../apps/desktop/src/main/services/database/migrations/2026100903_session_core'
import { turnDiff } from '../../../apps/desktop/src/main/services/database/migrations/2026101801_turn_diff'

const dispose: (() => unknown | Promise<unknown>)[] = []
afterEach(async () => { for (const action of dispose.splice(0).reverse()) await action() })
const base = { nativeSessionId: 'thread', nativeTurnId: 'native-turn', source: 'codex:turn/diff/updated', protocolVersion: '0.161.0', state: 'available' as const, patch: 'small', files: [], truncated: false }
const oldMigrations = [coreAppMeta, projectCore, sessionCore]
const actualDiffs = (events: EventRecorder) => events.ofType('turn.diff.updated').filter(event => event.diff.source !== 'client:native-turn-bound')

it('W23: buffers patch before start acknowledgement and locks it to its exact native Turn', async () => {
  const h = new Harness(); dispose.push(() => h.provider.dispose())
  h.configure = server => server.handle('turn/start', params => {
    const p = params as { threadId: string }
    server.notify('turn/diff/updated', { threadId: p.threadId, turnId: 'early', diff: 'early-patch' })
    return { turn: turn('early') }
  })
  const session = await h.session(), events = new EventRecorder(session)
  await h.start(session)
  await vi.waitFor(() => expect(events.last('turn.diff.updated')?.diff.patch).toBe('early-patch'))
  h.complete(session); await events.waitFor('turn.completed')
  h.notify(session, 'turn/diff/updated', { turnId: 'early', diff: 'too-late' })
  await new Promise(resolve => setTimeout(resolve, 10))
  expect(actualDiffs(events)).toHaveLength(1)
})

it('W23-F1: replacing an oversized aggregate with a small complete patch clears truncation', async () => {
  const h = new Harness(); dispose.push(() => h.provider.dispose())
  const session = await h.session(), events = new EventRecorder(session)
  await h.start(session)
  h.notify(session, 'turn/diff/updated', { diff: 'x'.repeat(NATIVE_DIFF_LIMIT + 1) })
  await vi.waitFor(() => expect(events.last('turn.diff.updated')?.diff.truncated).toBe(true))
  h.notify(session, 'turn/diff/updated', { diff: 'complete-replacement' })
  await vi.waitFor(() => expect(events.last('turn.diff.updated')?.diff.patch).toBe('complete-replacement'))
  expect(events.last('turn.diff.updated')?.diff.truncated).toBe(false)
})

it('W23-F2: path truncation is reported as incomplete native data', () => {
  const result = boundNativeDiff({ ...base, files: [{ itemId: 'file', path: 'a'.repeat(9000), status: 'completed', change: 'modify', patch: 'patch' }] })
  expect(Buffer.byteLength(result.files[0]!.path)).toBe(8192)
  expect(result.truncated).toBe(true)
})

it('W23: old SQLite upgrade preserves history; final revision survives reopen and rejects overwrite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-w23-db-')); dispose.push(() => rmSync(dir, { recursive: true, force: true }))
  const path = join(dir, 'store.sqlite3')
  let db = new DatabaseSync(path); db.exec('PRAGMA foreign_keys=ON')
  runMigrations(db, oldMigrations)
  db.prepare('INSERT INTO projects(id,name,local_path,canonical_path,dev,ino,created_at) VALUES (?,?,?,?,?,?,?)').run('p', 'p', dir, dir, '1', '1', '2026-10-18')
  db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?)').run('s','p','codex','thread',1,1,'{}')
  db.prepare('INSERT INTO session_turns(id,session_id,started_at,message) VALUES (?,?,?,?)').run('app-turn','s',1,'{}')
  expect(runMigrations(db, [...oldMigrations, turnDiff]).applied).toEqual(['2026101801_turn_diff'])
  let store = new SessionStore(db)
  const record = { ...base, projectId: 'p', sessionId: 's', turnId: 'app-turn', provider: 'codex' as const, revision: 2, receivedAt: 3, final: true, outcome: 'interrupted' as const }
  store.saveTurnDiff(record); db.close()
  db = new DatabaseSync(path); dispose.push(() => db.close()); store = new SessionStore(db)
  store.saveTurnDiff({ ...record, revision: 100, patch: 'late' })
  expect(store.turnDiff('app-turn')).toEqual(record)
  expect(db.prepare('SELECT count(*) AS count FROM session_turns').get()).toEqual({ count: 1 })
})

it('W23-F3: secret redaction preserves native identity and schema states', async () => {
  const db = new DatabaseSync(':memory:'); dispose.push(() => db.close())
  db.exec('PRAGMA foreign_keys=ON'); runMigrations(db, [...oldMigrations, turnDiff])
  db.prepare('INSERT INTO projects(id,name,local_path,canonical_path,dev,ino,created_at) VALUES (?,?,?,?,?,?,?)').run('p', 'p', '/tmp', '/tmp', '1', '1', '2026-10-18')
  const provider = new FakeProvider('codex'), store = new SessionStore(db)
  const service = new SessionService({ store, projects: createProjectService(() => db), providers: [provider, new FakeProvider('claude-code')], environment: async () => ({ env: { PATH: '/usr/bin' } }) })
  dispose.push(() => service.dispose())
  const summary = await service.create({ projectId: 'p', cli: 'codex', text: 'hello' })
  await vi.waitFor(() => expect(provider.sessions[0]?.controller.activeTurn).toBeDefined())
  const controller = provider.sessions[0]!.controller, nativeTurnId = 'native-completed'
  const adapterTurn = controller.activeTurn!.turnId
  controller.sink.bindNativeTurnId(adapterTurn, nativeTurnId)
  const requestId = controller.sink.inputRequested(adapterTurn, { kind: 'question', nativeType: 'test', questions: [{ id: 'q', prompt: 'Secret?', secret: true, multiSelect: false, allowFreeText: true, options: [] }] }, {})!
  await service.answer(summary.id, requestId, { kind: 'answers', answers: { q: { text: 'completed' } } })
  controller.sink.turnDiffUpdated(adapterTurn, { ...base, nativeSessionId: controller.nativeSessionId!, nativeTurnId, files: [{ itemId: 'f', path: 'file', change: 'modify', status: 'completed', patch: '+completed' }] })
  const appTurn = service.getConversation(summary.id).items.find(item => item.kind === 'user_message')!.turnId!
  const saved = service.getTurnDiff('p', summary.id, appTurn)
  expect(saved.nativeTurnId).toBe(nativeTurnId)
  expect(saved.files[0]!.status).toBe('completed')
  expect(saved.files[0]!.patch).not.toContain('completed')
})

it('W23-F4: redacted patch remains within the stated persistence limit', async () => {
  const db = new DatabaseSync(':memory:'); dispose.push(() => db.close())
  db.exec('PRAGMA foreign_keys=ON'); runMigrations(db, [...oldMigrations, turnDiff])
  db.prepare('INSERT INTO projects(id,name,local_path,canonical_path,dev,ino,created_at) VALUES (?,?,?,?,?,?,?)').run('p', 'p', '/tmp', '/tmp', '1', '1', '2026-10-18')
  const provider = new FakeProvider('codex'), store = new SessionStore(db)
  const service = new SessionService({ store, projects: createProjectService(() => db), providers: [provider, new FakeProvider('claude-code')], environment: async () => ({ env: { PATH: '/usr/bin' } }) })
  dispose.push(() => service.dispose())
  const summary = await service.create({ projectId: 'p', cli: 'codex', text: 'hello' })
  await vi.waitFor(() => expect(provider.sessions[0]?.controller.activeTurn).toBeDefined())
  const controller = provider.sessions[0]!.controller, nativeTurnId = 'native-turn'
  const adapterTurn = controller.activeTurn!.turnId
  controller.sink.bindNativeTurnId(adapterTurn, nativeTurnId)
  const requestId = controller.sink.inputRequested(adapterTurn, { kind: 'question', nativeType: 'test', questions: [{ id: 'q', prompt: 'Secret?', secret: true, multiSelect: false, allowFreeText: true, options: [] }] }, {})!
  await service.answer(summary.id, requestId, { kind: 'answers', answers: { q: { text: 'x' } } })
  controller.sink.turnDiffUpdated(adapterTurn, { ...base, nativeSessionId: controller.nativeSessionId!, nativeTurnId, patch: 'x'.repeat(NATIVE_DIFF_LIMIT) })
  const appTurn = service.getConversation(summary.id).items.find(item => item.kind === 'user_message')!.turnId!
  const saved = service.getTurnDiff('p', summary.id, appTurn)
  expect(Buffer.byteLength(saved.patch!)).toBeLessThanOrEqual(NATIVE_DIFF_LIMIT)
  expect(saved.truncated).toBe(true)
})

it('W23: concurrent Sessions with the identical native Turn ID retain independent snapshots', async () => {
  const h = new Harness(); dispose.push(() => h.provider.dispose())
  h.configure = server => server.handle('turn/start', () => ({ turn: turn('same-native-turn') }))
  const a = await h.session(), b = await h.session(), ea = new EventRecorder(a), eb = new EventRecorder(b)
  await h.start(a); await h.start(b)
  expect(a.activeTurn!.nativeTurnId).toBe(b.activeTurn!.nativeTurnId)
  h.notify(a, 'turn/diff/updated', { diff: 'only-a' }, 0)
  h.notify(b, 'turn/diff/updated', { diff: 'only-b' }, 1)
  await vi.waitFor(() => expect(ea.last('turn.diff.updated')?.diff.patch).toBe('only-a'))
  await vi.waitFor(() => expect(eb.last('turn.diff.updated')?.diff.patch).toBe('only-b'))
  expect(ea.last('turn.diff.updated')!.diff.nativeSessionId).not.toBe(eb.last('turn.diff.updated')!.diff.nativeSessionId)
  h.notify(a, 'turn/diff/updated', { diff: 'foreign-thread' }, 1)
  await new Promise(resolve => setTimeout(resolve, 10))
  expect(actualDiffs(eb)).toHaveLength(1)
})

it('W23: runtime replacement keeps old-turn patches out of the next turn', async () => {
  const h = new Harness(); dispose.push(() => h.provider.dispose())
  const session = await h.session(), events = new EventRecorder(session), oldTurn = await h.start(session)
  h.command(session)
  h.notify(session, 'turn/diff/updated', { diff: 'before-recovery' }, 0)
  await vi.waitFor(() => expect(events.last('turn.diff.updated')?.diff.patch).toBe('before-recovery'))
  h.servers[0]!.handle('thread/backgroundTerminals/terminate', () => { throw new Error('force runtime recovery') })
  expect(await session.stop()).toMatchObject({ status: 'stopped', summary: { cleanup: 'runtime_restarted' } })
  expect(h.runtimes).toHaveLength(2)
  events.clear(); await h.start(session)
  h.notify(session, 'turn/diff/updated', { turnId: oldTurn, diff: 'late-old-turn' }, 1)
  h.notify(session, 'turn/diff/updated', { diff: 'fresh-generation' }, 1)
  await vi.waitFor(() => expect(events.last('turn.diff.updated')?.diff.patch).toBe('fresh-generation'))
  expect(actualDiffs(events)).toHaveLength(1)
  expect(events.last('turn.diff.updated')!.diff.files).toEqual([])
})

it('W23-F5: provenance lists only the actual native events received', async () => {
  const h = new Harness(); dispose.push(() => h.provider.dispose())
  const session = await h.session(), events = new EventRecorder(session)
  await h.start(session)
  h.notify(session, 'item/completed', { item: { type: 'fileChange', id: 'f', status: 'completed', changes: [{ path: 'file.txt', kind: { type: 'update', move_path: null }, diff: '+native-file-patch' }] } })
  await vi.waitFor(() => expect(actualDiffs(events)).toHaveLength(1))
  expect(events.last('turn.diff.updated')!.diff).toMatchObject({ state: 'unknown', patch: null, source: 'codex:item/completed:fileChange' })
  h.notify(session, 'turn/diff/updated', { diff: '+native-aggregate' })
  await vi.waitFor(() => expect(actualDiffs(events)).toHaveLength(2))
  expect(events.last('turn.diff.updated')!.diff.source).toContain('codex:item/completed:fileChange')
  expect(events.last('turn.diff.updated')!.diff.source).toContain('codex:turn/diff/updated')
})

it('W23-F6: a new turn without any patch retains known native identity and version across completion and restart', async () => {
  const h = new Harness(); h.configure = server => server.handle('initialize', () => ({ userAgent: 'w23/0.163.0 (macos)' }))
  dispose.push(() => h.provider.dispose())
  const db = new DatabaseSync(':memory:'); dispose.push(() => db.close())
  db.exec('PRAGMA foreign_keys=ON'); runMigrations(db, [...oldMigrations, turnDiff])
  db.prepare('INSERT INTO projects(id,name,local_path,canonical_path,dev,ino,created_at) VALUES (?,?,?,?,?,?,?)').run('p', 'p', '/tmp', '/tmp', '1', '1', '2026-10-18')
  const store = new SessionStore(db), projects = createProjectService(() => db)
  const options = { store, projects, providers: [h.provider, new FakeProvider('claude-code')], environment: async () => ({ env: { PATH: '/test/bin' } }) }
  let service = new SessionService(options); dispose.push(() => service.dispose())
  const session = await service.create({ projectId: 'p', cli: 'codex', text: 'Do not modify anything' })
  await vi.waitFor(() => expect(store.turnDiff(store.lastTurn(session.id)!.id)).not.toBeNull())
  const appTurn = store.lastTurn(session.id)!.id
  expect(service.getTurnDiff('p', session.id, appTurn)).toMatchObject({ state: 'unknown', nativeSessionId: 'thread-0', nativeTurnId: 'turn-1', cliVersion: '0.163.0', protocolVersion: '0.161.0', patch: null, final: false })
  h.servers[0]!.notify('turn/completed', { threadId: 'thread-0', turn: turn('turn-1', 'completed') })
  await vi.waitFor(() => expect(service.getConversation(session.id).session.activity).toBe('none'))
  const saved = service.getTurnDiff('p', session.id, appTurn)
  expect(saved).toMatchObject({ state: 'unknown', nativeSessionId: 'thread-0', nativeTurnId: 'turn-1', cliVersion: '0.163.0', final: true, outcome: 'completed' })
  await service.dispose(); service = new SessionService(options)
  expect(service.getTurnDiff('p', session.id, appTurn)).toEqual(saved)
})
