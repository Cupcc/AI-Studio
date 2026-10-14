import { describe, expect, it, vi } from 'vitest'
import { closeProjectWithSessions } from './close-flow'
import { createQuitFlow } from './quit-flow'
import { stubMainSessionPort } from './session-port'
import { stubMainToolPort, type MainToolPort } from './tool-port'
import type { ClosingResource, QuitRequest } from '@shared/project/types'

const terminal: ClosingResource = { kind: 'terminal', id: 't1', projectId: 'p1', title: 'Terminal 1' }
function tools(): MainToolPort {
  let active = [terminal]
  return { ...stubMainToolPort,
    activeTerminals: projectId => active.filter(item => !projectId || item.projectId === projectId),
    closeProject: vi.fn(async id => { active = active.filter(item => item.projectId !== id) }),
    closeAll: vi.fn(async () => { active = [] })
  }
}

describe('Terminal and Browser lifecycle · DEC-14 / FR-PROJ-002', () => {
  it('confirms prompt-only Shells and preserves them on cancel; closes only the selected Project', async () => {
    const runtime = tools()
    const requested = await closeProjectWithSessions(stubMainSessionPort, 'p1', false, 100, runtime)
    expect(requested).toMatchObject({ status: 'confirmation_required', counts: { running: 0, needsInput: 0, terminals: 1, resources: [terminal] } })
    expect(runtime.closeProject).not.toHaveBeenCalled()
    expect(await closeProjectWithSessions(stubMainSessionPort, 'p2', false, 100, runtime)).toEqual({ status: 'closed' })
    expect(runtime.activeTerminals()).toEqual([terminal])
    expect(await closeProjectWithSessions(stubMainSessionPort, 'p1', true, 100, runtime)).toEqual({ status: 'closed' })
    expect(runtime.activeTerminals()).toEqual([])
  })
  it('lists Sessions and Shells in one confirmation and keeps the Project on tool cleanup failure', async () => {
    const runtime = tools()
    const session = { ...stubMainSessionPort,
      getBlockingSessionCounts: vi.fn(() => ({ running: 1, needsInput: 0 })),
      activeSessions: () => [{ kind: 'session' as const, id: 's1', projectId: 'p1', title: 'Build' }],
      stopProjectTurns: vi.fn(async () => ({ stopped: ['s1'], failed: [] })),
      projectClosed: vi.fn(async () => {})
    }
    const requested = await closeProjectWithSessions(session, 'p1', false, 100, runtime)
    expect(requested.status === 'confirmation_required' && requested.counts.resources).toHaveLength(2)
    expect(session.stopProjectTurns).not.toHaveBeenCalled()
    session.getBlockingSessionCounts.mockReturnValue({ running: 0, needsInput: 0 })
    runtime.closeProject = async () => { throw new Error('Terminal 1 清理失败') }
    expect(await closeProjectWithSessions(session, 'p1', true, 100, runtime)).toMatchObject({ status: 'failed', failed: [{ reason: 'Terminal 1 清理失败' }] })
    expect(session.projectClosed).not.toHaveBeenCalled()
  })
  it('blocks quit on failure, retains diagnostics, and retries without repeating Tab confirmations', async () => {
    const runtime = tools(), requested: QuitRequest[] = []
    const quit = vi.fn(), closeAll = runtime.closeAll
    runtime.closeAll = vi.fn().mockRejectedValueOnce(new Error('PTY cleanup failed')).mockImplementation(closeAll)
    const session = { ...stubMainSessionPort, cancelQuit: vi.fn() }
    const flow = createQuitFlow({ getPort: () => session, getTools: () => runtime,
      askRenderer: request => { requested.push(request); return true }, askNative: async () => false, quit })
    flow.onBeforeQuit({ preventDefault: vi.fn() })
    await vi.waitFor(() => expect(flow.state).toBe('asking'))
    expect(requested[0]).toMatchObject({ sessions: 0, projects: 1, terminals: 1, resources: [terminal] })
    flow.cancel(); expect(runtime.closeAll).not.toHaveBeenCalled(); expect(session.cancelQuit).toHaveBeenCalledOnce()
    flow.onBeforeQuit({ preventDefault: vi.fn() })
    await vi.waitFor(() => expect(flow.state).toBe('asking'))
    await flow.confirm()
    expect(flow.state).toBe('asking'); expect(quit).not.toHaveBeenCalled()
    expect(requested.at(-1)?.failures).toEqual(['PTY cleanup failed'])
    await flow.confirm()
    expect(quit).toHaveBeenCalledOnce(); expect(flow.state).toBe('approved')
  })
  it('times out without declaring quit approved and keeps cleanup owned until it settles', async () => {
    let release!: () => void
    const runtime = tools(), quit = vi.fn()
    runtime.closeAll = () => new Promise<void>(resolve => { release = resolve })
    const flow = createQuitFlow({ getPort: () => stubMainSessionPort, getTools: () => runtime,
      askRenderer: () => true, askNative: async () => false, quit, stopTimeoutMs: 1 })
    flow.onBeforeQuit({ preventDefault: vi.fn() })
    await vi.waitFor(() => expect(flow.state).toBe('asking'))
    await flow.confirm()
    expect(flow.state).toBe('asking'); expect(flow.cleanupPending).toBe(true); expect(quit).not.toHaveBeenCalled()
    release()
    await vi.waitFor(() => expect(flow.cleanupPending).toBe(false))
    expect(quit).not.toHaveBeenCalled()
  })
  it('does not release tools or close a retained Project after a late Stop', async () => {
    let release!: () => void
    const runtime = tools()
    const session = { ...stubMainSessionPort,
      getBlockingSessionCounts: () => ({ running: 1, needsInput: 0 }),
      stopProjectTurns: () => new Promise<{ stopped: string[]; failed: [] }>(resolve => { release = () => resolve({ stopped: ['s1'], failed: [] }) }),
      projectClosed: vi.fn(async () => {})
    }
    let actual!: Promise<unknown>
    const result = await closeProjectWithSessions(session, 'p1', true, 1, runtime, operation => { actual = operation })
    expect(result).toMatchObject({ status: 'failed', failed: [{ reason: '停止超时' }] })
    release(); await actual
    expect(runtime.closeProject).not.toHaveBeenCalled()
    expect(session.projectClosed).not.toHaveBeenCalled()
  })
  it('reopens Session submission when idle release settles after the close deadline', async () => {
    let release!: () => void
    const runtime = tools()
    const session = { ...stubMainSessionPort,
      projectClosed: () => new Promise<void>(resolve => { release = resolve }),
      projectCloseCancelled: vi.fn()
    }
    let actual!: Promise<unknown>
    expect(await closeProjectWithSessions(session, 'p1', true, 1, runtime, operation => { actual = operation }))
      .toMatchObject({ status: 'failed', failed: [{ reason: '停止超时' }] })
    release(); await actual
    expect(session.projectCloseCancelled).toHaveBeenCalledExactlyOnceWith('p1')
  })
  it('coalesces repeated quit requests while a native confirmation is pending', async () => {
    let answer!: (accepted: boolean) => void
    const runtime = tools(), quit = vi.fn()
    const askNative = vi.fn(() => new Promise<boolean>(resolve => { answer = resolve }))
    const flow = createQuitFlow({ getPort: () => stubMainSessionPort, getTools: () => runtime,
      askRenderer: () => false, askNative, quit })
    flow.onBeforeQuit({ preventDefault: vi.fn() })
    await vi.waitFor(() => expect(askNative).toHaveBeenCalledOnce())
    flow.onBeforeQuit({ preventDefault: vi.fn() })
    flow.onBeforeQuit({ preventDefault: vi.fn() })
    expect(askNative).toHaveBeenCalledOnce()
    answer(false)
    await vi.waitFor(() => expect(flow.state).toBe('idle'))
    expect(runtime.closeAll).not.toHaveBeenCalled()
    expect(quit).not.toHaveBeenCalled()
  })
  it('does not approve an otherwise idle quit until Session Runtime release succeeds', async () => {
    const quit = vi.fn(), requested: QuitRequest[] = []
    const session = { ...stubMainSessionPort,
      releaseAllRuntimes: vi.fn().mockRejectedValueOnce(new Error('idle Runtime cleanup failed')).mockResolvedValue(undefined),
      cancelQuit: vi.fn()
    }
    const flow = createQuitFlow({ getPort: () => session, getTools: () => stubMainToolPort,
      askRenderer: request => { requested.push(request); return true }, askNative: async () => false, quit })
    flow.onBeforeQuit({ preventDefault: vi.fn() })
    await vi.waitFor(() => expect(flow.state).toBe('asking'))
    expect(requested.at(-1)?.failures).toEqual(['idle Runtime cleanup failed'])
    expect(quit).not.toHaveBeenCalled()
    await flow.confirm()
    expect(session.releaseAllRuntimes).toHaveBeenCalledTimes(2)
    expect(quit).toHaveBeenCalledOnce()
  })
})
