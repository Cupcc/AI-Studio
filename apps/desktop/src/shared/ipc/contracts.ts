// Registry of all IPC feature contracts. Adding a feature = one line here
// (plus its handler line in src/main/ipc/index.ts).
import { appContract } from './app'
import type { StudioApiOf } from './contract'
import { projectContract } from './project'
import { sessionContract } from './session'
import { settingsContract } from './settings'
import { browserContract } from './browser'
import { terminalContract } from './terminal'
import { filesContract } from './files'
import { diffContract } from './diff'
import { menuContract } from './menu'
import { searchContract } from './search'
import { workbenchContract } from './workbench'
import { updatesContract } from './updates'

export const contracts = [
  appContract,
  projectContract,
  sessionContract,
  settingsContract,
  browserContract,
  terminalContract,
  filesContract,
  diffContract,
  menuContract,
  searchContract,
  workbenchContract,
  updatesContract
] as const

/** Type of `window.studio` as exposed by the preload bridge. */
export type StudioApi = StudioApiOf<typeof contracts>
