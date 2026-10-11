// Main process entry: app lifecycle, security setup, IPC and the window.
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import type { AppInfo } from '@shared/ipc/app'
import { projectContract } from '@shared/ipc/project'
import { S } from '@shared/project/strings'
import { installProjectMenu } from './menu/project-menu'
import { projectShellFor } from './services/project'
import { projectViewsFor } from './services/project-view'
import { createQuitFlow } from './services/project/quit-flow'
import { registerIpc } from './ipc'
import { emit } from './ipc/registry'
import { parseLaunchOptions } from './launch-options'
import { APP_ENTRY_URL, APP_ORIGIN, createSenderPolicy, originOf } from './security/policy'
import {
  handleAppProtocol,
  installPermissionPolicy,
  installWebContentsGuards,
  registerAppScheme
} from './security/hardening'
import { createCoreServices, type CoreServices } from './services/core'
import { runNativeSmoke, writeSmokeReport } from './smoke/native-smoke'
import { runRendererSmoke } from './smoke/renderer-smoke'
import { createMainWindow } from './window/main-window'
import { createShutdownHandler } from './shutdown'
import { createE2eProviders } from './services/session/e2e-providers'

const launch = parseLaunchOptions(process.argv)
const devServerUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
const rendererOrigin = (devServerUrl && originOf(devServerUrl)) || APP_ORIGIN

if (launch.userDataDir) {
  app.setPath('userData', launch.userDataDir)
} else if (!app.isPackaged) {
  // Keep development data apart from an installed build's data.
  app.setPath('userData', `${app.getPath('userData')} (Dev)`)
}

function appInfo(): AppInfo {
  return {
    name: app.getName(),
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node
    }
  }
}

function openWindow(hidden = false): BrowserWindow {
  const win = createMainWindow({
    preloadPath: join(__dirname, '../preload/index.js'),
    url: devServerUrl ?? APP_ENTRY_URL,
    hidden
  })
  win.on('focus', () => { if (core) projectViewsFor(core).refreshAll() })
  if (!hidden && process.platform === 'darwin') {
    // Keep the renderer and its draft/tool state alive while the macOS window
    // is closed; sessions continue until an explicit application quit.
    win.on('close', (event) => {
      if (core && projectShellFor(core).quitFlow?.state !== 'approved') { event.preventDefault(); win.hide() }
    })
  }
  return win
}

let core: CoreServices | null = null
let disposeIpc: (() => Promise<void>) | null = null

/** Runs after `ready`: protocol, permissions, core services and IPC. */
function startRuntime(): void {
  installPermissionPolicy(rendererOrigin)
  handleAppProtocol(join(__dirname, '../renderer'))
  core = createCoreServices({
    userDataDir: app.getPath('userData'),
    appInfo,
    broadcast: (channel, payload) => {
      for (const win of BrowserWindow.getAllWindows()) emit(win.webContents, channel, payload)
    }
  })
  const providers = !app.isPackaged && process.env.STUDIO_E2E_PROVIDERS === '1'
    ? createE2eProviders()
    : launch.smokeOutput ? [] : undefined
  disposeIpc = registerIpc(ipcMain, core, createSenderPolicy(devServerUrl), { providers })
  if (!launch.smokeOutput) {
    const shell = projectShellFor(core)
    shell.quitFlow = createQuitFlow({
      getPort: shell.sessionPort,
      quit: () => app.quit(),
      flushState: () => {
        const win = BrowserWindow.getAllWindows()[0]
        if (!win || win.webContents.isLoading()) return Promise.resolve()
        return new Promise<void>((resolve) => {
          const finish = () => { clearTimeout(timer); shell.onStateFlushed = null; resolve() }
          const timer = setTimeout(() => { console.error('[project] renderer state flush timed out'); finish() }, 2000)
          shell.onStateFlushed = finish
          emit(win.webContents, projectContract.events.flushRequested, undefined)
        })
      },
      askRenderer: (request) => {
        const win = BrowserWindow.getAllWindows().find((w) => w.isVisible())
        if (!win) return false
        emit(win.webContents, projectContract.events.quitRequested, request); return true
      },
      askNative: async (request) => {
        const result = await dialog.showMessageBox({ type: 'question', title: S.quitTitle, message: S.quitBody(request.sessions, request.projects), buttons: [S.cancel, S.quitConfirm], defaultId: 0, cancelId: 0 })
        return result.response === 1
      },
      onError: (error) => console.error('[project] quit failed', error)
    })
    app.on('before-quit', shell.quitFlow.onBeforeQuit)
    installProjectMenu()
  }
}

async function runSmokeAndQuit(output: string): Promise<void> {
  const info = appInfo()
  try {
    const report = await runNativeSmoke({
      userDataDir: app.getPath('userData'),
      app: {
        version: info.version,
        isPackaged: info.isPackaged,
        platform: info.platform,
        arch: info.arch,
        electron: info.versions.electron,
        node: info.versions.node
      }
    })
    startRuntime()
    const win = openWindow(true)
    const renderer = await runRendererSmoke(win)
    const full = { ...report, renderer, ok: report.ok && renderer.ok }
    await writeSmokeReport(output, full)
    // Destroying the last window can trigger Electron's default quit. Finish
    // the report before that event so its asynchronous write cannot be cut off.
    win.destroy()
    app.exit(full.ok ? 0 : 1)
  } catch (error) {
    console.error('[smoke] failed:', error)
    app.exit(2)
  }
}

registerAppScheme()
installWebContentsGuards(rendererOrigin)

if (launch.smokeOutput) {
  const output = launch.smokeOutput
  void app.whenReady().then(() => runSmokeAndQuit(output))
} else if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  void app.whenReady().then(() => {
    startRuntime()
    openWindow()
    app.on('activate', () => {
      const [win] = BrowserWindow.getAllWindows()
      if (win) { win.show(); win.focus() } else openWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  // Hold the quit once so features can dispose asynchronously (e.g. stop
  // processes), then quit again on a fresh tick: calling app.quit() from
  // within the same will-quit microtask chain leaves the app running.
  app.on('will-quit', createShutdownHandler({
    disposeFeatures: async () => { await disposeIpc?.() },
    disposeCore: () => core?.dispose(),
    quit: () => app.quit(),
    onError: (error) => console.error('[main] dispose failed:', error)
  }))
}
