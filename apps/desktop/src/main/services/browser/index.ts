import { app, BrowserWindow, WebContentsView, shell as systemShell, webContents } from 'electron'
import { browserContract } from '@shared/ipc/browser'
import { getAppMeta, setAppMeta } from '../database/app-meta'
import type { CoreServices } from '../core'
import { projectShellFor } from '../project'
import { BrowserService } from './browser-service'

const services = new WeakMap<object, BrowserService>()

export function browserFor(core: CoreServices): BrowserService {
  let service = services.get(core)
  if (!service) {
    const shell = projectShellFor(core)
    // Optional while the cross-feature close gate is installed by integration.
    const lifecycle = shell as typeof shell & { isProjectClosing?(id: string): boolean; isQuitting?(): boolean }
    service = new BrowserService({
      requireProject: id => { if (!shell.projects.getProject(id)) throw new Error('Unknown Project') },
      canOperate: id => !lifecycle.isProjectClosing?.(id) && !lifecycle.isQuitting?.(),
      isProjectVisible: id => {
        const state = shell.projects.loadWindowState()
        const tab = state.tabs.find(tab => tab.id === state.currentTabId)
        if (tab?.kind !== 'project' || tab.projectId !== id) return false
        const ui = shell.projects.getUiState(id)
        return ui.mainCanvas.mode === 'view' ? ui.viewRightArea === 'browser' : ui.sidebarOpen && ui.lastTool === 'browser'
      },
      findWindow: senderId => {
        const sender = webContents.fromId(senderId)
        if (!sender || sender.getType() !== 'window') return null
        return BrowserWindow.fromWebContents(sender)
      },
      createView: partition => new WebContentsView({ webPreferences: {
        partition, nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
        contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false,
        navigateOnDragDrop: false, safeDialogs: true, disableDialogs: true
        // No application preload: page code (local or remote) never receives window.studio.
      } }),
      readAddress: id => getAppMeta(core.database().db, `browser.address:${id}`),
      saveAddress: (id, address) => setAppMeta(core.database().db, `browser.address:${id}`, address),
      readTabs: id => getAppMeta(core.database().db, `browser.tabs:${id}`),
      saveTabs: (id, value) => setAppMeta(core.database().db, `browser.tabs:${id}`, value),
      // History, favorites and site permissions are shared by every Project, like the cookies (TOOLS-Q10).
      storage: { read: key => getAppMeta(core.database().db, key), write: (key, value) => setAppMeta(core.database().db, key, value) },
      changed: state => core.broadcast(browserContract.events.stateChanged, state),
      focusAddress: event => core.broadcast(browserContract.events.focusAddress, event),
      downloadsPath: () => app.getPath('downloads'),
      openExternal: url => systemShell.openExternal(url)
    })
    services.set(core, service)
  }
  return service
}

export { BrowserService } from './browser-service'
