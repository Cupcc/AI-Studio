// Main application window (Shell Spec v01 §1–2): 1280×800 default,
// 1024×640 minimum, macOS traffic lights on the left inside a 40px top bar.
import { BrowserWindow } from 'electron'
import { appContract } from '@shared/ipc/app'
import { emit } from '../ipc/registry'
import { observeWindowForeground } from './foreground'

export const WINDOW_DEFAULT_SIZE = { width: 1280, height: 800 } as const
export const WINDOW_MIN_SIZE = { width: 1024, height: 640 } as const
/** Vertically centres the 12px traffic lights in the 40px top bar. */
export const TRAFFIC_LIGHT_POSITION = { x: 14, y: 14 } as const

export interface MainWindowOptions {
  preloadPath: string
  url: string
  /** Keep the window hidden (smoke mode). */
  hidden?: boolean
}

export function createMainWindow(options: MainWindowOptions): BrowserWindow {
  const win = new BrowserWindow({
    ...WINDOW_DEFAULT_SIZE,
    minWidth: WINDOW_MIN_SIZE.width,
    minHeight: WINDOW_MIN_SIZE.height,
    show: false,
    title: 'AI Developer Studio',
    titleBarStyle: 'hidden',
    trafficLightPosition: TRAFFIC_LIGHT_POSITION,
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: false
    }
  })
  if (!options.hidden) win.once('ready-to-show', () => win.show())
  observeWindowForeground(win, (focused) => emit(win.webContents, appContract.events.windowFocusChanged, { focused }))
  void win.loadURL(options.url)
  return win
}
