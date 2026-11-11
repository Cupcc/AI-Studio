import { createContext, runInContext } from 'node:vm'
import { afterEach, expect, it, vi } from 'vitest'
import { PAGE_SDK } from '@shared/workbench/resources/sdk'

function fixture() {
  vi.useFakeTimers()
  const events = new Map<string, (event: Record<string, unknown>) => void>()
  const domEvents = new Map<string, () => void>()
  const parent = { postMessage: vi.fn() }
  class Element {
    constructor(readonly attributes: Record<string, string>) {}
    getAttribute(name: string) { return this.attributes[name] ?? null }
  }
  const window = {
    addEventListener: vi.fn((name: string, listener: (event: Record<string, unknown>) => void) => events.set(name, listener)),
    removeEventListener: vi.fn((name: string) => events.delete(name))
  }
  const context = createContext({ window, parent, Element, document: { readyState: 'loading', addEventListener: (name: string, listener: () => void) => domEvents.set(name, listener) }, setTimeout, clearTimeout })
  runInContext(PAGE_SDK, context)
  const respond = (data: Record<string, unknown>, source: unknown = parent) => events.get('message')?.({ source, data: { channel: 'ai-studio-workbench-v1', ...data } })
  return { window, parent, context, respond, events, domEvents, Element }
}
afterEach(() => vi.useRealTimers())
it('uses the ordinary SDK channel for project Session actions and current or new conversation drafts', async () => {
  const f = fixture()
  const open: Promise<unknown> = runInContext('window.workbench.openSession("session-one")', f.context)
  expect(f.parent.postMessage).toHaveBeenLastCalledWith({ channel: 'ai-studio-workbench-v1', type: 'request', id: '1', method: 'openSession', params: { sessionId: 'session-one' } }, '*')
  f.respond({ type: 'response', id: '1', ok: true }); await open
  const current: Promise<unknown> = runInContext('window.workbench.setDraft("Current draft")', f.context)
  expect(f.parent.postMessage).toHaveBeenLastCalledWith({ channel: 'ai-studio-workbench-v1', type: 'request', id: '2', method: 'setDraft', params: { text: 'Current draft', target: 'current' } }, '*')
  f.respond({ type: 'response', id: '2', ok: true }); await current
  const fresh: Promise<unknown> = runInContext('window.workbench.setDraft("New draft", { target: "new" })', f.context)
  expect(f.parent.postMessage).toHaveBeenLastCalledWith({ channel: 'ai-studio-workbench-v1', type: 'request', id: '3', method: 'setDraft', params: { text: 'New draft', target: 'new' } }, '*')
  f.respond({ type: 'response', id: '3', ok: true }); await fresh
})
it('binds request replies to the parent, resolves snapshots and subscribes without leaking after unsubscribe', async () => {
  const f = fixture()
  expect(f.parent.postMessage).not.toHaveBeenCalled()
  f.domEvents.get('DOMContentLoaded')?.()
  expect(f.parent.postMessage).toHaveBeenCalledWith({ channel: 'ai-studio-workbench-v1', type: 'ready' }, '*')
  const promise: Promise<unknown> = runInContext('window.workbench.getInstance()', f.context)
  expect(f.parent.postMessage).toHaveBeenLastCalledWith({ channel: 'ai-studio-workbench-v1', type: 'request', id: '1', method: 'getInstance', params: {} }, '*')
  f.respond({ type: 'response', id: '1', ok: true, result: 'foreign' }, {})
  f.respond({ type: 'response', id: '1', ok: true, result: { state: { count: 2 } } })
  await expect(promise).resolves.toEqual({ state: { count: 2 } })
  runInContext('globalThis.updates = []; globalThis.off = window.workbench.subscribe(value => updates.push(value))', f.context)
  f.respond({ type: 'snapshot', snapshot: { stateRevision: 2 } })
  runInContext('off()', f.context)
  f.respond({ type: 'snapshot', snapshot: { stateRevision: 3 } })
  expect(runInContext('updates.length', f.context)).toBe(1)
})
it('reports script/resource failures in capture phase and rejects pending operations on timeout or unload', async () => {
  const f = fixture()
  expect(f.window.addEventListener).toHaveBeenCalledWith('error', expect.any(Function), true)
  f.events.get('error')?.({ target: new f.Element({ src: 'missing.js' }) })
  expect(f.parent.postMessage).toHaveBeenLastCalledWith({ channel: 'ai-studio-workbench-v1', type: 'error', message: '页面资源加载失败：missing.js' }, '*')
  const timed: Promise<unknown> = runInContext('window.workbench.setDraft("hello")', f.context)
  const timeoutCheck = expect(timed).rejects.toThrow('超时')
  await vi.advanceTimersByTimeAsync(15000); await timeoutCheck
  const pending: Promise<unknown> = runInContext('window.workbench.updateState({},0)', f.context)
  const unloadCheck = expect(pending).rejects.toThrow('卸载')
  f.events.get('pagehide')?.({}); await unloadCheck
  expect(f.events.has('message')).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
  await expect(runInContext('window.workbench.getInstance()', f.context)).rejects.toThrow('卸载')
})
