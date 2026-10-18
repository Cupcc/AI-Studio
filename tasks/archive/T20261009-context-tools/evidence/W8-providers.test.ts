// W8 独立评审：Provider 级严格 / 可重试 Runtime 清理契约（Codex 与 Claude 同一组场景）。
// 仅使用 FakeRuntime / 脚本化 JSON-RPC / 模拟 Query；不启动任何真实 CLI 或模型。
import { afterAll, describe, expect, it } from 'vitest'
import { ProviderRegistry } from '@w8/registry.js'
import { activeTimeouts, claudeRig, codexRig, DEFAULT_CWD, record, rejectionGuard, tick, types } from 'W8-support'

const guard = rejectionGuard()
afterAll(async () => { await guard.settle(); guard.stop(); expect(guard.seen).toEqual([]) })

const A = '/tmp/w8/proj-a'
const A_SLASH = '/tmp/w8/proj-a/'
const A_DOT = '/tmp/w8/./proj-a'
const B = '/tmp/w8/proj-b'
const state = (session: { state: string }) => session.state
// Codex createSession() throws synchronously when the Provider is disposed (pre-existing); normalise to a rejection.
const attempt = <T>(work: () => Promise<T>) => (async () => work())()

describe.each([['codex', codexRig], ['claude', claudeRig]] as const)('%s', (_name, makeRig) => {
  it('dispose() rejects while exit is unconfirmed, retries on the exact same handle even when closed, then is a no-op', async () => {
    const rig = makeRig(); rig.knobs.terminate = 'hang'
    const session = await rig.create(); const runtime = rig.runtimes[0]!; const events = record(session)
    await expect(session.dispose()).rejects.toBeTruthy()
    expect(state(session)).toBe('closed')
    expect(rig.runtimes).toHaveLength(1); expect(rig.spawns).toHaveLength(1)
    expect(rig.retained()).toBe(1); expect(rig.tracked()).toBe(1)
    const first = runtime.terminateCalls.length
    await expect(session.dispose()).rejects.toBeTruthy()
    expect(runtime.terminateCalls.length).toBeGreaterThan(first)
    expect(rig.spawns).toHaveLength(1)
    runtime.terminateBehavior = 'exit'
    await session.dispose()
    expect(runtime.running).toBe(false); expect(rig.runtimes).toHaveLength(1); expect(rig.spawns).toHaveLength(1)
    expect(rig.retained()).toBe(0)
    const settled = runtime.terminateCalls.length
    await session.dispose(); await session.dispose()
    expect(runtime.terminateCalls.length).toBe(settled)
    expect(types(events).filter((type) => type === 'session.closed')).toHaveLength(1)
    await guard.settle()
  })

  it('a session explicitly disposed after an earlier failure leaves the tracked set (no unbounded retention)', async () => {
    const rig = makeRig(); rig.knobs.terminate = 'hang'
    const session = await rig.create(); const runtime = rig.runtimes[0]!
    await expect(session.dispose()).rejects.toBeTruthy()
    runtime.terminateBehavior = 'exit'
    await session.dispose()
    await guard.settle(); await tick(20)
    // Expected by the contract text ("a session leaves the set only after its driver confirmed runtime release").
    expect(rig.retained()).toBe(0)
    expect(rig.tracked()).toBe(0)
  })

  it('concurrent session.dispose / releaseRuntimes / releaseRuntimes(cwd) / provider.dispose share one termination', async () => {
    const rig = makeRig(); const session = await rig.create(); const runtime = rig.runtimes[0]!
    const a = session.dispose(); const b = session.dispose()
    expect(a).toBe(b)
    const results = await Promise.allSettled([a, b, rig.provider.releaseRuntimes(), rig.provider.releaseRuntimes(DEFAULT_CWD), rig.provider.dispose()])
    expect(results.map((result) => result.status)).toEqual(Array(5).fill('fulfilled'))
    expect(runtime.terminateCalls).toHaveLength(1)
    expect(rig.retained()).toBe(0); expect(rig.tracked()).toBe(0)
    await guard.settle()
  })

  it('releaseRuntimes() overlapping with a failing session.dispose() reports the failure once per attempt and stays retryable', async () => {
    const rig = makeRig(); rig.knobs.terminate = 'hang'
    const session = await rig.create(); const runtime = rig.runtimes[0]!
    const settled = await Promise.allSettled([session.dispose(), rig.provider.releaseRuntimes(), rig.provider.releaseRuntimes()])
    expect(settled.map((result) => result.status)).toEqual(['rejected', 'rejected', 'rejected'])
    const aggregate = (settled[1] as PromiseRejectedResult).reason
    expect(aggregate).toBeInstanceOf(AggregateError)
    expect(aggregate.errors.length).toBeGreaterThanOrEqual(1)
    expect(rig.retained()).toBe(1)
    runtime.terminateBehavior = 'exit'
    await rig.provider.releaseRuntimes()
    expect(runtime.running).toBe(false); expect(rig.retained()).toBe(0); expect(rig.tracked()).toBe(0)
    await guard.settle()
  })

  it('release during an in-flight startup waits for the late Runtime, leaves no running Runtime and gates only the same scope', async () => {
    const rig = makeRig(); let open!: () => void
    rig.knobs.startGate = new Promise<void>((resolve) => { open = resolve })
    const creating = rig.create(A).then((session) => ({ session }), (error: unknown) => ({ error }))
    await tick(30)
    expect(rig.spawns).toHaveLength(1); expect(rig.runtimes).toHaveLength(0)
    let released = false
    const release = rig.provider.releaseRuntimes(A).then(() => { released = true })
    await tick(30)
    expect(released).toBe(false)
    await expect(rig.create(A)).rejects.toMatchObject({ code: 'invalid_state' })
    open()
    await release
    const outcome = await creating
    // Either rejection or a closed session is acceptable; a live Session on a released Project is not.
    if ('session' in outcome) expect(state(outcome.session)).toBe('closed')
    expect(rig.runtimes.length).toBeGreaterThanOrEqual(1)
    expect(rig.runtimes.every((runtime) => !runtime.running)).toBe(true)
    expect(rig.retained()).toBe(0)
    rig.knobs.startGate = undefined
    const again = await rig.create(A)
    expect(state(again)).not.toBe('closed')
    await again.dispose()
    await guard.settle()
    // eslint-disable-next-line no-console
    console.log(`[W8] ${_name} in-flight startup outcome:`, 'error' in outcome ? `rejected ${(outcome.error as { code?: string }).code}` : 'resolved closed session')
  })

  it('all-Project release gates every cwd while it runs and lifts afterwards (also after a failed release)', async () => {
    const rig = makeRig(); const session = await rig.create(A); void session
    let open!: () => void
    rig.runtimes[0]!.terminateGate = new Promise<void>((resolve) => { open = resolve })
    const release = rig.provider.releaseRuntimes()
    await tick(20)
    await expect(rig.create(B)).rejects.toMatchObject({ code: 'invalid_state' })
    await expect(rig.create(A)).rejects.toMatchObject({ code: 'invalid_state' })
    open(); await release
    const later = await rig.create(B)
    expect(state(later)).not.toBe('closed')
    // failed release must also lift the gate
    rig.knobs.terminate = 'hang'
    const stuck = await rig.create(A); void stuck
    await expect(rig.provider.releaseRuntimes()).rejects.toBeInstanceOf(AggregateError)
    rig.knobs.terminate = 'exit'
    const afterFailure = await rig.create(A)
    expect(state(afterFailure)).not.toBe('closed')
    for (const runtime of rig.runtimes) runtime.terminateBehavior = 'exit'
    await rig.provider.releaseRuntimes()
    expect(rig.retained()).toBe(0)
    await guard.settle()
  })

  it('releaseRuntimes(cwd) compares cwd as an exact string: distinct non-normalized spellings are distinct Projects', async () => {
    const rig = makeRig()
    const sessions = { a: await rig.create(A), slash: await rig.create(A_SLASH), dot: await rig.create(A_DOT), b: await rig.create(B) }
    const runtimeOf = (index: number) => rig.runtimes[index]!
    await rig.provider.releaseRuntimes(A)
    expect(state(sessions.a)).toBe('closed'); expect(runtimeOf(0).running).toBe(false)
    for (const key of ['slash', 'dot', 'b'] as const) expect(state(sessions[key])).not.toBe('closed')
    expect([1, 2, 3].map((index) => runtimeOf(index).running)).toEqual([true, true, true])
    await rig.provider.releaseRuntimes(A_SLASH)
    expect(state(sessions.slash)).toBe('closed'); expect(state(sessions.dot)).not.toBe('closed'); expect(state(sessions.b)).not.toBe('closed')
    await rig.provider.releaseRuntimes(B)
    expect(state(sessions.b)).toBe('closed'); expect(state(sessions.dot)).not.toBe('closed')
    // Provider stays usable: only dispose() disposes it.
    expect(state(await rig.create(B))).not.toBe('closed')
    await rig.provider.releaseRuntimes()
    expect(rig.runtimes.every((runtime) => !runtime.running)).toBe(true)
    expect(rig.retained()).toBe(0)
    await guard.settle()
  })

  it('a release scoped to Project A neither blocks nor touches Project B while it is held open', async () => {
    const rig = makeRig(); const a = await rig.create(A); const b = await rig.create(B); void a
    let open!: () => void
    rig.runtimes[0]!.terminateGate = new Promise<void>((resolve) => { open = resolve })
    const release = rig.provider.releaseRuntimes(A)
    await tick(20)
    const other = await rig.create(B)
    expect(state(other)).not.toBe('closed'); expect(state(b)).not.toBe('closed')
    await expect(rig.create(A)).rejects.toMatchObject({ code: 'invalid_state' })
    // A different spelling of the same directory is NOT covered by the gate (exact-string contract).
    const spelling = await rig.create(A_SLASH)
    expect(state(spelling)).not.toBe('closed')
    open(); await release
    expect(state(await rig.create(A))).not.toBe('closed')
    await rig.provider.releaseRuntimes()
    await guard.settle()
  })

  it('a failed startup keeps the original startup error, retains the unconfirmed handle and releases it later (create and resume)', async () => {
    const rig = makeRig(); rig.knobs.failInitialize = true; rig.knobs.terminate = 'hang'
    const create = await rig.create().then(() => undefined, (error: { code: string; message: string }) => error)
    expect(create).toBeDefined()
    expect(create!.code).not.toBe('stop_cleanup_failed')
    expect(create!.message).toMatch(/W8 handshake/)
    const resume = await rig.provider.resumeSession({ cwd: DEFAULT_CWD, environment: { env: { PATH: '/test/bin' } }, nativeSessionId: '11111111-1111-4111-8111-111111111111',
      timeouts: { startupMs: 1000, requestMs: 500, terminateGraceMs: 1, killWaitMs: 1, disposeMs: 1000 } }).then(() => undefined, (error: { code: string }) => error)
    expect(resume).toMatchObject({ code: 'resume_failed' })
    expect(rig.retained()).toBe(2)
    await expect(rig.provider.releaseRuntimes()).rejects.toBeInstanceOf(AggregateError)
    expect(rig.retained()).toBe(2)
    for (const runtime of rig.runtimes) runtime.terminateBehavior = 'exit'
    await rig.provider.releaseRuntimes()
    expect(rig.retained()).toBe(0); expect(rig.tracked()).toBe(0)
    expect(rig.runtimes.every((runtime) => !runtime.running)).toBe(true)
    await guard.settle()
  })

  it('model probe: unconfirmed cleanup rejects (limitation c) but the handle stays retained for releaseRuntimes', async () => {
    const rig = makeRig(); rig.knobs.terminate = 'hang'
    const error = await rig.models().then(() => undefined, (e: { code: string }) => e)
    expect(error).toMatchObject({ code: 'stop_cleanup_failed' })
    expect(rig.retained()).toBe(1)
    await expect(rig.provider.releaseRuntimes()).rejects.toBeInstanceOf(AggregateError)
    rig.runtimes[0]!.terminateBehavior = 'exit'
    await rig.provider.releaseRuntimes()
    expect(rig.retained()).toBe(0)
    rig.knobs.terminate = 'exit'
    const models = await rig.models()
    expect(models.length).toBe(1)
    await guard.settle(); await tick(20)
    expect(rig.retained()).toBe(0); expect(rig.tracked()).toBe(0)
  })

  it('Provider.dispose() is shutdown: rejects while unconfirmed, keeps rejecting new work, retries the same handle, then is idempotent', async () => {
    const rig = makeRig(); rig.knobs.terminate = 'hang'
    const session = await rig.create(); void session
    const runtime = rig.runtimes[0]!
    const [first, second] = await Promise.allSettled([rig.provider.dispose(), rig.provider.dispose()])
    expect(first.status).toBe('rejected'); expect(second.status).toBe('rejected')
    await expect(attempt(() => rig.create())).rejects.toMatchObject({ code: 'disposed' })
    await expect(rig.models()).rejects.toMatchObject({ code: 'disposed' })
    expect(rig.retained()).toBe(1)
    runtime.terminateBehavior = 'exit'
    await rig.provider.dispose()
    expect(runtime.running).toBe(false); expect(rig.retained()).toBe(0)
    await rig.provider.dispose()
    expect(rig.spawns).toHaveLength(1)
    await guard.settle()
  })

  it('self-exit (crash): tracked set drops the session after confirmed release; an unconfirmed one stays and is retried', async () => {
    const ok = makeRig(); await ok.create(); ok.runtimes[0]!.crash(); await tick(30)
    expect(ok.tracked()).toBe(0); expect(ok.retained()).toBe(0)
    const stuck = makeRig(); stuck.knobs.terminate = 'hang'
    const session = await stuck.create(); const events = record(session); stuck.runtimes[0]!.crash(); await tick(30)
    expect(state(session)).toBe('closed')
    expect(stuck.tracked()).toBe(1); expect(stuck.retained()).toBe(1)
    await expect(stuck.provider.releaseRuntimes()).rejects.toBeInstanceOf(AggregateError)
    stuck.runtimes[0]!.terminateBehavior = 'exit'
    await stuck.provider.releaseRuntimes()
    expect(stuck.tracked()).toBe(0); expect(stuck.retained()).toBe(0)
    expect(types(events)).toContain('session.closed')
    await guard.settle()
  })

  it('no retained-handle growth across many create/dispose, probes, failed startups and crashes', async () => {
    const rig = makeRig()
    for (let i = 0; i < 25; i++) { const s = await rig.create(i % 2 ? A : B); await s.dispose() }
    for (let i = 0; i < 25; i++) await rig.models()
    rig.knobs.failInitialize = true
    for (let i = 0; i < 25; i++) await rig.create().then(() => undefined, () => undefined)
    rig.knobs.failInitialize = false
    for (let i = 0; i < 25; i++) { await rig.create(); rig.runtimes.at(-1)!.crash() }
    await guard.settle(); await tick(50)
    expect(rig.retained()).toBe(0); expect(rig.tracked()).toBe(0)
    expect(rig.runtimes.every((runtime) => !runtime.running)).toBe(true)
    await rig.provider.dispose()
  })

  it('disposeMs timeout rejects, a retry joins the still-running cleanup (no second termination), then succeeds', async () => {
    const rig = makeRig()
    const session = await rig.create(DEFAULT_CWD, { timeouts: { startupMs: 1000, requestMs: 500, terminateGraceMs: 1, killWaitMs: 1, disposeMs: 80 } })
    const runtime = rig.runtimes[0]!
    let open!: () => void
    runtime.terminateGate = new Promise<void>((resolve) => { open = resolve })
    await expect(session.dispose()).rejects.toMatchObject({ code: 'timeout' })
    expect(state(session)).toBe('closed')
    await expect(session.dispose()).rejects.toMatchObject({ code: 'timeout' })
    expect(runtime.terminateCalls.length).toBe(0) // the gate holds the very first (and only) termination attempt
    open(); await tick(30)
    await session.dispose()
    expect(runtime.terminateCalls.length).toBe(1); expect(runtime.running).toBe(false); expect(rig.retained()).toBe(0)
    await guard.settle()
  })

  it('re-entrant dispose() from event listeners joins the running attempt and never starts a second one', async () => {
    const rig = makeRig(); const session = await rig.create(); const runtime = rig.runtimes[0]!
    const inner: Promise<void>[] = []
    session.subscribe((event) => { if (event.type === 'session.state' || event.type === 'session.closed') inner.push(session.dispose()) })
    const outer = session.dispose()
    await outer
    expect(inner.length).toBeGreaterThanOrEqual(1)
    expect(inner.every((promise) => promise === outer)).toBe(true)
    expect(runtime.terminateCalls).toHaveLength(1)
    await guard.settle()
  })

  it('re-entrant dispose() from a diagnostic listener during a failing attempt does not recurse or leak rejections', async () => {
    const rig = makeRig(); rig.knobs.terminate = 'hang'
    const session = await rig.create(); const runtime = rig.runtimes[0]!
    let calls = 0
    session.subscribe((event) => { if (event.type === 'diagnostic' && calls++ < 3) void session.dispose() })
    await expect(session.dispose()).rejects.toBeTruthy()
    await guard.settle()
    expect(calls).toBeLessThanOrEqual(3)
    runtime.terminateBehavior = 'exit'
    await session.dispose()
    expect(rig.retained()).toBe(0)
    await guard.settle()
  })

  it('does not leave timers behind after success, failure and timeout paths', async () => {
    const rig = makeRig()
    await tick(5)
    const before = activeTimeouts()
    const ok = await rig.create(); await ok.dispose()
    rig.knobs.terminate = 'hang'
    const stuck = await rig.create(); await stuck.dispose().catch(() => undefined)
    rig.runtimes[1]!.terminateBehavior = 'exit'
    await stuck.dispose()
    await rig.provider.releaseRuntimes().catch(() => undefined)
    await rig.provider.dispose()
    await guard.settle(); await tick(30)
    expect(activeTimeouts()).toBeLessThanOrEqual(before)
  })
})

