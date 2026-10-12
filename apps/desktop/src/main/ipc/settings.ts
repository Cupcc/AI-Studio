// Handlers for the `settings` feature (specs/settings/spec.md §5). Windows and
// renderers follow changes through ../window/appearance.ts.
import { isColorMode, isGlassColor, isThemePreference, settingsContract, type SetGlassColorRequest, type SetModeRequest, type SetThemeRequest } from '@shared/ipc/settings'
import type { CoreServices } from '../services/core'
import { settingsFor, type SettingsService } from '../services/settings'
import { defineHandlers, IpcValidationError } from './registry'
import { expectOnlyKeys, expectRecord, noInput } from './validate'

function parseSetTheme(raw: unknown): SetThemeRequest {
  const input = expectRecord(raw)
  expectOnlyKeys(input, ['theme'])
  if (!isThemePreference(input.theme)) throw new IpcValidationError('theme must be "glass" or "solid"')
  return { theme: input.theme }
}

function parseSetGlassColor(raw: unknown): SetGlassColorRequest {
  const input = expectRecord(raw)
  expectOnlyKeys(input, ['color'])
  if (!isGlassColor(input.color)) throw new IpcValidationError('color must be a known glass colour')
  return { color: input.color }
}

function parseSetMode(raw: unknown): SetModeRequest {
  const input = expectRecord(raw)
  expectOnlyKeys(input, ['mode'])
  if (!isColorMode(input.mode)) throw new IpcValidationError('mode must be "system", "light" or "dark"')
  return { mode: input.mode }
}

export function createSettingsFeature(core: Pick<CoreServices, 'database'>, service: SettingsService = settingsFor(core)) {
  return defineHandlers(settingsContract, {
    getAppearance: { parse: noInput, handle: () => service.appearance() },
    setTheme: { parse: parseSetTheme, handle: ({ theme }) => service.setTheme(theme) },
    setGlassColor: { parse: parseSetGlassColor, handle: ({ color }) => service.setGlassColor(color) },
    setMode: { parse: parseSetMode, handle: ({ mode }) => service.setMode(mode) }
  })
}
