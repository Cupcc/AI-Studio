import { expect, it, vi } from 'vitest'
import { browserApi, type BrowserApi } from './api'
import { scheduleBrowserLayout } from './browser-layout'
import type { BrowserState } from '@shared/tools/browser'

vi.mock('./api', () => ({ browserApi: vi.fn() }))
it('coalesces a slow resize with newer bounds and an overlay hide before ever showing stale content', async () => {
  const state: BrowserState = { projectId: 'layout', generation: 'g', revision: 1, address: 'http://localhost/', title: '', status: 'ready', error: null, externalRequest: null, visible: false, canGoBack: false, canGoForward: false, devTools: false, zoom: 100, notice: null, tabs: [], favorite: false, permissionRequest: null }
  let resolve!: (state: BrowserState) => void
  const api = { setBounds: vi.fn().mockReturnValueOnce(new Promise(done => { resolve = done })).mockResolvedValue(state), setVisible: vi.fn().mockResolvedValue(state) } as unknown as BrowserApi
  vi.mocked(browserApi).mockReturnValue(api)
  const ref = { projectId: 'layout', generation: 'g' }, accepted = vi.fn()
  scheduleBrowserLayout({ ref, bounds: { x: 1, y: 1, width: 200, height: 300 }, visible: true, accepted })
  for (let i = 0; i < 100; i++) scheduleBrowserLayout({ ref, bounds: { x: i, y: 1, width: 200, height: 300 }, visible: true })
  scheduleBrowserLayout({ ref, visible: false, accepted })
  resolve(state)
  await vi.waitFor(() => expect(api.setVisible).toHaveBeenCalledTimes(1))
  expect(api.setBounds).toHaveBeenCalledTimes(1)
  expect(api.setVisible).toHaveBeenCalledWith({ ...ref, visible: false })
  expect(accepted).toHaveBeenCalledTimes(1)
})
