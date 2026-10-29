import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { CoreServices } from '../core'
import { browserFor } from './index'

const electron = vi.hoisted(() => {
  const session = {
    on: vi.fn(),
    setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(), setDevicePermissionHandler: vi.fn(),
    getUserAgent: () => 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) ai-studio/1.0.0 Chrome/140.0.0.0 Electron/44.4.5 Safari/537.36',
    setUserAgent: vi.fn()
  }
  return { views: [] as { preferences: Record<string, unknown>; contents: EventEmitter }[], senderType: 'window', session }
})
vi.mock('electron', () => ({
  WebContentsView: class {
    webContents = Object.assign(new EventEmitter(), {
      session: electron.session,
      setWindowOpenHandler: vi.fn(), isDestroyed: () => false
    })
    constructor(options: { webPreferences: Record<string, unknown> }) { electron.views.push({ preferences: options.webPreferences, contents: this.webContents }) }
    setVisible() {}
  },
  webContents: { fromId: (id: number) => ({ id, getType: () => electron.senderType }) },
  BrowserWindow: { fromWebContents: (sender: { id: number }) => Object.assign(new EventEmitter(), { webContents: sender, isDestroyed: () => false }) },
  shell: { openExternal: vi.fn() },
  app: { getPath: () => '/Users/test/Downloads' }
}))
vi.mock('../project', () => ({ projectShellFor: () => ({
  projects: { getProject: () => ({ id: 'p' }) }, isProjectClosing: () => false, isQuitting: () => false
}) }))
vi.mock('../database/app-meta', () => ({ getAppMeta: () => undefined, setAppMeta: vi.fn() }))

describe('Electron Browser construction', () => {
  it('sets sandbox/isolation explicitly, never installs app preload or Node, and shares one persistent session', () => {
    const core = { database: () => ({ db: {} }), broadcast: vi.fn() } as unknown as CoreServices
    const browser = browserFor(core)
    expect(browserFor(core)).toBe(browser)
    browser.getState('p', 2)
    browser.getState('q', 2)
    const first = electron.views[0]!.preferences
    const second = electron.views[1]!.preferences
    expect(first).toMatchObject({
      nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
      contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false,
      navigateOnDragDrop: false, disableDialogs: true
    })
    expect(first).not.toHaveProperty('preload')
    // TOOLS-Q10: logins are shared by every Project and survive a restart.
    expect(first.partition).toBe('persist:studio-browser')
    expect(second.partition).toBe(first.partition)
    // Session handlers are installed once, and the user agent drops the Electron / app tokens.
    expect(electron.session.setPermissionRequestHandler).toHaveBeenCalledOnce()
    expect(electron.session.setUserAgent).toHaveBeenCalledWith('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36')
    electron.senderType = 'browserView'
    expect(() => browser.getState('r', 2)).toThrow('Unknown application window')
  })
})
