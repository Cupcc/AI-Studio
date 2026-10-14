import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { CoreServices } from '../core'
import { browserFor } from './index'

const electron = vi.hoisted(() => ({ views: [] as { preferences: Record<string, unknown>; contents: EventEmitter }[], senderType: 'window' }))
vi.mock('electron', () => ({
  WebContentsView: class {
    webContents = Object.assign(new EventEmitter(), {
      session: Object.assign(new EventEmitter(), {
        setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(), setDevicePermissionHandler: vi.fn()
      }),
      setWindowOpenHandler: vi.fn(), isDestroyed: () => false
    })
    constructor(options: { webPreferences: Record<string, unknown> }) { electron.views.push({ preferences: options.webPreferences, contents: this.webContents }) }
    setVisible() {}
  },
  webContents: { fromId: (id: number) => ({ id, getType: () => electron.senderType }) },
  BrowserWindow: { fromWebContents: (sender: { id: number }) => Object.assign(new EventEmitter(), { webContents: sender, isDestroyed: () => false }) },
  shell: { openExternal: vi.fn() }
}))
vi.mock('../project', () => ({ projectShellFor: () => ({
  projects: { getProject: () => ({ id: 'p' }) }, isProjectClosing: () => false, isQuitting: () => false
}) }))
vi.mock('../database/app-meta', () => ({ getAppMeta: () => undefined, setAppMeta: vi.fn() }))

describe('Electron Browser construction', () => {
  it('sets sandbox/isolation explicitly, never installs app preload or Node, and uses separate memory sessions', () => {
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
    expect(first.partition).not.toBe(second.partition)
    expect(String(first.partition)).not.toMatch(/^persist:/)
    electron.senderType = 'browserView'
    expect(() => browser.getState('r', 2)).toThrow('Unknown application window')
  })
})
