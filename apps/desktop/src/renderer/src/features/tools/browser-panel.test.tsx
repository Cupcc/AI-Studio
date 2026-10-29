import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { BrowserState } from '@shared/tools/browser'
import { browserApi, type BrowserApi } from './api'
import { BrowserPanel, previewBounds } from './BrowserPanel'
import { popupMenu } from '../../lib/menu'

vi.mock('./api', () => ({ browserApi: vi.fn() }))
vi.mock('../../lib/menu', () => ({ popupMenu: vi.fn(), below: () => ({ x: 0, y: 0 }), separator: { type: 'separator' } }))
let api: BrowserApi, changed: (state: BrowserState) => void
const state = (patch: Partial<BrowserState> = {}): BrowserState => ({ projectId: 'p', generation: 'g1', revision: 1, address: '', title: '', status: 'idle', error: null, visible: false, externalRequest: null, canGoBack: false, canGoForward: false, devTools: false, zoom: 100, notice: null, tabs: [], favorite: false, permissionRequest: null, ...patch })
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 600, top: 130, right: 1000, bottom: 700, x: 600, y: 130, width: 400, height: 570, toJSON() {} })
  api = {
    getState: vi.fn().mockResolvedValue(state()), navigate: vi.fn().mockResolvedValue(state({ revision: 2, address: 'http://localhost:3000/', status: 'loading' })),
    reload: vi.fn().mockResolvedValue(state({ revision: 3, address: 'http://localhost:3000/', status: 'loading' })),
    setBounds: vi.fn().mockResolvedValue(state()), setVisible: vi.fn().mockResolvedValue(state()), focus: vi.fn().mockResolvedValue(undefined),
    openExternal: vi.fn().mockResolvedValue(state({ revision: 4 })), dismissExternal: vi.fn().mockResolvedValue(state({ revision: 4 })),
    stop: vi.fn().mockResolvedValue(state({ revision: 7 })), goBack: vi.fn().mockResolvedValue(state({ revision: 7 })), goForward: vi.fn().mockResolvedValue(state({ revision: 7 })),
    toggleDevTools: vi.fn().mockResolvedValue(state({ revision: 7, devTools: true })), zoom: vi.fn().mockResolvedValue(state({ revision: 7, zoom: 110 })),
    openInSystemBrowser: vi.fn().mockResolvedValue(state({ revision: 7 })), clearData: vi.fn().mockResolvedValue(state({ revision: 7, notice: '已清除' })),
    dismissNotice: vi.fn().mockResolvedValue(state({ revision: 8 })),
    newTab: vi.fn().mockResolvedValue(state({ revision: 9 })), selectTab: vi.fn().mockResolvedValue(state({ revision: 9 })), closeTab: vi.fn().mockResolvedValue(state({ revision: 9 })),
    toggleFavorite: vi.fn().mockResolvedValue(state({ revision: 9, favorite: true })), suggest: vi.fn().mockResolvedValue([]),
    clearHistory: vi.fn().mockResolvedValue(state({ revision: 9 })), answerPermission: vi.fn().mockResolvedValue(state({ revision: 9 })),
    resetPermissions: vi.fn().mockResolvedValue(state({ revision: 9 })),
    onStateChanged: vi.fn(listener => { changed = listener; return () => {} }),
    onFocusAddress: vi.fn(() => () => {})
  }
  vi.mocked(browserApi).mockReturnValue(api)
})
afterEach(async () => { cleanup(); await act(async () => {}); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('waits for the restored background Project to be selected before creating a Browser and keeps it on later switches', async () => {
  const view = render(<BrowserPanel projectId="p" active={false} />)
  expect(api.getState).not.toHaveBeenCalled()
  expect(api.onStateChanged).not.toHaveBeenCalled()
  view.rerender(<BrowserPanel projectId="p" active />)
  await screen.findByText('打开网页')
  expect(api.getState).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByRole('combobox', { name: '网址' }), { target: { value: 'http://localhost:4000' } })
  view.rerender(<BrowserPanel projectId="p" active={false} />)
  view.rerender(<BrowserPanel projectId="p" active />)
  expect(api.getState).toHaveBeenCalledTimes(1)
  expect((screen.getByRole('combobox', { name: '网址' }) as HTMLInputElement).value).toBe('http://localhost:4000')
})

it('navigates from the address bar, shows loading and reloads the local address', async () => {
  render(<BrowserPanel projectId="p" active />)
  await screen.findByText('打开网页')
  fireEvent.change(screen.getByRole('combobox', { name: '网址' }), { target: { value: 'http://localhost:3000' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Browser 导航' }))
  await screen.findByText('正在加载网页…')
  expect(api.navigate).toHaveBeenCalledWith({ projectId: 'p', generation: 'g1', url: 'http://localhost:3000' })
  // While loading the button stops the load; once loaded it reloads.
  expect(screen.getByRole('button', { name: '停止加载' })).toBeTruthy()
  act(() => changed(state({ revision: 10, address: 'http://localhost:3000/', status: 'ready' })))
  fireEvent.click(screen.getByRole('button', { name: '刷新网页' }))
  await waitFor(() => expect(api.reload).toHaveBeenCalledWith({ projectId: 'p', generation: 'g1' }))
})

it('keeps a newer load failure when an older navigate response arrives and offers recovery', async () => {
  let resolve!: (result: BrowserState) => void
  vi.mocked(api.navigate).mockReturnValue(new Promise(done => { resolve = done }))
  render(<BrowserPanel projectId="p" active />)
  await screen.findByText('打开网页')
  fireEvent.change(screen.getByRole('combobox', { name: '网址' }), { target: { value: 'http://localhost:3000' } })
  fireEvent.submit(screen.getByRole('form'))
  act(() => changed(state({ revision: 4, address: 'http://localhost:3000/', status: 'failed', error: '服务器不可达' })))
  await act(async () => resolve(state({ revision: 2, address: 'http://localhost:3000/', status: 'loading' })))
  expect(screen.getByText('服务器不可达')).toBeTruthy()
  expect(screen.queryByText('正在加载网页…')).toBeNull()
  vi.mocked(api.reload).mockResolvedValue(state({ revision: 5, address: 'http://localhost:3000/', status: 'loading' }))
  fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
  await screen.findByText('正在加载网页…')
})

it('prompts before a mailto: link and calls only the selected action', async () => {
  render(<BrowserPanel projectId="p" active />)
  await screen.findByText('打开网页')
  const externalRequest = { id: 'request', url: 'mailto:dev@example.com', source: 'window' as const }
  act(() => changed(state({ revision: 3, externalRequest })))
  expect(screen.getByRole('alertdialog')).toBeTruthy()
  expect(api.openExternal).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(api.dismissExternal).toHaveBeenCalledWith({ projectId: 'p', generation: 'g1', requestId: 'request' })
  act(() => changed(state({ revision: 5, externalRequest: { ...externalRequest, id: 'second' } })))
  vi.mocked(api.openExternal).mockResolvedValue(state({ revision: 6 }))
  fireEvent.click(screen.getByRole('button', { name: '打开' }))
  await waitFor(() => expect(api.openExternal).toHaveBeenCalledWith({ projectId: 'p', generation: 'g1', requestId: 'second' }))
})

it('hides native content for an inactive Project, application overlay and unmount without disposing the resource', async () => {
  vi.mocked(api.getState).mockResolvedValue(state({ address: 'http://localhost:3000/', status: 'ready' }))
  const view = render(<BrowserPanel projectId="p" active />)
  await waitFor(() => expect(api.setVisible).toHaveBeenCalledWith({ projectId: 'p', generation: 'g1', visible: true }))
  view.rerender(<BrowserPanel projectId="p" active overlayBlocked />)
  await waitFor(() => expect(vi.mocked(api.setVisible).mock.calls.at(-1)?.[0].visible).toBe(false))
  view.rerender(<BrowserPanel projectId="p" active={false} />)
  await act(async () => {})
  view.unmount()
  await waitFor(() => expect(vi.mocked(api.setVisible).mock.calls.at(-1)?.[0].visible).toBe(false))
  expect(api.setBounds).toHaveBeenCalledWith({ projectId: 'p', generation: 'g1', bounds: { x: 600, y: 130, width: 400, height: 570 } })
})

it('ignores another Project or generation and reports rejected input with an editable address', async () => {
  vi.mocked(api.navigate).mockRejectedValue(new Error('只支持本地 HTTP 地址'))
  render(<BrowserPanel projectId="p" active />)
  await screen.findByText('打开网页')
  act(() => { changed(state({ generation: 'old', revision: 100, status: 'failed', error: 'old' })); changed(state({ projectId: 'other', revision: 100, status: 'failed', error: 'other' })) })
  fireEvent.change(screen.getByRole('combobox', { name: '网址' }), { target: { value: 'file:///tmp/private' } })
  fireEvent.submit(screen.getByRole('form'))
  await screen.findByText('Error: 只支持本地 HTTP 地址')
  expect(screen.getByRole('combobox', { name: '网址' }).getAttribute('disabled')).toBeNull()
  expect(screen.queryByText('old')).toBeNull(); expect(screen.queryByText('other')).toBeNull()
})

it('clips preview bounds to the renderer viewport and keeps hidden hosts at zero size', () => {
  expect(previewBounds({ left: -20, top: -10, right: 1200, bottom: 900 } as DOMRect, 1024, 768)).toEqual({ x: 0, y: 0, width: 1024, height: 768 })
  expect(previewBounds({ left: 2000, top: 2000, right: 2400, bottom: 2500 } as DOMRect, 1024, 768)).toEqual({ x: 1024, y: 768, width: 0, height: 0 })
})

it('goes back, forward and stops, and restores the address with Escape', async () => {
  vi.mocked(api.getState).mockResolvedValue(state({ address: 'https://example.com/b', status: 'ready', canGoBack: true }))
  render(<BrowserPanel projectId="p" active />)
  const back = await screen.findByRole('button', { name: '后退' })
  expect((screen.getByRole('button', { name: '前进' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(back)
  await waitFor(() => expect(api.goBack).toHaveBeenCalledWith({ projectId: 'p', generation: 'g1' }))
  act(() => changed(state({ revision: 20, address: 'https://example.com/c', status: 'loading' })))
  fireEvent.click(await screen.findByRole('button', { name: '停止加载' }))
  await waitFor(() => expect(api.stop).toHaveBeenCalled())
  const address = screen.getByRole('combobox', { name: '网址' }) as HTMLInputElement
  fireEvent.change(address, { target: { value: 'typo' } })
  fireEvent.keyDown(address, { key: 'Escape' })
  expect(address.value).toBe('https://example.com/c')
})

it('runs the More menu actions and confirms before clearing the shared browsing data', async () => {
  vi.mocked(api.getState).mockResolvedValue(state({ address: 'https://example.com/', status: 'ready' }))
  render(<BrowserPanel projectId="p" active />)
  const more = await screen.findByRole('button', { name: '更多 Browser 操作' })
  vi.mocked(popupMenu).mockResolvedValueOnce('devtools')
  fireEvent.click(more)
  await waitFor(() => expect(api.toggleDevTools).toHaveBeenCalledWith({ projectId: 'p', generation: 'g1' }))
  vi.mocked(popupMenu).mockResolvedValueOnce('zoom-in')
  fireEvent.click(more)
  await waitFor(() => expect(api.zoom).toHaveBeenCalledWith({ projectId: 'p', generation: 'g1', zoom: 'in' }))
  vi.mocked(popupMenu).mockResolvedValueOnce('system')
  fireEvent.click(more)
  await waitFor(() => expect(api.openInSystemBrowser).toHaveBeenCalled())
  vi.mocked(popupMenu).mockResolvedValueOnce('clear')
  fireEvent.click(more)
  const dialog = await screen.findByRole('alertdialog', { name: '清除浏览数据？' })
  expect(api.clearData).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: '清除' }))
  await waitFor(() => expect(api.clearData).toHaveBeenCalled())
  expect(await screen.findByText('已清除')).toBeTruthy()
})

it('shows several tabs, switches and closes them, stars the page and answers a site permission prompt', async () => {
  const tabs = [{ generation: 'g1', title: 'Local app', address: 'http://localhost:3000/', status: 'ready' as const }, { generation: 'g2', title: '', address: 'https://example.com/', status: 'ready' as const }]
  vi.mocked(api.getState).mockResolvedValue(state({ address: 'http://localhost:3000/', status: 'ready', tabs }))
  render(<BrowserPanel projectId="p" active />)
  const list = await screen.findByRole('tablist', { name: 'Browser 标签页' })
  expect(within(list).getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Local app', 'example.com'])
  fireEvent.click(within(list).getByRole('tab', { name: 'example.com' }))
  await waitFor(() => expect(api.selectTab).toHaveBeenCalledWith({ projectId: 'p', generation: 'g2' }))
  // The Project's current tab changed: its state replaces the old one even with another generation.
  act(() => changed(state({ generation: 'g2', revision: 30, address: 'https://example.com/', status: 'ready', tabs })))
  expect((screen.getByRole('combobox', { name: '网址' }) as HTMLInputElement).value).toBe('https://example.com/')
  fireEvent.click(screen.getByRole('button', { name: '收藏此页' }))
  await waitFor(() => expect(api.toggleFavorite).toHaveBeenCalledWith({ projectId: 'p', generation: 'g2' }))
  fireEvent.click(screen.getByRole('button', { name: '关闭标签页 Local app' }))
  await waitFor(() => expect(api.closeTab).toHaveBeenCalledWith({ projectId: 'p', generation: 'g1' }))
  act(() => changed(state({ generation: 'g2', revision: 40, address: 'https://example.com/', status: 'ready', tabs, permissionRequest: { id: 'r1', origin: 'https://meet.example', permission: 'media' } })))
  const prompt = screen.getByRole('alertdialog', { name: '网站请求权限' })
  expect(prompt.textContent).toContain('使用摄像头或麦克风')
  fireEvent.click(within(prompt).getByRole('button', { name: '允许' }))
  await waitFor(() => expect(api.answerPermission).toHaveBeenCalledWith({ projectId: 'p', generation: 'g2', requestId: 'r1', allow: true }))
})

it('suggests favorites and history while typing and opens the chosen one', async () => {
  vi.mocked(api.getState).mockResolvedValue(state({ address: 'https://example.com/', status: 'ready' }))
  vi.mocked(api.suggest).mockResolvedValue([{ kind: 'favorite', url: 'https://docs.example/', title: 'Docs' }, { kind: 'history', url: 'https://example.com/a', title: '' }])
  render(<BrowserPanel projectId="p" active />)
  const address = await screen.findByRole('combobox', { name: '网址' })
  await waitFor(() => expect((address as HTMLInputElement).disabled).toBe(false))
  address.focus()
  fireEvent.change(address, { target: { value: 'doc' } })
  const listbox = await screen.findByRole('listbox', { name: '网址建议' })
  expect(api.suggest).toHaveBeenLastCalledWith({ query: 'doc' })
  fireEvent.keyDown(address, { key: 'ArrowDown' })
  expect(within(listbox).getAllByRole('option')[0]!.getAttribute('aria-selected')).toBe('true')
  fireEvent.submit(screen.getByRole('form', { name: 'Browser 导航' }))
  await waitFor(() => expect(api.navigate).toHaveBeenCalledWith({ projectId: 'p', generation: 'g1', url: 'https://docs.example/' }))
})
