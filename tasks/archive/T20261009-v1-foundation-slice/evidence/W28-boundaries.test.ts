import { afterEach, describe, expect, it, vi } from '../../../../packages/agent-adapter/node_modules/vitest/dist/index.js'
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RuntimeOwnershipRegistry } from '../../../../packages/agent-adapter/src/core/runtime-ownership.js'
import { FakeRuntime, fakeProcess } from '../../../../packages/agent-adapter/src/testing/fake-runtime.js'
import { Harness, model, options } from '../../../../packages/agent-adapter/test/codex/harness.js'
import { EventRecorder } from '../../../../packages/agent-adapter/src/testing/event-recorder.js'

const releases: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const release of releases.splice(0).reverse()) await release() })
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'w28-review-'))
  releases.push(() => rm(directory, { recursive: true, force: true }))
  return directory
}
function rpc() {
  const h = new Harness()
  releases.push(async () => { for (const runtime of h.runtimes) runtime.terminateBehavior = 'exit'; await h.provider.dispose() })
  return h
}

describe('W28 independent boundaries; synthetic RPC/OS only, no Electron or model calls', () => {
  it('keeps corrupt ownership records diagnosable without signalling any PID', async () => {
    const directory = await fixture()
    const path = join(directory, 'aaaa-1234.json')
    await writeFile(path, '{corrupt')
    const signal = vi.fn()
    const registry = new RuntimeOwnershipRegistry({ directory, lister: { list: async () => [fakeProcess(8001)] }, signal })
    expect(await registry.recover()).toEqual([{ record: 'aaaa-1234.json', status: 'unconfirmed', detail: expect.any(String) }])
    expect(signal).not.toHaveBeenCalled()
    expect(await readFile(path, 'utf8')).toBe('{corrupt')
  })

  it('retains survivors and the journal after failure, then retries only matching identities', async () => {
    const directory = await fixture()
    const host = fakeProcess(1001), root = fakeProcess(2001), detached = fakeProcess(2002, '', { pgid: 2002 })
    const external = fakeProcess(3001)
    const path = join(directory, 'aaaa-1234.json')
    const identity = ({ pid, startedAt }: typeof host) => ({ pid, startedAt })
    await writeFile(path, JSON.stringify({ version: 1, instanceId: 'previous', host: identity(host), runtime: { ...identity(root), pgid: root.pid }, sessionId: 'test', processes: [{ ...identity(detached), pgid: detached.pgid }] }))
    let table = [root, detached, external], permitExit = false
    const signals: number[] = []
    const registry = new RuntimeOwnershipRegistry({ directory, graceMs: 0, killWaitMs: 0, lister: { list: async () => [...table] }, signal: pid => { signals.push(pid); if (permitExit) table = table.filter(p => p.pid !== pid) } })
    expect((await registry.recover())[0]).toMatchObject({ status: 'unconfirmed', survivors: [root.pid, detached.pid] })
    expect((await readdir(directory)).filter(name => name.endsWith('.json'))).toHaveLength(1)
    permitExit = true
    expect((await registry.recover())[0]).toMatchObject({ status: 'cleaned' })
    expect(table).toEqual([external])
    expect(signals).not.toContain(external.pid)
    expect((await readdir(directory)).filter(name => name.endsWith('.json'))).toEqual([])
  })

  it('writes private identity-only ownership data before exposing a Runtime', async () => {
    const directory = join(await fixture(), 'journal')
    const host = fakeProcess(1001), runtime = new FakeRuntime()
    let table = [host, fakeProcess(runtime.pid)]
    const terminate = runtime.terminate.bind(runtime)
    runtime.terminate = async opts => { const report = await terminate(opts); table = [host]; return report }
    const registry = new RuntimeOwnershipRegistry({ directory, hostPid: host.pid, sampleMs: 60000, graceMs: 0, killWaitMs: 0, lister: { list: async () => [...table] } })
    const handle = await registry.start({ command: 'private-command', args: ['private-argument'], cwd: '/private-project', env: { W28_SECRET: 'private-secret' }, sessionId: 'client-session' }, async () => runtime)
    releases.push(() => handle.terminate())
    const path = join(directory, (await readdir(directory)).find(name => name.endsWith('.json'))!)
    const raw = await readFile(path, 'utf8')
    expect(JSON.parse(raw)).toMatchObject({ sessionId: 'client-session', host: { pid: host.pid }, runtime: { pid: runtime.pid } })
    expect(raw).not.toMatch(/private-command|private-argument|private-project|private-secret/)
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    expect((await stat(directory)).mode & 0o777).toBe(0o700)
  })

  it('reads enabled Skill metadata through a fresh managed catalog Runtime without creating a Thread', async () => {
    const h = rpc()
    h.configure = server => server.handle('skills/list', () => ({ data: [{ cwd: options.cwd, skills: [{ name: 'w28', description: 'test', path: '/tmp/SKILL.md', enabled: true }], errors: [] }] }))
    expect(await h.provider.listSkills({ environment: options.environment, cwd: options.cwd })).toEqual({ skills: [{ name: 'w28', description: 'test', path: '/tmp/SKILL.md', enabled: true }], errors: [] })
    expect(h.servers[0]!.received.find(r => r.method === 'skills/list')!.params).toEqual({ cwds: [options.cwd], forceReload: true })
    expect(h.servers[0]!.received.some(r => r.method.startsWith('thread/'))).toBe(false)
    expect(h.runtimes[0]!.running).toBe(false)
  })

  it('retains an unconfirmed malformed Skill probe Runtime for exact release retry', async () => {
    const h = rpc()
    h.configure = (server, runtime) => { runtime.terminateBehavior = 'hang'; server.handle('skills/list', () => ({ data: [] })) }
    await expect(h.provider.listSkills({ environment: options.environment, cwd: options.cwd })).rejects.toMatchObject({ code: 'protocol_error' })
    expect(h.runtimes).toHaveLength(1)
    expect(h.runtimes[0]!.running).toBe(true)
    await expect(h.provider.releaseRuntimes(options.cwd)).rejects.toBeInstanceOf(AggregateError)
    h.runtimes[0]!.terminateBehavior = 'exit'
    await h.provider.releaseRuntimes(options.cwd)
    expect(h.runtimes[0]!.running).toBe(false)
    expect(h.runtimes).toHaveLength(1)
  })

  it('resets effort using the currently selected model and resets model from the Project native config', async () => {
    const h = rpc()
    h.configure = server => {
      server.handle('model/list', () => ({ data: [{ ...model('native-default'), defaultReasoningEffort: 'medium' }, { ...model('selected-model'), isDefault: false, defaultReasoningEffort: 'high' }], nextCursor: null }))
      server.handle('config/read', () => ({ config: { model: 'native-default' } }))
    }
    const session = await h.session()
    await session.setModel('selected-model')
    await session.setReasoningEffort('low')
    await session.setReasoningEffort(null)
    await h.start(session)
    expect(h.servers[0]!.received.find(r => r.method === 'turn/start')!.params).toMatchObject({ model: 'selected-model', effort: 'high' })
    h.complete(session)
    await vi.waitFor(() => expect(session.state).toBe('idle'))
    await session.setModel(null)
    await session.setReasoningEffort(null)
    await h.start(session)
    expect(h.servers[0]!.received.filter(r => r.method === 'turn/start')[1]!.params).toMatchObject({ model: 'native-default', effort: 'medium' })
    for (const request of h.servers[0]!.received.filter(r => r.method === 'config/read')) expect(request.params).toEqual({ cwd: options.cwd, includeLayers: false })
  })

  it('passes native effort names through create options and later turn selection without a client enum', async () => {
    const h = rpc()
    const session = await h.session({ providerOptions: { effort: 'max' } })
    await h.start(session)
    expect(h.servers[0]!.received.find(r => r.method === 'turn/start')!.params).toMatchObject({ effort: 'max' })
    h.complete(session)
    await vi.waitFor(() => expect(session.state).toBe('idle'))
    await session.setReasoningEffort('native-future-effort')
    await h.start(session)
    expect(h.servers[0]!.received.filter(r => r.method === 'turn/start')[1]!.params).toMatchObject({ effort: 'native-future-effort' })
  })

  it('ignores public reasoning deltas after final snapshot and permits the same item ID in a later turn', async () => {
    const h = rpc(), session = await h.session(), recorder = new EventRecorder(session)
    await h.start(session)
    h.notify(session, 'item/reasoning/summaryTextDelta', { itemId: 'same-id', summaryIndex: 0, delta: 'initial' })
    h.notify(session, 'item/completed', { item: { id: 'same-id', type: 'reasoning', summary: ['final'], content: [] } })
    h.notify(session, 'item/reasoning/summaryTextDelta', { itemId: 'same-id', summaryIndex: 0, delta: 'late' })
    await vi.waitFor(() => expect(recorder.events.some(e => e.type === 'item.completed')).toBe(true))
    expect(recorder.events.filter(e => e.type === 'item.updated')).toHaveLength(1)
    expect(recorder.events.find(e => e.type === 'item.completed')).toMatchObject({ item: { text: 'final' } })
    h.complete(session)
    await vi.waitFor(() => expect(session.state).toBe('idle'))
    await h.start(session)
    h.notify(session, 'item/reasoning/summaryTextDelta', { itemId: 'same-id', summaryIndex: 0, delta: 'next turn' })
    await vi.waitFor(() => expect(recorder.events.filter(e => e.type === 'item.updated')).toHaveLength(2))
    expect(recorder.events.filter(e => e.type === 'item.updated').at(-1)).toMatchObject({ item: { text: 'next turn' } })
  })

  it('preserves the native public function output body instead of reducing it to a type label', async () => {
    const h = rpc(), session = await h.session(), recorder = new EventRecorder(session)
    await h.start(session)
    h.notify(session, 'item/completed', { item: { id: 'function-output', type: 'functionCallOutput', name: 'public-fixture', namespace: 'test', output: 'W28 public function result body' } })
    await vi.waitFor(() => expect(recorder.events.some(e => e.type === 'item.completed')).toBe(true))
    expect(JSON.stringify(recorder.events.find(e => e.type === 'item.completed'))).toContain('W28 public function result body')
  })

  it('preserves native review mode public text', async () => {
    const h = rpc(), session = await h.session(), recorder = new EventRecorder(session)
    await h.start(session)
    for (const type of ['enteredReviewMode', 'exitedReviewMode']) h.notify(session, 'item/completed', { item: { id: type, type, review: `W28 public ${type} body` } })
    await vi.waitFor(() => expect(recorder.events.filter(e => e.type === 'item.completed')).toHaveLength(2))
    for (const type of ['enteredReviewMode', 'exitedReviewMode']) expect(JSON.stringify(recorder.events.find(e => e.type === 'item.completed' && e.item.itemId === type))).toContain(`W28 public ${type} body`)
  })

  it('preserves native search result bodies and collaboration result messages', async () => {
    const h = rpc(), session = await h.session(), recorder = new EventRecorder(session)
    await h.start(session)
    h.notify(session, 'item/completed', { item: { id: 'search', type: 'webSearch', query: 'fixture query', action: null, results: [{ title: 'W28 public search body', url: 'https://example.invalid/fixture' }] } })
    h.notify(session, 'item/completed', { item: { id: 'collab', type: 'collabAgentToolCall', tool: 'wait', status: 'completed', senderThreadId: 'sender', receiverThreadIds: ['receiver'], prompt: 'fixture prompt', model: 'fixture model', reasoningEffort: 'high', agentsStates: { receiver: { status: 'completed', message: 'W28 public collaboration body' } } } })
    await vi.waitFor(() => expect(recorder.events.filter(e => e.type === 'item.completed')).toHaveLength(2))
    expect(JSON.stringify(recorder.events.find(e => e.type === 'item.completed' && e.item.itemId === 'search'))).toContain('W28 public search body')
    expect(JSON.stringify(recorder.events.find(e => e.type === 'item.completed' && e.item.itemId === 'collab'))).toContain('W28 public collaboration body')
  })
})
