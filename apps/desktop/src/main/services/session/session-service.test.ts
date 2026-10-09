import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { deferred, type AgentSession, type CreateSessionOptions, type InputRequestInit } from '@ai-studio/agent-adapter'
import { FakeProvider } from '@ai-studio/agent-adapter/testing'
import { runMigrations } from '../database/migrator'
import { coreAppMeta } from '../database/migrations/2026100901_core_app_meta'
import { projectCore } from '../database/migrations/2026100902_project_core'
import { sessionCore } from '../database/migrations/2026100903_session_core'
import { createProjectService } from '../project/project-service'
import { SessionService } from './session-service'
import { SessionStore } from './store'
import type { TranscriptItem } from '@shared/session/types'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
const approval: InputRequestInit = {
  kind: 'approval', subject: 'command', nativeType: 'test', title: 'Run command?', allowsMessage: false,
  options: [{ id: 'allow', label: 'Allow', intent: 'allow' }, { id: 'deny', label: 'Deny', intent: 'deny' }]
}
const question = (secret = false): InputRequestInit => ({
  kind: 'question', nativeType: 'test', questions: [{ id: 'q', prompt: 'Answer?', multiSelect: false, allowFreeText: true, secret, options: [] }]
})

function harness(codex = new FakeProvider('codex')) {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys=ON')
  runMigrations(db, [coreAppMeta, projectCore, sessionCore])
  for (const projectId of ['p', 'p2']) db.prepare('INSERT INTO projects(id,name,local_path,canonical_path,dev,ino,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(projectId, projectId, '/tmp', `/tmp/${projectId}`, '1', projectId, '2026-10-09')
  const projects = createProjectService(() => db)
  const store = new SessionStore(db)
  const claude = new FakeProvider('claude-code')
  const clock = { now: 1000, foreground: true }
  const changes: TranscriptItem[] = []
  const build = () => new SessionService({
    store, projects, providers: [codex, claude], environment: async () => ({ env: { PATH: '/usr/bin' } }),
    now: () => clock.now, isForeground: () => clock.foreground,
    transcriptChanged: event => changes.push(...event.items)
  })
  let service = build()
  cleanups.push(async () => { await service.dispose().catch(() => {}); db.close() })
  const create = async (text = 'hello', cli: 'codex' | 'claude-code' = 'codex', projectId = 'p') => service.create({ projectId, cli, text })
  const summary = (id: string) => service.getConversation(id).session
  const items = (id: string) => service.getConversation(id).items
  const native = (index = 0) => codex.sessions[index]!
  return { db, store, projects, codex, claude, clock, create, summary, items, native, changes, get service() { return service }, restart: async () => { await service.dispose(); service = build() } }
}

describe('Session state, persistence and native continuity · AC-02–05 / FR-STATE-001–007', () => {
  it('accepts into Running before runtime startup and handles instant completion before send resolves', async () => {
    const gate = deferred<AgentSession>()
    class DelayedProvider extends FakeProvider {
      override createSession(options: CreateSessionOptions) { void super.createSession(options).then(gate.resolve); return gate.promise.then(async session => { await tick(); return session }) }
    }
    const h = harness(new DelayedProvider('codex', { behavior: { onStartTurn: (turn, _input, sink) => sink.nativeTurnEnded(turn.turnId, { status: 'completed' }) } }))
    const session = await h.create()
    expect(session.status).toBe('running')
    expect(h.items(session.id).map(item => item.kind)).toEqual(['user_message'])
    await tick(); await tick()
    expect(h.summary(session.id)).toMatchObject({ activity: 'none', status: 'completed_unread' })
    expect(h.items(session.id).filter(item => item.kind === 'turn_end')).toHaveLength(1)
  })

  it('accumulates stream then replaces by complete snapshot with stable id and sequence; omits reasoning', async () => {
    const h = harness()
    const session = await h.create(); await tick()
    const { controller: runtime } = h.native()
    const turn = runtime.activeTurn!.turnId
    runtime.sink.itemStarted(turn, { itemId: 'm', kind: 'assistant_message', status: 'in_progress' })
    runtime.sink.itemDelta(turn, 'm', 'text', 'hel')
    runtime.sink.itemDelta(turn, 'm', 'text', 'lo')
    runtime.sink.itemStarted(turn, { itemId: 'think', kind: 'reasoning', status: 'in_progress', text: 'private thought' })
    const streaming = h.items(session.id).find(item => item.kind === 'agent_message')!
    expect(streaming).toMatchObject({ text: 'hello', complete: false })
    runtime.sink.itemCompleted(turn, { itemId: 'm', kind: 'assistant_message', status: 'completed', text: 'hello!' })
    runtime.sink.nativeTurnEnded(turn, { status: 'completed' })
    const messages = h.items(session.id).filter(item => item.kind === 'agent_message')
    expect(messages).toEqual([{ ...streaming, text: 'hello!', complete: true }])
    expect(JSON.stringify(h.items(session.id))).not.toContain('private thought')
  })

  it('uses actual window foreground at terminal time; focus alone does not clear unread but repeated opened does', async () => {
    const h = harness()
    const session = await h.create(); await tick()
    h.service.updateViewing(9, { projectId: 'p', sessionId: session.id, foreground: true })
    h.clock.foreground = false
    const first = h.native().controller
    first.sink.nativeTurnEnded(first.activeTurn!.turnId, { status: 'completed' })
    expect(h.summary(session.id).completionUnread).toBe(true)
    h.service.opened(9, 'p', session.id)
    expect(h.summary(session.id).completionUnread).toBe(true)
    h.clock.foreground = true
    h.service.updateViewing(9, { projectId: 'p', sessionId: session.id, foreground: true })
    expect(h.summary(session.id).completionUnread).toBe(true)
    h.service.opened(9, 'p', session.id)
    expect(h.summary(session.id).status).toBeNull()
    h.service.send(session.id, { text: 'next' }); await tick()
    first.sink.nativeTurnEnded(first.activeTurn!.turnId, { status: 'failed', error: { code: 'provider_error', message: 'bad' } })
    expect(h.summary(session.id).errorUnseen).toBe(false)
    expect(h.items(session.id).at(-1)).toMatchObject({ kind: 'error', summary: 'bad' })
  })

  it('preserves Needs Input on opened, answers independent cards and gives pending requests priority', async () => {
    const h = harness()
    const session = await h.create(); await tick()
    const runtime = h.native().controller
    const turn = runtime.activeTurn!.turnId
    const a = runtime.sink.inputRequested(turn, approval, 'a')!
    const b = runtime.sink.inputRequested(turn, approval, 'b')!
    h.service.updateViewing(1, { projectId: 'p', sessionId: session.id, foreground: true })
    h.service.opened(1, 'p', session.id)
    expect(h.summary(session.id).status).toBe('needs_input')
    expect(h.service.getProjectState('p')).toMatchObject({ attention: 'needs_input', counts: { running: 0, needsInput: 1 } })
    h.clock.now = 3000
    await h.service.answer(session.id, a, { kind: 'approval', optionId: 'allow' })
    expect(h.summary(session.id)).toMatchObject({ status: 'needs_input', lastUserMessageAt: 1000 })
    await h.service.answer(session.id, b, { kind: 'approval', optionId: 'deny' })
    expect(h.summary(session.id).status).toBe('running')
    expect(h.items(session.id).filter(item => item.kind === 'input_request' && item.resolution?.status === 'answered')).toHaveLength(2)
  })

  it('serializes card/text responses and honors single-question versus multi-request I-Q2 semantics', async () => {
    const answered = deferred<void>()
    const h = harness(new FakeProvider('codex', { behavior: { onRespond: () => answered.promise } }))
    const session = await h.create(); await tick()
    const runtime = h.native().controller
    const turn = runtime.activeTurn!.turnId
    const request = runtime.sink.inputRequested(turn, question(), 'q')!
    const first = h.service.replyWithText(session.id, 'answer')
    await expect(h.service.answer(session.id, request, { kind: 'answers', answers: { q: { text: 'second' } } })).rejects.toThrow('正在提交')
    answered.resolve(); await first
    expect(h.native().driver.callsTo('respondToInput')[0]!.args[1]).toEqual({ kind: 'answers', answers: { q: { text: 'answer' } } })
    runtime.sink.inputRequested(turn, approval, 'a')
    runtime.sink.inputRequested(turn, question(), 'b')
    h.clock.now = 5000
    await h.service.replyWithText(session.id, 'do something else')
    expect(h.native().driver.callsTo('declineInputsWithText')).toHaveLength(1)
    expect(h.summary(session.id)).toMatchObject({ status: 'running', lastUserMessageAt: 5000 })
    const requests = h.items(session.id).filter(item => item.kind === 'input_request')
    expect(requests.at(-1)).toMatchObject({ resolution: { status: 'declined_with_text' } })
  })

  it('keeps secret answers and secret composer drafts out of all persisted rows and transcript events', async () => {
    const h = harness()
    const session = await h.create(); await tick()
    const runtime = h.native().controller
    const turn = runtime.activeTurn!.turnId
    const request = runtime.sink.inputRequested(turn, question(true), 'q')!
    const key = { kind: 'session', sessionId: session.id, projectId: 'p' } as const
    h.service.saveDraft(key, { cli: 'codex', model: null, text: 'SECRET-COMPOSER-123', contextItems: [] })
    expect(h.store.getDraft(key)).toBeNull()
    await h.service.answer(session.id, request, { kind: 'answers', answers: { q: { text: 'SECRET-ANSWER-456' } } })
    runtime.sink.itemCompleted(turn, { itemId: 'echo', kind: 'assistant_message', status: 'completed', text: 'Echo SECRET-ANSWER-456' })
    runtime.sink.nativeTurnEnded(turn, { status: 'failed', error: { code: 'provider_error', message: 'SECRET-ANSWER-456 failed' } })
    await new Promise(resolve => setTimeout(resolve, 40))
    const rows = ['sessions', 'session_turns', 'transcript_items', 'session_drafts'].map(table => h.db.prepare(`SELECT * FROM ${table}`).all())
    expect(JSON.stringify(rows)).not.toContain('SECRET-')
    expect(JSON.stringify(h.changes)).not.toContain('SECRET-')
    expect(h.items(session.id).find(item => item.kind === 'input_request')).toMatchObject({ redacted: true, resolution: { status: 'answered', response: { answers: { q: { text: '[已隐藏]' } } } } })
  })

  it('redacts a free-text secret reply as a user message and updates history ordering', async () => {
    const h = harness()
    const session = await h.create(); await tick()
    const runtime = h.native().controller
    runtime.sink.inputRequested(runtime.activeTurn!.turnId, question(true), null)
    h.clock.now = 9000
    await h.service.replyWithText(session.id, 'NEVER-PERSIST-THIS')
    expect(h.summary(session.id).lastUserMessageAt).toBe(9000)
    expect(h.items(session.id).at(-1)).toMatchObject({ kind: 'user_message', redacted: true, text: '[已隐藏]' })
    expect(JSON.stringify(h.db.prepare('SELECT * FROM transcript_items').all())).not.toContain('NEVER-PERSIST-THIS')
  })

  it('stops during runtime creation without submitting a turn, and blocks sends until cleanup settles', async () => {
    const gate = deferred<void>()
    class DelayedProvider extends FakeProvider {
      override async createSession(options: CreateSessionOptions) { const session = await super.createSession(options); await gate.promise; return session }
    }
    const h = harness(new DelayedProvider('codex'))
    const session = await h.create(); await tick()
    const stopping = h.service.stop(session.id)
    expect(h.summary(session.id)).toMatchObject({ stopping: true, status: 'running' })
    expect(() => h.service.send(session.id, { text: 'blocked' })).toThrow()
    expect(h.service.stop(session.id)).toBe(stopping)
    gate.resolve(); await stopping
    expect(h.native().driver.callsTo('startTurn')).toHaveLength(0)
    expect(h.native().driver.disposed).toBe(true)
    expect(h.summary(session.id)).toMatchObject({ status: null, stopping: false })
    expect(h.items(session.id).at(-1)).toMatchObject({ kind: 'turn_end', outcome: 'interrupted' })
  })

  it('cancels pending cards immediately, waits for cleanup, emits one terminal and ignores late events', async () => {
    const cleanup = deferred<{ status: 'confirmed'; scope: 'turn' }>()
    const h = harness(new FakeProvider('codex', { behavior: { cleanup: () => cleanup.promise } }))
    const session = await h.create(); await tick()
    const runtime = h.native().controller
    const turn = runtime.activeTurn!.turnId
    runtime.sink.inputRequested(turn, approval, null)
    const stopping = h.service.stop(session.id); await tick()
    expect(h.summary(session.id)).toMatchObject({ status: 'running', stopping: true })
    expect(h.items(session.id).at(-1)).toMatchObject({ kind: 'input_request', resolution: { status: 'cancelled', reason: 'turn_stopping' } })
    cleanup.resolve({ status: 'confirmed', scope: 'turn' }); await stopping
    runtime.sink.itemDelta(turn, 'late', 'text', 'late output')
    runtime.sink.nativeTurnEnded(turn, { status: 'completed' })
    expect(h.summary(session.id).status).toBeNull()
    expect(h.items(session.id).filter(item => item.kind === 'turn_end')).toHaveLength(1)
    expect(JSON.stringify(h.items(session.id))).not.toContain('late output')
  })

  it('coalesces Stop cleanup failure, session.error and session.closed into one Error with no stopped line', async () => {
    const h = harness(new FakeProvider('codex', { behavior: { cleanup: () => ({ status: 'failed', scope: 'turn', error: { code: 'stop_cleanup_failed', message: 'survivor' } }) } }))
    const session = await h.create(); await tick()
    await expect(h.service.stop(session.id)).rejects.toThrow()
    expect(h.summary(session.id)).toMatchObject({ status: 'error', stopping: false, activity: 'none' })
    expect(h.items(session.id).filter(item => item.kind === 'error')).toHaveLength(1)
    expect(h.items(session.id).filter(item => item.kind === 'turn_end')).toHaveLength(0)
  })

  it('follows successful native completion racing Stop', async () => {
    const h = harness(new FakeProvider('codex', { behavior: { onInterrupt: (stop, sink) => sink.nativeTurnEnded(stop.turnId, { status: 'completed' }) } }))
    const session = await h.create(); await tick()
    await h.service.stop(session.id)
    expect(h.summary(session.id).status).toBe('completed_unread')
    expect(h.items(session.id).at(-1)).toMatchObject({ kind: 'turn_end', outcome: 'completed' })
  })

  it('isolates Project close and single runtime crash; resumes by immutable native ID after error', async () => {
    const h = harness()
    const a = await h.create('a'), b = await h.create('b', 'claude-code', 'p2'); await tick()
    const runtime = h.native().controller
    const nativeId = h.summary(a.id).nativeSessionId
    runtime.sink.runtimeExited({ generation: 1, code: 1, signal: null, expected: false, exitedAt: 2000 })
    expect(h.summary(a.id).status).toBe('error')
    expect(h.summary(b.id).status).toBe('running')
    h.service.retry(a.id); await tick()
    expect(h.codex.sessions).toHaveLength(2)
    expect(h.native(1).options).toMatchObject({ nativeSessionId: nativeId })
    const result = await h.service.stopProjectTurns('p')
    expect(result).toEqual({ stopped: [a.id], failed: [] })
    expect(h.summary(b.id).status).toBe('running')
    await h.service.projectClosed('p')
    expect(h.native(1).driver.disposed).toBe(true)
    expect(h.service.activeTurnCountAll()).toEqual({ projects: 1, sessions: 1 })
  })

  it('does not silently recreate when resume fails; idle exit has no Error and restart is lazy', async () => {
    const h = harness()
    const session = await h.create(); await tick()
    const runtime = h.native().controller
    runtime.sink.nativeTurnEnded(runtime.activeTurn!.turnId, { status: 'completed' })
    runtime.sink.runtimeExited({ generation: 1, code: 1, signal: null, expected: false, exitedAt: 2000 })
    expect(h.summary(session.id).errorUnseen).toBe(false)
    await h.restart()
    expect(h.codex.sessions).toHaveLength(1)
    h.codex.resumeFailure = { code: 'resume_failed', message: 'native history removed' }
    h.service.send(session.id, { text: 'continue' }); await tick()
    expect(h.codex.sessions).toHaveLength(1)
    expect(h.summary(session.id).nativeSessionId).toBe(session.nativeSessionId ?? runtime.nativeSessionId)
    expect(h.items(session.id).at(-1)).toMatchObject({ kind: 'error', summary: 'native history removed' })
  })

  it('restarts unfinished turns as Error, invalidates requests and does not start native runtimes', async () => {
    const h = harness()
    const session = await h.create(); await tick()
    const runtime = h.native().controller
    runtime.sink.inputRequested(runtime.activeTurn!.turnId, approval, null)
    const summary = h.summary(session.id)
    const request = h.items(session.id).at(-1)!
    await h.service.dispose()
    h.store.saveSummary(summary)
    h.store.saveItem(request)
    h.db.prepare('UPDATE session_turns SET outcome=NULL, ended_at=NULL WHERE session_id=?').run(session.id)
    await h.restart()
    expect(h.codex.sessions).toHaveLength(1)
    expect(h.summary(session.id)).toMatchObject({ status: 'error', activity: 'none' })
    expect(h.items(session.id).at(-1)).toMatchObject({ kind: 'error', summary: '应用退出时本轮未完成' })
    expect(h.items(session.id).find(item => item.id === request.id)).toMatchObject({ resolution: { status: 'cancelled' } })
  })

  it('preserves title priority, message-only sorting, drafts, model-next-turn and default CLI inheritance', async () => {
    const h = harness(new FakeProvider('codex', { capabilities: { nativeTitle: true } }))
    expect(await h.service.getDefaultCli('p')).toBe('codex')
    await h.service.setDefaultCli('p', 'claude-code')
    expect(await h.service.getDefaultCli('p2')).toBe('claude-code')
    const key = { kind: 'new_chat', projectId: 'p' } as const
    h.service.saveDraft(key, { cli: 'codex', model: 'first', text: 'unsent', contextItems: [] })
    h.service.saveDraft(key, { cli: 'claude-code', model: 'wrong-model', text: 'unsent', contextItems: [] })
    expect(await h.service.getDraft(key)).toMatchObject({ model: null, text: 'unsent' })
    const a = await h.create('first\nbody'); await tick()
    h.clock.now = 2000
    const b = await h.create('second'); await tick()
    const first = h.native().controller
    first.sink.nativeTitle('Native')
    expect(h.summary(a.id).title).toBe('Native')
    h.service.rename(a.id, ' User title ')
    first.sink.nativeTitle('Late native')
    h.clock.now = 5000
    h.service.setModel(a.id, 'next-model')
    expect(first.model).toBeUndefined()
    first.sink.nativeTurnEnded(first.activeTurn!.turnId, { status: 'completed' })
    expect(h.service.list('p').map(item => item.id)).toEqual([b.id, a.id])
    h.service.send(a.id, { text: 'next' }); await tick()
    expect(first.model).toBe('next-model')
    expect(h.summary(a.id).title).toBe('User title')
    expect(h.service.list('p').map(item => item.id)).toEqual([a.id, b.id])
    const sessionKey = { kind: 'session', projectId: 'p', sessionId: a.id } as const
    h.service.saveDraft(sessionKey, { cli: 'claude-code', model: null, text: 'remember me', contextItems: [] })
    await h.restart()
    expect(await h.service.getDraft(sessionKey)).toMatchObject({ cli: 'codex', text: 'remember me' })
  })

  it('pages transcript from the tail without duplicates and does not create unavailable-CLI sessions', async () => {
    const h = harness(new FakeProvider('codex', { behavior: { onStartTurn: (turn, _input, sink) => {
      for (let i = 0; i < 120; i++) sink.itemCompleted(turn.turnId, { itemId: `${i}`, kind: 'assistant_message', status: 'completed', text: `line ${i}` })
      sink.nativeTurnEnded(turn.turnId, { status: 'completed' })
    } } }))
    const session = await h.create(); await tick()
    const tail = h.service.getConversation(session.id, undefined, 50)
    const earlier = h.service.getConversation(session.id, tail.nextBeforeSequence!, 100)
    expect(tail).toMatchObject({ hasMore: true })
    expect(earlier).toMatchObject({ hasMore: false })
    expect(new Set([...earlier.items, ...tail.items].map(item => item.id)).size).toBe(122)
    h.claude.availability.login = { status: 'ok', value: { state: 'logged_out' } }
    await h.service.getProviders(true)
    await expect(h.create('no', 'claude-code')).rejects.toThrow()
    expect(h.service.list('p')).toHaveLength(1)
  })

  it('allows first-input failure without native ID to create again, but never accepts a replacement ID', async () => {
    const h = harness(new FakeProvider('codex', { capabilities: { nativeSessionIdTiming: 'after_first_input' } }))
    const session = await h.create(); await tick()
    const first = h.native().controller
    first.sink.nativeTurnEnded(first.activeTurn!.turnId, { status: 'failed', error: { code: 'spawn_failed', message: 'before init' } })
    expect(h.summary(session.id).nativeSessionId).toBeNull()
    h.service.send(session.id, { text: 'retry new init' }); await tick()
    expect(h.codex.sessions).toHaveLength(2)
    const second = h.native(1).controller
    second.sink.nativeSessionId('native-one')
    second.sink.nativeSessionId('native-two')
    expect(h.summary(session.id)).toMatchObject({ nativeSessionId: 'native-one', status: 'error' })
    expect(h.items(session.id).filter(item => item.kind === 'error')).toHaveLength(2)
  })

  it('maps native request withdrawal to Running and ignores old runtime title/output after retry', async () => {
    const h = harness(new FakeProvider('codex', { capabilities: { nativeTitle: true } }))
    const session = await h.create(); await tick()
    const first = h.native().controller
    const oldTurn = first.activeTurn!.turnId
    const request = first.sink.inputRequested(oldTurn, approval, null)!
    first.sink.inputResolvedNatively(request)
    expect(h.summary(session.id).status).toBe('running')
    expect(h.items(session.id).at(-1)).toMatchObject({ resolution: { status: 'cancelled', reason: 'native_resolved' } })
    first.sink.nativeTurnEnded(oldTurn, { status: 'failed', error: { code: 'provider_error', message: 'retry' } })
    h.service.retry(session.id); await tick()
    first.sink.nativeTitle('outdated title')
    first.sink.itemCompleted(oldTurn, { itemId: 'late', kind: 'assistant_message', status: 'completed', text: 'old runtime output' })
    expect(h.summary(session.id).title).toBe('hello')
    expect(JSON.stringify(h.items(session.id))).not.toContain('old runtime output')
  })

  it('blocks new work throughout Project close including metadata refresh, then allows reopening', async () => {
    const h = harness()
    const session = await h.create(); await tick()
    await h.service.stopProjectTurns('p')
    h.service.list('p')
    expect(() => h.service.send(session.id, { text: 'during close' })).toThrow('关闭')
    await h.service.projectClosed('p')
    expect(() => h.service.send(session.id, { text: 'closed project' })).toThrow('关闭')
    h.service.list('p')
    h.service.send(session.id, { text: 'reopened' }); await tick()
    expect(h.summary(session.id).status).toBe('running')
    expect(h.codex.sessions).toHaveLength(2)
  })

  it('snapshots initial defaults even while discovery is unavailable, independent of later app preference', async () => {
    const h = harness()
    h.codex.availability.login = { status: 'ok', value: { state: 'logged_out' } }
    h.claude.availability.login = { status: 'ok', value: { state: 'logged_out' } }
    await h.service.initializeProject('p')
    expect(h.projects.getDefaultCli('p')).toBeNull()
    h.claude.availability.login = { status: 'ok', value: { state: 'logged_in' } }
    await h.service.getProviders(true)
    await h.service.setDefaultCli('p2', 'claude-code')
    h.codex.availability.login = { status: 'ok', value: { state: 'logged_in' } }
    await h.service.getProviders(true)
    expect(await h.service.getDefaultCli('p')).toBe('codex')
  })

  it('keeps streaming secret echoes out of checkpoints and protects a late composer save after answer', async () => {
    const h = harness()
    const session = await h.create(); await tick()
    const runtime = h.native().controller
    const turn = runtime.activeTurn!.turnId
    const request = runtime.sink.inputRequested(turn, question(true), null)!
    await h.service.answer(session.id, request, { kind: 'answers', answers: { q: { text: 'FULL-SECRET-VALUE' } } })
    runtime.sink.itemStarted(turn, { itemId: 'echo', kind: 'assistant_message', status: 'in_progress' })
    runtime.sink.itemDelta(turn, 'echo', 'text', 'FULL-SECRET-')
    h.service.getConversation(session.id)
    expect(JSON.stringify(h.db.prepare('SELECT * FROM transcript_items').all())).not.toContain('FULL-SECRET-')
    runtime.sink.itemDelta(turn, 'echo', 'text', 'VALUE')
    runtime.sink.itemCompleted(turn, { itemId: 'echo', kind: 'assistant_message', status: 'completed', text: 'FULL-SECRET-VALUE' })
    h.service.saveDraft({ projectId: 'p', kind: 'session', sessionId: session.id }, { cli: 'codex', model: null, text: 'FULL-SECRET-VALUE', contextItems: [] })
    expect(JSON.stringify(h.db.prepare('SELECT * FROM session_drafts').all())).not.toContain('FULL-SECRET-VALUE')
    expect(h.items(session.id).at(-1)).toMatchObject({ text: '[已隐藏]' })
  })

  it('preserves composer and ordering on rejected text answers; accepted instant completion follows the user reply', async () => {
    const h = harness(new FakeProvider('codex', { behavior: { onRespond: () => { throw new Error('native refused answer') } } }))
    const session = await h.create(); await tick()
    const runtime = h.native().controller
    const turn = runtime.activeTurn!.turnId
    runtime.sink.inputRequested(turn, question(), null)
    const key = { projectId: 'p', kind: 'session', sessionId: session.id } as const
    h.service.saveDraft(key, { cli: 'codex', model: null, text: 'retained reply', contextItems: [] })
    h.clock.now = 6000
    await expect(h.service.replyWithText(session.id, 'retained reply')).rejects.toThrow('native refused')
    expect((await h.service.getDraft(key)).text).toBe('retained reply')
    expect(h.summary(session.id)).toMatchObject({ status: 'needs_input', lastUserMessageAt: 1000 })
    expect(h.items(session.id).filter(item => item.kind === 'user_message')).toHaveLength(1)
    h.native().driver.behavior.onRespond = () => runtime.sink.nativeTurnEnded(turn, { status: 'completed' })
    await h.service.replyWithText(session.id, 'retained reply')
    expect(h.items(session.id).slice(-2).map(item => item.kind)).toEqual(['user_message', 'turn_end'])
    expect((await h.service.getDraft(key)).text).toBe('')
    expect(h.summary(session.id).lastUserMessageAt).toBe(6000)
  })
})
