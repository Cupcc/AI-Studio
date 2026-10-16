import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { deferred, type AgentSession, type CreateSessionOptions, type InputRequestInit } from '@ai-studio/agent-adapter'
import { FakeProvider } from '@ai-studio/agent-adapter/testing'
import { runMigrations } from '../database/migrator'
import { coreAppMeta } from '../database/migrations/2026100901_core_app_meta'
import { projectCore } from '../database/migrations/2026100902_project_core'
import { sessionCore } from '../database/migrations/2026100903_session_core'
import { createProjectService } from '../project/project-service'
import { closeProjectWithSessions } from '../project/close-flow'
import { SessionService, type SessionServiceOptions } from './session-service'
import { SessionStore } from './store'
import type { TranscriptItem } from '@shared/session/types'
import type { FileReferenceFailureReason, FileReferenceResolver, ResolvedFileReference } from '@shared/tools/files'
import { FILE_REFERENCE_HEADER } from './file-reference'
import { createE2eProviders } from './e2e-providers'

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

function harness(codex = new FakeProvider('codex'), buildViewContext?: SessionServiceOptions['buildViewContext'], extra: Partial<SessionServiceOptions> = {}) {
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
    transcriptChanged: event => changes.push(...event.items),
    buildViewContext, ...extra
  })
  let service = build()
  cleanups.push(async () => { await service.dispose().catch(() => {}); if (db.isOpen) db.close() })
  const create = async (text = 'hello', cli: 'codex' | 'claude-code' = 'codex', projectId = 'p') => service.create({ projectId, cli, text })
  const summary = (id: string) => service.getConversation(id).session
  const items = (id: string) => service.getConversation(id).items
  const native = (index = 0) => codex.sessions[index]!
  return { db, store, projects, codex, claude, clock, create, summary, items, native, changes, get service() { return service }, restart: async () => { await service.dispose(); service = build() } }
}

