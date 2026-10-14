import { expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import { installWebContentsGuards } from './hardening'

const openExternal = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ shell: { openExternal }, net: {}, protocol: {}, session: {} }))

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
