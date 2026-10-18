import { afterEach, describe, expect, it, vi } from '../../../../packages/agent-adapter/node_modules/vitest/dist/index.js'
import { DatabaseSync } from 'node:sqlite'
import { FakeProvider } from '../../../../packages/agent-adapter/src/testing/scripted-driver.js'
import { deferred } from '../../../../packages/agent-adapter/src/core/async.js'
import { EventRecorder } from '../../../../packages/agent-adapter/src/testing/event-recorder.js'
import { Harness, model } from '../../../../packages/agent-adapter/test/codex/harness.js'
import { nativeInput } from '../../../../packages/agent-adapter/src/codex/mapping.js'
import type { CreateSessionOptions } from '../../../../packages/agent-adapter/src/provider.js'
import { SessionService, type SessionServiceOptions } from '../../../../apps/desktop/src/main/services/session/session-service'
import { SessionStore } from '../../../../apps/desktop/src/main/services/session/store'
import { buildUserInput } from '../../../../apps/desktop/src/main/services/session/file-reference'
import { createProjectService } from '../../../../apps/desktop/src/main/services/project/project-service'
import { runMigrations } from '../../../../apps/desktop/src/main/services/database/migrator'
import { migrations } from '../../../../apps/desktop/src/main/services/database/migrations'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const release of cleanup.splice(0).reverse()) await release() })
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))

class CatalogProvider extends FakeProvider {
  skills = [{ name: 'review-local', description: 'Review this local project', path: '/tmp/w27-review/.agents/skills/review/SKILL.md', enabled: true }]
  reads: string[] = []
  async listSkills(options: { cwd: string }) {
    this.reads.push(options.cwd)
    return { skills: this.skills.map(skill => ({ ...skill })), errors: [] }
  }
}

