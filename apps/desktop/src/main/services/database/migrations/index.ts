// Ordered list of all migrations. Each feature adds its own migration file
// and one line here; ids are date-prefixed so parallel tasks do not collide.
import type { Migration } from '../migrator'
import { coreAppMeta } from './2026100901_core_app_meta'
import { projectCore } from './2026100902_project_core'
import { sessionCore } from './2026100903_session_core'
import { turnDiff } from './2026101801_turn_diff'

export const migrations: readonly Migration[] = [
  coreAppMeta,
  projectCore,
  sessionCore,
  turnDiff
]
