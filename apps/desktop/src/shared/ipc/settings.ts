// Settings feature contract: application appearance (specs/settings/spec.md §4–5;
// FR-SET-001, FR-SET-002).
import { defineContract, event, invoke } from './contract'

/**
 * What the window shows: glass (prototype v04), or solid (prototype v03 in light mode) while macOS
 * "Reduce transparency" is on. Users no longer choose a theme (user decision 2026-11-12, DEC-31).
 */
export type Theme = 'glass' | 'solid'

/** Colour mode: follows the system by default, or forced light / dark (2026-10-12 confirmation). */
export const COLOR_MODES = ['system', 'light', 'dark'] as const
export type ColorMode = (typeof COLOR_MODES)[number]
export const DEFAULT_COLOR_MODE: ColorMode = 'system'

/**
 * Colour behind the glass (user request 2026-10-12: "毛玻璃目前没有背景颜色，也支持选择多种背景颜色的选择").
 * Aurora and mint are prototype v04's sample wallpapers A and B; 'none' shows only the desktop
 * behind the window (specs/settings/spec.md SET-Q5, confirmed 2026-10-12).
 */
export const GLASS_COLORS = ['aurora', 'mint', 'sunset', 'haze', 'none'] as const
export type GlassColor = (typeof GLASS_COLORS)[number]
export const DEFAULT_GLASS_COLOR: GlassColor = 'aurora'

export interface AppearancePreferences {
  /** Background colour of the glass theme; kept while "Reduce transparency" shows solid. */
  glassColor: GlassColor
  mode: ColorMode
}

export interface AppearanceSystem {
  /** macOS "Reduce transparency" is on. */
  reducedTransparency: boolean
  /** Dark colours are in use: the forced mode, or the system's when following it. */
  dark: boolean
}

export interface AppearanceState extends AppearancePreferences, AppearanceSystem {
  /** What the window shows: glass unless transparency is reduced (FR-SET-002). */
  effective: Theme
}

export interface SetGlassColorRequest { color: GlassColor }
export interface SetModeRequest { mode: ColorMode }

const isOneOf = <T extends string>(values: readonly T[]) => (value: unknown): value is T => (values as readonly unknown[]).includes(value)
export const isGlassColor = isOneOf(GLASS_COLORS)
export const isColorMode = isOneOf(COLOR_MODES)

export const DEFAULT_PREFERENCES: AppearancePreferences = { glassColor: DEFAULT_GLASS_COLOR, mode: DEFAULT_COLOR_MODE }

export function appearanceOf(preferences: Partial<AppearancePreferences> = {}, system: Partial<AppearanceSystem> = {}): AppearanceState {
  const p = { ...DEFAULT_PREFERENCES, ...preferences }, s = { reducedTransparency: false, dark: false, ...system }
  return { ...p, ...s, effective: s.reducedTransparency ? 'solid' : 'glass' }
}

export const settingsContract = defineContract('settings', {
  invoke: {
    getAppearance: invoke<void, AppearanceState>('settings:get-appearance'),
    setGlassColor: invoke<SetGlassColorRequest, AppearanceState>('settings:set-glass-color'),
    setMode: invoke<SetModeRequest, AppearanceState>('settings:set-mode')
  },
  events: {
    appearanceChanged: event<AppearanceState>('settings:appearance-changed'),
    /** Menu bar "设置…" / ⌘, (FR-SET-001). */
    openRequested: event<void>('settings:open-requested')
  }
})
