import { afterEach, describe, expect, it, vi } from 'vitest'
import { projectShellFor } from '../../../../apps/desktop/src/main/services/project'
import { closeProjectWithSessions } from '../../../../apps/desktop/src/main/services/project/close-flow'
import { createQuitFlow } from '../../../../apps/desktop/src/main/services/project/quit-flow'
import { stubMainSessionPort } from '../../../../apps/desktop/src/main/services/project/session-port'
import { stubMainToolPort } from '../../../../apps/desktop/src/main/services/project/tool-port'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

afterEach(() => vi.useRealTimers())

describe('W4 independent cleanup ownership review', () => {
  it('keeps the Project creation gate until actual timed-out cleanup settles', async () => {
    vi.useFakeTimers()
    const actual = deferred<void>()
    const closeProject = vi.fn(() => actual.promise)
    const row = { id: 'p1', name: 'Fixture', local_path: '/tmp/w4', canonical_path: '/tmp/w4', created_at: '', last_opened_at: null }
    const shell = projectShellFor({ database: () => ({ db: { prepare: () => ({ get: () => row }) } }) } as never)
    shell.setToolPort({ ...stubMainToolPort, closeProject })
    const attempt = shell.closeProject('p1', true)
    await vi.advanceTimersByTimeAsync(10_001)
    expect(await attempt).toMatchObject({ status: 'failed' })
    expect(shell.isProjectClosing('p1')).toBe(true)
    expect(await shell.closeProject('p1', true)).toMatchObject({ status: 'failed' })
    expect(closeProject).toHaveBeenCalledOnce()
    actual.resolve(undefined)
    await vi.advanceTimersByTimeAsync(0)
    expect(shell.isProjectClosing('p1')).toBe(false)
    expect(closeProject).toHaveBeenCalledOnce()
  })

  it('does not continue into Tool or idle Runtime release when Stop succeeds after timeout', async () => {
    vi.useFakeTimers()
    const stop = deferred<{ stopped: string[]; failed: never[] }>()
    const projectClosed = vi.fn(async () => {})
    const closeProject = vi.fn(async () => {})
    const result = closeProjectWithSessions({ ...stubMainSessionPort,
      getBlockingSessionCounts: () => ({ running: 1, needsInput: 0 }),
      stopProjectTurns: () => stop.promise, projectClosed
    }, 'p1', true, 100, { ...stubMainToolPort, closeProject })
    await vi.advanceTimersByTimeAsync(101)
    expect(await result).toMatchObject({ status: 'failed' })
    stop.resolve({ stopped: ['s1'], failed: [] })
    await vi.advanceTimersByTimeAsync(0)
    expect(closeProject).not.toHaveBeenCalled()
    expect(projectClosed).not.toHaveBeenCalled()
  })

  it('allows Cancel after a quit timeout while retaining cleanup ownership and never late-quits', async () => {
    vi.useFakeTimers()
    const actual = deferred<void>()
    const terminal = { kind: 'terminal' as const, id: 't1', projectId: 'p1', title: 'Prompt Shell' }
    let active = [terminal]
    const cancelQuit = vi.fn(), quit = vi.fn()
    const closeAll = vi.fn(async () => { await actual.promise; active = [] })
    const flow = createQuitFlow({
      getPort: () => ({ ...stubMainSessionPort, cancelQuit }),
      getTools: () => ({ ...stubMainToolPort, activeTerminals: () => active, closeAll }),
      askRenderer: () => true, askNative: async () => false, quit, stopTimeoutMs: 100
    })
    flow.onBeforeQuit({ preventDefault() {} })
    await vi.advanceTimersByTimeAsync(0)
    const confirm = flow.confirm()
    await vi.advanceTimersByTimeAsync(101)
    await confirm
    expect(flow.state).toBe('asking')
    expect(flow.cleanupPending).toBe(true)
    flow.cancel()
    expect(flow.state).toBe('idle')
    expect(cancelQuit).not.toHaveBeenCalled()
    actual.resolve(undefined)
    await vi.advanceTimersByTimeAsync(0)
    expect(flow.cleanupPending).toBe(false)
    expect(cancelQuit).toHaveBeenCalledOnce()
    expect(quit).not.toHaveBeenCalled()
    expect(closeAll).toHaveBeenCalledOnce()
  })

  it('cancels a late idle Runtime closure rather than retiring the still-open Project', async () => {
    vi.useFakeTimers()
    const runtimeReleased = deferred<void>()
    const cancelled = vi.fn()
    const result = closeProjectWithSessions({ ...stubMainSessionPort,
      projectClosed: () => runtimeReleased.promise,
      projectCloseCancelled: cancelled
    }, 'p1', true, 100)
    await vi.advanceTimersByTimeAsync(101)
    expect(await result).toMatchObject({ status: 'failed' })
    expect(cancelled).not.toHaveBeenCalled()
    runtimeReleased.resolve(undefined)
    await vi.advanceTimersByTimeAsync(0)
    expect(cancelled).toHaveBeenCalledExactlyOnceWith('p1')
  })
})
