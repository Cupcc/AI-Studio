// Settings dialog and appearance state (specs/settings/spec.md §3–4).
import { create } from 'zustand'
import type { FeatureBridge } from '@shared/ipc/contract'
import { appearanceOf, type AppearanceState, type ColorMode, type GlassColor, type settingsContract, type ThemePreference } from '@shared/ipc/settings'
import { studio } from '../../lib/studio'

export type SettingsApi = FeatureBridge<typeof settingsContract>
export function settingsApi(): SettingsApi {
  return studio().settings
}

/** Styles follow `<html data-theme data-scheme data-glass-color>`; only the effective appearance is applied (SET-T4). */
export function applyDocumentTheme(appearance: AppearanceState): void {
  const root = document.documentElement.dataset
  root.theme = appearance.effective
  root.scheme = appearance.dark ? 'dark' : 'light'
  root.glassColor = appearance.glassColor
}

export interface SettingsState {
  appearance: AppearanceState
  dialogOpen: boolean
  saveFailed: boolean
  /** Reads the saved appearance; the first render waits for it so it never shows the other look. */
  load(): Promise<void>
  watchEvents(): () => void
  openDialog(): void
  closeDialog(): void
  setTheme(theme: ThemePreference): Promise<void>
  setGlassColor(color: GlassColor): Promise<void>
  setMode(mode: ColorMode): Promise<void>
}

export const useSettings = create<SettingsState>((set, get) => {
  const receive = (appearance: AppearanceState) => { applyDocumentTheme(appearance); set({ appearance }) }
  const save = async (request: () => Promise<AppearanceState>) => {
    set({ saveFailed: false })
    try { receive(await request()) } catch (error) {
      console.error('[settings] appearance save failed', error)
      set({ saveFailed: true })
    }
  }
  return {
    appearance: appearanceOf(),
    dialogOpen: false,
    saveFailed: false,
    async load() {
      try { receive(await settingsApi().getAppearance()) } catch (error) {
        console.error('[settings] appearance load failed', error)
        applyDocumentTheme(get().appearance)
      }
    },
    watchEvents() {
      const unsub = [
        settingsApi().onAppearanceChanged(receive),
        settingsApi().onOpenRequested(() => get().openDialog())
      ]
      return () => unsub.forEach((off) => off())
    },
    openDialog: () => set({ dialogOpen: true, saveFailed: false }),
    closeDialog: () => set({ dialogOpen: false }),
    async setTheme(theme) {
      if (theme !== get().appearance.theme) await save(() => settingsApi().setTheme({ theme }))
    },
    async setGlassColor(color) {
      if (color !== get().appearance.glassColor) await save(() => settingsApi().setGlassColor({ color }))
    },
    async setMode(mode) {
      if (mode !== get().appearance.mode) await save(() => settingsApi().setMode({ mode }))
    }
  }
})
