// node-pty smoke check: spawn the user's shell in a PTY owned by the main
// process and wait for a marker on its output. Terminal UI is out of scope;
// user terminals and agent runtimes must use separate PTYs (04 §4).
import { homedir } from 'node:os'
import type { Env } from '../shell-env/login-env'

export interface PtySmokeResult {
  ok: boolean
  shell: string
  receivedMarker: boolean
  exitCode?: number
  durationMs: number
  error?: string
}

export const PTY_SMOKE_MARKER = '__AI_STUDIO_PTY_OK__'

export async function runPtySmoke(options: { shell: string; env: Env; timeoutMs?: number }): Promise<PtySmokeResult> {
  const started = Date.now()
  const timeoutMs = options.timeoutMs ?? 10_000
  const base = { shell: options.shell }
  let pty: typeof import('node-pty')
  try {
    // Loaded lazily so a broken native module is reported instead of crashing the app.
    pty = await import('node-pty')
  } catch (error) {
    return { ...base, ok: false, receivedMarker: false, durationMs: Date.now() - started, error: `load failed: ${errorMessage(error)}` }
  }
  return new Promise((resolve) => {
    let output = ''
    let receivedMarker = false
    let settled = false
    // Split so the marker only appears once the shell has executed printf.
    const script = `printf '%s%s\\n' '${PTY_SMOKE_MARKER.slice(0, 10)}' '${PTY_SMOKE_MARKER.slice(10)}'`
    let proc: import('node-pty').IPty | undefined
    const finish = (result: Omit<PtySmokeResult, 'shell' | 'durationMs'>): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ...base, ...result, durationMs: Date.now() - started })
    }
    const timer = setTimeout(() => {
      try {
        proc?.kill()
      } catch {
        // already gone
      }
      finish({ ok: false, receivedMarker, error: `timed out after ${timeoutMs}ms` })
    }, timeoutMs)
    try {
      proc = pty.spawn(options.shell, ['-l', '-c', script], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: homedir(),
        env: options.env
      })
    } catch (error) {
      finish({ ok: false, receivedMarker: false, error: `spawn failed: ${errorMessage(error)}` })
      return
    }
    proc.onData((data) => {
      output += data
      if (output.includes(PTY_SMOKE_MARKER)) receivedMarker = true
    })
    proc.onExit(({ exitCode }) => {
      // Give the last data chunk a moment to arrive.
      setTimeout(() => finish({ ok: receivedMarker && exitCode === 0, receivedMarker, exitCode }), 50)
    })
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
