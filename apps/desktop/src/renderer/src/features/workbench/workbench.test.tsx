import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WORKBENCH_MESSAGE, type WorkbenchCapability, type WorkbenchChange, type WorkbenchEntry, type WorkbenchPageSnapshot, type WorkbenchSnapshot } from '@shared/workbench/types'
import type { StudioApi } from '@shared/ipc/contracts'
import { defaultUiState } from '@shared/project/ui-state'
import type { ViewSlotProps } from '../project/integration'
import { WorkbenchPreview } from './WorkbenchPreview'
import { WorkbenchHeader } from './WorkbenchHeader'
import { describeCapabilities } from './WorkbenchControls'
import { useWorkbenches, watchWorkbenches } from './store'

const project = { id: 'p', name: 'Project', localPath: '/p', displayPath: '/p', canonicalPath: '/p', createdAt: '', lastOpenedAt: '' }
const draft = { id: 'draft', projectId: 'p', source: 'template', title: '笔记', directory: '/p/draft', targetInstanceId: null, viewId: 'workbench-draft:draft', origin: 'custom', kind: 'draft', icon: 'pencil', editable: true, canDisable: false } as const
const instance = { id: 'one', projectId: 'p', pluginId: 'notes', packageRevision: 'r1', title: '随手记', enabled: true, viewId: 'workbench:one', origin: 'custom', kind: 'instance', icon: 'preview', editable: true, canDisable: true } as const
const makeSnapshot = (entry: typeof draft | typeof instance = draft, enabled = true): WorkbenchSnapshot & { page: WorkbenchPageSnapshot } => ({
  ref: { projectId: 'p', viewId: entry.viewId }, status: 'ready', error: null, revision: 1, entry,
  page: {
    target: { projectId: 'p', kind: entry.kind === 'draft' ? 'draft' : 'instance', id: entry.id }, manifest: { schemaVersion: 1, sdkVersion: 1, pluginId: 'notes', version: '1.2.0', title: '笔记', entry: 'index.html', capabilities: ['state.read', 'state.write', 'conversation.draft'] },
    packageRevision: 'r1', stateRevision: 0, state: null, pageUrl: 'app://workbench/draft/index.html', enabled
  }
})
let api: StudioApi['workbench'], snapshot: ReturnType<typeof makeSnapshot>
let change: (event: WorkbenchChange) => void, detach: () => void
beforeEach(() => {
  snapshot = makeSnapshot()
  api = {
    startAgent: vi.fn(), listAgents: vi.fn(), getAgent: vi.fn(), stopAgent: vi.fn(),
    list: vi.fn(async () => [draft, instance]), listRemoved: vi.fn(async () => []), rename: vi.fn(), move: vi.fn(), setVisible: vi.fn(), deleteDraft: vi.fn(), createDraft: vi.fn(), getContext: vi.fn(),
    getSnapshot: vi.fn(async () => snapshot), applyDraft: vi.fn(),
    updateState: vi.fn(async () => ({ ...snapshot, revision: 2, page: { ...snapshot.page, stateRevision: 1, state: { count: 1 } } })),
    setEnabled: vi.fn(async ({ enabled }) => { snapshot = { ...makeSnapshot(instance, enabled), revision: snapshot.revision + 1 }; return { ...instance, enabled } }),
    onChanged: vi.fn(listener => { change = listener; return () => {} })
  }
  Object.defineProperty(window, 'studio', { configurable: true, value: { workbench: api } })
  useWorkbenches.setState({ catalogs: { p: [draft, instance] }, snapshots: {}, errors: {}, snapshotErrors: {}, loading: {}, hosts: {} })
  detach = watchWorkbenches()
})
afterEach(() => { cleanup(); detach(); useWorkbenches.getState().close('p') })
/** The right-area header parts and the page body, as Workspace renders them for a workbench view. */
function Host(props: ViewSlotProps) {
  return <><header><span>title</span><WorkbenchHeader {...props} part="status" /><WorkbenchHeader {...props} part="actions" /><WorkbenchHeader {...props} part="menu" /></header><WorkbenchPreview {...props} /></>
}
async function mount(entry: WorkbenchEntry = draft) {
  const props = { project, canvas: defaultUiState().mainCanvas, active: true, viewId: entry.viewId }
  const rendered = render(<Host {...props} />)
  await waitFor(() => expect(document.querySelector('iframe')).toBeTruthy())
  const first = document.querySelector('iframe')!.contentWindow!
  // Messages come from the current page, or from the unloaded first page once it is gone.
  const emit = (data: object) => act(() => { window.dispatchEvent(new MessageEvent('message', { source: document.querySelector('iframe')?.contentWindow ?? first, data: { channel: WORKBENCH_MESSAGE, ...data } })) })
  return { ...rendered, props, emit }
}
const status = () => screen.getByRole('status')
const openMenu = () => { fireEvent.click(screen.getByRole('button', { name: '更多操作' })); return screen.getByRole('menu', { name: '更多操作' }) }

