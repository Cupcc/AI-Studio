// Finds a usable `git` and refuses to run the macOS Command Line Tools shim when the tools are not installed:
// executing /usr/bin/git then opens the system "install developer tools" dialog. `xcode-select -p` is the only probe
// used for that (it never starts the installer); the shim is only run when the selected developer directory really
// holds a git binary. Missing git is reported, never installed.
import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import type { Env } from '../shell-env/login-env'
import { findExecutable } from '../shell-env/executables'
import { scrubbedGitEnv } from './git-env'

export type GitLocation = { status: 'ok'; path: string; version: string | null } | { status: 'missing' }
export interface GitLocator {
  (): Promise<GitLocation>
  /** Forget a cached location (the binary vanished). */
  invalidate(): void
}

export interface GitLocatorOptions {
  env(): Promise<Env>
  platform?: NodeJS.Platform
  /** The selected developer directory, or null when `xcode-select -p` fails. Injectable for tests. */
  xcodeSelect?: (env: Env) => Promise<string | null>
  /** Whether `<developer dir>/usr/bin/git` is executable. Injectable for tests. */
  developerGit?: (directory: string) => Promise<boolean>
  find?: (name: string, pathValue: string | undefined) => Promise<string | null>
  /** Reads `git --version` output; injectable so tests never execute anything. */
  version?: (path: string, env: Env) => Promise<string | null>
}

const SHIM = '/usr/bin/git'

function defaultXcodeSelect(env: Env): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('/usr/bin/xcode-select', ['-p'], { env, timeout: 5000, maxBuffer: 16 * 1024 }, (error, stdout) => {
      const directory = String(stdout).trim()
      resolve(error || !directory.startsWith('/') ? null : directory)
    })
  })
}

async function defaultDeveloperGit(directory: string): Promise<boolean> {
  try { await access(join(directory, 'usr/bin/git'), constants.X_OK); return true } catch { return false }
}

function defaultVersion(path: string, env: Env): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(path, ['--version'], { env, timeout: 5000, maxBuffer: 16 * 1024, killSignal: 'SIGKILL' }, (error, stdout) => {
      const match = error ? null : /git version (.+)/.exec(String(stdout))
      resolve(match ? match[1]!.trim().slice(0, 60) : null)
    })
  })
}

export function createGitLocator(options: GitLocatorOptions): GitLocator {
  const platform = options.platform ?? process.platform
  const find = options.find ?? findExecutable
  const xcodeSelect = options.xcodeSelect ?? defaultXcodeSelect
  const developerGit = options.developerGit ?? defaultDeveloperGit
  const readVersion = options.version ?? defaultVersion
  let cached: GitLocation | null = null
  let pending: Promise<GitLocation> | null = null
  const locate = (async (): Promise<GitLocation> => {
    if (cached) return cached
    pending ??= (async (): Promise<GitLocation> => {
      const env = await options.env()
      const path = await find('git', env.PATH)
      if (!path) return { status: 'missing' }
      if (platform === 'darwin' && path === SHIM) {
        const directory = await xcodeSelect(env)
        if (!directory || !(await developerGit(directory))) return { status: 'missing' }
      }
      const found: GitLocation = { status: 'ok', path, version: await readVersion(path, scrubbedGitEnv(env)) }
      cached = found
      return found
    })().finally(() => { pending = null })
    return pending
  }) as GitLocator
  locate.invalidate = () => { cached = null }
  return locate
}
