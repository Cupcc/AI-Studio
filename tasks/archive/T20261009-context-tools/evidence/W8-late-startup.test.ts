// W8 独立评审：迟到 / 失败启动、探测与释放闸门的交互；以及 W6 列出的局限 (d)（启动工厂永不结算）。
import { afterAll, describe, expect, it } from 'vitest'
import { claudeRig, codexRig, DEFAULT_CWD, rejectionGuard, tick } from 'W8-support'

const guard = rejectionGuard()
afterAll(async () => { await guard.settle(); guard.stop(); expect(guard.seen).toEqual([]) })

const A = '/tmp/w8/proj-a'
const B = '/tmp/w8/proj-b'
const shortStartup = { timeouts: { startupMs: 60, requestMs: 200, terminateGraceMs: 1, killWaitMs: 1, disposeMs: 500 } }
const gate = () => { let open!: () => void; const promise = new Promise<void>((resolve) => { open = resolve }); return { promise, open } }

describe.each([['codex', codexRig], ['claude', claudeRig]] as const)('%s', (_name, makeRig) => {
  it('startup timeout then late Runtime: the late handle is terminated; with an unconfirmed exit it stays retained and retryable', async () => {
    for (const behavior of ['exit', 'hang'] as const) {
      const rig = makeRig(); const g = gate()
      rig.knobs.startGate = g.promise; rig.knobs.terminate = behavior
      // Neither provider can reject before the spawn settles (Codex waits in RuntimeSlot, Claude in the spawn bridge): open late.
      setTimeout(g.open, 150)
      const error = await rig.create(A, shortStartup).then(() => undefined, (e: { code: string; message: string }) => e)
      expect(error).toBeDefined()
      expect(error!.code).not.toBe('stop_cleanup_failed')
      await tick(250); await guard.settle() // Claude rejects at startupMs, before the late spawn lands at 150 ms
      expect(rig.runtimes).toHaveLength(1)
      if (behavior === 'exit') {
        expect(rig.runtimes[0]!.running).toBe(false); expect(rig.retained()).toBe(0)
        await rig.provider.releaseRuntimes(A)
      } else {
        expect(rig.retained()).toBe(1)
        await expect(rig.provider.releaseRuntimes(A)).rejects.toBeInstanceOf(AggregateError)
        rig.runtimes[0]!.terminateBehavior = 'exit'
        await rig.provider.releaseRuntimes(A)
        expect(rig.retained()).toBe(0); expect(rig.runtimes[0]!.running).toBe(false)
      }
      expect(rig.tracked()).toBe(0)
    }
  })

  it('releaseRuntimes(B) does not wait for an in-flight startup that belongs to Project A', async () => {
    const rig = makeRig(); const g = gate()
    const other = await rig.create(B)
    rig.knobs.startGate = g.promise; rig.knobs.gateCwd = A
    const creating = rig.create(A).then((session) => session, (error: unknown) => error)
    await tick(30)
    const started = Date.now()
    await rig.provider.releaseRuntimes(B)
    expect(Date.now() - started).toBeLessThan(500)
    expect(other.state).toBe('closed')
    g.open()
    expect(await creating).toBeDefined()
    await rig.provider.releaseRuntimes()
    expect(rig.runtimes.every((runtime) => !runtime.running)).toBe(true)
    await guard.settle()
  })

  it('Provider.dispose() during an in-flight startup waits for it and leaves no running Runtime', async () => {
    const rig = makeRig(); const g = gate()
    rig.knobs.startGate = g.promise
    const creating = rig.create(A).then(() => 'resolved', (error: { code: string }) => error.code)
    await tick(30)
    let disposed = false
    const dispose = rig.provider.dispose().then(() => { disposed = true })
    await tick(30)
    expect(disposed).toBe(false)
    g.open(); await dispose
    const outcome = await creating
    // eslint-disable-next-line no-console
    console.log(`[W8] ${_name}: createSession during Provider.dispose() ->`, outcome)
    expect(outcome).not.toBe('resolved') // a Session must not be handed out by a Provider that has been disposed
    expect(rig.runtimes.every((runtime) => !runtime.running)).toBe(true)
    expect(rig.retained()).toBe(0)
    await guard.settle()
  })

  it('DOCUMENTED LIMITATION (d): releaseRuntimes(cwd) has no upper bound while a startup factory never settles, and keeps gating that Project', async () => {
    const rig = makeRig(); const g = gate()
    rig.knobs.startGate = g.promise; rig.knobs.gateCwd = A
    const creating = rig.create(A, shortStartup).then(() => 'resolved', (error: { code: string }) => error.code)
    await tick(30)
    let settled = false
    const release = rig.provider.releaseRuntimes(A).then(() => { settled = true }, () => { settled = true })
    await tick(500)
    expect(settled).toBe(false) // still pending long after startupMs (60) + disposeMs (500) of the Session
    await expect(rig.create(A)).rejects.toMatchObject({ code: 'invalid_state' }) // Project A stays gated while pending
    await expect(rig.create(B)).resolves.toBeDefined() // other Projects are unaffected
    g.open(); await release
    expect(settled).toBe(true)
    await creating
    await rig.provider.releaseRuntimes()
    expect(rig.runtimes.every((runtime) => !runtime.running)).toBe(true)
    await guard.settle()
  })

  it('fire-and-forget rejecting session.dispose() / releaseRuntimes() never become unhandled rejections', async () => {
    const rig = makeRig(); rig.knobs.terminate = 'hang'
    const session = await rig.create(A)
    void session.dispose()
    void rig.provider.releaseRuntimes()
    void rig.provider.releaseRuntimes(A)
    await tick(100); await guard.settle()
    expect(guard.seen).toEqual([])
    rig.runtimes[0]!.terminateBehavior = 'exit'
    await rig.provider.dispose()
    expect(rig.retained()).toBe(0)
  })
})