describe('model probe: a failed catalog request keeps its own error when the cleanup is also unconfirmed (spec §3.6 item 9)', () => {
  it('Claude: listModels keeps the catalog error and retains the handle', async () => {
    const rig = claudeRig(); rig.knobs.terminate = 'hang'; rig.flags.failModelsFromCall = 2
    const error = await rig.models().then(() => undefined, (e: { code?: string; message: string }) => e)
    expect(error?.message).toMatch(/W8 catalog request failed/)
    expect(rig.retained()).toBe(1)
    rig.runtimes[0]!.terminateBehavior = 'exit'
    await rig.provider.releaseRuntimes()
    expect(rig.retained()).toBe(0)
    await guard.settle()
  })

  it('Codex: the same contract (the spec says the probe behaves alike for both providers)', async () => {
    const rig = codexRig(); rig.knobs.terminate = 'hang'; rig.knobs.failModelList = true
    const error = await rig.models().then(() => undefined, (e: { code?: string; message: string }) => e)
    // eslint-disable-next-line no-console
    console.log(`[W8] codex listModels catalog failure + unconfirmed cleanup surfaces: ${error?.code} / ${error?.message}`)
    expect(rig.retained()).toBe(1)
    rig.runtimes[0]!.terminateBehavior = 'exit'
    await rig.provider.releaseRuntimes()
    expect(rig.retained()).toBe(0)
    expect(error?.message).toMatch(/catalog request failed/) // fails: the finally-throw replaces it with stop_cleanup_failed
    await guard.settle()
  })
})