function serviceHarness(provider = new CatalogProvider('codex'), extra: Partial<SessionServiceOptions> = {}) {
  const db = new DatabaseSync(':memory:')
  runMigrations(db, migrations)
  for (const [id, path] of [['project', '/tmp/w27-review'], ['other', '/tmp/w27-other']]) {
    db.prepare('INSERT INTO projects(id,name,local_path,canonical_path,dev,ino,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, id, path, path, '1', id, '2026-10-18')
  }
  const store = new SessionStore(db)
  const projects = createProjectService(() => db)
  const build = () => new SessionService({ store, projects, providers: [provider], environment: async () => ({ env: { PATH: '/usr/bin' } }), ...extra })
  let service = build()
  cleanup.push(async () => { await service.dispose().catch(() => {}); if (db.isOpen) db.close() })
  return { db, store, provider, get service() { return service }, restart: async () => { await service.dispose(); service = build() } }
}

function rpcHarness() { const h = new Harness(); cleanup.push(() => h.provider.dispose()); return h }

describe('W27 independent native input and public output checks; synthetic providers only', () => {
  it('binds opaque Skill selection to the current Project catalog and ignores renderer-supplied names', async () => {
    const h = serviceHarness()
    const catalog = await h.service.getSkills('codex', 'project')
    const skill = catalog.skills[0]!
    expect(skill.id).not.toContain('/tmp')
    expect(JSON.stringify(catalog)).not.toContain('SKILL.md')
    const selected = { type: 'skill' as const, id: skill.id, name: 'renderer cannot substitute this native name' }
    const session = await h.service.create({ projectId: 'project', cli: 'codex', text: 'Use the chosen skill', contextItems: [selected, selected] })
    await vi.waitFor(() => expect(h.provider.sessions[0]?.driver.callsTo('startTurn')).toHaveLength(1))
    const input = h.provider.sessions[0]!.driver.callsTo('startTurn')[0]!.args[1]
    expect(input).toEqual({ text: 'Use the chosen skill', attachments: [{ kind: 'skill', name: 'review-local', path: h.provider.skills[0]!.path }] })
    expect(h.provider.reads.every(cwd => cwd === '/tmp/w27-review')).toBe(true)
    expect(JSON.stringify(h.service.getConversation(session.id))).not.toContain(h.provider.skills[0]!.path)
    await expect(h.service.create({ projectId: 'other', cli: 'codex', text: 'wrong project', contextItems: [selected] })).rejects.toThrow('重新选择')
    expect(h.store.summaries()).toHaveLength(1)
  })

  it('refuses a disabled Skill before creating a Session and retains its saved composer draft', async () => {
    const h = serviceHarness()
    const skill = (await h.service.getSkills('codex', 'project')).skills[0]!
    const contextItems = [{ type: 'skill' as const, id: skill.id, name: skill.name }]
    const key = { projectId: 'project', kind: 'new_chat' as const }
    h.service.saveDraft(key, { cli: 'codex', model: null, text: 'retain draft', contextItems })
    h.provider.skills[0]!.enabled = false
    await expect(h.service.create({ projectId: 'project', cli: 'codex', text: 'retain draft', contextItems })).rejects.toThrow('已禁用')
    expect(h.store.summaries()).toEqual([])
    expect(h.provider.sessions).toEqual([])
    expect(await h.service.getDraft(key)).toMatchObject({ text: 'retain draft', contextItems })
  })

  it('revalidates Skill on Running steer without recording an unaccepted user message', async () => {
    const provider = new CatalogProvider('codex', { capabilities: { inputWhileRunning: 'steer' }, behavior: { onSteer: () => {} } })
    const h = serviceHarness(provider)
    const skill = (await h.service.getSkills('codex', 'project')).skills[0]!
    const session = await h.service.create({ projectId: 'project', cli: 'codex', text: 'first turn' })
    await vi.waitFor(() => expect(provider.sessions[0]?.controller.state).toBe('running'))
    const key = { projectId: 'project', kind: 'session' as const, sessionId: session.id }
    const contextItems = [{ type: 'skill' as const, id: skill.id, name: skill.name }]
    h.service.saveDraft(key, { cli: 'codex', model: null, text: 'not accepted', contextItems })
    provider.skills = []
    await expect(h.service.send(session.id, { text: 'not accepted', contextItems })).rejects.toThrow('重新选择')
    expect(provider.sessions[0]!.driver.callsTo('steerTurn')).toEqual([])
    expect(h.service.getConversation(session.id).items.filter(item => item.kind === 'user_message')).toHaveLength(1)
    expect(await h.service.getDraft(key)).toMatchObject({ text: 'not accepted', contextItems })
  })

  it('revalidates a failed Skill turn before Retry and retains the original failure when selection is no longer enabled', async () => {
    const h = serviceHarness()
    const skill = (await h.service.getSkills('codex', 'project')).skills[0]!
    const contextItems = [{ type: 'skill' as const, id: skill.id, name: skill.name }]
    const session = await h.service.create({ projectId: 'project', cli: 'codex', text: 'retry selected skill', contextItems })
    await vi.waitFor(() => expect(h.provider.sessions[0]?.controller.activeTurn).toBeDefined())
    const runtime = h.provider.sessions[0]!.controller
    runtime.sink.nativeTurnEnded(runtime.activeTurn!.turnId, { status: 'failed', error: { code: 'provider_error', message: 'synthetic failure' } })
    const originalTurn = h.store.lastTurn(session.id)!
    h.provider.skills[0]!.enabled = false
    await expect(h.service.retry(session.id)).rejects.toThrow('已禁用')
    expect(h.store.lastTurn(session.id)!.id).toBe(originalTurn.id)
    expect(h.provider.sessions).toHaveLength(1)
    h.provider.skills[0]!.enabled = true
    await h.service.retry(session.id)
    await vi.waitFor(() => expect(h.provider.sessions).toHaveLength(2))
    await vi.waitFor(() => expect(h.provider.sessions.at(-1)!.driver.callsTo('startTurn')).toHaveLength(1))
    expect(h.provider.sessions.at(-1)!.driver.callsTo('startTurn')[0]!.args[1]).toMatchObject({ attachments: [{ kind: 'skill', name: skill.name, path: h.provider.skills[0]!.path }] })
    expect(h.store.lastTurn(session.id)!.id).not.toBe(originalTurn.id)
  })

  it('preserves both explicit file mention and native image when resolver deduplicates aliases', () => {
    const input = buildUserInput({ text: 'Compare the image and file', strategy: 'attachments',
      files: [{ path: 'assets/figure.png', aliases: ['figure.png'], name: 'figure.png', absolutePath: '/tmp/w27-review/assets/figure.png', size: 100, version: '1' }],
      filePaths: ['figure.png'], images: ['assets/figure.png'] })
    expect(nativeInput(input)).toEqual([
      { type: 'text', text: 'Compare the image and file', text_elements: [] },
      { type: 'mention', name: 'figure.png', path: '/tmp/w27-review/assets/figure.png' },
      { type: 'localImage', path: '/tmp/w27-review/assets/figure.png' },
    ])
    expect(() => buildUserInput({ text: 'do not silently drop', strategy: 'text', files: [], images: ['x.png'] })).toThrow('消息未发送')
  })

  it('persists public reasoning and tool results with stable transcript identity across service restart', async () => {
    const h = serviceHarness()
    const session = await h.service.create({ projectId: 'project', cli: 'codex', text: 'public output fixture' })
    await vi.waitFor(() => expect(h.provider.sessions[0]?.controller.activeTurn).toBeDefined())
    const runtime = h.provider.sessions[0]!.controller
    const turn = runtime.activeTurn!.turnId
    runtime.sink.itemDelta(turn, 'reason', 'reasoning', 'initial public')
    runtime.sink.itemCompleted(turn, { itemId: 'reason', kind: 'reasoning', status: 'completed', text: 'authoritative public summary' })
    runtime.sink.itemCompleted(turn, { itemId: 'tool', kind: 'tool_call', status: 'completed', tool: { name: 'fixture', result: { content: [{ type: 'text', text: 'public result' }] } } })
    runtime.sink.nativeTurnEnded(turn, { status: 'completed' })
    const before = h.service.getConversation(session.id).items.filter(item => item.kind === 'tool_activity')
    expect(before).toHaveLength(2)
    expect(before[0]).toMatchObject({ item: { text: 'authoritative public summary' } })
    expect(before[1]).toMatchObject({ item: { tool: { result: { content: [{ text: 'public result' }] } } } })
    await h.restart()
    expect(h.service.getConversation(session.id).items.filter(item => item.kind === 'tool_activity')).toEqual(before)
  })

  it('freezes the accepted turn effort while startup is pending, then persists the next-turn choice and default reset', async () => {
    const gate = deferred<void>()
    const efforts: (string | null)[] = []
    class EffortProvider extends CatalogProvider {
      override async createSession(options: CreateSessionOptions) {
        const session = await super.createSession(options)
        Object.assign(this.sessions.at(-1)!.driver, { setReasoningEffort: async (effort: string | null) => { efforts.push(effort) } })
        await gate.promise
        return session
      }
    }
    const h = serviceHarness(new EffortProvider('codex'))
    const session = await h.service.create({ projectId: 'project', cli: 'codex', text: 'first', reasoningEffort: 'low' })
    await tick()
    h.service.setReasoningEffort(session.id, 'xhigh')
    gate.resolve()
    await vi.waitFor(() => expect(efforts).toEqual(['low']))
    const native = h.provider.sessions[0]!.controller
    native.sink.nativeTurnEnded(native.activeTurn!.turnId, { status: 'completed' })
    await h.service.send(session.id, { text: 'next' })
    await vi.waitFor(() => expect(efforts).toEqual(['low', 'xhigh']))
    native.sink.nativeTurnEnded(native.activeTurn!.turnId, { status: 'completed' })
    h.service.setReasoningEffort(session.id, null)
    await h.restart()
    expect(h.service.getConversation(session.id).session.reasoningEffort).toBeNull()
  })

  it('keeps the untouched native effort omitted and resolves an explicit reset from the actual model catalog', async () => {
    const h = rpcHarness()
    h.configure = server => server.handle('model/list', () => ({ data: [{ ...model('cli-model'), defaultReasoningEffort: 'medium' }], nextCursor: null }))
    const session = await h.session()
    await h.start(session)
    expect(h.servers[0]!.received.find(request => request.method === 'turn/start')!.params).not.toHaveProperty('effort')
    h.complete(session)
    await vi.waitFor(() => expect(session.state).toBe('idle'))
    await session.setReasoningEffort('low')
    await session.setReasoningEffort(null)
    await h.start(session)
    expect(h.servers[0]!.received.filter(request => request.method === 'turn/start')[1]!.params).toMatchObject({ effort: 'medium' })
  })

  it('orders indexed public reasoning and replaces content with summary without merging duplicate streams', async () => {
    const h = rpcHarness()
    const session = await h.session()
    const recorder = new EventRecorder(session)
    await h.start(session)
    h.notify(session, 'item/started', { item: { id: 'think', type: 'reasoning', summary: [], content: [] } })
    for (const [method, index, delta] of [
      ['item/reasoning/textDelta', 1, 'raw second'], ['item/reasoning/textDelta', 0, 'raw first'],
      ['item/reasoning/summaryTextDelta', 1, 'summary second'], ['item/reasoning/summaryTextDelta', 0, 'summary first'],
    ] as const) h.notify(session, method, { itemId: 'think', [method.includes('summary') ? 'summaryIndex' : 'contentIndex']: index, delta })
    await vi.waitFor(() => expect(recorder.events.filter(event => event.type === 'item.updated')).toHaveLength(4))
    expect(recorder.events.filter(event => event.type === 'item.updated').at(-1)).toMatchObject({ item: { text: 'summary first\nsummary second' } })
  })

  it('retains public MCP and dynamic tool result bodies across native item mapping', async () => {
    const h = rpcHarness()
    const session = await h.session()
    const recorder = new EventRecorder(session)
    await h.start(session)
    h.notify(session, 'item/completed', { item: { id: 'mcp', type: 'mcpToolCall', server: 'fixture', tool: 'lookup', arguments: { key: 'example' }, status: 'completed',
      result: { content: [{ type: 'text', text: 'MCP public body' }], structuredContent: { found: true } }, error: null } })
    h.notify(session, 'item/completed', { item: { id: 'dynamic', type: 'dynamicToolCall', tool: 'dynamic-fixture', arguments: {}, status: 'completed',
      contentItems: [{ type: 'inputText', text: 'dynamic public body' }], success: true } })
    await vi.waitFor(() => expect(recorder.events.filter(event => event.type === 'item.completed')).toHaveLength(2))
    const items = recorder.events.filter(event => event.type === 'item.completed')
    expect(items[0]).toMatchObject({ item: { tool: { name: 'lookup', result: { content: [{ text: 'MCP public body' }], structuredContent: { found: true } } } } })
    expect(items[1]).toMatchObject({ item: { tool: { name: 'dynamic-fixture', result: [{ text: 'dynamic public body' }] } } })
  })
})
