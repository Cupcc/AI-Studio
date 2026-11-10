import { expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import { handleAppProtocol, installWebContentsGuards } from './hardening'

const openExternal = vi.hoisted(() => vi.fn())
const handle = vi.hoisted(() => vi.fn())
const fetch = vi.hoisted(() => vi.fn(async () => new Response('renderer')))
vi.mock('electron', () => ({ shell: { openExternal }, net: { fetch }, protocol: { handle }, session: {} }))

it('installs app navigation policy only on its explicit owner, not window-typed preview pages', () => {
  const owner = { setWindowOpenHandler: vi.fn(), on: vi.fn() }
  const preview = { getType: () => 'window', setWindowOpenHandler: vi.fn(), on: vi.fn() }
  installWebContentsGuards(owner as unknown as WebContents, 'app://studio')
  expect(owner.on.mock.calls.map(([event]) => event)).toEqual(['will-navigate', 'will-redirect', 'will-attach-webview'])
  expect(preview.on).not.toHaveBeenCalled()
  expect(preview.setWindowOpenHandler).not.toHaveBeenCalled()
  const navigation = owner.on.mock.calls.find(([event]) => event === 'will-navigate')![1]
  const preventDefault = vi.fn()
  navigation({ preventDefault }, 'http://localhost:3000/')
  expect(preventDefault).toHaveBeenCalledOnce()
  preventDefault.mockClear()
  navigation({ preventDefault }, 'app://studio/index.html')
  expect(preventDefault).not.toHaveBeenCalled()
})

it('routes only app://workbench requests to the plugin asset handler and preserves renderer routing', async () => {
  const workbench = vi.fn(async () => new Response('plugin'))
  handleAppProtocol('/renderer', workbench)
  const listener = handle.mock.calls.at(-1)![1]
  const pluginRequest = new Request('app://workbench/project/draft/id/revision/index.html')
  expect(await (await listener(pluginRequest)).text()).toBe('plugin')
  expect(workbench).toHaveBeenCalledWith(pluginRequest)
  expect(await (await listener(new Request('app://studio/index.html'))).text()).toBe('renderer')
  expect(fetch).toHaveBeenCalledWith('file:///renderer/index.html')
  expect((await listener(new Request('app://unknown/index.html'))).status).toBe(404)
  handleAppProtocol('/renderer')
  expect((await handle.mock.calls.at(-1)![1](pluginRequest)).status).toBe(404)
})
