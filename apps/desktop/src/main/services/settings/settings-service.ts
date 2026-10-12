// Application appearance preferences (specs/settings/spec.md §3 FR-SET-002, §4).
// Pure apart from the injected database and system probe, so it is unit-tested
// without Electron; ../../window/appearance.ts applies the result to windows.
import type { DatabaseSync } from 'node:sqlite'
import {
  appearanceOf, DEFAULT_PREFERENCES, isColorMode, isGlassColor, isThemePreference,
  type AppearancePreferences, type AppearanceState, type AppearanceSystem, type ColorMode, type GlassColor, type ThemePreference
} from '@shared/ipc/settings'
import { getAppMeta, setAppMeta } from '../database/app-meta'

/** app_meta keys of the appearance preferences (SET-T3). */
export const META_KEYS = {
  theme: 'settings.appearance.theme',
  glassColor: 'settings.appearance.glassColor',
  mode: 'settings.appearance.mode'
} as const satisfies Record<keyof AppearancePreferences, string>
const VALID = { theme: isThemePreference, glassColor: isGlassColor, mode: isColorMode }

export interface AppearanceProbe {
  /** macOS "Reduce transparency"; read on every refresh, never cached. */
  reducedTransparency(): boolean
  /** Applies the colour mode to native UI (window material, menus, dialogs). */
  applyMode(mode: ColorMode): void
  /** Dark colours are in use under the applied mode. */
  dark(): boolean
}

export interface SettingsService {
  appearance(): AppearanceState
  /** Each setter saves its preference; listeners hear about it only when the appearance changed. */
  setTheme(theme: ThemePreference): AppearanceState
  setGlassColor(color: GlassColor): AppearanceState
  setMode(mode: ColorMode): AppearanceState
  /** Re-reads the system state and notifies listeners if the appearance changed. */
  refreshSystem(): void
  subscribe(listener: (state: AppearanceState) => void): () => void
}

export function createSettingsService(options: { db: () => DatabaseSync; system: AppearanceProbe }): SettingsService {
  // Read lazily: the database and the system probe need Electron's app to be ready.
  let saved: AppearancePreferences | null = null
  let system: AppearanceSystem | null = null
  const listeners = new Set<(state: AppearanceState) => void>()
  const read = (): AppearanceSystem => ({ reducedTransparency: options.system.reducedTransparency(), dark: options.system.dark() })
  const preferences = (): AppearancePreferences => {
    if (saved === null) {
      const load = <K extends keyof AppearancePreferences>(key: K) => {
        const stored = getAppMeta(options.db(), META_KEYS[key])
        return (VALID[key](stored) ? stored : DEFAULT_PREFERENCES[key]) as AppearancePreferences[K]
      }
      saved = { theme: load('theme'), glassColor: load('glassColor'), mode: load('mode') }
      options.system.applyMode(saved.mode)
    }
    return saved
  }
  const current = () => { const p = preferences(); return appearanceOf(p, system ??= read()) }
  const notify = () => { const state = current(); for (const listener of listeners) listener(state) }
  const save = <K extends keyof AppearancePreferences>(key: K, value: AppearancePreferences[K]) => {
    if (!VALID[key](value)) throw new Error(`Unknown ${key}: ${String(value)}`)
    const before = current()
    // Saved even when unchanged: a first explicit choice outlives a later change of the default.
    setAppMeta(options.db(), META_KEYS[key], value)
    saved = { ...preferences(), [key]: value }
    if (key === 'mode') { options.system.applyMode(value as ColorMode); system = read() }
    const after = current()
    if (JSON.stringify(after) !== JSON.stringify(before)) notify()
    return after
  }
  return {
    appearance: current,
    setTheme: (theme) => save('theme', theme),
    setGlassColor: (color) => save('glassColor', color),
    setMode: (mode) => save('mode', mode),
    refreshSystem() {
      // Nobody has been told an appearance yet, so there is nothing to correct.
      if (system === null) return
      const next = read()
      if (next.reducedTransparency === system.reducedTransparency && next.dark === system.dark) return
      system = next
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    }
  }
}
