// W8 复验：对修复后的「同组成员记录 / 退出瞬间列表 / 条件收编」逻辑做真实进程的对抗测试。
// 只使用 /bin/sh、sleep、perl（setsid / setpgid）与 ps；无 CLI、无模型。每个用例只清理自己启动的残留（按 pid + 启动时间）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { RuntimeProcess } from '@w8/core/runtime-process.js'
import { PsProcessLister, type ProcessInfo, type ProcessLister } from '@w8/core/process-probe.js'
import { tick } from 'W8-support'

const ps = new PsProcessLister()
const strays: Array<{ pid: number; startedAt: string }> = []
const runtimes: RuntimeProcess[] = []
const env = { PATH: '/bin:/usr/bin' }

async function launch(script: string, lister?: ProcessLister) {
  const runtime = await RuntimeProcess.start({ command: '/bin/sh', args: ['-c', script], cwd: tmpdir(), env, label: 'w8-adopt', ...(lister ? { lister } : {}) })
  runtimes.push(runtime)
  return runtime
}
/** Line reader over the runtime's stdout: every printed integer is queued so later waits never miss earlier lines. */
const readers = new WeakMap<RuntimeProcess, { take(count: number): Promise<number[]> }>()
function reader(runtime: RuntimeProcess) {
  let existing = readers.get(runtime)
  if (existing) return existing
  const queue: number[] = []; let partial = ''; const waiters: Array<() => void> = []
  runtime.stdout.on('data', (chunk: Buffer) => {
    partial += String(chunk)
    const lines = partial.split('\n'); partial = lines.pop() ?? ''
    for (const line of lines) { const value = Number(line.trim()); if (line.trim() && Number.isInteger(value)) queue.push(value) }
    for (const wake of waiters.splice(0)) wake()
  })
  existing = { take(count: number) {
    return new Promise<number[]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`expected ${count} pids, queue ${JSON.stringify(queue)}`)), 5000)
      const check = () => { if (queue.length >= count) { clearTimeout(timer); resolve(queue.splice(0, count)) } else waiters.push(check) }
      check()
    })
  } }
  readers.set(runtime, existing)
  return existing
}
const pidsPrinted = (runtime: RuntimeProcess, count: number) => reader(runtime).take(count)
const row = async (pid: number): Promise<ProcessInfo | undefined> => (await ps.list()).find((p) => p.pid === pid && !p.state.startsWith('Z'))
async function track(pid: number) { const info = await row(pid); if (info) strays.push({ pid, startedAt: info.startedAt }); return info! }
const aliveAs = async (info: ProcessInfo) => { const now = await row(info.pid); return !!now && now.startedAt === info.startedAt }

afterEach(async () => {
  vi.restoreAllMocks()
  for (const stray of strays.splice(0)) {
    const info = await row(stray.pid)
    if (info && info.startedAt === stray.startedAt) { try { process.kill(stray.pid, 'SIGKILL') } catch { /* gone */ } }
  }
  for (const runtime of runtimes.splice(0)) if (runtime.running) { try { process.kill(-runtime.pid!, 'SIGKILL') } catch { /* gone */ } }
})

