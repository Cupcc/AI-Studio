// Native window side of the appearances (specs/settings/spec.md SET-T1, SET-T2;
// Shell Spec v02 §12). Glass is the macOS window material behind a transparent
// page; solid removes the material and paints the window in the mode's colour.
// The colour mode itself reaches the material through nativeTheme.themeSource.
import { app, BrowserWindow, nativeTheme, type BrowserWindowConstructorOptions } from 'electron'
import { join } from 'node:path'
import { settingsContract, type AppearanceState } from '@shared/ipc/settings'
import type { CoreServices } from '../services/core'
import { settingsFor } from '../services/settings'

/** NSVisualEffectView material shared by the whole window, as in ChatGPT Desktop's sidebar. */
export const GLASS_MATERIAL = 'sidebar' as const
const TRANSPARENT = '#00000000'
/** Same as --color-window of the solid theme in tokens.css, so no other colour flashes. */
export const SOLID_BACKGROUND = { light: '#ffffff', dark: '#212121' } as const

type WindowLook = Pick<AppearanceState, 'effective' | 'dark'>
const supportsMaterial = () => process.platform === 'darwin'
const solid = (look: WindowLook) => SOLID_BACKGROUND[look.dark ? 'dark' : 'light']

export function windowAppearanceOptions(look: WindowLook): BrowserWindowConstructorOptions {
  if (look.effective !== 'glass' || !supportsMaterial()) return { backgroundColor: solid(look) }
  // followWindow: the material dims with the window when it is not key, like other macOS apps.
  return { vibrancy: GLASS_MATERIAL, visualEffectState: 'followWindow', backgroundColor: TRANSPARENT }
}

export function applyWindowAppearance(win: Pick<BrowserWindow, 'isDestroyed' | 'setVibrancy' | 'setBackgroundColor'>, look: WindowLook): void {
  if (win.isDestroyed()) return
  if (look.effective === 'glass' && supportsMaterial()) {
    win.setBackgroundColor(TRANSPARENT)
    win.setVibrancy(GLASS_MATERIAL)
  } else {
    if (supportsMaterial()) win.setVibrancy(null)
    win.setBackgroundColor(solid(look))
  }
}

/** Dock appearance follows the app's colour mode, including a forced light/dark choice. */
function applyDockAppearance(look: Pick<AppearanceState, 'dark'>): void {
  if (process.platform !== 'darwin' || !app.dock) return
  const directory = app.isPackaged ? join(process.resourcesPath, 'icons') : join(app.getAppPath(), 'build')
  app.dock.setIcon(join(directory, look.dark ? 'icon-dark.png' : 'icon.png'))
}

/**
 * Keeps every window and renderer on the current appearance: applies the
 * material after each change and re-reads the system state (dark colours,
 * "Reduce transparency") when it reports a change or a window regains focus
 * (back from System Settings).
 */
export function installWindowAppearance(core: Pick<CoreServices, 'database' | 'broadcast'>): void {
  const settings = settingsFor(core)
  settings.subscribe((state) => {
    applyDockAppearance(state)
    for (const win of BrowserWindow.getAllWindows()) applyWindowAppearance(win, state)
    core.broadcast(settingsContract.events.appearanceChanged, state)
  })
  const refresh = () => settings.refreshSystem()
  nativeTheme.on('updated', refresh)
  app.on('browser-window-focus', refresh)
  // Apply the saved mode before opening the first window, including on a dark restart.
  applyDockAppearance(settings.appearance())
}
