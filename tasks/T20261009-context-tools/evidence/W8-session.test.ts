// W8 独立评审：Session 级契约（Stop / dispose / 崩溃的并发，Stop 后替换 Runtime，ensureSession 不回退为新会话）。
import { afterAll, describe, expect, it } from 'vitest'
import { ensureSession } from '@w8/session-helpers.js'
import { claudeRig, codexRig, DEFAULT_CWD, record, rejectionGuard, sessionOptions, tick, types } from './W8-support'
import type { AgentSession } from '@w8/provider.js'

const guard = rejectionGuard()
afterAll(async () => { await guard.settle(); guard.stop(); expect(guard.seen).toEqual([]) })

type CodexRig = ReturnType<typeof codexRig>
type ClaudeRig = ReturnType<typeof claudeRig>

async function runningTurn(rig: CodexRig | ClaudeRig, session: AgentSession) {
  if (rig.name === 'claude') {
    (rig as ClaudeRig).queries.at(-1)!.init(); await tick(5)
    await session.sendUserInput({ text: 'work' }); await tick(5)
  } else await (rig as CodexRig).start(session, 'work')
}
const count = (events: ReturnType<typeof record>, type: string) => types(events).filter((t) => t === type).length

describe.each([['codex', codexRig], ['claude', claudeRig]] as const)('%s', (_name, makeRig) => {
  it('concurrent Stop and dispose on a running turn: one interrupted terminal, one closed event, Runtime gone (both orders)', async () => {
    for (const order of ['stop-first', 'dispose-first'] as const) {
      const rig = makeRig(); const session = await rig.create(); const events = record(session)
      await runningTurn(rig, session)
      const operations = order === 'stop-first' ? [session.stop(), session.dispose()] : [session.dispose(), session.stop()]
      const results = await Promise.allSettled(operations)
      expect(results.filter((r) => r.status === 'rejected')).toEqual([])
      expect(session.state).toBe('closed')
      expect(count(events, 'turn.completed')).toBe(1)
      expect(count(events, 'session.closed')).toBe(1)
      expect(rig.runtimes.every((runtime) => !runtime.running)).toBe(true)
      expect(rig.retained()).toBe(0)
      await guard.settle()
    }
  })

  it('dispose() during a running turn with an unconfirmed exit: turn ends once (interrupted), rejection is retryable, retry adds no events', async () => {
    const rig = makeRig(); rig.knobs.terminate = 'hang'
    const session = await rig.create(); const events = record(session)
    await runningTurn(rig, session)
    await expect(session.dispose()).rejects.toBeTruthy()
    expect(session.state).toBe('closed')
    const completed = events.filter((event) => event.type === 'turn.completed')
    expect(completed).toHaveLength(1)
    expect(completed[0]).toMatchObject({ outcome: 'interrupted' })
    const total = events.length
    await expect(session.dispose()).rejects.toBeTruthy()
    expect(count(events, 'turn.completed')).toBe(1); expect(count(events, 'session.closed')).toBe(1)
    rig.runtimes.forEach((runtime) => { runtime.terminateBehavior = 'exit' })
    await session.dispose()
    expect(rig.runtimes.every((runtime) => !runtime.running)).toBe(true)
    expect(events.length).toBeGreaterThanOrEqual(total) // diagnostics/errors from retries are allowed; no new turn or closure events
    expect(count(events, 'turn.completed')).toBe(1); expect(count(events, 'session.closed')).toBe(1)
    await guard.settle()
  })

  it('Runtime crash racing with dispose(): closed once, exit confirmed, nothing leaks', async () => {
    const rig = makeRig(); const session = await rig.create(); const events = record(session)
    rig.runtimes[0]!.crash()
    const outcome = await Promise.allSettled([session.dispose(), session.dispose()])
    expect(outcome.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled'])
    await tick(20)
    expect(count(events, 'session.closed')).toBe(1)
    expect(rig.retained()).toBe(0); expect(rig.tracked()).toBe(0)
    await guard.settle()
  })

  it('ensureSession starts no replacement while the closed Session exit is unconfirmed; resumes on the same native session after the retry', async () => {
    const rig = makeRig(); rig.knobs.terminate = 'hang'
    const session = await rig.create(); await runningTurn(rig, session)
    if (rig.name === 'codex') rig.complete(session); else (rig as ClaudeRig).queries.at(-1)!.end()
    await tick(20)
    await expect(session.dispose()).rejects.toBeTruthy()
    const options = { ...sessionOptions(DEFAULT_CWD), nativeSessionId: '11111111-1111-4111-8111-111111111111' }
    const spawnsBefore = rig.spawns.length
    await expect(ensureSession(rig.provider, session, options)).rejects.toBeTruthy()
    expect(rig.spawns).toHaveLength(spawnsBefore) // no new Runtime, no new native session
    rig.runtimes[0]!.terminateBehavior = 'exit'; rig.knobs.terminate = 'exit'
    const resumed = await ensureSession(rig.provider, session, options)
    expect(resumed.action).toBe('resumed')
    expect(rig.spawns).toHaveLength(spawnsBefore + 1)
    await rig.provider.dispose()
    await guard.settle()
  })
})

describe('Stop / replacement flows keep their behaviour and handle accounting', () => {
  it('Codex: Stop fallback replaces the Runtime once; the confirmed old handle leaves the retained set; session timeouts are used', async () => {
    const rig = codexRig(); const session = await rig.create()
    await rig.start(session); rig.command(session)
    const result = await session.stop()
    expect(result).toMatchObject({ status: 'stopped', summary: { cleanup: 'runtime_restarted' } })
    expect(rig.runtimes).toHaveLength(2)
    expect(rig.runtimes[0]!.running).toBe(false); expect(rig.runtimes[1]!.running).toBe(true)
    expect(rig.runtimes[0]!.terminateCalls[0]).toEqual({ graceMs: 1, killWaitMs: 1 })
    expect(rig.retained()).toBe(1); expect(rig.tracked()).toBe(1)
    expect(session.state).toBe('idle')
    await rig.start(session, 'after recovery'); rig.complete(session); await tick(10)
    await session.dispose()
    expect(rig.retained()).toBe(0)
  })

  it('Codex: Stop whose recovery cannot confirm the old exit closes the Session (stop_failed) and the handle stays retained for strict release', async () => {
    const rig = codexRig(); const session = await rig.create(); const events = record(session)
    await rig.start(session); rig.command(session)
    rig.runtimes[0]!.terminateBehavior = 'survivors'
    const result = await session.stop().catch((error: unknown) => ({ rejected: error }))
    expect(session.state).toBe('closed')
    expect(rig.runtimes).toHaveLength(1)
    expect(events.find((event) => event.type === 'session.closed')).toMatchObject({ reason: expect.stringMatching(/stop_failed|disposed|runtime_exited/) })
    expect(rig.retained()).toBe(1)
    await expect(rig.provider.releaseRuntimes()).rejects.toBeInstanceOf(AggregateError)
    rig.runtimes[0]!.terminateBehavior = 'exit'
    await rig.provider.releaseRuntimes()
    expect(rig.retained()).toBe(0)
    void result
    await guard.settle()
  })

  it('Claude: Stop then continue on the same Runtime; Stop with queued input replaces the Runtime and accounting stays exact', async () => {
    const rig = claudeRig(); const session = await rig.create(); const query = rig.queries.at(-1)!
    query.init(); await tick(5)
    await session.sendUserInput({ text: 'one' }); await tick(5)
    expect(await session.stop()).toMatchObject({ status: 'stopped' })
    expect(rig.runtimes).toHaveLength(1); expect(rig.retained()).toBe(1)
    await session.sendUserInput({ text: 'two' }); await tick(5); query.end(); await tick(10)
    expect(session.state).toBe('idle')
    // now force the conservative fallback: the interrupted input stays queued natively
    rig.flags.queueAfterInterrupt = true; query.queueAfterInterrupt = true
    await session.sendUserInput({ text: 'three' }); await tick(5)
    const result = await session.stop()
    expect(result).toMatchObject({ status: 'stopped', summary: { cleanup: 'runtime_restarted' } })
    expect(rig.runtimes).toHaveLength(2)
    expect(rig.runtimes[0]!.running).toBe(false); expect(rig.runtimes[1]!.running).toBe(true)
    expect(rig.retained()).toBe(1)
    await session.dispose()
    expect(rig.retained()).toBe(0)
    await guard.settle()
  })
})
