import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { StudioApi } from '@shared/ipc/contracts'
import type { WorkbenchCatalog, WorkbenchEntry } from '@shared/workbench/types'
import { PRESET_WORKBENCHES } from '@shared/workbench/presets'
import { defaultUiState } from '@shared/project/ui-state'
import { useProjectShell } from '../project/store'
import { useWorkbenches } from './store'
import { WorkbenchNavigation } from './WorkbenchNavigation'

const project = { id: 'p', name: 'Project', localPath: '/p', displayPath: '/p', canonicalPath: '/p', createdAt: '', lastOpenedAt: '' }
const draft = { id: 'draft', projectId: 'p', source: 'template', title: '笔记设计', directory: '/p/draft', targetInstanceId: null, viewId: 'workbench-draft:draft', origin: 'custom', kind: 'draft', runtime: 'web', icon: 'pencil', editable: true, canDisable: false } as const
const originalShell = useProjectShell.getState()
let catalog: WorkbenchCatalog, removed: WorkbenchEntry[], api: StudioApi['workbench']
function Navigation() {
  const canvas = useProjectShell(s => s.uiStates.p!.mainCanvas)
  return <WorkbenchNavigation project={project} canvas={canvas} active />
}
beforeEach(() => {
  catalog = [...PRESET_WORKBENCHES, draft]; removed = []
  useProjectShell.setState({ projects: { p: project }, uiStates: { p: defaultUiState() } })
  useWorkbenches.setState({ catalogs: {}, snapshots: {}, errors: {}, snapshotErrors: {}, loading: {}, zoom: {} })
  api = {
    startAgent: vi.fn(), listAgents: vi.fn(), getAgent: vi.fn(), stopAgent: vi.fn(),
    list: vi.fn(async () => catalog), listRemoved: vi.fn(async () => removed), getSnapshot: vi.fn(), getContext: vi.fn(), createDraft: vi.fn(), applyDraft: vi.fn(), updateState: vi.fn(), setEnabled: vi.fn(), onChanged: vi.fn(),
    rename: vi.fn(async ({ ref, title }) => { catalog = catalog.map(entry => entry.viewId === ref.viewId ? { ...entry, title } : entry); return catalog }),
    move: vi.fn(async () => catalog), deleteDraft: vi.fn(async ref => { catalog = catalog.filter(entry => entry.viewId !== ref.viewId); return catalog }),
    setVisible: vi.fn(async ({ ref, visible }) => {
      if (visible) { catalog = [...catalog, ...removed.filter(entry => entry.viewId === ref.viewId)]; removed = removed.filter(entry => entry.viewId !== ref.viewId) }
      else { removed.push(...catalog.filter(entry => entry.viewId === ref.viewId)); catalog = catalog.filter(entry => entry.viewId !== ref.viewId) }
      return catalog
    })
  }
  Object.defineProperty(window, 'studio', { configurable: true, value: { workbench: api, project: { updateUiState: vi.fn(async () => defaultUiState()) } } })
})
afterEach(async () => { cleanup(); await useProjectShell.getState().flush(); useProjectShell.setState(originalShell, true); useWorkbenches.getState().close('p') })
async function manage(name: string) { fireEvent.click(await screen.findByRole('button', { name: `管理 ${name}` })) }
const list = () => document.querySelector('.workbench-navigation__items')!

it('keeps the add control below the list and opens its choices in a floating menu', async () => {
  render(<Navigation />)
  const items = list(), add = screen.getByRole('button', { name: '添加工作台' })
  expect(items.nextElementSibling).toBe(add)
  expect(add.closest('.workbench-navigation__items')).toBeNull()
  fireEvent.click(add)
  const menu = await screen.findByRole('menu', { name: '工作台操作' })
  expect(menu.parentElement).toBe(document.body)
  expect(list()).toBe(items)
  fireEvent.keyDown(menu, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('menu', { name: '工作台操作' })).toBeNull())
})

