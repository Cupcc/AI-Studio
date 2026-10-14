// W8 独立评审：RuntimeProcess 严格终止的真实本地子进程验证（仅 /bin/sh、sleep、ps；无 CLI、无模型）。
// 覆盖：退出确认 / 可重试 / PID 复用不误杀 / 已退出句柄不再发组信号 / 无遗留定时器。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { RuntimeProcess } from '@w8/core/runtime-process.js'
import { RuntimeResources } from '@w8/core/runtime-resources.js'
import { PsProcessLister, type ProcessInfo, type ProcessLister } from '@w8/core/process-probe.js'
import { activeTimeouts, tick } from './W8-support'

const ps = new PsProcessLister()
const strays: Array<{ pid: number; startedAt: string }> = []
const runtimes: RuntimeProcess[] = []
const env = { PATH: '/bin:/usr/bin' }

async function launch(script: string, lister?: ProcessLister) {
  const runtime = await RuntimeProcess.start({ command: '/bin/sh', args: ['-c', script], cwd: tmpdir(), env, label: 'w8', ...(lister ? { lister } : {}) })
  runtimes.push(runtime)
  return runtime
}
function firstNumber(runtime: RuntimeProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no pid printed')), 5000)
    runtime.stdout.once('data', (chunk: Buffer) => { clearTimeout(timer); resolve(Number(String(chunk).trim().split('\n')[0])) })
  })
}
async function row(pid: number): Promise<ProcessInfo | undefined> {
  return (await ps.list()).find((p) => p.pid === pid && !p.state.startsWith('Z'))
}
async function remember(pid: number) {
  const info = await row(pid)
  if (info) strays.push({ pid, startedAt: info.startedAt })
  return info
}
const alive = async (pid: number, startedAt?: string) => { const info = await row(pid); return !!info && (startedAt === undefined || info.startedAt === startedAt) }

afterEach(async () => {
  vi.restoreAllMocks()
  // Test hygiene: kill only test-owned leftovers, and only when the recorded identity still matches.
  for (const stray of strays.splice(0)) {
    const info = await row(stray.pid)
    if (info && info.startedAt === stray.startedAt) { try { process.kill(stray.pid, 'SIGKILL') } catch { /* gone */ } }
  }
  for (const runtime of runtimes.splice(0)) if (runtime.running) { try { process.kill(-runtime.pid!, 'SIGKILL') } catch { /* gone */ } }
})

