// Registry of all IPC feature contracts. Adding a feature = one line here
// (plus its handler line in src/main/ipc/index.ts).
import { appContract } from './app'
import type { StudioApiOf } from './contract'
import { projectContract } from './project'
import { sessionContract } from './session'
import { projectViewContract } from './project-view'
import { settingsContract } from './settings'

export const contracts = [
  appContract,
  projectContract,
  sessionContract,
  projectViewContract,
  settingsContract
] as const

/** Type of `window.studio` as exposed by the preload bridge. */
export type StudioApi = StudioApiOf<typeof contracts>