it('adds the optional selection preset through a writable template draft', async () => {
  vi.mocked(api.createDraft).mockResolvedValue({ ...draft, title: '选品工作台' })
  render(<Navigation />)
  expect(screen.queryByRole('button', { name: /^选品工作台$/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '添加工作台' }))
  const add = await screen.findByRole('button', { name: '添加 选品工作台' })
  expect(screen.getByRole('heading', { name: '预设工作台' }).compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(add)
  await waitFor(() => expect(api.createDraft).toHaveBeenCalledExactlyOnceWith({ projectId: 'p', source: 'template', templateId: 'product-selection' }))
  expect(api.setVisible).not.toHaveBeenCalled()
  await waitFor(() => expect(useProjectShell.getState().uiStates.p?.mainCanvas).toMatchObject({ mode: 'view', viewId: draft.viewId }))
})

it('renames through the menu, keeps the dialog open on failure and retries without losing the name', async () => {
  render(<Navigation />)
  await manage('Architecture')
  fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
  const input = screen.getByRole('textbox', { name: '工作台名称' })
  expect(document.activeElement).toBe(input)
  fireEvent.change(input, { target: { value: '项目架构' } })
  vi.mocked(api.rename).mockRejectedValueOnce(new Error('磁盘不可写'))
  fireEvent.click(screen.getByRole('button', { name: '保存名称' }))
  await screen.findByText('磁盘不可写')
  expect(screen.getByRole('textbox').getAttribute('value')).toBe('项目架构')
  fireEvent.click(screen.getByRole('button', { name: '保存名称' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(screen.getByRole('button', { name: '项目架构' })).toBeTruthy()
  expect(api.rename).toHaveBeenLastCalledWith({ ref: { projectId: 'p', viewId: 'architecture' }, title: '项目架构' })
})

it('moves via menu and Alt+Arrow, and reports failed saves without changing the visible list', async () => {
  render(<Navigation />)
  await manage('Progress')
  fireEvent.click(screen.getByRole('menuitem', { name: '上移' }))
  await waitFor(() => expect(api.move).toHaveBeenCalledWith({ ref: { projectId: 'p', viewId: 'progress' }, before: 'overview' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '添加工作台' }).hasAttribute('disabled')).toBe(false))
  vi.mocked(api.move).mockRejectedValueOnce(new Error('保存失败，请重试'))
  fireEvent.keyDown(screen.getByRole('button', { name: 'Overview' }), { key: 'ArrowDown', altKey: true })
  await screen.findByText('保存失败，请重试')
  expect(api.move).toHaveBeenLastCalledWith({ ref: { projectId: 'p', viewId: 'overview' }, before: 'architecture' })
  expect(list().querySelector('button')?.textContent).toBe('Overview')
})

it('removes the selected preset, selects a neighbor and restores it using the add chooser', async () => {
  render(<Navigation />)
  await manage('Overview')
  fireEvent.click(screen.getByRole('menuitem', { name: '移除工作台' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Overview' })).toBeNull())
  expect(useProjectShell.getState().uiStates.p?.mainCanvas).toMatchObject({ mode: 'view', viewId: 'progress' })
  fireEvent.click(screen.getByRole('button', { name: '添加工作台' }))
  const add = await screen.findByRole('button', { name: '添加 Overview' })
  await waitFor(() => expect(add.hasAttribute('disabled')).toBe(false))
  expect(screen.getByRole('button', { name: '添加 Progress' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(add)
  await screen.findByRole('button', { name: 'Overview' })
  expect(useProjectShell.getState().uiStates.p?.mainCanvas).toMatchObject({ mode: 'view', viewId: 'overview' })
})

it('cancels draft deletion, then deletes with confirmation and shows the empty-list state', async () => {
  catalog = [draft]
  useProjectShell.setState({ uiStates: { p: { ...defaultUiState(), mainCanvas: { mode: 'view', viewId: draft.viewId, conversation: { kind: 'draft' } } } } })
  render(<Navigation />)
  await manage('草稿：笔记设计')
  fireEvent.click(screen.getByRole('menuitem', { name: '删除草稿…' }))
  expect(screen.getByRole('dialog').textContent).toContain('项目文件、已有工作台和会话历史会保留')
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(api.deleteDraft).not.toHaveBeenCalled()
  await manage('草稿：笔记设计')
  fireEvent.click(screen.getByRole('menuitem', { name: '删除草稿…' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '删除草稿' }))
  await screen.findByText('还没有工作台，点击 + 添加。')
  expect(api.deleteDraft).toHaveBeenCalledExactlyOnceWith({ projectId: 'p', viewId: draft.viewId })
  expect(useProjectShell.getState().uiStates.p?.mainCanvas).toEqual({ mode: 'draft' })
})

it('keeps a later workbench selection when an earlier removal finishes', async () => {
  let finish!: () => void
  vi.mocked(api.setVisible).mockImplementationOnce(async ({ ref }) => {
    await new Promise<void>(resolve => { finish = resolve })
    catalog = catalog.filter(entry => entry.viewId !== ref.viewId)
    return catalog
  })
  render(<Navigation />)
  await manage('Overview')
  fireEvent.click(screen.getByRole('menuitem', { name: '移除工作台' }))
  fireEvent.click(screen.getByRole('button', { name: 'Business Flow' }))
  finish()
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Overview' })).toBeNull())
  expect(useProjectShell.getState().uiStates.p?.mainCanvas).toMatchObject({ mode: 'view', viewId: 'business-flow' })
})

it('restores keyboard focus to the management button after canceling rename', async () => {
  render(<Navigation />)
  await manage('Architecture')
  const anchor = screen.getByRole('button', { name: '管理 Architecture' })
  fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(document.activeElement).toBe(anchor)
})
