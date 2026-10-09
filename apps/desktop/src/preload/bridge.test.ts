import { describe, expect, it, vi } from 'vitest'
import { appContract } from '@shared/ipc/app'
import { contracts } from '@shared/ipc/contracts'
import { buildStudioApi, type BridgeIpc } from './bridge'

type Listener = (event: unknown, ...args: unknown[]) => void

function fakeIpc() {
  const listeners = new Map<string, Set<Listener>>()
  const ipc = {
    invoke: vi.fn(async (_channel: string, ..._args: unknown[]) => 'result' as unknown),
    on: vi.fn((channel: string, listener: Listener) => {
      if (!listeners.has(channel)) listeners.set(channel, new Set())
      listeners.get(channel)!.add(listener)
    }),
    removeListener: vi.fn((channel: string, listener: Listener) => {
      listeners.get(channel)?.delete(listener)
    })
  } satisfies BridgeIpc
  const emit = (channel: string, payload: unknown) => {
    for (const l of listeners.get(channel) ?? []) l({ sender: 'secret-ipc-renderer' }, payload)
  }
  return { ipc, emit, listeners }
}

describe('buildStudioApi', () => {
  it('exposes exactly one object per contract with invoke and on<Event> members', () => {
    const { ipc } = fakeIpc()
    const api = buildStudioApi(contracts, ipc)
    expect(Object.keys(api)).toEqual(contracts.map((c) => c.name))
    expect(Object.keys(api.app).sort()).toEqual(['getInfo', 'onWindowFocusChanged', 'ping'])
    expect(Object.isFrozen(api)).toBe(true)
    expect(Object.isFrozen(api.app)).toBe(true)
  })

  it('forwards invoke calls to the declared channel only', async () => {
    const { ipc } = fakeIpc()
    const api = buildStudioApi([appContract], ipc)
    await api.app.getInfo()
    expect(ipc.invoke).toHaveBeenLastCalledWith('app:get-info')
    await api.app.ping({ message: 'hi' })
    expect(ipc.invoke).toHaveBeenLastCalledWith('app:ping', { message: 'hi' })
  })

  it('delivers only the payload to listeners and supports unsubscribe', () => {
    const { ipc, emit, listeners } = fakeIpc()
    const api = buildStudioApi([appContract], ipc)
    const listener = vi.fn()
    const off = api.app.onWindowFocusChanged(listener)
    emit('app:window-focus-changed', { focused: false })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0]).toEqual([{ focused: false }])
    off()
    expect(listeners.get('app:window-focus-changed')?.size).toBe(0)
    emit('app:window-focus-changed', { focused: true })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('rejects non-function listeners', () => {
    const { ipc } = fakeIpc()
    const api = buildStudioApi([appContract], ipc)
    expect(() => api.app.onWindowFocusChanged('nope' as never)).toThrow(TypeError)
  })

  it('rejects duplicate feature contracts', () => {
    const { ipc } = fakeIpc()
    expect(() => buildStudioApi([appContract, appContract], ipc)).toThrow(/Duplicate feature contract/)
  })
})
