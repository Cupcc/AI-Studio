import { describe, expect, it, vi } from 'vitest'
import { createShutdownHandler } from './shutdown'

describe('application resource shutdown · FR-SESSION-003 / AC-03', () => {
  it('blocks repeated quit attempts until Runtime cleanup completes before closing persistence', async () => {
    let finish!: () => void
    const cleanup = new Promise<void>((resolve) => { finish = resolve })
    const order: string[] = []
    const disposeFeatures = vi.fn(async () => { await cleanup; order.push('runtime exited') })
    const quit = vi.fn(() => { order.push('quit') })
    const shutdown = createShutdownHandler({
      disposeFeatures, disposeCore: () => { order.push('database closed') }, quit, onError: vi.fn()
    })
    const preventDefault = vi.fn()
    shutdown({ preventDefault })
    shutdown({ preventDefault })
    expect(preventDefault).toHaveBeenCalledTimes(2)
    expect(disposeFeatures).toHaveBeenCalledTimes(1)
    expect(order).toEqual([])
    finish()
    await new Promise<void>((resolve) => setImmediate(resolve))
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(order).toEqual(['runtime exited', 'database closed', 'quit'])
    preventDefault.mockClear()
    shutdown({ preventDefault })
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('reports a settled cleanup failure and still closes persistence exactly once', async () => {
    const error = new Error('cleanup could not confirm exit')
    const onError = vi.fn(), disposeCore = vi.fn(), quit = vi.fn()
    const shutdown = createShutdownHandler({ disposeFeatures: async () => { throw error }, disposeCore, quit, onError })
    shutdown({ preventDefault: vi.fn() })
    await new Promise<void>((resolve) => setImmediate(resolve))
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(onError).toHaveBeenCalledExactlyOnceWith(error)
    expect(disposeCore).toHaveBeenCalledTimes(1)
    expect(quit).toHaveBeenCalledTimes(1)
  })
})
