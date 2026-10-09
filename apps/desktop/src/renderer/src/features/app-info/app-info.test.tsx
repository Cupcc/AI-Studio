import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppInfo, WindowFocusPayload } from '@shared/ipc/app'
import type { StudioApi } from '@shared/ipc/contracts'
import { AppInfoPanel } from './AppInfoPanel'
import { useAppInfoStore } from './store'

const info: AppInfo = {
  name: 'AI Developer Studio',
  version: '0.0.0',
  isPackaged: false,
  platform: 'darwin',
  arch: 'arm64',
  versions: { electron: '44.4.5', chrome: '152.0', node: '24.21.0' }
}

function installFakeStudio(getInfo: () => Promise<AppInfo>) {
  let focusListener: ((p: WindowFocusPayload) => void) | null = null
  const unsubscribe = vi.fn()
  const api: StudioApi = {
    app: {
      getInfo,
      ping: async ({ message }) => ({ message, receivedAt: '' }),
      onWindowFocusChanged: (listener) => {
        focusListener = listener
        return unsubscribe
      }
    }
  }
  Object.defineProperty(window, 'studio', { value: api, configurable: true })
  return { emitFocus: (focused: boolean) => focusListener?.({ focused }), unsubscribe }
}

const initial = useAppInfoStore.getState()

beforeEach(() => {
  useAppInfoStore.setState(initial, true)
})

afterEach(() => {
  cleanup()
})

describe('app-info store', () => {
  it('loads info through the preload API', async () => {
    installFakeStudio(async () => info)
    await useAppInfoStore.getState().load()
    expect(useAppInfoStore.getState()).toMatchObject({ status: 'ready', info })
  })

  it('records load errors', async () => {
    installFakeStudio(async () => {
      throw new Error('denied')
    })
    await useAppInfoStore.getState().load()
    expect(useAppInfoStore.getState()).toMatchObject({ status: 'error', error: 'denied' })
  })

  it('tracks window focus events until unsubscribed', () => {
    const fake = installFakeStudio(async () => info)
    const off = useAppInfoStore.getState().watchWindowFocus()
    fake.emitFocus(false)
    expect(useAppInfoStore.getState().windowFocused).toBe(false)
    off()
    expect(fake.unsubscribe).toHaveBeenCalled()
  })
})

describe('AppInfoPanel', () => {
  it('renders versions once loaded', async () => {
    installFakeStudio(async () => info)
    await act(async () => {
      render(<AppInfoPanel />)
    })
    expect(screen.getByTestId('app-info').textContent).toContain('44.4.5')
  })
})