describe('events of an unconfirmed dispose (spec §3.6 item 9, first bullet)', () => {
  it.each([['codex', codexRig], ['claude', claudeRig]] as const)('%s: session.state(closed) and session.closed are emitted before the rejection is reported, exactly once across retries', async (_name, makeRig) => {
    const rig = makeRig(); rig.knobs.terminate = 'hang'
    const session = await rig.create(); const events = record(session)
    let seenAtRejection: string[] = []
    await session.dispose().catch(() => { seenAtRejection = types(events) })
    expect(seenAtRejection).toEqual(expect.arrayContaining(['session.state', 'session.closed']))
    expect(session.state).toBe('closed')
    await session.dispose().catch(() => undefined)
    rig.runtimes[0]!.terminateBehavior = 'exit'
    await session.dispose()
    expect(types(events).filter((t) => t === 'session.closed')).toHaveLength(1)
    expect(types(events).filter((t) => t === 'session.state')).toHaveLength(1)
    await guard.settle()
  })
})

describe.each([['codex', codexRig], ['claude', claudeRig]] as const)('%s: documented release semantics (spec §3.6 item 9)', (_name, makeRig) => {
  it('model probes are gated by an in-flight release of the same scope, with invalid_state', async () => {
    const rig = makeRig(); const session = await rig.create(DEFAULT_CWD); void session
    let open!: () => void
    rig.runtimes[0]!.terminateGate = new Promise<void>((resolve) => { open = resolve })
    const release = rig.provider.releaseRuntimes()
    await tick(20)
    await expect(rig.models(DEFAULT_CWD)).rejects.toMatchObject({ code: 'invalid_state' })
    open(); await release
    expect((await rig.models(DEFAULT_CWD)).length).toBe(1) // gate lifted
    await guard.settle()
  })

  it('a failing releaseRuntimes() re-terminates the same stuck handle twice (Session driver once, Provider once) using the Session\'s registered waits', async () => {
    const rig = makeRig(); rig.knobs.terminate = 'hang'
    const session = await rig.create(); const runtime = rig.runtimes[0]!
    await session.dispose().catch(() => undefined)
    const afterSession = runtime.terminateCalls.length
    await rig.provider.releaseRuntimes().catch(() => undefined)
    expect(runtime.terminateCalls.length - afterSession).toBe(2)
    const providerCall = runtime.terminateCalls.at(-1)
    expect(providerCall).toEqual({ graceMs: 1, killWaitMs: 1 }) // the Session's timeouts, not the defaults
    runtime.terminateBehavior = 'exit'
    await rig.provider.releaseRuntimes()
    await guard.settle()
  })
})

describe('ProviderRegistry.shutdownAll', () => {
  it('attempts every provider, rejects with an AggregateError naming each failure, and succeeds after the retry', async () => {
    const codex = codexRig(); const claude = claudeRig()
    codex.knobs.terminate = 'hang'
    await codex.create(); await claude.create()
    const registry = new ProviderRegistry(); registry.register(codex.provider); registry.register(claude.provider)
    const error = await registry.shutdownAll().then(() => undefined, (e: unknown) => e)
    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toHaveLength(1)
    expect(claude.runtimes[0]!.running).toBe(false) // second provider was still attempted
    expect(codex.runtimes[0]!.running).toBe(true)
    codex.runtimes[0]!.terminateBehavior = 'exit'
    await registry.shutdownAll()
    expect(codex.runtimes[0]!.running).toBe(false)
    expect(codex.retained()).toBe(0); expect(claude.retained()).toBe(0)
    await guard.settle()
  })
})
