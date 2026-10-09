// Locates executables on a given PATH and reads their version. Used for the
// skeleton smoke check; the CLI Adapter does its own availability checks
// and only needs the resolved environment from this service.
import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { delimiter, isAbsolute, join } from 'node:path'
import type { Env } from './login-env'

export interface ExecutableProbe {
  name: string
  found: boolean
  path?: string
  /** Semver-like version extracted from `--version`; raw output is not kept. */
  version?: string
  error?: string
}

const NAME = /^[A-Za-z0-9._-]+$/
const VERSION = /\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?/

export function splitPath(pathValue: string | undefined): string[] {
  if (!pathValue) return []
  return pathValue.split(delimiter).filter((dir) => dir.length > 0 && isAbsolute(dir))
}

export async function findExecutable(name: string, pathValue: string | undefined): Promise<string | null> {
  if (!NAME.test(name)) throw new Error(`Invalid executable name: ${name}`)
  for (const dir of splitPath(pathValue)) {
    const candidate = join(dir, name)
    try {
      const info = await stat(candidate)
      if (!info.isFile()) continue
      await access(candidate, constants.X_OK)
      return candidate
    } catch {
      // not here
    }
  }
  return null
}

export function extractVersion(output: string): string | undefined {
  return output.match(VERSION)?.[0]
}

export function readVersion(file: string, env: Env, timeoutMs = 15_000): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      ['--version'],
      { env, timeout: timeoutMs, maxBuffer: 64 * 1024, killSignal: 'SIGKILL' },
      (error, stdout) => {
        if (error) {
          reject(new Error(`--version failed (${error.code ?? error.signal ?? 'error'})`))
          return
        }
        resolve(extractVersion(String(stdout)))
      }
    )
  })
}

export async function probeExecutable(name: string, env: Env, timeoutMs?: number): Promise<ExecutableProbe> {
  const file = await findExecutable(name, env.PATH)
  if (!file) return { name, found: false }
  try {
    const version = await readVersion(file, env, timeoutMs)
    return version ? { name, found: true, path: file, version } : { name, found: true, path: file }
  } catch (error) {
    return { name, found: true, path: file, error: error instanceof Error ? error.message : String(error) }
  }
}
