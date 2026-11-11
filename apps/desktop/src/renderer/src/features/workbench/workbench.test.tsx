import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WORKBENCH_MESSAGE, type WorkbenchChange, type WorkbenchPageSnapshot, type WorkbenchSnapshot } from '@shared/workbench/types'
import type { StudioApi } from '@shared/ipc/contracts'
import { defaultUiState } from '@shared/project/ui-state'
import { WorkbenchPreview } from './WorkbenchPreview'
import { useWorkbenches, watchWorkbenches } from './store'

const project = { id: 'p', name: 'Project', localPath: '/p', displayPath: '/p', canonicalPath: '/p', createdAt: '', lastOpenedAt: '' }
const entry = { id: 'draft', projectId: 'p', source: 'template', title: '笔记', directory: '/p/draft', targetInstanceId: null, viewId: 'workbench-draft:draft', origin: 'custom', kind: 'draft', icon: 'pencil', editable: true, canDisable: false } as const
const makeSnapshot = (): WorkbenchSnapshot & { page: WorkbenchPageSnapshot } => ({
  ref: { projectId: 'p', viewId: entry.viewId }, status: 'ready', error: null, revision: 1, entry,
  page: {
    target: { projectId: 'p', kind: 'draft', id: 'draft' }, manifest: { schemaVersion: 1, sdkVersion: 1, pluginId: 'notes', version: '1.0.0', title: '笔记', entry: 'index.html', capabilities: ['state.read', 'state.write'] },
    packageRevision: 'r1', stateRevision: 0, state: null, pageUrl: 'app://workbench/draft/index.html', enabled: true
  }
})
let api: StudioApi['workbench'], snapshot: ReturnType<typeof makeSnapshot>
let change: (event: WorkbenchChange) => void, detach: () => void
beforeEach(() => {
  snapshot = makeSnapshot()
  api = {
    list: vi.fn(async () => [entry]), listRemoved: vi.fn(async () => []), rename: vi.fn(), move: vi.fn(), setVisible: vi.fn(), deleteDraft: vi.fn(), createDraft: vi.fn(), getContext: vi.fn(),
    getSnapshot: vi.fn(async () => snapshot), applyDraft: vi.fn(),
    updateState: vi.fn(async () => ({ ...snapshot, revision: 2, page: { ...snapshot.page, stateRevision: 1, state: { count: 1 } } })),
    setEnabled: vi.fn(), onChanged: vi.fn(listener => { change = listener; return () => {} })
  }
  Object.defineProperty(window, 'studio', { configurable: true, value: { workbench: api } })
  useWorkbenches.setState({ catalogs: { p: [entry] }, snapshots: {}, errors: {}, snapshotErrors: {}, loading: {}, zoom: {} })
  detach = watchWorkbenches()
})
afterEach(() => { cleanup(); detach(); useWorkbenches.getState().close('p') })
async function mount() {
  const props = { project, canvas: defaultUiState().mainCanvas, active: true, viewId: entry.viewId }
  const rendered = render(<WorkbenchPreview {...props} />)
  await waitFor(() => expect(document.querySelector('iframe')).toBeTruthy())
  const frame = document.querySelector('iframe')!.contentWindow!
  const emit = (data: object) => act(() => { window.dispatchEvent(new MessageEvent('message', { source: frame, data: { channel: WORKBENCH_MESSAGE, ...data } })) })
  return { ...rendered, props, frame, emit }
}
it('requires the page connection before applying and retains runtime error until reload', async () => {
  const { emit } = await mount()
  expect(screen.getByRole('button', { name: '添加至当前项目' }).hasAttribute('disabled')).toBe(true)
  emit({ type: 'ready' })
  expect(screen.getByRole('button', { name: '添加至当前项目' }).hasAttribute('disabled')).toBe(false)
  emit({ type: 'error', message: 'Missing function' }); emit({ type: 'ready' })
  expect(screen.getByRole('alert').textContent).toContain('Missing function')
  expect(screen.getByRole('button', { name: '添加至当前项目' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '重试预览' }))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
})
it('reports save failures and keeps the same page for successful state updates', async () => {
  const { emit } = await mount(), iframe = document.querySelector('iframe')
  vi.mocked(api.updateState).mockRejectedValueOnce(new Error("Error invoking remote method 'workbench:update-state': Error: 磁盘不可写"))
  emit({ type: 'request', id: 'fail', method: 'updateState', params: { state: { count: 1 }, expectedRevision: 0 } })
  await screen.findByText('保存失败：磁盘不可写')
  expect(screen.queryByText(/Error invoking remote method/)).toBeNull()
  emit({ type: 'request', id: 'ok', method: 'updateState', params: { state: { count: 1 }, expectedRevision: 0 } })
  await screen.findByText('已保存')
  expect(api.updateState).toHaveBeenLastCalledWith({ ref: snapshot.ref, state: { count: 1 }, expectedRevision: 0 })
  expect(document.querySelector('iframe')).toBe(iframe)
})
it('unloads the iframe when the Project is hidden and ignores messages from the old page', async () => {
  const { rerender, props, emit } = await mount()
  rerender(<WorkbenchPreview {...props} active={false} />)
  expect(document.querySelector('iframe')).toBeNull()
  emit({ type: 'request', id: 'late', method: 'updateState', params: { state: 1, expectedRevision: 0 } })
  expect(api.updateState).not.toHaveBeenCalled()
})
it('waits for the new revision to connect before applying after a full snapshot event', async () => {
  const { emit } = await mount()
  emit({ type: 'ready' })
  expect(screen.getByRole('button', { name: '添加至当前项目' }).hasAttribute('disabled')).toBe(false)
  snapshot = { ...snapshot, revision: 2, page: { ...snapshot.page, packageRevision: 'r2', pageUrl: 'app://workbench/draft/r2/index.html' } }
  act(() => change({ kind: 'snapshot', snapshot }))
  await waitFor(() => expect(document.querySelector('iframe')?.getAttribute('src')).toContain('/r2/'))
  expect(screen.getByRole('button', { name: '添加至当前项目' }).hasAttribute('disabled')).toBe(true)
  const frame = document.querySelector('iframe')!.contentWindow!
  act(() => window.dispatchEvent(new MessageEvent('message', { source: frame, data: { channel: WORKBENCH_MESSAGE, type: 'ready' } })))
  vi.mocked(api.applyDraft).mockRejectedValueOnce(new Error('test stops after application request'))
  fireEvent.click(screen.getByRole('button', { name: '添加至当前项目' }))
  await waitFor(() => expect(api.applyDraft).toHaveBeenCalledExactlyOnceWith({ ref: snapshot.ref, expectedPackageRevision: 'r2' }))
  expect(api.getSnapshot).toHaveBeenCalledTimes(1)
})
it('clears a pending-save indicator after hiding and reading the saved state again', async () => {
  const { rerender, props, emit } = await mount()
  let finish!: (value: WorkbenchSnapshot) => void
  vi.mocked(api.updateState).mockImplementationOnce(() => new Promise<WorkbenchSnapshot>(resolve => { finish = resolve }))
  emit({ type: 'request', id: 'pending', method: 'updateState', params: { state: { count: 1 }, expectedRevision: 0 } })
  expect(screen.getByText('正在保存…')).toBeTruthy()
  rerender(<WorkbenchPreview {...props} active={false} />)
  snapshot = { ...snapshot, revision: 2, page: { ...snapshot.page, state: { count: 1 }, stateRevision: 1 } }
  await act(async () => { finish(snapshot); await Promise.resolve() })
  rerender(<WorkbenchPreview {...props} active />)
  await waitFor(() => expect(screen.queryByText('正在保存…')).toBeNull())
  expect(screen.getByText('已读取保存状态')).toBeTruthy()
})
