import { describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type { ColorMode } from '@shared/ipc/settings'
import { runMigrations } from '../database/migrator'
import { migrations } from '../database/migrations'
import { getAppMeta, setAppMeta } from '../database/app-meta'
import { createSettingsService, META_KEYS } from './settings-service'

/** A fake system: "Reduce transparency", the OS colour scheme, and the mode applied to native UI. */
function setup({ reduced = false, systemDark = false } = {}) {
  const db = new DatabaseSync(':memory:')
  runMigrations(db, migrations)
  const system = {
    reduced, systemDark, mode: 'system' as ColorMode,
    reducedTransparency: vi.fn(() => system.reduced),
    applyMode: vi.fn((mode: ColorMode) => { system.mode = mode }),
    dark: vi.fn(() => system.mode === 'dark' || (system.mode === 'system' && system.systemDark))
  }
  const service = () => createSettingsService({ db: () => db, system })
  return { db, system, service }
}
const base = { theme: 'glass', glassColor: 'aurora', mode: 'system', reducedTransparency: false, dark: false, effective: 'glass' }

describe('settings service · FR-SET-002', () => {
  it('defaults to glass, aurora and the system mode, reading the system only when first asked', () => {
    const { system, service } = setup()
    const settings = service()
    expect(system.reducedTransparency).not.toHaveBeenCalled()
    expect(settings.appearance()).toEqual(base)
    expect(system.applyMode).toHaveBeenCalledWith('system')
  })

  it('saves each choice app-wide so a new service (restart) starts with it and applies the saved mode', () => {
    const { db, system, service } = setup()
    const settings = service()
    expect(settings.setTheme('solid')).toEqual({ ...base, theme: 'solid', effective: 'solid' })
    settings.setGlassColor('mint'); settings.setMode('dark')
    expect(Object.values(META_KEYS).map((key) => getAppMeta(db, key))).toEqual(['solid', 'mint', 'dark'])
    system.applyMode.mockClear()
    expect(service().appearance()).toEqual({ ...base, theme: 'solid', glassColor: 'mint', mode: 'dark', dark: true, effective: 'solid' })
    expect(system.applyMode).toHaveBeenCalledWith('dark')
  })

  it('treats unknown stored values as defaults and rejects unknown values', () => {
    const { db, service } = setup()
    setAppMeta(db, META_KEYS.theme, 'white'); setAppMeta(db, META_KEYS.glassColor, 'rainbow'); setAppMeta(db, META_KEYS.mode, 'sepia')
    const settings = service()
    expect(settings.appearance()).toEqual(base)
    expect(() => settings.setTheme('white' as never)).toThrow()
    expect(() => settings.setGlassColor('rainbow' as never)).toThrow()
    expect(() => settings.setMode('sepia' as never)).toThrow()
    expect(getAppMeta(db, META_KEYS.mode)).toBe('sepia')
  })

  it('notifies listeners only when the appearance changed', () => {
    const { service } = setup()
    const settings = service(), listener = vi.fn()
    const off = settings.subscribe(listener)
    settings.setTheme('glass'); settings.setMode('system')
    expect(listener).not.toHaveBeenCalled()
    settings.setTheme('solid')
    expect(listener).toHaveBeenLastCalledWith({ ...base, theme: 'solid', effective: 'solid' })
    off(); settings.setTheme('glass')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('follows the system colour scheme in the system mode, and forced modes ignore it (2026-10-12)', () => {
    const { system, service } = setup()
    const settings = service(), listener = vi.fn()
    settings.subscribe(listener)
    expect(settings.appearance().dark).toBe(false)
    system.systemDark = true; settings.refreshSystem()
    expect(listener).toHaveBeenLastCalledWith({ ...base, dark: true })
    expect(settings.setMode('light')).toMatchObject({ mode: 'light', dark: false })
    expect(system.mode).toBe('light')
    system.systemDark = false; settings.refreshSystem(); system.systemDark = true; settings.refreshSystem()
    expect(settings.appearance().dark).toBe(false)
    expect(settings.setMode('dark')).toMatchObject({ mode: 'dark', dark: true })
  })

  it('shows solid while "Reduce transparency" is on and restores glass when it is off (SET-C5)', () => {
    const { system, service } = setup({ reduced: true })
    const settings = service(), listener = vi.fn()
    settings.subscribe(listener)
    expect(settings.appearance()).toEqual({ ...base, reducedTransparency: true, effective: 'solid' })
    settings.refreshSystem()
    expect(listener).not.toHaveBeenCalled()
    system.reduced = false; settings.refreshSystem()
    expect(listener).toHaveBeenLastCalledWith(base)
  })

  it('does not announce system changes before anyone saw an appearance', () => {
    const { system, service } = setup()
    const settings = service(), listener = vi.fn()
    settings.subscribe(listener)
    system.reduced = true; settings.refreshSystem()
    expect(listener).not.toHaveBeenCalled()
    expect(settings.appearance().effective).toBe('solid')
  })

  it('keeps the glass colour while solid is chosen (SET-Q5)', () => {
    const { service } = setup()
    const settings = service(), listener = vi.fn()
    settings.subscribe(listener)
    expect(settings.setGlassColor('mint')).toMatchObject({ glassColor: 'mint', effective: 'glass' })
    settings.setGlassColor('mint')
    expect(listener).toHaveBeenCalledTimes(1)
    settings.setTheme('solid')
    expect(service().appearance()).toMatchObject({ theme: 'solid', glassColor: 'mint' })
  })
})