it('requires the page connection before applying and retains runtime error until reload', async () => {
  const { emit } = await mount()
  expect(screen.getByText('草稿').className).toContain('workbench-chip--draft')
  expect(status().textContent).toBe('正在加载页面…')
  expect(screen.getByRole('button', { name: '添加至当前项目' }).hasAttribute('disabled')).toBe(true)
  emit({ type: 'ready' })
  expect(screen.getByRole('button', { name: '添加至当前项目' }).hasAttribute('disabled')).toBe(false)
  emit({ type: 'error', message: 'Missing function' }); emit({ type: 'ready' })
  expect(screen.getByRole('alert').textContent).toContain('Missing function')
  expect(status().textContent).toBe('页面未正常运行')
  expect(status().querySelector('.workbench-status-dot--error')).toBeTruthy()
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
  emit({ type: 'ready' })
  emit({ type: 'request', id: 'ok', method: 'updateState', params: { state: { count: 1 }, expectedRevision: 0 } })
  await waitFor(() => expect(status().textContent).toBe('运行正常 · 已保存'))
  expect(status().getAttribute('data-tip')).toBe('运行正常 · 已保存')
  expect(status().querySelector('.sr-only')).toBeTruthy()
  expect(api.updateState).toHaveBeenLastCalledWith({ ref: snapshot.ref, state: { count: 1 }, expectedRevision: 0 })
  expect(document.querySelector('iframe')).toBe(iframe)
})
it('unloads the iframe when the Project is hidden and ignores messages from the old page', async () => {
  const { rerender, props, emit } = await mount()
  rerender(<Host {...props} active={false} />)
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
  emit({ type: 'ready' })
  vi.mocked(api.applyDraft).mockRejectedValueOnce(new Error('test stops after application request'))
  fireEvent.click(screen.getByRole('button', { name: '添加至当前项目' }))
  await waitFor(() => expect(api.applyDraft).toHaveBeenCalledExactlyOnceWith({ ref: snapshot.ref, expectedPackageRevision: 'r2' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('test stops after application request'))
  expect(api.getSnapshot).toHaveBeenCalledTimes(1)
})
it('clears a pending-save indicator after hiding and reading the saved state again', async () => {
  const { rerender, props, emit } = await mount()
  emit({ type: 'ready' })
  let finish!: (value: WorkbenchSnapshot) => void
  vi.mocked(api.updateState).mockImplementationOnce(() => new Promise<WorkbenchSnapshot>(resolve => { finish = resolve }))
  emit({ type: 'request', id: 'pending', method: 'updateState', params: { state: { count: 1 }, expectedRevision: 0 } })
  expect(status().textContent).toBe('运行正常 · 正在保存…')
  rerender(<Host {...props} active={false} />)
  snapshot = { ...snapshot, revision: 2, page: { ...snapshot.page, state: { count: 1 }, stateRevision: 1 } }
  await act(async () => { finish(snapshot); await Promise.resolve() })
  rerender(<Host {...props} active />)
  await waitFor(() => expect(document.querySelector('iframe')).toBeTruthy())
  emit({ type: 'ready' })
  expect(status().textContent).toBe('运行正常 · 已读取保存状态')
})
it('keeps a healthy instance silent and offers its actions in the "更多操作" menu', async () => {
  snapshot = makeSnapshot(instance)
  const { emit } = await mount(instance)
  emit({ type: 'ready' })
  expect(document.querySelector('.workbench-toolbar, .workbench-details, .workbench-status, .text-button')).toBeNull()
  expect(document.querySelector('.workbench-preview')?.firstElementChild?.className).toBe('workbench-page-viewport')
  expect(screen.queryByRole('button', { name: '添加至当前项目' })).toBeNull()
  expect(screen.queryByText('草稿')).toBeNull()
  const button = screen.getByRole('button', { name: '更多操作' })
  expect(button.getAttribute('aria-haspopup')).toBe('menu')
  const menu = openMenu()
  expect(button.getAttribute('aria-expanded')).toBe('true')
  expect(within(menu).getAllByRole('menuitem').map(item => item.textContent)).toEqual(['编辑工作台', '重新加载', '关于此工作台1.2.0', '停用工作台'])
  expect(within(menu).getByRole('menuitem', { name: '停用工作台' }).className).toContain('workbench-menu__danger')
  fireEvent.keyDown(menu, { key: 'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(document.activeElement).toBe(button)
  openMenu()
  act(() => { window.dispatchEvent(new Event('blur')) })
  expect(screen.queryByRole('menu')).toBeNull()
  openMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: '重新加载' }))
  await waitFor(() => expect(api.getSnapshot).toHaveBeenCalledTimes(2))
  expect(status().textContent).toBe('正在加载页面…')
})
it('disables without confirmation, shows the idle page and enables again', async () => {
  snapshot = makeSnapshot(instance)
  const { emit } = await mount(instance)
  emit({ type: 'ready' })
  openMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: '停用工作台' }))
  await waitFor(() => expect(api.setEnabled).toHaveBeenCalledExactlyOnceWith({ ref: snapshot.ref, enabled: false }))
  await screen.findByRole('heading', { name: '此工作台已停用' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.querySelector('iframe')).toBeNull()
  expect(status().textContent).toBe('已停用')
  expect(within(openMenu()).getByRole('menuitem', { name: '启用工作台' }).className).not.toContain('workbench-menu__danger')
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  fireEvent.click(screen.getByRole('button', { name: '启用工作台' }))
  await waitFor(() => expect(document.querySelector('iframe')).toBeTruthy())
  expect(api.setEnabled).toHaveBeenLastCalledWith({ ref: snapshot.ref, enabled: true })
})
it('describes the workbench in the about dialog and returns focus on Esc', async () => {
  await mount()
  const menu = openMenu()
  expect(within(menu).queryByRole('menuitem', { name: '编辑工作台' })).toBeNull()
  expect(within(menu).queryByRole('menuitem', { name: '停用工作台' })).toBeNull()
  fireEvent.click(within(menu).getByRole('menuitem', { name: '关于此工作台' }))
  const dialog = screen.getByRole('dialog', { name: '关于此工作台' })
  expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '关闭' }))
  for (const text of ['内置模板', 'notes', '1.2.0', '正在加载页面…', '读写本工作台保存的数据', '把内容填入对话草稿，发送仍由你确认', '/p/draft']) expect(within(dialog).getByText(text)).toBeTruthy()
  expect(dialog.textContent).toContain('只复制项目目录无法恢复全部状态')
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '更多操作' }))
})
it('maps capabilities to plain language and keeps unknown ids', () => {
  expect(describeCapabilities(['state.write', 'session.open', 'agent.execute', 'future.thing' as WorkbenchCapability])).toEqual(['读写本工作台保存的数据', '打开会话', '调用 Agent 执行任务', 'future.thing'])
})