describe('REGRESSION (W8-F6, fixed in 81db33c): Provider.dispose() never creates an unhandled rejection when the caller drops the promise', () => {
  it('Codex and Claude both pre-handle the shared disposal promise; awaiting callers still see the failure and the retry works', async () => {
    const outcome: Record<string, number> = {}
    for (const [name, make] of [['codex', codexRig], ['claude', claudeRig]] as const) {
      const rig = make(); rig.knobs.terminate = 'hang'
      await rig.create(A)
      guard.seen.length = 0
      void rig.provider.dispose() // caller drops the rejecting promise
      await tick(50); await guard.settle()
      outcome[name] = guard.seen.length
      guard.seen.length = 0
      // an awaiting caller still sees the failure (the dropped call above did not swallow it)
      expect(await rig.provider.dispose().then(() => 'resolved', () => 'rejected')).toBe('rejected')
      rig.runtimes[0]!.terminateBehavior = 'exit'
      await rig.provider.dispose()
    }
    // eslint-disable-next-line no-console
    console.log('[W8] unhandled rejections after `void provider.dispose()` with an unconfirmed exit:', JSON.stringify(outcome))
    expect(outcome).toEqual({ codex: 0, claude: 0 })
  })
})

describe('model probe started late (Codex checkAvailability / Claude listModels with an aborted wait)', () => {
  it('Codex: a probe Runtime that arrives after the catalog timeout is terminated and, if unconfirmed, retained for release', async () => {
    for (const behavior of ['exit', 'hang'] as const) {
      const rig = codexRig(); const g = gate()
      rig.knobs.startGate = g.promise; rig.knobs.terminate = behavior
      const report = await rig.provider.checkAvailability({ environment: { env: { PATH: '/test/bin' } }, includeModels: true, timeoutMs: 60 })
      expect(report.models.status).toBe('failed')
      g.open(); await tick(80); await guard.settle()
      expect(rig.runtimes).toHaveLength(1)
      if (behavior === 'exit') { expect(rig.runtimes[0]!.running).toBe(false); expect(rig.retained()).toBe(0) }
      else {
        expect(rig.retained()).toBe(1)
        await expect(rig.provider.releaseRuntimes()).rejects.toBeInstanceOf(AggregateError)
        rig.runtimes[0]!.terminateBehavior = 'exit'
        await rig.provider.releaseRuntimes()
        expect(rig.retained()).toBe(0)
      }
    }
  })

  it('Claude: a listModels Runtime that finishes starting after the caller aborted is terminated and, if unconfirmed, retained for release', async () => {
    for (const behavior of ['exit', 'hang'] as const) {
      const rig = claudeRig(); const g = gate()
      rig.knobs.startGate = g.promise; rig.knobs.terminate = behavior
      setTimeout(g.open, 150)
      const error = await rig.provider.listModels({ environment: { env: { PATH: '/test/bin' } }, cwd: DEFAULT_CWD, signal: AbortSignal.timeout(60) }).then(() => undefined, (e: unknown) => e)
      await tick(80); await guard.settle()
      expect(rig.runtimes).toHaveLength(1)
      // eslint-disable-next-line no-console
      console.log(`[W8] claude listModels after abort (${behavior}):`, error === undefined ? 'resolved' : `rejected ${(error as { code?: string }).code}`)
      if (behavior === 'exit') { expect(rig.runtimes[0]!.running).toBe(false); expect(rig.retained()).toBe(0) }
      else {
        expect(rig.retained()).toBe(1)
        await expect(rig.provider.releaseRuntimes()).rejects.toBeInstanceOf(AggregateError)
        rig.runtimes[0]!.terminateBehavior = 'exit'
        await rig.provider.releaseRuntimes()
        expect(rig.retained()).toBe(0)
      }
    }
  })
})
