import { describe, expect, it, vi } from 'vitest'
import { closeProjectWithSessions } from './close-flow'
import { createQuitFlow } from './quit-flow'
import { stubMainSessionPort, type MainSessionPort } from './session-port'

function port(): MainSessionPort {
  return { ...stubMainSessionPort, getBlockingSessionCounts: vi.fn(() => ({ running: 1, needsInput: 1 })), stopProjectTurns: vi.fn(async () => ({ stopped: ['s1'], failed: [] })), projectClosed: vi.fn(async () => {}) }
}
describe('trusted close flow · FR-PROJ-002 · D-10', () => {
  it('asks only for running/input and performs no stop before confirmation', async () => {
    const session = port()
    expect(await closeProjectWithSessions(session, 'p1', false)).toEqual({ status: 'confirmation_required', counts: { running: 1, needsInput: 1 } })
    expect(session.stopProjectTurns).not.toHaveBeenCalled()
    session.getBlockingSessionCounts = () => ({ running: 0, needsInput: 0 })
    expect(await closeProjectWithSessions(session, 'p1', true)).toEqual({ status: 'closed' })
    expect(session.stopProjectTurns).not.toHaveBeenCalled()
  })
  it('stops only the confirmed Project and checks cleanup before closing', async () => {
    const session = port()
    session.getBlockingSessionCounts = vi.fn().mockReturnValueOnce({ running: 1, needsInput: 0 }).mockReturnValue({ running: 0, needsInput: 0 })
    expect(await closeProjectWithSessions(session, 'p1', true)).toEqual({ status: 'closed' })
    expect(session.stopProjectTurns).toHaveBeenCalledExactlyOnceWith('p1')
    expect(session.projectClosed).toHaveBeenCalledExactlyOnceWith('p1')
  })
  it('releases idle Project runtimes even when no turn needs confirmation', async () => {
    const session = port()
    session.getBlockingSessionCounts = vi.fn(() => ({ running: 0, needsInput: 0 }))
    expect(await closeProjectWithSessions(session, 'p1', false)).toEqual({ status: 'closed' })
    expect(session.projectClosed).toHaveBeenCalledExactlyOnceWith('p1')
  })
  it('keeps the Project open when runtime release fails', async () => {
    const session = port()
    session.getBlockingSessionCounts = vi.fn(() => ({ running: 0, needsInput: 0 }))
    session.projectClosed = vi.fn(async () => { throw new Error('runtime release failed') })
    expect(await closeProjectWithSessions(session, 'p1', false)).toMatchObject({ status: 'failed', failed: [{ reason: 'runtime release failed' }] })
  })
  it('keeps the Tab on reported failure, remaining turns or a timeout', async () => {
    const session = port()
    session.stopProjectTurns = async () => ({ stopped: [], failed: [{ sessionId: 's1', reason: 'cleanup failed' }] })
    expect(await closeProjectWithSessions(session, 'p1', true)).toMatchObject({ status: 'failed', failed: [{ sessionId: 's1' }] })
    session.stopProjectTurns = async () => ({ stopped: ['s1'], failed: [] })
    expect(await closeProjectWithSessions(session, 'p1', true)).toMatchObject({ status: 'failed' })
    session.stopProjectTurns = () => new Promise(() => {})
    expect(await closeProjectWithSessions(session, 'p1', true, 1)).toMatchObject({ status: 'failed', failed: [{ reason: '停止超时' }] })
  })
})
describe('application quit · PROJ-Q7/S-Q6 recommendation', () => {
  it('waits for renderer persistence before quitting even with no active turns', async () => {
    let release!: () => void
    const flush = new Promise<void>((resolve) => { release = resolve })
    const quit = vi.fn(), prevent = vi.fn()
    const flow = createQuitFlow({ getPort: () => stubMainSessionPort, askRenderer: () => true, askNative: async () => false, quit, flushState: () => flush })
    flow.onBeforeQuit({ preventDefault: prevent })
    expect(prevent).toHaveBeenCalledOnce(); expect(quit).not.toHaveBeenCalled()
    release(); await flush; await Promise.resolve()
    expect(quit).toHaveBeenCalledOnce(); expect(flow.state).toBe('approved')
  })
  it('separates cancel from stopping all turns and allows the approved second quit', async () => {
    const session = { ...port(), activeTurnCountAll: () => ({ sessions: 2, projects: 1 }), stopAllTurns: vi.fn(async () => {}) }
    const ask = vi.fn(() => true), quit = vi.fn(), prevent = vi.fn()
    const flow = createQuitFlow({ getPort: () => session, askRenderer: ask, askNative: async () => false, quit })
    flow.onBeforeQuit({ preventDefault: prevent }); await Promise.resolve(); await Promise.resolve()
    expect(flow.state).toBe('asking'); flow.cancel()
    expect(session.stopAllTurns).not.toHaveBeenCalled()
    flow.onBeforeQuit({ preventDefault: prevent }); await Promise.resolve(); await Promise.resolve()
    await flow.confirm()
    expect(session.stopAllTurns).toHaveBeenCalledOnce(); expect(quit).toHaveBeenCalledOnce()
    expect(flow.state).toBe('approved')
    prevent.mockClear(); flow.onBeforeQuit({ preventDefault: prevent }); expect(prevent).not.toHaveBeenCalled()
  })
})
