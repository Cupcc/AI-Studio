import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WORKBENCH_MESSAGE, type WorkbenchSnapshot } from '@shared/workbench/types'
import { attachWorkbenchPageBridge } from './page-bridge'

const snapshot = (): WorkbenchSnapshot => ({
  target: { projectId: 'p', kind: 'instance', id: 'one' }, manifest: { schemaVersion: 1, sdkVersion: 1, pluginId: 'local.notes', title: 'Notes', version: '1.0.0', entry: 'index.html', capabilities: ['state.read', 'state.write', 'conversation.draft'] },
  state: { count: 1 }, stateRevision: 1, packageRevision: 'r1', pageUrl: 'app://workbench/one/index.html', enabled: true
})
let iframe: HTMLIFrameElement, frame: Window, dispose: () => void
const updateState = vi.fn(), setDraft = vi.fn(), ready = vi.fn(), error = vi.fn()
let current: WorkbenchSnapshot
function emit(data: object, source = frame) { window.dispatchEvent(new MessageEvent('message', { source, data: { channel: WORKBENCH_MESSAGE, ...data } })) }
beforeEach(() => {
  vi.clearAllMocks(); current = snapshot()
  iframe = document.createElement('iframe'); document.body.append(iframe); frame = iframe.contentWindow!
  updateState.mockResolvedValue({ ...current, state: { count: 2 }, stateRevision: 2 }); setDraft.mockResolvedValue(undefined)
  dispose = attachWorkbenchPageBridge({ frame, snapshot: () => current, updateState, setDraft, ready, error })
})
afterEach(() => { dispose(); iframe.remove(); vi.restoreAllMocks() })
it('routes only the current page and stops requests after detach', async () => {
  const post = vi.spyOn(frame, 'postMessage')
  emit({ type: 'request', id: 'wrong', method: 'updateState', params: { state: 2, expectedRevision: 1 } }, window)
  expect(updateState).not.toHaveBeenCalled()
  emit({ type: 'request', id: 'ok', method: 'updateState', params: { state: { count: 2 }, expectedRevision: 1 } })
  await vi.waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ id: 'ok', ok: true, result: expect.objectContaining({ stateRevision: 2 }) }), '*'))
  dispose()
  emit({ type: 'request', id: 'late', method: 'updateState', params: { state: 3, expectedRevision: 2 } })
  expect(updateState).toHaveBeenCalledTimes(1)
})
it('returns concrete save failure without pretending it saved', async () => {
  const post = vi.spyOn(frame, 'postMessage')
  updateState.mockRejectedValue(new Error('state revision conflict'))
  emit({ type: 'request', id: 'save', method: 'updateState', params: { state: null, expectedRevision: 0 } })
  await vi.waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ id: 'save', ok: false, error: 'state revision conflict' }), '*'))
  expect(post).not.toHaveBeenCalledWith(expect.objectContaining({ ok: true }), '*')
})
it('refuses unknown operations, malformed state and undeclared capabilities', async () => {
  const post = vi.spyOn(frame, 'postMessage')
  emit({ type: 'request', id: 'unknown', method: 'sendMessage', params: { text: 'run' } })
  emit({ type: 'request', id: 'invalid', method: 'updateState', params: { state: NaN, expectedRevision: 0 } })
  current.manifest.capabilities = ['state.read']
  emit({ type: 'request', id: 'denied', method: 'setDraft', params: { text: 'run' } })
  await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(3))
  expect(setDraft).not.toHaveBeenCalled(); expect(updateState).not.toHaveBeenCalled()
  expect(post).toHaveBeenCalledWith(expect.objectContaining({ id: 'denied', ok: false, error: '此工作台未声明填写对话草稿能力' }), '*')
})
it('does not answer a pending request after the page unmounts', async () => {
  const post = vi.spyOn(frame, 'postMessage')
  let finish!: (snapshot: WorkbenchSnapshot) => void
  updateState.mockImplementation(() => new Promise<WorkbenchSnapshot>(resolve => { finish = resolve }))
  emit({ type: 'request', id: 'pending', method: 'updateState', params: { state: 2, expectedRevision: 1 } })
  dispose(); finish(current); await Promise.resolve(); await Promise.resolve()
  expect(post).not.toHaveBeenCalled()
})
it('re-mounting does not keep duplicate listeners and reports page failures', () => {
  dispose()
  dispose = attachWorkbenchPageBridge({ frame, snapshot: () => current, updateState, setDraft, ready, error })
  emit({ type: 'ready' }); emit({ type: 'error', message: 'ReferenceError: missing function' })
  expect(ready).toHaveBeenCalledTimes(1)
  expect(error).toHaveBeenCalledExactlyOnceWith('ReferenceError: missing function')
})
