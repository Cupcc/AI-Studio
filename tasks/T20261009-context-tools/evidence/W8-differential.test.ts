// W8 差分验证：同一脚本分别在基线 2f4bb5a 与被评审（清理）源码上运行，回答
// 「Stop / 模型 / 事件行为是否未变」以及「哪些行为是有意的契约变化 / 哪些是回归」。
// 需要 W8_BASE_SRC（见 W8-vitest.config.ts 注释）；未设置时全部跳过，不影响其它用例。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { claudeRig, codexRig, currentClaudeMods, currentMods, tick, type ClaudeMods, type CodexMods } from './W8-support'
import { PsProcessLister } from '@w8/core/process-probe.js'
import type { AgentSession } from '@w8/provider.js'

const hasBase = !!process.env.W8_BASE_SRC
const strays: Array<{ pid: number; startedAt: string }> = []
const ps = new PsProcessLister()
afterEach(async () => {
  for (const stray of strays.splice(0)) {
    const info = (await ps.list()).find((p) => p.pid === stray.pid)
    if (info && info.startedAt === stray.startedAt) { try { process.kill(stray.pid, 'SIGKILL') } catch { /* gone */ } }
  }
})

async function baseMods(): Promise<CodexMods> {
  const [{ CodexProvider }, { FakeRuntime }, { ScriptedJsonRpcServer, ScriptedRpcError }] = await Promise.all([
    import('@w8base/codex/index.js'), import('@w8base/testing/fake-runtime.js'), import('@w8base/testing/fake-transport.js')
  ])
  return { CodexProvider, FakeRuntime, ScriptedJsonRpcServer, ScriptedRpcError } as unknown as CodexMods
}

async function baseClaudeMods(): Promise<ClaudeMods> {
  const [{ ClaudeProvider }, { FakeRuntime }] = await Promise.all([import('@w8base/claude/index.js'), import('@w8base/testing/fake-runtime.js')])
  return { ClaudeProvider, FakeRuntime } as unknown as ClaudeMods
}

const volatile = new Set(['createdAt', 'at', 'seq', 'sessionId', 'providerId', 'turnId', 'requestId', 'itemId', 'nativeSessionId', 'startedAt', 'completedAt', 'requestedAt', 'durationMs', 'exitedAt', 'pid', 'nativeTurnId'])
function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !volatile.has(key)).map(([key, inner]) => [key, shape(inner)]))
  }
  return value
}

/** One scripted Session life: model change, completed turn, plain Stop, Stop that falls back to a Runtime replacement, continue. */
async function lifecycle(mods: CodexMods) {
  const rig = codexRig(mods)
  const session = await rig.create()
  const events: unknown[] = []
  session.subscribe((event) => { events.push(shape(event)) })
  await session.setModel('m2')
  await rig.start(session, 'one'); rig.complete(session); await tick(10)
  await rig.start(session, 'two')
  const plainStop = await session.stop()
  await rig.start(session, 'three'); rig.command(session)
  const fallbackStop = await session.stop()
  await rig.start(session, 'four'); rig.complete(session); await tick(10)
  const midSequence = events.length
  return { rig, session, events, midSequence, stops: shape([plainStop, fallbackStop]),
    terminateOptions: rig.runtimes.map((runtime) => runtime.terminateCalls), runtimeStates: rig.runtimes.map((runtime) => runtime.running) }
}

