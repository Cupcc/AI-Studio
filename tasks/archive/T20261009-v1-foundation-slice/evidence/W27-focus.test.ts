import { afterEach, describe, expect, it, vi } from '../../../../packages/agent-adapter/node_modules/vitest/dist/index.js'
import { deferred } from '../../../../packages/agent-adapter/src/core/async.js'
import { createAppFeature } from '../../../../apps/desktop/src/main/ipc/app'
import { defaultUiState } from '../../../../apps/desktop/src/shared/project/ui-state'

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const release of cleanup.splice(0).reverse()) release()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function harness() {
  vi.stubGlobal('document', { hasFocus: () => false })
  const snapshot = deferred<{ focused: boolean }>()
  const order: string[] = []
  const listeners = new Set<(payload: { focused: boolean }) => void>()
  const unsub = vi.fn()
  vi.stubGlobal('window', { studio: {
    app: {
      onWindowFocusChanged: (listener: (payload: { focused: boolean }) => void) => {
        order.push('subscribed'); listeners.add(listener)
        return () => { listeners.delete(listener); unsub() }
      },
      getWindowFocus: () => { order.push('snapshot'); return snapshot.promise }
    },
    project: { onQuitRequested: () => () => {}, onFlushRequested: () => () => {}, onMenuCommand: () => () => {} }
  } })
  const { useProjectShell } = await import('../../../../apps/desktop/src/renderer/src/features/project/store')
  const { registerShellIntegration } = await import('../../../../apps/desktop/src/renderer/src/features/project/integration')
  const initial = useProjectShell.getState()
  const port = {
    getProjectAttention: () => null, subscribeAttention: () => () => {},
    onProjectOpened: () => {}, onProjectClosed: () => {}, sessionExists: () => true,
    setViewing: vi.fn(), setWindowForeground: vi.fn(), userOpenedSession: vi.fn(), startNewChat: () => {}
  }
  const restore = registerShellIntegration({ session: port })
  useProjectShell.setState({ foreground: false,
    windowState: { tabs: [{ kind: 'project', id: 'project:fixture', projectId: 'fixture' }], currentTabId: 'project:fixture', navCollapsed: false },
    uiStates: { fixture: { ...defaultUiState(), mainCanvas: { mode: 'session', sessionId: 'session' } } }
  })
  const unwatch = useProjectShell.getState().watchEvents()
  cleanup.push(() => { unwatch(); restore(); useProjectShell.setState(initial, true) })
  return { snapshot, order, listeners, unsub, unwatch, port, store: useProjectShell,
    emit: (focused: boolean) => listeners.forEach(listener => listener({ focused })) }
}

describe('W27 independent initial native focus snapshot checks; no Electron or GUI', () => {
  it('subscribes before snapshot and restores missed initial native focus without opening or marking read', async () => {
    const h = await harness()
    expect(h.order).toEqual(['subscribed', 'snapshot'])
    h.snapshot.resolve({ focused: true })
    await Promise.resolve()
    expect(h.store.getState().foreground).toBe(true)
    expect(h.port.setWindowForeground).toHaveBeenLastCalledWith(true)
    expect(h.port.setViewing).toHaveBeenLastCalledWith('fixture', 'session')
    expect(h.port.userOpenedSession).not.toHaveBeenCalled()
  })

  it.each([true, false])('retains the newer native event (%s) over an older opposite snapshot', async focused => {
    const h = await harness()
    h.emit(focused)
    h.snapshot.resolve({ focused: !focused })
    await Promise.resolve()
    expect(h.store.getState().foreground).toBe(focused)
    expect(h.port.setWindowForeground).toHaveBeenCalledExactlyOnceWith(focused)
    expect(h.port.setViewing).toHaveBeenLastCalledWith('fixture', focused ? 'session' : null)
    expect(h.port.userOpenedSession).not.toHaveBeenCalled()
  })

  it('ignores the outstanding snapshot after unsubscribe', async () => {
    const h = await harness()
    h.unwatch()
    h.snapshot.resolve({ focused: true })
    await Promise.resolve()
    expect(h.store.getState().foreground).toBe(false)
    expect(h.port.setWindowForeground).not.toHaveBeenCalled()
    expect(h.port.userOpenedSession).not.toHaveBeenCalled()
    expect(h.listeners.size).toBe(0)
  })

  it('keeps newer native events usable when the initial snapshot request fails', async () => {
    const h = await harness()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.snapshot.reject(new Error('synthetic IPC failure'))
    await Promise.resolve(); await Promise.resolve()
    h.emit(true)
    expect(h.store.getState().foreground).toBe(true)
    expect(h.port.userOpenedSession).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith('[project] initial window focus unavailable', expect.any(Error))
  })

  it('uses the trusted sender identity for the snapshot and rejects renderer-supplied focus data', () => {
    const read = vi.fn((senderId: number) => senderId === 19)
    const handlers = createAppFeature({ appInfo: () => { throw new Error('unused') } }, read).handlers
    expect(() => handlers.getWindowFocus.parse({ focused: true })).toThrow('no input')
    const context = { senderId: 19, senderUrl: 'app://fixture/' }
    expect(handlers.getWindowFocus.handle(undefined, context)).toEqual({ focused: true })
    expect(handlers.getWindowFocus.handle(undefined, { ...context, senderId: 20 })).toEqual({ focused: false })
    expect(read.mock.calls).toEqual([[19], [20]])
  })
})