describe('Session state, persistence and native continuity · AC-02–05 / FR-STATE-001–007', () => {
  it('awaits steering, retains failures and newer drafts, and records accepted input on its original turn after completion', async () => {
    const gate = deferred<void>()
    const h = harness(new FakeProvider('codex', { capabilities: { inputWhileRunning: 'steer' }, behavior: { onSteer: () => gate.promise } }))
    const session = await h.create(); await tick()
    const key = { projectId: 'p', kind: 'session' as const, sessionId: session.id }
    const draft = { cli: 'codex' as const, model: null, text: 'additional input', contextItems: [] }
    h.service.saveDraft(key, draft)
    const originalTurn = h.items(session.id)[0]!.turnId
    const send = h.service.send(session.id, { text: draft.text })
    expect(() => h.service.send(session.id, { text: 'duplicate' })).toThrow('正在提交')
    await tick()
    expect(h.items(session.id).filter(item => item.kind === 'user_message')).toHaveLength(1)
    h.service.saveDraft(key, { ...draft, text: 'newer draft' })
    const runtime = h.native().controller
    runtime.sink.nativeTurnEnded(runtime.activeTurn!.turnId, { status: 'completed' })
    gate.resolve(); await send
    expect(h.items(session.id).filter(item => item.kind === 'user_message').at(-1)).toMatchObject({ text: draft.text, turnId: originalTurn })
    expect((await h.service.getDraft(key)).text).toBe('newer draft')
    expect(h.native().driver.callsTo('startTurn')).toHaveLength(1)

    h.service.send(session.id, { text: 'next turn' }); await tick()
    h.native().driver.behavior.onSteer = () => { throw new Error('native rejected') }
    h.service.saveDraft(key, draft)
    await expect(h.service.send(session.id, { text: draft.text })).rejects.toThrow('native rejected')
    expect((await h.service.getDraft(key)).text).toBe(draft.text)
    expect(h.items(session.id).filter(item => item.kind === 'user_message' && item.text === draft.text)).toHaveLength(1)
  })

  it.each(['codex', 'claude-code'] as const)('attaches View Context once for %s, stores metadata but never its template, and retains detached origin', async cli => {
    const text = 'Current Project View: Architecture\nRelevant files: .ai-studio/knowledge/architecture.json\nRules: keep facts separate.'
    let calls = 0
    const h = harness(new FakeProvider('codex'), (_project, viewId) => { calls++; return { originViewId: viewId, paths: ['.ai-studio/knowledge/architecture.json'], text } })
    const session = await h.service.create({ projectId: 'p', cli, text: '重新整理支付模块架构。', originViewId: 'architecture', viewContextAttached: true })
    await tick()
    const native = (cli === 'codex' ? h.codex : h.claude).sessions[0]!
    expect(JSON.stringify(native.driver.callsTo('startTurn'))).toContain('Current Project View')
    expect(h.items(session.id)[0]).toMatchObject({ text: '重新整理支付模块架构。', viewContextAttached: true, viewContextPaths: ['.ai-studio/knowledge/architecture.json'] })
    expect(JSON.stringify(h.items(session.id))).not.toContain('Rules: keep')
    expect(h.store.lastTurn(session.id)!.message).not.toContain('Current Project View')
    native.controller.sink.nativeTurnEnded(native.controller.activeTurn!.turnId, { status: 'completed' })
    h.service.send(session.id, { text: '第二轮' }); await tick()
    expect(native.driver.callsTo('startTurn')).toHaveLength(2)
    expect(JSON.stringify(native.driver.callsTo('startTurn')[1])).not.toContain('Current Project View')
    expect(calls).toBe(1)
    native.controller.sink.nativeTurnEnded(native.controller.activeTurn!.turnId, { status: 'completed' })
    await h.restart()
    h.service.send(session.id, { text: '恢复后继续' }); await tick()
    const resumed = (cli === 'codex' ? h.codex : h.claude).sessions.at(-1)!
    expect('nativeSessionId' in resumed.options).toBe(true)
    expect(JSON.stringify(resumed.driver.callsTo('startTurn'))).not.toContain('Current Project View')
    expect(calls).toBe(1)
    const detached = await h.service.create({ projectId: 'p', cli, text: '普通请求', originViewId: 'architecture', viewContextAttached: false })
    expect(detached.originViewId).toBe('architecture'); expect(detached.viewContextAttached).toBe(false)
    expect(calls).toBe(1)
  })
  it('isolates View drafts and preserves removed labels across reload', async () => {
    const h = harness(), key = { projectId: 'p', kind: 'new_chat' as const, viewId: 'architecture' }
    const initial = await h.service.getDraft(key)
    expect(initial.contextItems).toEqual([{ type: 'view', viewId: 'architecture' }])
    h.service.saveDraft(key, { ...initial, text: 'Keep me', contextItems: [] })
    expect((await h.service.getDraft(key)).contextItems).toEqual([])
    expect((await h.service.getDraft({ ...key, viewId: 'progress' })).text).toBe('')
    expect((await h.service.getDraft({ projectId: 'p', kind: 'new_chat' })).text).toBe('')
  })
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
    const releaseRuntime = deferred<void>()
    const driver = h.native().driver
    const originalDispose = driver.dispose.bind(driver)
    driver.dispose = async () => { await releaseRuntime.promise; await originalDispose() }
    const closing = h.service.projectClosed('p')
    await tick()
    h.service.list('p')
    try {
      expect(h.service.getBlockingSessionCounts('p')).toEqual({ running: 0, needsInput: 0 })
      expect(() => h.service.send(session.id, { text: 'during runtime release' })).toThrow('关闭')
      // A second stopping scope must not unlock the outer Runtime release scope.
      await h.service.stopProjectTurns('p')
      expect(() => h.service.send(session.id, { text: 'overlapping close' })).toThrow('关闭')
    } finally { releaseRuntime.resolve() }
    await closing
    expect(() => h.service.send(session.id, { text: 'closed project' })).toThrow('关闭')
    h.service.list('p')
    h.service.send(session.id, { text: 'reopened' }); await tick()
    expect(h.summary(session.id).status).toBe('running')
    expect(h.codex.sessions).toHaveLength(2)
  })

  it('retains the same idle Runtime after a rejected release and retries its cleanup', async () => {
    const h = harness()
    const session = await h.create(); await tick()
    const { controller: runtime, driver } = h.native()
    runtime.sink.nativeTurnEnded(runtime.activeTurn!.turnId, { status: 'completed' })
    // Inject at the Driver boundary so the real SessionController's strict, shared
    // release applies: Session retirement and Provider.releaseRuntimes share one attempt.
    const originalDispose = driver.dispose.bind(driver)
    let attempts = 0
    driver.dispose = async () => {
      attempts++
      if (attempts === 1) throw new Error('transient idle cleanup failure')
      await originalDispose()
    }
    expect(await closeProjectWithSessions(h.service, 'p', true, 100)).toMatchObject({ status: 'failed' })
    expect(attempts).toBe(1)
    expect(await closeProjectWithSessions(h.service, 'p', true, 100)).toEqual({ status: 'closed' })
    expect(attempts).toBe(2)
    h.service.list('p')
    h.service.send(session.id, { text: 'reopened after retry' }); await tick()
    expect(h.summary(session.id).status).toBe('running')
    expect(h.codex.sessions).toHaveLength(2)
  })

  it('does not hold quit preparation behind an in-flight model probe: the Provider release ends it', async () => {
    const probe = deferred<Awaited<ReturnType<FakeProvider['listModels']>>>()
    class ProbeProvider extends FakeProvider {
      override listModels() { return probe.promise }
      override async releaseRuntimes(cwd?: string) { probe.resolve([]); await super.releaseRuntimes(cwd) }
    }
    const h = harness(new ProbeProvider('codex'))
    await h.create(); await tick()
    const models = h.service.getModels('codex', 'p'); await tick()
    const outcome = await Promise.race([
      h.service.releaseAllRuntimes().then(() => 'released'),
      new Promise<string>(resolve => setTimeout(() => resolve('blocked behind the probe'), 500))
    ])
    expect(outcome).toBe('released')
    await models
  })

  it('keeps a timed-out close locked only until its actual Stop settles, then allows retained Tab work', async () => {
    const cleanup = deferred<{ status: 'confirmed'; scope: 'turn' }>()
    const h = harness(new FakeProvider('codex', { behavior: { cleanup: () => cleanup.promise } }))
    const session = await h.create(); await tick()
    const result = await closeProjectWithSessions(h.service, 'p', true, 1)
    expect(result).toMatchObject({ status: 'failed', failed: [{ reason: '停止超时' }] })
    try {
      expect(h.summary(session.id).stopping).toBe(true)
      expect(() => h.service.send(session.id, { text: 'cleanup still running' })).toThrow('关闭')
    } finally { cleanup.resolve({ status: 'confirmed', scope: 'turn' }) }
    await tick()
    expect(h.summary(session.id).stopping).toBe(false)
    h.service.send(session.id, { text: 'continue in retained Tab' }); await tick()
    expect(h.summary(session.id).status).toBe('running')
    expect(h.codex.sessions).toHaveLength(1)
  })

  it('ignores a secret card answer resolving after disposal and database close', async () => {
    const response = deferred<void>()
    const h = harness(new FakeProvider('codex', { behavior: { onRespond: () => response.promise } }))
    const session = await h.create(); await tick()
    const runtime = h.native().controller
    const request = runtime.sink.inputRequested(runtime.activeTurn!.turnId, question(true), null)!
    const answer = h.service.answer(session.id, request, { kind: 'answers', answers: { q: { text: 'secret-value' } } })
    await h.service.dispose()
    h.db.close()
    response.resolve()
    await expect(answer).resolves.toBeUndefined()
  })

  it('does not let a retired secret answer clear the next turn composer on the same Runtime', async () => {
    const response = deferred<void>()
    const h = harness(new FakeProvider('codex', { behavior: { onRespond: () => response.promise } }))
    const session = await h.create(); await tick()
    const runtime = h.native().controller
    const request = runtime.sink.inputRequested(runtime.activeTurn!.turnId, question(true), null)!
    const answer = h.service.answer(session.id, request, { kind: 'answers', answers: { q: { text: 'secret-value' } } })
    await h.service.stop(session.id)
    h.service.send(session.id, { text: 'new turn' }); await tick()
    const key = { projectId: 'p', kind: 'session', sessionId: session.id } as const
    h.service.saveDraft(key, { cli: 'codex', model: null, text: 'keep new draft', contextItems: [] })
    response.resolve(); await answer
    expect((await h.service.getDraft(key)).text).toBe('keep new draft')
    expect(h.summary(session.id).status).toBe('running')
    expect(h.codex.sessions).toHaveLength(1)
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

/** Fake Files resolver: accepts every path unless listed in `reject`; `gate` holds the answer until released. */
function fileResolver(options: { reject?: Record<string, FileReferenceFailureReason>; gate?: () => Promise<void> } = {}) {
  const calls: { projectId: string; paths: string[] }[] = []
  const resolver: FileReferenceResolver = {
    async resolve(projectId, paths) {
      calls.push({ projectId, paths: [...paths] })
      await options.gate?.()
      const failures = paths.flatMap(path => options.reject?.[path] ? [{ path, reason: options.reject[path]! }] : [])
      if (failures.length) return { status: 'rejected', failures }
      const files: ResolvedFileReference[] = paths.map(path => ({ path, name: path.slice(path.lastIndexOf('/') + 1), size: 3, version: '1:2:3:4', absolutePath: `/tmp/${projectId}/${path}` }))
      return { status: 'ok', files }
    }
  }
  return { resolver, calls, reject: options.reject }
}
const referenceBlock = (paths: string[], text: string) => `${FILE_REFERENCE_HEADER}\n${paths.map(path => `- ${JSON.stringify(path)}`).join('\n')}\n\n${text}`
const files = (...paths: string[]) => paths.map(path => ({ type: 'file' as const, path }))
const userMessages = (h: ReturnType<typeof harness>, id: string) => h.items(id).filter(item => item.kind === 'user_message')
const startInputs = (h: ReturnType<typeof harness>, index = 0) => h.native(index).driver.callsTo('startTurn').map(call => call.args[1])
const steerInputs = (h: ReturnType<typeof harness>, index = 0) => h.native(index).driver.callsTo('steerTurn').map(call => call.args[1])

describe('Files references reach the Provider · FR-TOOL-001 item 4, FR-INPUT-001, Tools §4.1', () => {
  it('create: re-validates before any state exists, hands the Provider the exact text block, and stores only relative paths', async () => {
    const gate = deferred<void>()
    const fake = fileResolver({ gate: () => gate.promise })
    const h = harness(undefined, undefined, { fileReferences: fake.resolver })
    const contextItems = files('src/a.ts', 'docs/my file.md')
    const created = h.service.create({ projectId: 'p', cli: 'codex', text: '请阅读', contextItems })
    await tick()
    // Nothing is registered, stored or started while the files are being read.
    expect(fake.calls).toEqual([{ projectId: 'p', paths: ['src/a.ts', 'docs/my file.md'] }])
    expect(h.service.list('p')).toEqual([])
    expect(h.store.summaries()).toEqual([])
    expect(h.codex.sessions).toHaveLength(0)
    gate.resolve()
    const session = await created; await tick()
    expect(startInputs(h)).toEqual([{ text: referenceBlock(['src/a.ts', 'docs/my file.md'], '请阅读') }])
    expect(userMessages(h, session.id)[0]).toMatchObject({ text: '请阅读', contextItems })
    expect(JSON.parse(h.store.lastTurn(session.id)!.message)).toEqual({ text: '请阅读', contextItems })
    expect(JSON.stringify(h.items(session.id))).not.toContain('/tmp/p')
    expect(JSON.stringify(h.store.lastTurn(session.id))).not.toContain('/tmp/p')
  })

  it('create: a refusal names each path and reason and leaves no Session, Runtime or Provider call behind', async () => {
    const fake = fileResolver({ reject: { 'gone.ts': 'missing', 'ln': 'symlink_refused' } })
    const h = harness(undefined, undefined, { fileReferences: fake.resolver })
    await expect(h.service.create({ projectId: 'p', cli: 'codex', text: 'x', contextItems: files('ok.ts', 'gone.ts', 'ln') }))
      .rejects.toThrow('文件引用失败，消息未发送：gone.ts（文件已不存在）；ln（符号链接不能引用）')
    expect(h.store.summaries()).toEqual([]); expect(h.service.list('p')).toEqual([]); expect(h.codex.sessions).toHaveLength(0)
    expect(h.service.getBlockingSessionCounts('p')).toEqual({ running: 0, needsInput: 0 })
  })

  it('refuses explicitly, never silently dropping the references, when no resolver is injected', async () => {
    const h = harness()
    await expect(h.service.create({ projectId: 'p', cli: 'codex', text: 'x', contextItems: files('a.ts') })).rejects.toThrow('文件引用不可用')
    expect(h.store.summaries()).toEqual([])
    const session = await h.create(); await tick()
    h.native().controller.sink.nativeTurnEnded(h.native().controller.activeTurn!.turnId, { status: 'completed' })
    expect(() => h.service.send(session.id, { text: 'x', contextItems: files('a.ts') })).toThrow('文件引用不可用')
    expect(userMessages(h, session.id)).toHaveLength(1)
    expect(h.summary(session.id).activity).toBe('none')
  })

  it('create: a resolver that throws or returns fewer files than asked refuses the message', async () => {
    const throwing: FileReferenceResolver = { resolve: async () => { throw new Error('disk gone') } }
    const dropping: FileReferenceResolver = { resolve: async (_project, paths) => ({ status: 'ok', files: paths.slice(1).map(path => ({ path, name: path, size: 1, version: 'v', absolutePath: `/x/${path}` })) }) }
    await expect(harness(undefined, undefined, { fileReferences: throwing }).service.create({ projectId: 'p', cli: 'codex', text: 'x', contextItems: files('a.ts') })).rejects.toThrow('文件引用校验失败：disk gone')
    const h = harness(undefined, undefined, { fileReferences: dropping })
    await expect(h.service.create({ projectId: 'p', cli: 'codex', text: 'x', contextItems: files('a.ts', 'b.ts') })).rejects.toThrow('返回的文件与请求不一致')
    expect(h.store.summaries()).toEqual([])
  })

  it('create: re-checks the Project gate after the await, so a Project that began closing gets no Session', async () => {
    const gate = deferred<void>()
    let operable = true
    const fake = fileResolver({ gate: () => gate.promise })
    const h = harness(undefined, undefined, { fileReferences: fake.resolver, canOperate: () => operable })
    const created = h.service.create({ projectId: 'p', cli: 'codex', text: 'x', contextItems: files('a.ts') })
    await tick(); operable = false; gate.resolve()
    await expect(created).rejects.toThrow('Project 正在关闭')
    expect(h.store.summaries()).toEqual([]); expect(h.codex.sessions).toHaveLength(0)
  })

  it('send: resolves before begin() so a refusal starts no turn, then re-checks the state after the await', async () => {
    const gate = deferred<void>()
    const fake = fileResolver({ gate: () => gate.promise })
    const h = harness(undefined, undefined, { fileReferences: fake.resolver })
    const session = await h.create(); await tick()
    h.native().controller.sink.nativeTurnEnded(h.native().controller.activeTurn!.turnId, { status: 'completed' })
    const key = { projectId: 'p', kind: 'session' as const, sessionId: session.id }
    h.service.saveDraft(key, { cli: 'codex', model: null, text: 'next', contextItems: files('src/a.ts') })
    const sent = h.service.send(session.id, { text: 'next', contextItems: files('src/a.ts') })
    expect(sent).toBeInstanceOf(Promise)
    await tick()
    // While the files are read the Session is still idle: no user message, no turn, the draft untouched.
    expect(h.summary(session.id).activity).toBe('none')
    expect(userMessages(h, session.id)).toHaveLength(1)
    expect(h.store.lastTurn(session.id)!.outcome).toBe('completed')
    expect((await h.service.getDraft(key)).contextItems).toEqual(files('src/a.ts'))
    gate.resolve(); await sent; await tick()
    expect(h.summary(session.id).activity).toBe('running')
    expect(startInputs(h)[1]).toEqual({ text: referenceBlock(['src/a.ts'], 'next') })
    expect(userMessages(h, session.id).at(-1)).toMatchObject({ text: 'next', contextItems: files('src/a.ts') })
    expect((await h.service.getDraft(key)).text).toBe('')
  })

  it('send: a refused reference keeps the draft and starts nothing; the same message goes out once the file is fine', async () => {
    const reject: Record<string, FileReferenceFailureReason> = { 'gone.ts': 'missing' }
    const fake = fileResolver({ reject })
    const h = harness(undefined, undefined, { fileReferences: fake.resolver })
    const session = await h.create(); await tick()
    h.native().controller.sink.nativeTurnEnded(h.native().controller.activeTurn!.turnId, { status: 'completed' })
    const key = { projectId: 'p', kind: 'session' as const, sessionId: session.id }
    const draft = { cli: 'codex' as const, model: null, text: 'again', contextItems: files('gone.ts') }
    h.service.saveDraft(key, draft)
    await expect(h.service.send(session.id, draft)).rejects.toThrow('gone.ts（文件已不存在）')
    expect(h.summary(session.id).activity).toBe('none')
    expect(h.store.lastTurn(session.id)!.outcome).toBe('completed')
    expect(await h.service.getDraft(key)).toEqual(draft)
    expect(startInputs(h)).toHaveLength(1)
    delete reject['gone.ts']
    await h.service.send(session.id, draft); await tick()
    expect(startInputs(h)[1]).toEqual({ text: referenceBlock(['gone.ts'], 'again') })
  })

  it('send: a double submit during the await starts exactly one turn; the loser is refused and keeps its input', async () => {
    const gate = deferred<void>()
    const fake = fileResolver({ gate: () => gate.promise })
    const h = harness(undefined, undefined, { fileReferences: fake.resolver })
    const session = await h.create(); await tick()
    h.native().controller.sink.nativeTurnEnded(h.native().controller.activeTurn!.turnId, { status: 'completed' })
    const message = { text: 'once', contextItems: files('a.ts') }
    const first = h.service.send(session.id, message), second = h.service.send(session.id, message)
    gate.resolve()
    const results = await Promise.allSettled([first, second]); await tick()
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
    expect((results[1] as PromiseRejectedResult).reason.message).toContain('当前一轮尚未结束')
    expect(startInputs(h)).toHaveLength(2)
    expect(userMessages(h, session.id).filter(item => item.kind === 'user_message' && item.text === 'once')).toHaveLength(1)
  })

  it('send: a plain send that begins a turn while the files are read wins; the file send is refused, not queued', async () => {
    const gate = deferred<void>()
    const fake = fileResolver({ gate: () => gate.promise })
    const h = harness(undefined, undefined, { fileReferences: fake.resolver })
    const session = await h.create(); await tick()
    h.native().controller.sink.nativeTurnEnded(h.native().controller.activeTurn!.turnId, { status: 'completed' })
    const withFiles = h.service.send(session.id, { text: 'with files', contextItems: files('a.ts') })
    h.service.send(session.id, { text: 'plain' }); await tick()
    gate.resolve()
    await expect(withFiles).rejects.toThrow('当前一轮尚未结束')
    expect(userMessages(h, session.id).map(item => item.kind === 'user_message' && item.text)).toEqual(['hello', 'plain'])
    expect(JSON.stringify(startInputs(h))).not.toContain(FILE_REFERENCE_HEADER)
  })

  it('send: a Project that starts closing during the await blocks the send before any state changes', async () => {
    const gate = deferred<void>()
    let operable = true
    const fake = fileResolver({ gate: () => gate.promise })
    const h = harness(undefined, undefined, { fileReferences: fake.resolver, canOperate: () => operable })
    const session = await h.create(); await tick()
    h.native().controller.sink.nativeTurnEnded(h.native().controller.activeTurn!.turnId, { status: 'completed' })
    const sent = h.service.send(session.id, { text: 'x', contextItems: files('a.ts') })
    await tick(); operable = false; gate.resolve()
    await expect(sent).rejects.toThrow('Project 正在关闭')
    expect(h.summary(session.id).activity).toBe('none'); expect(startInputs(h)).toHaveLength(1)
  })

  it('running steer: reserves the turn before awaiting, delivers the same block as turn/steer, and releases the reservation', async () => {
    const gate = deferred<void>()
    const fake = fileResolver({ gate: () => gate.promise })
    const h = harness(new FakeProvider('codex', { capabilities: { inputWhileRunning: 'steer' }, behavior: { onSteer: () => {} } }), undefined, { fileReferences: fake.resolver })
    const session = await h.create(); await tick()
    const steer = h.service.send(session.id, { text: 'also this', contextItems: files('docs/my file.md') })
    expect(() => h.service.send(session.id, { text: 'duplicate', contextItems: files('x.ts') })).toThrow('输入正在提交')
    await tick()
    expect(steerInputs(h)).toEqual([]); expect(userMessages(h, session.id)).toHaveLength(1)
    gate.resolve(); await steer
    expect(steerInputs(h)).toEqual([{ text: referenceBlock(['docs/my file.md'], 'also this') }])
    expect(userMessages(h, session.id).at(-1)).toMatchObject({ text: 'also this', contextItems: files('docs/my file.md') })
    expect(fake.calls).toHaveLength(1)
    await h.service.send(session.id, { text: 'third' })
    expect(steerInputs(h).at(-1)).toEqual({ text: 'third' })
  })

  it('running steer: a refusal rejects, appends nothing, calls no native steer and releases the reservation', async () => {
    const fake = fileResolver({ reject: { 'gone.ts': 'permission_denied' } })
    const h = harness(new FakeProvider('codex', { capabilities: { inputWhileRunning: 'steer' }, behavior: { onSteer: () => {} } }), undefined, { fileReferences: fake.resolver })
    const session = await h.create(); await tick()
    await expect(h.service.send(session.id, { text: 'x', contextItems: files('gone.ts') })).rejects.toThrow('gone.ts（没有读取权限）')
    expect(steerInputs(h)).toEqual([]); expect(userMessages(h, session.id)).toHaveLength(1)
    await h.service.send(session.id, { text: 'next' })
    expect(steerInputs(h)).toEqual([{ text: 'next' }])
  })

  it('running steer: a turn that ends while the files are read refuses the input instead of steering a finished turn', async () => {
    const gate = deferred<void>()
    const fake = fileResolver({ gate: () => gate.promise })
    const h = harness(new FakeProvider('codex', { capabilities: { inputWhileRunning: 'steer' }, behavior: { onSteer: () => {} } }), undefined, { fileReferences: fake.resolver })
    const session = await h.create(); await tick()
    const steer = h.service.send(session.id, { text: 'late', contextItems: files('a.ts') })
    await tick()
    const runtime = h.native().controller
    runtime.sink.nativeTurnEnded(runtime.activeTurn!.turnId, { status: 'completed' })
    gate.resolve()
    await expect(steer).rejects.toThrow('当前一轮已结束或正在停止，输入已保留')
    expect(steerInputs(h)).toEqual([]); expect(userMessages(h, session.id)).toHaveLength(1)
  })

  it('running steer: Stop requested during the await also refuses it', async () => {
    const gate = deferred<void>()
    const fake = fileResolver({ gate: () => gate.promise })
    const h = harness(new FakeProvider('codex', { capabilities: { inputWhileRunning: 'steer' }, behavior: { onSteer: () => {} } }), undefined, { fileReferences: fake.resolver })
    const session = await h.create(); await tick()
    const steer = h.service.send(session.id, { text: 'late', contextItems: files('a.ts') })
    await tick()
    const stopping = h.service.stop(session.id)
    gate.resolve()
    await expect(steer).rejects.toThrow('当前一轮已结束或正在停止')
    await stopping
    expect(steerInputs(h)).toEqual([])
  })

  it('Claude has no running-turn input: a file send during a turn is refused before the resolver is asked', async () => {
    const fake = fileResolver()
    const h = harness(undefined, undefined, { fileReferences: fake.resolver })
    const session = await h.service.create({ projectId: 'p', cli: 'claude-code', text: 'hi' }); await tick()
    expect(() => h.service.send(session.id, { text: 'more', contextItems: files('a.ts') })).toThrow('当前 CLI 不支持运行中发送')
    expect(fake.calls).toEqual([])
    expect(h.claude.sessions[0]!.driver.callsTo('steerTurn')).toEqual([])
  })

  it.each(['codex', 'claude-code'] as const)('%s: both CLIs get the text block on the first turn of a new Session', async cli => {
    const h = harness(undefined, undefined, { fileReferences: fileResolver().resolver })
    await h.service.create({ projectId: 'p', cli, text: 'look', contextItems: files('a b/c.ts') }); await tick()
    const provider = cli === 'codex' ? h.codex : h.claude
    expect(provider.sessions[0]!.driver.callsTo('startTurn')[0]!.args[1]).toEqual({ text: referenceBlock(['a b/c.ts'], 'look') })
  })

  it('combines View context, the reference block and the user text in that order', async () => {
    const viewText = 'Current Project View: Architecture'
    const h = harness(undefined, (_project, viewId) => ({ originViewId: viewId, paths: [], text: viewText }), { fileReferences: fileResolver().resolver })
    await h.service.create({ projectId: 'p', cli: 'codex', text: 'go', originViewId: 'architecture', viewContextAttached: true, contextItems: [{ type: 'view', viewId: 'architecture' }, ...files('a.ts')] }); await tick()
    expect(startInputs(h)).toEqual([{ text: `${viewText}\n\n${referenceBlock(['a.ts'], 'go')}` }])
  })

  it('resolves a duplicated path once and lists it once', async () => {
    const fake = fileResolver()
    const h = harness(undefined, undefined, { fileReferences: fake.resolver })
    await h.service.create({ projectId: 'p', cli: 'codex', text: 'x', contextItems: files('a.ts', 'b.ts', 'a.ts') }); await tick()
    expect(fake.calls[0]!.paths).toEqual(['a.ts', 'b.ts'])
    expect(startInputs(h)).toEqual([{ text: referenceBlock(['a.ts', 'b.ts'], 'x') }])
  })

  it('passes distinct case and Unicode spellings unchanged to Files and delivers every resolved file', async () => {
    const paths = ['A.ts', 'a.ts', 'café.txt', 'café.txt']
    const fake = fileResolver()
    const h = harness(undefined, undefined, { fileReferences: fake.resolver })
    await h.service.create({ projectId: 'p', cli: 'codex', text: 'all files', contextItems: files(...paths) }); await tick()
    expect(fake.calls).toEqual([{ projectId: 'p', paths }])
    expect(startInputs(h)).toEqual([{ text: referenceBlock(paths, 'all files') }])
  })

  it('accepts fewer resolved files only when verified aliases cover every original request', async () => {
    const paths = ['A.ts', 'a.ts', 'café.txt', 'café.txt']
    const calls: string[][] = []
    const resolver: FileReferenceResolver = {
      async resolve(_project, requested) {
        calls.push([...requested])
        return { status: 'ok', files: [
          { path: 'A.ts', aliases: ['a.ts'], name: 'A.ts', size: 1, version: 'v', absolutePath: '/tmp/p/A.ts' },
          { path: 'café.txt', aliases: ['café.txt'], name: 'café.txt', size: 1, version: 'v', absolutePath: '/tmp/p/café.txt' }
        ] }
      }
    }
    const h = harness(undefined, undefined, { fileReferences: resolver })
    const session = await h.service.create({ projectId: 'p', cli: 'codex', text: 'aliases', contextItems: files(...paths) }); await tick()
    expect(calls).toEqual([paths])
    expect(startInputs(h)).toEqual([{ text: referenceBlock(['A.ts', 'café.txt'], 'aliases') }])
    expect(userMessages(h, session.id)[0]).toMatchObject({ contextItems: files(...paths) })
    expect(JSON.stringify(h.items(session.id))).not.toContain('"aliases":')
  })

  it.each([
    ['same-count replacement', [{ path: 'a.ts' }, { path: 'foreign.ts' }]],
    ['duplicate instead of missing path', [{ path: 'a.ts' }, { path: 'a.ts' }]],
    ['missing alias', [{ path: 'a.ts' }]],
    ['extra alias', [{ path: 'a.ts', aliases: ['b.ts', 'foreign.ts'] }]],
    ['duplicate alias', [{ path: 'a.ts', aliases: ['b.ts', 'b.ts'] }]],
    ['overlapping file and alias', [{ path: 'a.ts', aliases: ['b.ts'] }, { path: 'b.ts' }]]
  ] as const)('rejects a malformed resolver result (%s) before creating state', async (_name, resolved) => {
    const resolver: FileReferenceResolver = {
      resolve: async () => ({ status: 'ok', files: resolved.map(file => ({
        path: file.path, ...('aliases' in file ? { aliases: [...file.aliases] } : {}),
        name: file.path, size: 1, version: 'v', absolutePath: `/tmp/p/${file.path}`
      })) })
    }
    const h = harness(undefined, undefined, { fileReferences: resolver })
    await expect(h.service.create({ projectId: 'p', cli: 'codex', text: 'x', contextItems: files('a.ts', 'b.ts') })).rejects.toThrow('返回的文件与请求不一致')
    expect(h.store.summaries()).toEqual([])
    expect(h.codex.sessions).toHaveLength(0)
  })

  it('retry: re-resolves the stored relative paths; a file deleted since the failure blocks it, and it works again once restored', async () => {
    const reject: Record<string, FileReferenceFailureReason> = {}
    const fake = fileResolver({ reject })
    const h = harness(undefined, undefined, { fileReferences: fake.resolver })
    const session = await h.service.create({ projectId: 'p', cli: 'codex', text: 'analyze', contextItems: files('src/a.ts') }); await tick()
    const first = h.native().controller
    first.sink.nativeTurnEnded(first.activeTurn!.turnId, { status: 'failed', error: { code: 'provider_error', message: 'boom', retryable: true } })
    expect(h.summary(session.id).status).toBe('error')
    expect(fake.calls).toHaveLength(1)

    reject['src/a.ts'] = 'missing'
    const failedTurn = h.store.lastTurn(session.id)!.id
    const blocked = h.service.retry(session.id)
    expect(blocked).toBeInstanceOf(Promise)
    await expect(blocked).rejects.toThrow('文件引用失败，消息未发送：src/a.ts（文件已不存在）')
    // Still the failed turn, still retryable, no second turn and no new Runtime.
    expect(fake.calls).toHaveLength(2)
    expect(h.store.lastTurn(session.id)).toMatchObject({ id: failedTurn, outcome: 'failed' })
    expect(h.summary(session.id)).toMatchObject({ activity: 'none', status: 'error' })
    expect(h.codex.sessions).toHaveLength(1)

    delete reject['src/a.ts']
    await h.service.retry(session.id); await tick()
    expect(fake.calls).toHaveLength(3)
    expect(h.summary(session.id).status).toBe('running')
    const resumed = h.native(1).driver.callsTo('startTurn')
    expect(resumed.at(-1)!.args[1]).toEqual({ text: referenceBlock(['src/a.ts'], 'analyze') })
    expect(userMessages(h, session.id).at(-1)).toMatchObject({ text: 'analyze', contextItems: files('src/a.ts') })
  })

  it('retry: a second retry during the await is refused and only one turn starts', async () => {
    const gate = deferred<void>()
    let hold = false
    const fake = fileResolver({ gate: () => hold ? gate.promise : Promise.resolve() })
    const h = harness(undefined, undefined, { fileReferences: fake.resolver })
    const session = await h.service.create({ projectId: 'p', cli: 'codex', text: 'analyze', contextItems: files('a.ts') }); await tick()
    const runtime = h.native().controller
    runtime.sink.nativeTurnEnded(runtime.activeTurn!.turnId, { status: 'failed', error: { code: 'provider_error', message: 'boom', retryable: true } })
    hold = true
    const first = h.service.retry(session.id), second = h.service.retry(session.id)
    gate.resolve()
    const results = await Promise.allSettled([first, second]); await tick()
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
    expect(h.codex.sessions.flatMap(native => native.driver.callsTo('startTurn'))).toHaveLength(2)
  })

  it('retry: only the failed turn it started from is retried; a newer turn that already failed in between is not replayed', async () => {
    const gate = deferred<void>()
    let hold = false
    const fake = fileResolver({ gate: () => hold ? gate.promise : Promise.resolve() })
    const h = harness(undefined, undefined, { fileReferences: fake.resolver })
    const session = await h.service.create({ projectId: 'p', cli: 'codex', text: 'analyze', contextItems: files('a.ts') }); await tick()
    const fail = () => { const runtime = h.native(h.codex.sessions.length - 1).controller; runtime.sink.nativeTurnEnded(runtime.activeTurn!.turnId, { status: 'failed', error: { code: 'provider_error', message: 'boom', retryable: true } }) }
    fail()
    hold = true
    const retrying = h.service.retry(session.id)
    h.service.send(session.id, { text: 'newer message' }); await tick()
    fail()
    const newer = h.store.lastTurn(session.id)!
    gate.resolve()
    await expect(retrying).rejects.toThrow('没有可重试的失败消息')
    expect(h.store.lastTurn(session.id)!.id).toBe(newer.id)
    expect(h.summary(session.id).activity).toBe('none')
    expect(userMessages(h, session.id).map(item => item.kind === 'user_message' && item.text)).toEqual(['analyze', 'newer message'])
  })

  it('retry without a resolver refuses explicitly and keeps the failed turn', async () => {
    const h = harness()
    const session = await h.create('plain'); await tick()
    const runtime = h.native().controller
    runtime.sink.nativeTurnEnded(runtime.activeTurn!.turnId, { status: 'failed', error: { code: 'provider_error', message: 'boom', retryable: true } })
    // A turn stored by an earlier build that carried file tags.
    h.db.prepare('UPDATE session_turns SET message=? WHERE session_id=?').run(JSON.stringify({ text: 'plain', contextItems: files('a.ts') }), session.id)
    expect(() => h.service.retry(session.id)).toThrow('文件引用不可用')
    expect(h.store.lastTurn(session.id)!.outcome).toBe('failed')
    expect(h.summary(session.id).activity).toBe('none')
  })

  describe('simulated E2E Providers echo the references that reached them', () => {
    const reply = (h: ReturnType<typeof harness>, id: string) => h.items(id).filter(item => item.kind === 'agent_message').map(item => item.kind === 'agent_message' && item.text)
    const settle = () => new Promise<void>(resolve => setTimeout(resolve, 800))

    it.each(['codex', 'claude-code'] as const)('%s lists the start input\'s references in its final reply', async cli => {
      const h = harness(undefined, undefined, { providers: createE2eProviders(), fileReferences: fileResolver().resolver })
      const session = await h.service.create({ projectId: 'p', cli, text: 'look', contextItems: files('src/a.ts', 'docs/my file.md') })
      await settle()
      expect(reply(h, session.id)).toEqual(['已收到文件引用：src/a.ts, docs/my file.md'])
      expect(h.summary(session.id).status).toBe('completed_unread')
    })

    it('Codex also lists the references of a steer sent during the turn; Claude has no running-turn input', async () => {
      const h = harness(undefined, undefined, { providers: createE2eProviders(), fileReferences: fileResolver().resolver })
      const session = await h.service.create({ projectId: 'p', cli: 'codex', text: 'look', contextItems: files('src/a.ts') })
      await h.service.send(session.id, { text: 'and this', contextItems: files('docs/my file.md') })
      await h.service.send(session.id, { text: 'and nothing else' })
      await settle()
      expect(reply(h, session.id)).toEqual(['已收到文件引用：src/a.ts, docs/my file.md'])
      const claude = await h.service.create({ projectId: 'p', cli: 'claude-code', text: 'look' })
      expect(() => h.service.send(claude.id, { text: 'more', contextItems: files('a.ts') })).toThrow('当前 CLI 不支持运行中发送')
      expect(createE2eProviders().map(provider => provider.capabilities.inputWhileRunning)).toEqual(['steer', 'none'])
    })

    it('keeps the plain simulated reply when no reference was sent', async () => {
      const h = harness(undefined, undefined, { providers: createE2eProviders(), fileReferences: fileResolver().resolver })
      const session = await h.service.create({ projectId: 'p', cli: 'codex', text: 'plain' })
      await settle()
      expect(reply(h, session.id)).toEqual(['模拟回复已完成。可以继续同一个 Session。'])
    })
  })

  describe('zero regression for messages without file items', () => {
    it('keeps the synchronous paths and the exact Provider input; the resolver is never consulted', async () => {
      const fake = fileResolver()
      const h = harness(new FakeProvider('codex', { capabilities: { inputWhileRunning: 'steer' }, behavior: { onSteer: () => {} } }), undefined, { fileReferences: fake.resolver })
      const created = h.service.create({ projectId: 'p', cli: 'codex', text: 'plain', contextItems: [{ type: 'view', viewId: 'overview' }] })
      expect(created).toBeInstanceOf(Promise)
      const session = await created; await tick()
      expect(startInputs(h)).toStrictEqual([{ text: 'plain' }])
      const steered = h.service.send(session.id, { text: 'steer' })
      await steered
      expect(steerInputs(h)).toStrictEqual([{ text: 'steer' }])
      const runtime = h.native().controller
      runtime.sink.nativeTurnEnded(runtime.activeTurn!.turnId, { status: 'completed' })
      // Idle send stays synchronous: it returns nothing and the turn is already Running when it returns.
      expect(h.service.send(session.id, { text: 'next' })).toBeUndefined()
      expect(h.summary(session.id).activity).toBe('running')
      await tick()
      expect(startInputs(h)[1]).toStrictEqual({ text: 'next' })
      runtime.sink.nativeTurnEnded(runtime.activeTurn!.turnId, { status: 'failed', error: { code: 'provider_error', message: 'boom', retryable: true } })
      expect(h.service.retry(session.id)).toBeUndefined()
      expect(h.summary(session.id).activity).toBe('running')
      expect(fake.calls).toEqual([])
    })
  })
})
