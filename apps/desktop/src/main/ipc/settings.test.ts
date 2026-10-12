import { describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { runMigrations } from '../services/database/migrator'
import { migrations } from '../services/database/migrations'
import { createSettingsService } from '../services/settings/settings-service'
import { IpcValidationError } from './registry'
import { createSettingsFeature } from './settings'

const ctx = { senderUrl: 'app://studio/index.html', senderId: 1 }

describe('settings feature handlers · specs/settings/spec.md §5', () => {
  const db = new DatabaseSync(':memory:')
  runMigrations(db, migrations)
  const service = createSettingsService({ db: () => db, system: { reducedTransparency: () => false, applyMode: () => {}, dark: () => false } })
  const { handlers } = createSettingsFeature({ database: vi.fn() } as never, service)

  it('getAppearance takes no input', async () => {
    expect(() => handlers.getAppearance.parse({})).toThrow(IpcValidationError)
    expect(await handlers.getAppearance.handle(handlers.getAppearance.parse(undefined), ctx)).toEqual({ theme: 'glass', glassColor: 'aurora', mode: 'system', reducedTransparency: false, dark: false, effective: 'glass' })
  })

  it('setTheme accepts exactly { theme: "glass" | "solid" }', async () => {
    for (const bad of [undefined, null, 'solid', [], {}, { theme: 'white' }, { theme: 1 }, { theme: 'solid', extra: true }]) {
      expect(() => handlers.setTheme.parse(bad)).toThrow(IpcValidationError)
    }
    expect(await handlers.setTheme.handle(handlers.setTheme.parse({ theme: 'solid' }), ctx)).toMatchObject({ theme: 'solid', effective: 'solid' })
    expect(service.appearance().theme).toBe('solid')
  })

  it('setGlassColor accepts exactly { color } with a known colour', async () => {
    for (const bad of [undefined, 'mint', {}, { color: 'rainbow' }, { color: 'mint', theme: 'glass' }]) {
      expect(() => handlers.setGlassColor.parse(bad)).toThrow(IpcValidationError)
    }
    expect(await handlers.setGlassColor.handle(handlers.setGlassColor.parse({ color: 'none' }), ctx)).toMatchObject({ glassColor: 'none' })
  })

  it('setMode accepts exactly { mode: "system" | "light" | "dark" }', async () => {
    for (const bad of [undefined, 'dark', {}, { mode: 'auto' }, { mode: 'dark', theme: 'glass' }]) {
      expect(() => handlers.setMode.parse(bad)).toThrow(IpcValidationError)
    }
    expect(await handlers.setMode.handle(handlers.setMode.parse({ mode: 'light' }), ctx)).toMatchObject({ mode: 'light' })
  })
})
