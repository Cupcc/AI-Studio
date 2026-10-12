// Main-process entry of the settings feature for other modules: window
// creation reads the appearance here (main/index.ts); the IPC feature saves it.
import { nativeTheme } from 'electron'
import type { CoreServices } from '../core'
import { createSettingsService, type SettingsService } from './settings-service'

const services = new WeakMap<object, SettingsService>()

export function settingsFor(core: Pick<CoreServices, 'database'>): SettingsService {
  let service = services.get(core)
  if (!service) {
    service = createSettingsService({
      db: () => core.database().db,
      system: {
        reducedTransparency: () => nativeTheme.prefersReducedTransparency,
        // themeSource takes the same 'system' | 'light' | 'dark' values and drives the
        // window material, native menus and dialogs, and prefers-color-scheme (SET-T2).
        applyMode: (mode) => { nativeTheme.themeSource = mode },
        dark: () => nativeTheme.shouldUseDarkColors
      }
    })
    services.set(core, service)
  }
  return service
}

export type { SettingsService } from './settings-service'