describe('F1 regression: same-group orphans are found and cleaned', () => {
  it('several orphans of mixed disposition after a leader self-exit (never sampled)', async () => {
    const runtime = await launch(`for i in 1 2 3; do sleep 300 >/dev/null 2>&1 & echo $!; done; (trap '' TERM; exec sleep 300 >/dev/null 2>&1) & echo $!; exit 0`)
    const orphans = await Promise.all((await pidsPrinted(runtime, 4)).map(track))
    expect(orphans.every((info) => info.pgid === runtime.pid)).toBe(true)
    await runtime.exited
    const report = await runtime.terminate({ graceMs: 200, killWaitMs: 1500 })
    expect(report.confirmed).toBe(true)
    expect(await Promise.all(orphans.map(aliveAs))).toEqual([false, false, false, false])
  })

  it('a member that appears after the last snapshot but before the exit is picked up by the exit-time listing', async () => {
    const runtime = await launch(`sleep 300 >/dev/null 2>&1 & echo $!; read go; sleep 300 >/dev/null 2>&1 & echo $!; exit 0`)
    const first = await track((await pidsPrinted(runtime, 1))[0]!)
    const sampled = await runtime.snapshotDescendants()
    expect(sampled.map((p) => p.pid)).toContain(first.pid)
    runtime.stdin.write('go\n')
    const late = await track((await pidsPrinted(runtime, 1))[0]!)
    await runtime.exited
    const report = await runtime.terminate({ graceMs: 200, killWaitMs: 1500 })
    expect(report.confirmed).toBe(true)
    expect(await aliveAs(first)).toBe(false); expect(await aliveAs(late)).toBe(false)
  })

  it('exit-time listing fails, group provably unclaimed (no process owns the leader pid): the orphan is still adopted and killed', async () => {
    let mode: 'ok' | 'fail' = 'ok'
    const lister: ProcessLister = { list: async () => { if (mode === 'fail') throw new Error('W8 ps unavailable'); return ps.list() } }
    const runtime = await launch(`sleep 300 >/dev/null 2>&1 & echo $!; sleep 1; exit 0`, lister)
    const orphan = await track((await pidsPrinted(runtime, 1))[0]!)
    mode = 'fail' // the listing taken at the exit event fails
    await runtime.exited; await tick(200)
    mode = 'ok'
    const report = await runtime.terminate({ graceMs: 200, killWaitMs: 1500 })
    expect(report.confirmed).toBe(true)
    expect(await aliveAs(orphan)).toBe(false)
  })

  it('nested session: a setsid child that is still in the parent chain is found by identity and killed; its own group is not signalled', async () => {
    const runtime = await launch(`perl -MPOSIX -e 'POSIX::setsid(); exec "sleep", "300"' >/dev/null 2>&1 & echo $!; sleep 30`)
    const child = await track((await pidsPrinted(runtime, 1))[0]!)
    await tick(150)
    const detached = (await row(child.pid))!
    expect(detached.pgid).toBe(child.pid) // own session / group, not the runtime's
    const kill = vi.spyOn(process, 'kill')
    const report = await runtime.terminate({ graceMs: 300, killWaitMs: 1500 })
    expect(report.confirmed).toBe(true)
    expect(await aliveAs(child)).toBe(false)
    expect(kill.mock.calls.some(([pid]) => pid === -child.pid)).toBe(false)
  })

  it('KNOWN LIMITATION (unchanged by W6, inherent): a daemonised setsid process re-parented to launchd before any snapshot is invisible', async () => {
    const runtime = await launch(`perl -MPOSIX -e 'exit 0 if fork; POSIX::setsid(); $|=1; print "$$\\n"; exec "sleep", "300"' ; sleep 30`)
    const daemon = await track((await pidsPrinted(runtime, 1))[0]!)
    expect(daemon.ppid).toBe(1); expect(daemon.pgid).toBe(daemon.pid)
    const report = await runtime.terminate({ graceMs: 300, killWaitMs: 1000 })
    const stillAlive = await aliveAs(daemon)
    // eslint-disable-next-line no-console
    console.log(`[W8] daemonised setsid process: confirmed=${report.confirmed} alive=${stillAlive} (spec: 采样前已脱离的后代仍需后续真实验证)`)
    expect(stillAlive).toBe(true)
  })
})

