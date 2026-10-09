// Ordered list of all migrations. Each feature adds its own migration file
// and one line here; ids are date-prefixed so parallel tasks do not collide.
import type { Migration } from '../migrator'
import { coreAppMeta } from './2026100901_core_app_meta'

export const migrations: readonly Migration[] = [
  coreAppMeta
]
