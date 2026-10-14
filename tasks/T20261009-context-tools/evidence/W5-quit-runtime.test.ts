import { afterEach, expect, it, vi } from 'vitest'
import { createQuitFlow } from '../../../apps/desktop/src/main/services/project/quit-flow'
import { stubMainSessionPort } from '../../../apps/desktop/src/main/services/project/session-port'
import { stubMainToolPort } from '../../../apps/desktop/src/main/services/project/tool-port'

afterEach(() => vi.useRealTimers())

it('W5 waits for idle Runtime release even with no active Turn or Terminal', async () => {
  let finish!: () => void
  const releaseAllRuntimes = vi.fn(() => new Promise<void>(done => { finish = done }))
  const quit = vi.fn()
  const flow = createQuitFlow({
    getPort: () => ({ ...stubMainSessionPort, releaseAllRuntimes }),
    getTools: () => stubMainToolPort,
    askRenderer: () => true, askNative: async () => false, quit
  })
  flow.onBeforeQuit({ preventDefault() {} })
  await new Promise(done => setImmediate(done))
  expect(releaseAllRuntimes).toHaveBeenCalledOnce()
  expect(quit).not.toHaveBeenCalled()
  finish()
  await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce())
})

it('W5 keeps release failure diagnostic and retries the same quit resource cleanup', async () => {
  const terminal = { kind: 'terminal' as const, id: 't1', projectId: 'p1', title: 'W5 Shell' }
  let active = [terminal]
  const closeAll = vi.fn(async () => { active = [] })
  const releaseAllRuntimes = vi.fn().mockRejectedValueOnce(new Error('fixture Runtime release failed')).mockResolvedValue(undefined)
  const quit = vi.fn(), requests: unknown[] = []
  const flow = createQuitFlow({
    getPort: () => ({ ...stubMainSessionPort, releaseAllRuntimes }),
    getTools: () => ({ ...stubMainToolPort, activeTerminals: () => active, closeAll }),
    askRenderer: request => { requests.push(request); return true }, askNative: async () => false, quit
  })
  flow.onBeforeQuit({ preventDefault() {} })
  await vi.waitFor(() => expect(flow.state).toBe('asking'))
  await flow.confirm()
  expect(releaseAllRuntimes).toHaveBeenCalledOnce()
  expect(flow.state).toBe('asking')
  expect(requests.at(-1)).toMatchObject({ failures: [expect.stringContaining('fixture Runtime release failed')] })
  expect(quit).not.toHaveBeenCalled()
  await flow.confirm()
  expect(releaseAllRuntimes).toHaveBeenCalledTimes(2)
  expect(quit).toHaveBeenCalledOnce()
})

it('W5 cancel after idle release timeout owns the pending release without late quit', async () => {
  vi.useFakeTimers()
  let finish!: () => void
  const releaseAllRuntimes = vi.fn(() => new Promise<void>(done => { finish = done }))
  const quit = vi.fn(), cancelQuit = vi.fn()
  const flow = createQuitFlow({
    getPort: () => ({ ...stubMainSessionPort, releaseAllRuntimes, cancelQuit }),
    getTools: () => stubMainToolPort,
    askRenderer: () => true, askNative: async () => false, quit, stopTimeoutMs: 100
  })
  flow.onBeforeQuit({ preventDefault() {} })
  await vi.advanceTimersByTimeAsync(101)
  expect(releaseAllRuntimes).toHaveBeenCalledOnce()
  expect(flow.state).toBe('asking')
  expect(flow.cleanupPending).toBe(true)
  flow.cancel()
  expect(cancelQuit).not.toHaveBeenCalled()
  finish()
  await vi.advanceTimersByTimeAsync(0)
  expect(flow.cleanupPending).toBe(false)
  expect(cancelQuit).toHaveBeenCalledOnce()
  expect(quit).not.toHaveBeenCalled()
})