describe.skipIf(!hasBase)('Stop / model / event behaviour: baseline 2f4bb5a vs reviewed source', () => {
  it('produces identical event streams, Stop results, Runtime counts and terminate options for the scripted lifecycle', async () => {
    const before = await lifecycle(await baseMods())
    const after = await lifecycle(currentMods)
    expect(after.events).toEqual(before.events)
    expect(after.stops).toEqual(before.stops)
    expect(after.terminateOptions).toEqual(before.terminateOptions)
    expect(after.runtimeStates).toEqual(before.runtimeStates)
    expect(after.rig.runtimes).toHaveLength(2) // Stop fallback replaced the Runtime exactly once
    expect(after.rig.retained()).toBe(1) // the replaced (confirmed) handle left the retained set; only the live one remains
    await after.session.dispose()
    expect(after.rig.retained()).toBe(0)
    await before.session.dispose()
  })

  it('INTENDED CHANGE: Stop failure now leaves an unconfirmed handle that dispose() reports (base swallowed it)', async () => {
    for (const [label, mods] of [['base', await baseMods()], ['reviewed', currentMods]] as const) {
      const rig = codexRig(mods)
      const session = await rig.create()
      await rig.start(session); rig.command(session)
      rig.runtimes[0]!.terminateBehavior = 'survivors'
      const outcome = await session.stop().catch((error: unknown) => ({ rejected: String(error) }))
      const closedReason = session.state
      const disposed = await session.dispose().then(() => 'resolved', () => 'rejected')
      // eslint-disable-next-line no-console
      console.log(`[W8] ${label}: stop=${JSON.stringify(shape(outcome)).slice(0, 120)} state=${closedReason} dispose()=${disposed}`)
      if (label === 'base') expect(disposed).toBe('resolved')
      else expect(disposed).toBe('rejected')
      rig.runtimes[0]!.terminateBehavior = 'exit'
      await session.dispose().catch(() => undefined)
    }
  })

  it('EVENT ORDER of an explicit dispose() (reported, not asserted equal): base vs reviewed', async () => {
    const orders: Record<string, string[]> = {}
    for (const [label, mods] of [['base', await baseMods()], ['reviewed', currentMods]] as const) {
      const rig = codexRig(mods)
      const session = await rig.create()
      const types: string[] = []
      session.subscribe((event) => { types.push(event.type) })
      await session.dispose()
      orders[label] = types
    }
    // eslint-disable-next-line no-console
    console.log(`[W8] dispose() event order\n  base:     ${orders.base!.join(' > ')}\n  reviewed: ${orders.reviewed!.join(' > ')}`)
    expect([...orders.reviewed!].sort()).toEqual([...orders.base!].sort())
    // The documented behaviour is "session.closed is Session-level terminal"; consumers must not require runtime.exited first.
    expect(orders.reviewed).toEqual(orders.base)
  })

  it('Codex: dispose() with a pending approval releases it identically (events and native answer)', async () => {
    const run = async (mods: CodexMods) => {
      const rig = codexRig(mods)
      const session = await rig.create()
      const events: unknown[] = []
      session.subscribe((event) => { events.push(shape(event)) })
      await rig.start(session, 'needs approval')
      const answer = rig.servers[0]!.request('item/commandExecution/requestApproval', { threadId: session.nativeSessionId, turnId: session.activeTurn!.nativeTurnId,
        itemId: 'approval-item', command: 'rm -rf build', cwd: '/tmp/w8/project-a', availableDecisions: ['accept', 'decline', 'cancel'] })
        .then((value) => ({ answer: value }), (error: Error) => ({ error: error.message }))
      await tick(20)
      expect(session.pendingInputs).toHaveLength(1)
      await session.dispose()
      return { events, native: await Promise.race([answer, tick(150).then(() => 'no native answer')]) }
    }
    const before = await run(await baseMods()); const after = await run(currentMods)
    // eslint-disable-next-line no-console
    console.log('[W8] pending approval on dispose: base native =', JSON.stringify(before.native), '| reviewed native =', JSON.stringify(after.native))
    expect(after.events).toEqual(before.events)
    expect(after.native).toEqual(before.native)
  })

  it('Claude: identical event streams, Stop results and Runtime counts for turn / Stop / continue; dispose() event order reported', async () => {
    const run = async (mods: ClaudeMods) => {
      const rig = claudeRig(mods)
      const session = await rig.create()
      const events: unknown[] = []
      session.subscribe((event) => { events.push(shape(event)) })
      const query = rig.queries.at(-1)!
      query.init(); await tick(5)
      await session.setModel('sonnet')
      await session.sendUserInput({ text: 'one' }); await tick(5); query.end(); await tick(10)
      await session.sendUserInput({ text: 'two' }); await tick(5)
      const stop = await session.stop()
      await session.sendUserInput({ text: 'three' }); await tick(5); query.end(); await tick(10)
      const beforeDispose = events.length
      const types: string[] = []
      session.subscribe((event) => { types.push(event.type) })
      await session.dispose()
      return { events: events.slice(0, beforeDispose), stop: shape(stop), runtimes: rig.runtimes.length, order: types }
    }
    const before = await run(await baseClaudeMods())
    const after = await run(currentClaudeMods)
    // eslint-disable-next-line no-console
    console.log(`[W8] Claude dispose() event order (new subscriber)\n  base:     ${before.order.join(' > ')}\n  reviewed: ${after.order.join(' > ')}`)
    expect(after.events).toEqual(before.events)
    expect(after.stop).toEqual(before.stop)
    expect(after.runtimes).toBe(before.runtimes)
    expect(after.order).toEqual(before.order)
  })

  it('REGRESSION (W8-F1 fixed in 81db33c): a never-sampled orphan of the runtime process group is cleaned after the leader self-exits, as in the baseline', async () => {
    const runOnce = async (label: string, RuntimeProcessClass: typeof import('@w8/core/runtime-process.js').RuntimeProcess) => {
      const runtime = await RuntimeProcessClass.start({ command: '/bin/sh', args: ['-c', 'sleep 300 >/dev/null 2>&1 & echo $!; exit 0'], cwd: tmpdir(), env: { PATH: '/bin:/usr/bin' }, label: 'w8' })
      const orphan = await new Promise<number>((resolve) => runtime.stdout.once('data', (chunk: Buffer) => resolve(Number(String(chunk).trim()))))
      const info = (await ps.list()).find((p) => p.pid === orphan)!
      strays.push({ pid: orphan, startedAt: info.startedAt })
      await runtime.exited
      const report = await runtime.terminate({ graceMs: 200, killWaitMs: 800 })
      const orphanAlive = (await ps.list()).some((p) => p.pid === orphan && p.startedAt === info.startedAt && !p.state.startsWith('Z'))
      // eslint-disable-next-line no-console
      console.log(`[W8] ${label}: confirmed=${report.confirmed} survivors=${report.survivors.length} orphanAlive=${orphanAlive}`)
      return { confirmed: report.confirmed, orphanAlive }
    }
    const baseModule = await import('@w8base/core/runtime-process.js')
    const base = await runOnce('base', baseModule.RuntimeProcess as never)
    const reviewed = await runOnce('reviewed', (await import('@w8/core/runtime-process.js')).RuntimeProcess)
    expect(base).toEqual({ confirmed: true, orphanAlive: false })
    expect(reviewed).toEqual({ confirmed: true, orphanAlive: false })
    vi.restoreAllMocks()
  })
})

