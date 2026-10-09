// Resolves the user's login-shell environment. Apps launched from Finder or
// `open` inherit launchd's minimal PATH, so CLI discovery must use the
// environment a login + interactive shell would produce.
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { userInfo } from 'node:os'
import { isAbsolute } from 'node:path'

export type Env = Record<string, string>

export interface LoginEnvResult {
  source: 'login-shell' | 'fallback'
  shell: string
  env: Env
  durationMs: number
  /** Reason for falling back; never contains environment values. */
  error?: string
}

export interface ResolveLoginEnvOptions {
  shell?: string
  baseEnv?: NodeJS.ProcessEnv
  timeoutMs?: number
}

export const RESOLVING_ENV_FLAG = 'AI_STUDIO_RESOLVING_ENVIRONMENT'
const DROPPED_KEYS = new Set(['_', 'SHLVL', 'PWD', 'OLDPWD', RESOLVING_ENV_FLAG])
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024

export function toEnv(source: NodeJS.ProcessEnv): Env {
  const env: Env = {}
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') env[key] = value
  }
  return env
}

export function defaultShell(baseEnv: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = baseEnv.SHELL
  if (fromEnv && isAbsolute(fromEnv)) return fromEnv
  try {
    const fromUser = userInfo().shell
    if (fromUser && isAbsolute(fromUser)) return fromUser
  } catch {
    // userInfo can throw when the user has no passwd entry
  }
  return '/bin/zsh'
}

/** Builds the `-c` script that prints the environment between markers. */
export function buildEnvScript(marker: string): string {
  return `printf '%s' '${marker}'; /usr/bin/env -0; printf '%s' '${marker}'`
}

/** Extracts NUL-separated `KEY=value` pairs printed between two markers. */
export function parseEnvOutput(output: string, marker: string): Env | null {
  const start = output.indexOf(marker)
  if (start < 0) return null
  const end = output.indexOf(marker, start + marker.length)
  if (end < 0) return null
  const env: Env = {}
  for (const entry of output.slice(start + marker.length, end).split('\0')) {
    const eq = entry.indexOf('=')
    if (eq <= 0) continue
    const key = entry.slice(0, eq)
    if (DROPPED_KEYS.has(key)) continue
    env[key] = entry.slice(eq + 1)
  }
  return env
}

export function resolveLoginEnv(options: ResolveLoginEnvOptions = {}): Promise<LoginEnvResult> {
  const baseEnv = options.baseEnv ?? process.env
  const shell = options.shell ?? defaultShell(baseEnv)
  const timeoutMs = options.timeoutMs ?? 10_000
  const started = Date.now()
  const fallback = (error: string): LoginEnvResult => ({
    source: 'fallback',
    shell,
    env: toEnv(baseEnv),
    durationMs: Date.now() - started,
    error
  })

  if (!isAbsolute(shell)) return Promise.resolve(fallback('shell path is not absolute'))

  const marker = `__AI_STUDIO_ENV_${randomUUID().replace(/-/g, '')}__`
  return new Promise((resolvePromise) => {
    let settled = false
    let output = ''
    let bytes = 0
    const finish = (result: LoginEnvResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise(result)
    }
    const child = spawn(shell, ['-i', '-l', '-c', buildEnvScript(marker)], {
      env: { ...toEnv(baseEnv), [RESOLVING_ENV_FLAG]: '1' },
      stdio: ['ignore', 'pipe', 'ignore'],
      detached: true
    })
    const killGroup = (): void => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL')
      } catch {
        child.kill('SIGKILL')
      }
    }
    const timer = setTimeout(() => {
      killGroup()
      finish(fallback(`login shell timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      bytes += Buffer.byteLength(chunk)
      if (bytes > MAX_OUTPUT_BYTES) {
        killGroup()
        finish(fallback('login shell output too large'))
        return
      }
      output += chunk
    })
    child.on('error', (error) => finish(fallback(`failed to start login shell: ${error.message}`)))
    child.on('close', (code) => {
      const env = parseEnvOutput(output, marker)
      if (!env || !env.PATH) {
        finish(fallback(`login shell produced no environment (exit code ${code ?? 'null'})`))
        return
      }
      finish({ source: 'login-shell', shell, env, durationMs: Date.now() - started })
    })
  })
}

/** Caches one resolution per app run; call `refresh()` to resolve again. */
export interface ShellEnvService {
  get(): Promise<LoginEnvResult>
  refresh(): Promise<LoginEnvResult>
}

export function createShellEnvService(options: ResolveLoginEnvOptions = {}): ShellEnvService {
  let pending: Promise<LoginEnvResult> | null = null
  return {
    get: () => (pending ??= resolveLoginEnv(options)),
    refresh: () => (pending = resolveLoginEnv(options))
  }
}
