import {
  descendantsIn, findAlive, identityOf, isZombie, PsProcessLister, signalProcesses, waitForExit,
  type ProcessInfo, type ProcessLister
} from '@ai-studio/agent-adapter'
import type { Env } from '../shell-env/login-env'

export interface TerminalProcess {
  write(data: string): void
  resize(cols: number, rows: number): void
  pause(): void
  resume(): void
  onData(listener: (data: string) => void): { dispose(): void }
  onExit(listener: (exit: { exitCode: number; signal?: number }) => void): { dispose(): void }
  /** Natural PTY exit proves neither root ownership nor exit of observed descendants. */
  liveOwnedProcesses(): Promise<number[]>
  /** Verifies exit of the PTY and every observed owned process identity. Retryable. */
  close(): Promise<void>
}

export interface TerminalSpawn {
  shell: string
  cwd: string
  env: Env
  cols: number
  rows: number
}

export type TerminalSpawner = (options: TerminalSpawn) => Promise<TerminalProcess>

/** node-pty is loaded lazily; no CLI Session or unrelated process group is touched. */
export function createPtySpawner(options: { lister?: ProcessLister; gracefulMs?: number; forcedMs?: number } = {}): TerminalSpawner {
  const lister = options.lister ?? new PsProcessLister({ timeoutMs: 1500 })
  return async (spawn) => {
    const pty = await import('node-pty')
    const proc = pty.spawn(spawn.shell, ['-l'], {
      name: 'xterm-256color', cwd: spawn.cwd, env: spawn.env, cols: spawn.cols, rows: spawn.rows
    })
    // Pausing before awaiting process discovery prevents startup output being lost.
    proc.pause()
    let exited = false
    let closing: Promise<void> | null = null
    const owned = new Map<string, ProcessInfo>()
    const retain = (info: ProcessInfo) => owned.set(`${info.pid}:${info.startedAt}`, info)
    let root: ProcessInfo | undefined
    const exitListeners = new Set<(exit: { exitCode: number; signal?: number }) => void>()
    let lastExit: { exitCode: number; signal?: number } | undefined
    const exitSubscription = proc.onExit((event) => {
      exited = true
      lastExit = event
      clearInterval(tracker)
      for (const listener of exitListeners) listener(event)
    })
    let probe: Promise<void> | null = null
    const capture = (): Promise<void> => {
      if (probe) return probe
      probe = lister.list().then((all) => {
        const candidate = all.find((info) => info.pid === proc.pid && !isZombie(info))
        // Once the PTY exits, its numeric PID can belong to an unrelated process.
        // Only an identity observed while it was alive can establish ownership.
        if (!root && candidate && !exited) { root = candidate; retain(candidate) }
        if (root && candidate?.startedAt === root.startedAt) {
          for (const child of descendantsIn(all, proc.pid)) retain(child)
        }
        // Follow descendants we previously saw even after they get reparented.
        for (const known of [...owned.values()]) {
          const alive = all.find((info) => info.pid === known.pid && info.startedAt === known.startedAt && !isZombie(info))
          if (alive) for (const child of descendantsIn(all, alive.pid)) retain(child)
          else if (known.pid !== root?.pid) owned.delete(`${known.pid}:${known.startedAt}`)
        }
      }).finally(() => { probe = null })
      return probe
    }
    const tracker = setInterval(() => { void capture().catch(() => {}) }, 1000)
    tracker.unref()
    // A diagnostic probe failure must not orphan a successfully spawned PTY.
    // Return it to the Project service, keep retrying discovery, and retain its
    // cleanup error if ownership still cannot be proven when the user closes it.
    await capture().catch(() => {})
    return {
      write: (data) => proc.write(data),
      resize: (cols, rows) => proc.resize(cols, rows),
      pause: () => proc.pause(),
      resume: () => proc.resume(),
      onData: (listener) => proc.onData(listener),
      onExit: (listener) => {
        exitListeners.add(listener)
        if (lastExit) queueMicrotask(() => { if (exitListeners.has(listener)) listener(lastExit!) })
        return { dispose: () => exitListeners.delete(listener) }
      },
      liveOwnedProcesses: async () => {
        await capture()
        if (!root) throw new Error('Terminal process ownership unavailable; cannot safely confirm cleanup')
        return (await findAlive([...owned.values()].map(identityOf), lister)).map((info) => info.pid)
      },
      close: () => {
        if (closing) return closing
        closing = (async () => {
          await capture()
          const targets = [...owned.values()].reverse().map(identityOf)
          if (!root) throw new Error('Terminal process ownership unavailable; cannot safely confirm cleanup')
          // Identity checks are repeated immediately before each signal.
          await signalProcesses(targets, 'SIGHUP', lister)
          proc.resume()
          let result = await waitForExit(targets, { lister, timeoutMs: options.gracefulMs ?? 1200, intervalMs: 50 })
          if (!result.exited) {
            await signalProcesses(result.survivors.map(identityOf), 'SIGKILL', lister)
            result = await waitForExit(targets, { lister, timeoutMs: options.forcedMs ?? 1200, intervalMs: 50 })
          }
          if (!result.exited) throw new Error(`Terminal cleanup unconfirmed; surviving owned PIDs: ${result.survivors.map((info) => info.pid).join(', ')}`)
          // OS identity verification proves process exit; PTY exit flushes its final output.
          const deadline = Date.now() + (options.forcedMs ?? 1200)
          while (!exited && Date.now() < deadline) await new Promise<void>((resolve) => setTimeout(resolve, 25))
          if (!exited) throw new Error('Owned processes exited but PTY exit notification timed out')
          clearInterval(tracker)
          exitSubscription.dispose()
        })().finally(() => { closing = null })
        return closing
      }
    }
  }
}