describe.skipIf(!hasBase)('SIGTERM-ignoring same-group orphan during a normal terminate(): baseline vs reviewed', () => {
  it('REGRESSION (W8-F1 fixed in 81db33c): a SIGTERM-ignoring same-group orphan is SIGKILLed during a normal terminate(), as in the baseline', async () => {
    const runOnce = async (label: string, RuntimeProcessClass: typeof import('@w8/core/runtime-process.js').RuntimeProcess) => {
      const runtime = await RuntimeProcessClass.start({ command: '/bin/sh', cwd: tmpdir(), env: { PATH: '/bin:/usr/bin' }, label: 'w8',
        args: ['-c', `sh -c 'trap "" TERM; sleep 300 >/dev/null 2>&1 & echo $!'; while true; do sleep 1; done`] })
      const orphan = await new Promise<number>((resolve) => runtime.stdout.once('data', (chunk: Buffer) => resolve(Number(String(chunk).trim()))))
      const info = (await ps.list()).find((p) => p.pid === orphan)!
      strays.push({ pid: orphan, startedAt: info.startedAt })
      const report = await runtime.terminate({ graceMs: 600, killWaitMs: 1500 })
      const orphanAlive = (await ps.list()).some((p) => p.pid === orphan && p.startedAt === info.startedAt && !p.state.startsWith('Z'))
      // eslint-disable-next-line no-console
      console.log(`[W8] ${label}: confirmed=${report.confirmed} forced=${report.forced} orphanAlive=${orphanAlive}`)
      return { confirmed: report.confirmed, orphanAlive }
    }
    const base = await runOnce('base', (await import('@w8base/core/runtime-process.js')).RuntimeProcess as never)
    const reviewed = await runOnce('reviewed', (await import('@w8/core/runtime-process.js')).RuntimeProcess)
    expect(base).toEqual({ confirmed: true, orphanAlive: false })
    expect(reviewed).toEqual({ confirmed: true, orphanAlive: false })
  })
})

export type { AgentSession }
