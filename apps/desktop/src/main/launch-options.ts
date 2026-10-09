// Command-line switches understood by the app (used by tests and the
// packaged smoke check). Unknown arguments are ignored.
import { isAbsolute } from 'node:path'

export interface LaunchOptions {
  /** Run native checks, write a sanitized JSON report here, then quit. */
  smokeOutput?: string
  /** Override userData (tests only), so runs do not touch real app data. */
  userDataDir?: string
}

export const SMOKE_OUTPUT_SWITCH = '--studio-smoke-output='
export const USER_DATA_SWITCH = '--studio-user-data-dir='

export function parseLaunchOptions(argv: readonly string[]): LaunchOptions {
  const options: LaunchOptions = {}
  for (const arg of argv) {
    if (arg.startsWith(SMOKE_OUTPUT_SWITCH)) {
      const value = arg.slice(SMOKE_OUTPUT_SWITCH.length)
      if (!isAbsolute(value)) throw new Error(`${SMOKE_OUTPUT_SWITCH} requires an absolute path`)
      options.smokeOutput = value
    } else if (arg.startsWith(USER_DATA_SWITCH)) {
      const value = arg.slice(USER_DATA_SWITCH.length)
      if (!isAbsolute(value)) throw new Error(`${USER_DATA_SWITCH} requires an absolute path`)
      options.userDataDir = value
    }
  }
  return options
}
