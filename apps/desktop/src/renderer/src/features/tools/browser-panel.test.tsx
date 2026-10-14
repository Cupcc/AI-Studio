import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { BrowserState } from '@shared/tools/browser'
import { browserApi, type BrowserApi } from './api'
import { BrowserPanel, previewBounds } from './BrowserPanel'

vi.mock('./api', () => ({ browserApi: vi.fn() }))
let api: BrowserApi, changed: (state: BrowserState) => void
const state = (patch: Partial<BrowserState> = {}): BrowserState => ({ projectId: 'p', generation: 'g1', revision: 1, address: '', title: '', status: 'idle', error: null, visible: false, externalRequest: null, ...patch })
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 600, top: 130, right: 1000, bottom: 700, x: 600, y: 130, width: 400, height: 570, toJSON() {} })
  api = {
    getState: vi.fn().mockResolvedValue(state()), navigate: vi.fn().mockResolvedValue(state({ revision: 2, address: 'http://localhost:3000/', status: 'loading' })),
    reload: vi.fn().mockResolvedValue(state({ revision: 3, address: 'http://localhost:3000/', status: 'loading' })),
    setBounds: vi.fn().mockResolvedValue(state()), setVisible: vi.fn().mockResolvedValue(state()), focus: vi.fn().mockResolvedValue(undefined),
    openExternal: vi.fn().mockResolvedValue(state({ revision: 4 })), dismissExternal: vi.fn().mockResolvedValue(state({ revision: 4 })),
    onStateChanged: vi.fn(listener => { changed = listener; return () => {} })
  }
  vi.mocked(browserApi).mockReturnValue(api)
})
afterEach(async () => { cleanup(); await act(async () => {}); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('waits for the restored background Project to be selected before creating a Browser and keeps it on later switches', async () => {
  const view = render(<BrowserPanel projectId="p" active={false} />)
  expect(api.getState).not.toHaveBeenCalled()
  expect(api.onStateChanged).not.toHaveBeenCalled()
  view.rerender(<BrowserPanel projectId="p" active />)
  await screen.findByText('预览本地网页')
  expect(api.getState).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'http://localhost:4000' } })
  view.rerender(<BrowserPanel projectId="p" active={false} />)
  view.rerender(<BrowserPanel projectId="p" active />)
  expect(api.getState).toHaveBeenCalledTimes(1)
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('http://localhost:4000')
})

it('navigates from the address bar, shows loading and reloads the local address', async () => {
  render(<BrowserPanel projectId="p" active />)
  await screen.findByText('预览本地网页')
  fireEvent.change(screen.getByRole('textbox', { name: '本地 Web 地址' }), { target: { value: 'http://localhost:3000' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Browser 导航' }))
  await screen.findByText('正在加载网页…')
  expect(api.navigate).toHaveBeenCalledWith({ projectId: 'p', generation: 'g1', url: 'http://localhost:3000' })
  fireEvent.click(screen.getByRole('button', { name: '刷新网页' }))
  await waitFor(() => expect(api.reload).toHaveBeenCalledWith({ projectId: 'p', generation: 'g1' }))
})

it('keeps a newer load failure when an older navigate response arrives and offers recovery', async () => {
  let resolve!: (result: BrowserState) => void
  vi.mocked(api.navigate).mockReturnValue(new Promise(done => { resolve = done }))
  render(<BrowserPanel projectId="p" active />)
  await screen.findByText('预览本地网页')
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'http://localhost:3000' } })
  fireEvent.submit(screen.getByRole('form'))
  act(() => changed(state({ revision: 4, address: 'http://localhost:3000/', status: 'failed', error: '服务器不可达' })))
  await act(async () => resolve(state({ revision: 2, address: 'http://localhost:3000/', status: 'loading' })))
  expect(screen.getByText('服务器不可达')).toBeTruthy()
  expect(screen.queryByText('正在加载网页…')).toBeNull()
  vi.mocked(api.reload).mockResolvedValue(state({ revision: 5, address: 'http://localhost:3000/', status: 'loading' }))
  fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
  await screen.findByText('正在加载网页…')
})

it('prompts before external navigation and calls only the selected action', async () => {
  render(<BrowserPanel projectId="p" active />)
  await screen.findByText('预览本地网页')
  const externalRequest = { id: 'request', url: 'https://example.com', source: 'window' as const }
  act(() => changed(state({ revision: 3, externalRequest })))
  expect(screen.getByRole('alertdialog')).toBeTruthy()
  expect(api.openExternal).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(api.dismissExternal).toHaveBeenCalledWith({ projectId: 'p', generation: 'g1', requestId: 'request' })
  act(() => changed(state({ revision: 5, externalRequest: { ...externalRequest, id: 'second' } })))
  vi.mocked(api.openExternal).mockResolvedValue(state({ revision: 6 }))
  fireEvent.click(screen.getByRole('button', { name: '用系统浏览器打开' }))
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
  await screen.findByText('预览本地网页')
  act(() => { changed(state({ generation: 'old', revision: 100, status: 'failed', error: 'old' })); changed(state({ projectId: 'other', revision: 100, status: 'failed', error: 'other' })) })
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'file:///tmp/private' } })
  fireEvent.submit(screen.getByRole('form'))
  await screen.findByText('Error: 只支持本地 HTTP 地址')
  expect(screen.getByRole('textbox').getAttribute('disabled')).toBeNull()
  expect(screen.queryByText('old')).toBeNull(); expect(screen.queryByText('other')).toBeNull()
})

it('clips preview bounds to the renderer viewport and keeps hidden hosts at zero size', () => {
  expect(previewBounds({ left: -20, top: -10, right: 1200, bottom: 900 } as DOMRect, 1024, 768)).toEqual({ x: 0, y: 0, width: 1024, height: 768 })
  expect(previewBounds({ left: 2000, top: 2000, right: 2400, bottom: 2500 } as DOMRect, 1024, 768)).toEqual({ x: 1024, y: 768, width: 0, height: 0 })
})