describe('F1 safety: the adoption rule never signals or adopts an unrelated process', () => {
  // A real unrelated `sleep` (the bystander) is made to *look* like a member of a recycled group by rewriting its table row.
  async function bystander() {
    const b = await launch('sleep 300')
    const info = await track(b.pid!)
    return { runtime: b, info }
  }

  it('clean exit listing + later table claims a stranger in the same numeric group: not adopted, not signalled', async () => {
    const { runtime: other, info } = await bystander()
    let phase: 'live' | 'spoof' = 'live'; let leader = 0
    const lister: ProcessLister = { list: async () => {
      const rows = (await ps.list()).filter((p) => p.pid !== info.pid)
      return phase === 'live' ? [...rows, info] : [...rows, { ...info, pgid: leader, ppid: 1 }, { ...info, pid: leader, ppid: 1, pgid: leader, startedAt: 'recycled leader', command: 'stranger' }]
    } }
    const runtime = await launch('exit 0', lister)
    leader = runtime.pid!
    await runtime.exited; await tick(150) // exit listing succeeded and found nothing
    phase = 'spoof'
    const kill = vi.spyOn(process, 'kill')
    const report = await runtime.terminate({ graceMs: 100, killWaitMs: 300 })
    expect(kill.mock.calls.filter(([pid]) => Math.abs(pid as number) === info.pid || Math.abs(pid as number) === leader)).toEqual([])
    expect(report.confirmed).toBe(true); expect(report.survivors).toEqual([])
    expect(await aliveAs(info)).toBe(true)
    void other
  })

  it('exit listing failed but a different process now owns the leader pid (recycled): the group is not adopted', async () => {
    const { info } = await bystander()
    let phase: 'ok' | 'fail' | 'spoof' = 'ok'; let leader = 0
    const lister: ProcessLister = { list: async () => {
      if (phase === 'fail') throw new Error('W8 ps unavailable')
      const rows = (await ps.list()).filter((p) => p.pid !== info.pid)
      return phase === 'ok' ? [...rows, info]
        : [...rows, { ...info, pgid: leader, ppid: 1 }, { ...info, pid: leader, ppid: 1, pgid: leader, startedAt: 'recycled leader', command: 'stranger' }]
    } }
    const runtime = await launch('sleep 0.5; exit 0', lister)
    leader = runtime.pid!
    phase = 'fail'
    await runtime.exited; await tick(150)
    phase = 'spoof'
    const kill = vi.spyOn(process, 'kill')
    const report = await runtime.terminate({ graceMs: 100, killWaitMs: 300 })
    expect(kill.mock.calls.filter(([pid]) => Math.abs(pid as number) === info.pid || Math.abs(pid as number) === leader)).toEqual([])
    expect(report.confirmed).toBe(true)
    expect(await aliveAs(info)).toBe(true)
  })

  it('RULE support: a group kept alive by a recorded member is adopted wholesale, and the kernel refuses a foreign session joining that live group (so no stranger can be swept in)', async () => {
    const runtime = await launch(`sleep 300 >/dev/null 2>&1 & echo $!; exit 0`)
    const member = await track((await pidsPrinted(runtime, 1))[0]!)
    await runtime.exited; await tick(150)
    // real kernel behaviour: a process of another session cannot setpgid into this group
    const joined = execFileSync('/usr/bin/perl', ['-MPOSIX', '-e', `print POSIX::setpgid(0, ${runtime.pid}) ? "joined" : "refused:" . ($!+0)`], { encoding: 'utf8' })
    // eslint-disable-next-line no-console
    console.log(`[W8] foreign process setpgid into the live group of an exited leader: ${joined}`)
    expect(joined).toMatch(/^refused:/)
    const report = await runtime.terminate({ graceMs: 200, killWaitMs: 1500 })
    expect(report.confirmed).toBe(true)
    expect(await aliveAs(member)).toBe(false)
  })

  it('RULE: a member first seen after the exit (forked by a recorded, still-living member) is adopted because the live member keeps the group id from being recycled', async () => {
    // leader exits at once; the surviving subshell A (recorded by the exit-time listing) forks B later and prints its pid.
    const runtime = await launch(`sh -c 'echo $$; sleep 0.8; sleep 300 >/dev/null 2>&1 & echo $!; wait' & exit 0`)
    const [aPid] = await pidsPrinted(runtime, 1)
    const a = await track(aPid!)
    await runtime.exited
    const [bPid] = await pidsPrinted(runtime, 1) // appears ~0.8 s after the exit-time listing
    const b = await track(bPid!)
    expect(b.pgid).toBe(runtime.pid)
    const report = await runtime.terminate({ graceMs: 200, killWaitMs: 1500 })
    expect(report.confirmed).toBe(true)
    expect(await aliveAs(a)).toBe(false); expect(await aliveAs(b)).toBe(false)
  })

  it('probe failure never leads to a signal on an unverified process; the retry on the same handle cleans up', async () => {
    let failing = false
    const lister: ProcessLister = { list: async () => { if (failing) throw new Error('W8 ps unavailable'); return ps.list() } }
    const runtime = await launch(`sleep 300 >/dev/null 2>&1 & echo $!; exit 0`, lister)
    const orphan = await track((await pidsPrinted(runtime, 1))[0]!)
    await runtime.exited; await tick(150)
    failing = true
    const kill = vi.spyOn(process, 'kill')
    const first = await runtime.terminate({ graceMs: 100, killWaitMs: 300 })
    expect(first.confirmed).toBe(false)
    expect(kill.mock.calls.filter(([pid]) => Math.abs(pid as number) === orphan.pid || Math.abs(pid as number) === runtime.pid)).toEqual([])
    expect(await aliveAs(orphan)).toBe(true)
    failing = false
    kill.mockRestore()
    const second = await runtime.terminate({ graceMs: 100, killWaitMs: 1500 })
    expect(second.confirmed).toBe(true)
    expect(await aliveAs(orphan)).toBe(false)
  })

  it('a recorded member whose pid was recycled (different start time) is neither signalled nor treated as ownership proof', async () => {
    const { info } = await bystander()
    let phase: 'record' | 'verify' = 'record'; let leader = 0
    const lister: ProcessLister = { list: async () => {
      const rows = (await ps.list()).filter((p) => p.pid !== info.pid)
      // while recording, the bystander pid is claimed as a member of the runtime's group under a wrong start time; afterwards its real row (other start time, own group) shows
      return phase === 'record' ? [...rows, { ...info, ppid: leader, pgid: leader, startedAt: 'Thu Jan  1 00:00:00 2026' }] : [...rows, info]
    } }
    const runtime = await launch('sleep 0.6; exit 0', lister)
    leader = runtime.pid!
    await runtime.snapshotDescendants()
    phase = 'verify'
    await runtime.exited; await tick(100)
    const kill = vi.spyOn(process, 'kill')
    const report = await runtime.terminate({ graceMs: 100, killWaitMs: 300 })
    expect(kill.mock.calls.filter(([pid]) => Math.abs(pid as number) === info.pid)).toEqual([])
    expect(report.confirmed).toBe(true)
    expect(await aliveAs(info)).toBe(true)
  })
})

describe('F1 liveness: terminate() cannot hang on the new exit-time listing', () => {
  it('a hanging ps is bounded by the lister timeout; terminate() settles unconfirmed instead of hanging', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'w8-ps-'))
    const hangingPs = join(dir, 'ps')
    writeFileSync(hangingPs, '#!/bin/sh\nexec sleep 30\n'); chmodSync(hangingPs, 0o755)
    const lister = new PsProcessLister({ psPath: hangingPs, timeoutMs: 300 })
    const runtime = await launch(`sleep 300 >/dev/null 2>&1 & echo $!; exit 0`, lister)
    const orphan = await track((await pidsPrinted(runtime, 1))[0]!)
    await runtime.exited
    const started = Date.now()
    const report = await runtime.terminate({ graceMs: 200, killWaitMs: 600 })
    const elapsed = Date.now() - started
    // eslint-disable-next-line no-console
    console.log(`[W8] terminate() with a hanging ps: confirmed=${report.confirmed} after ${elapsed} ms`)
    expect(report.confirmed).toBe(false)
    expect(elapsed).toBeLessThan(5000)
    expect(await aliveAs(orphan)).toBe(true) // nothing was signalled without a verified table
  })
})