describe('RuntimeProcess.terminate with real processes', () => {
  it('confirms exit of a TERM/HUP-ignoring runtime and its same-group child, escalating to SIGKILL', async () => {
    const runtime = await launch(`trap '' TERM HUP; sleep 300 >/dev/null 2>&1 & echo $!; while true; do sleep 1; done`)
    const child = await firstNumber(runtime)
    const childInfo = await remember(child)
    expect(childInfo).toBeDefined()
    const report = await runtime.terminate({ graceMs: 300, killWaitMs: 2000 })
    expect(report).toMatchObject({ confirmed: true, forced: true })
    expect(report.survivors).toEqual([])
    expect(await alive(child, childInfo!.startedAt)).toBe(false)
  })

  it('INVARIANT: a confirmed report never coexists with a live member of the runtime process group (leader exited on its own, group member never sampled)', async () => {
    const runtime = await launch(`sleep 300 >/dev/null 2>&1 & echo $!; exit 0`)
    const orphan = await firstNumber(runtime)
    const orphanInfo = await remember(orphan)
    expect(orphanInfo?.pgid).toBe(runtime.pid)
    await runtime.exited
    expect(await alive(orphan, orphanInfo!.startedAt)).toBe(true) // orphaned, same group, still running
    const report = await runtime.terminate({ graceMs: 200, killWaitMs: 800 })
    const stillAlive = await alive(orphan, orphanInfo!.startedAt)
    // eslint-disable-next-line no-console
    console.log(`[W8] orphan group member after leader self-exit: confirmed=${report.confirmed} survivors=${report.survivors.length} orphanAlive=${stillAlive}`)
    expect(report.confirmed && stillAlive).toBe(false)
  })

  it('INVARIANT (normal terminate): the leader exits on SIGTERM while a SIGTERM-ignoring same-group orphan (ppid 1, not reachable by the parent chain) lives on: never confirmed over it', async () => {
    // inner sh ignores TERM, backgrounds `sleep`, prints its pid and exits -> sleep is reparented to launchd but keeps the runtime's pgid.
    const runtime = await launch(`sh -c 'trap "" TERM; sleep 300 >/dev/null 2>&1 & echo $!'; while true; do sleep 1; done`)
    const orphan = await firstNumber(runtime)
    const orphanInfo = await remember(orphan)
    expect(orphanInfo).toMatchObject({ pgid: runtime.pid, ppid: 1 })
    const report = await runtime.terminate({ graceMs: 600, killWaitMs: 1500 })
    const stillAlive = await alive(orphan, orphanInfo!.startedAt)
    // eslint-disable-next-line no-console
    console.log(`[W8] SIGTERM-ignoring same-group orphan after normal terminate(): confirmed=${report.confirmed} forced=${report.forced} survivors=${report.survivors.length} orphanAlive=${stillAlive}`)
    expect(report.confirmed && stillAlive).toBe(false)
  })

  it('control: the same orphan IS found and killed when it was sampled while the leader was still running', async () => {
    const runtime = await launch(`sleep 300 >/dev/null 2>&1 & echo $!; sleep 1.5; exit 0`)
    const orphan = await firstNumber(runtime)
    const orphanInfo = await remember(orphan)
    const sampled = await runtime.snapshotDescendants()
    expect(sampled.map((p) => p.pid)).toContain(orphan)
    await runtime.exited
    const report = await runtime.terminate({ graceMs: 200, killWaitMs: 1500 })
    expect(report.confirmed).toBe(true)
    expect(await alive(orphan, orphanInfo!.startedAt)).toBe(false)
  })

  // Real recycled pids cannot be forced, so the table is spoofed: the lister claims the pid of a real, unrelated
  // `sleep` (the bystander) as a child of the runtime, once under a wrong start time and once under its real one.
  async function claimScenario(claimStart: 'wrong' | 'real') {
    const bystander = await launch('sleep 300')
    const real = (await remember(bystander.pid!))!
    let phase: 'record' | 'verify' = 'record'
    let target: RuntimeProcess | undefined
    const lister: ProcessLister = { list: async () => {
      const rows = (await ps.list()).filter((p) => p.pid !== real.pid)
      return phase === 'record'
        ? [...rows, { ...real, ppid: target!.pid!, pgid: real.pid, startedAt: claimStart === 'wrong' ? 'Thu Jan  1 00:00:00 2026' : real.startedAt }]
        : [...rows, real]
    } }
    target = await launch('sleep 1; exit 0', lister)
    const recorded = await target.snapshotDescendants()
    expect(recorded.map((p) => p.pid)).toEqual([real.pid])
    phase = 'verify'
    await target.exited
    const kill = vi.spyOn(process, 'kill')
    const report = await target.terminate({ graceMs: 100, killWaitMs: 400 })
    const calls = kill.mock.calls.map(([pid, signal]) => [pid, signal] as [number, unknown])
    kill.mockRestore()
    return { real, report, calls, bystanderAlive: await alive(real.pid, real.startedAt) }
  }

  it('never signals a pid whose recorded identity (pid + start time) no longer matches', async () => {
    const { real, report, calls, bystanderAlive } = await claimScenario('wrong')
    expect(calls.filter(([pid]) => Math.abs(pid) === real.pid)).toEqual([])
    expect(report.confirmed).toBe(true)
    expect(bystanderAlive).toBe(true)
  })

  it('control: a recorded identity that still matches IS signalled (so the previous test proves the identity check, not an inert path)', async () => {
    const { real, calls, bystanderAlive } = await claimScenario('real')
    expect(calls.some(([pid, signal]) => pid === real.pid && signal === 'SIGKILL')).toBe(true)
    expect(bystanderAlive).toBe(false)
  })

  it('after the leader exited, a retry never sends a signal to -pid or the numeric runtime pid', async () => {
    let failing = true
    const lister: ProcessLister = { list: async () => { if (failing) throw new Error('W8 ps unavailable'); return ps.list() } }
    const runtime = await launch('exit 0', lister)
    await runtime.exited
    const kill = vi.spyOn(process, 'kill')
    const first = await runtime.terminate({ graceMs: 50, killWaitMs: 120 })
    expect(first.confirmed).toBe(false)
    failing = false
    const second = await runtime.terminate({ graceMs: 50, killWaitMs: 120 })
    expect(second.confirmed).toBe(true)
    expect(kill.mock.calls.filter(([pid]) => Math.abs(pid as number) === runtime.pid)).toEqual([])
  })

  it('unconfirmed attempts are dropped (retry on the same handle); pending and confirmed attempts are shared', async () => {
    let failing = true; let listCalls = 0
    const lister: ProcessLister = { list: async () => { listCalls++; if (failing) throw new Error('W8 ps unavailable'); return ps.list() } }
    const runtime = await launch('exit 0', lister)
    await runtime.exited
    const a = runtime.terminate({ graceMs: 50, killWaitMs: 100 }); const b = runtime.terminate()
    expect(a).toBe(b)
    expect((await a).confirmed).toBe(false)
    failing = false
    const retry = runtime.terminate({ graceMs: 50, killWaitMs: 100 })
    expect(retry).not.toBe(a)
    const report = await retry
    expect(report.confirmed).toBe(true)
    const calls = listCalls
    expect(runtime.terminate()).toBe(retry)
    await runtime.terminate()
    expect(listCalls).toBe(calls)
    expect(runtime.exitInfo).toBeDefined()
  })

  it('leaves no timer behind when the runtime exits during the grace period', async () => {
    const runtime = await launch('exec sleep 60')
    await tick(100)
    const before = activeTimeouts()
    const report = await runtime.terminate({ graceMs: 5000, killWaitMs: 5000 })
    expect(report.confirmed).toBe(true); expect(report.forced).toBe(false)
    await tick(50)
    expect(activeTimeouts()).toBeLessThanOrEqual(before)
  })

  it('TIMING (limitation b, handles started WITHOUT registered waits, e.g. a Codex model probe): the Provider-level retry uses the 2 s / 3 s defaults', async () => {
    // A survivor that never dies (pid far outside the OS range, so signalling it is a harmless ESRCH) keeps every attempt unconfirmed.
    const ghost: ProcessInfo = { pid: 4_194_304, ppid: 0, pgid: 4_194_304, state: 'S', startedAt: 'Thu Jan  1 00:00:00 2026', command: 'W8 ghost survivor' }
    let owner: number | undefined
    const lister: ProcessLister = { list: async () => [...(await ps.list()), { ...ghost, ppid: owner ?? 0 }] }
    const resources = new RuntimeResources()
    const runtime = await resources.start({ command: '/bin/sh', args: ['-c', 'sleep 1.2; exit 0'], cwd: tmpdir(), env, label: 'w8', lister }, RuntimeProcess.start)
    runtimes.push(runtime as RuntimeProcess); owner = runtime.pid
    await runtime.snapshotDescendants() // records the ghost while the runtime is still running
    await runtime.exited
    const driverStart = Date.now()
    const first = await runtime.terminate({ graceMs: 50, killWaitMs: 100 }) // what a driver with short Session timeouts does
    const driverMs = Date.now() - driverStart
    expect(first.confirmed).toBe(false)
    const retryStart = Date.now()
    await expect(resources.release(undefined, async () => undefined)).rejects.toBeInstanceOf(AggregateError)
    const retryMs = Date.now() - retryStart
    // eslint-disable-next-line no-console
    console.log(`[W8] driver attempt (killWait 100 ms) took ${driverMs} ms; Provider-level retry took ${retryMs} ms (default killWait 3000 ms)`)
    expect(retryMs).toBeGreaterThan(2500)
    expect(resources.retained).toBe(1)
  }, 15_000)

  it('REGRESSION (W8-F4, fixed in 81db33c): processLike().kill() on an already exited runtime sends no signal to -pid', async () => {
    const runtime = await launch('exit 0')
    await runtime.exited
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true) // never signal for real
    const result = runtime.processLike().kill('SIGTERM')
    const signals = kill.mock.calls.filter(([pid]) => Math.abs(pid as number) === runtime.pid!)
    // eslint-disable-next-line no-console
    console.log(`[W8] processLike().kill() after exit sent ${signals.length} signal(s) naming the runtime pid / group; returned ${result}`)
    expect(signals).toEqual([])
  })

  it('REGRESSION (limitation b fixed): a Runtime started with registered terminate waits is re-terminated by the Provider with those waits, not the 2 s / 3 s defaults', async () => {
    const ghost: ProcessInfo = { pid: 4_194_304, ppid: 0, pgid: 4_194_304, state: 'S', startedAt: 'Thu Jan  1 00:00:00 2026', command: 'W8 ghost survivor' }
    let owner: number | undefined
    const lister: ProcessLister = { list: async () => [...(await ps.list()), { ...ghost, ppid: owner ?? 0 }] }
    const resources = new RuntimeResources()
    const runtime = await resources.start({ command: '/bin/sh', args: ['-c', 'sleep 1.2; exit 0'], cwd: tmpdir(), env, label: 'w8', lister,
      terminate: { graceMs: 50, killWaitMs: 100 } } as never, RuntimeProcess.start)
    runtimes.push(runtime as RuntimeProcess); owner = runtime.pid
    await runtime.snapshotDescendants()
    await runtime.exited
    const first = await runtime.terminate({ graceMs: 50, killWaitMs: 100 })
    expect(first.confirmed).toBe(false)
    const started = Date.now()
    await expect(resources.release(undefined, async () => undefined)).rejects.toBeInstanceOf(AggregateError)
    const retryMs = Date.now() - started
    // eslint-disable-next-line no-console
    console.log(`[W8] Provider-level retry with registered waits (killWait 100 ms) took ${retryMs} ms`)
    expect(retryMs).toBeLessThan(1500)
    expect(resources.retained).toBe(1)
  }, 15_000)
})
