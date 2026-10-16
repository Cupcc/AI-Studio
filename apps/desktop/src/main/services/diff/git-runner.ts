// Runs the Git CLI for the Diff service: argument arrays only, a scrubbed environment, a detached process group that
// is killed as a whole, bounded output, timeouts, and a concurrency limit per Project and overall. Every child is
// tracked so closing a Project can prove that nothing it started is still running.
import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import type { Env } from '../shell-env/login-env'
import { GIT_GLOBAL_ARGS, scrubbedGitEnv } from './git-env'
import { prepareGitIndex } from './git-index'
import type { GitLocator } from './git-locate'

export interface GitRunRequest {
  projectId: string
  /** The Project root (canonical path); it is also the base of every relative path argument. */
  cwd: string
  /** Subcommand and its options. User-controlled paths must come after a `--`. */
  args: readonly string[]
  maxBytes: number
  timeoutMs: number
  signal?: AbortSignal
}

export type GitRunResult =
  | { kind: 'done'; code: number; stdout: Buffer; stderr: string; truncated: boolean }
  | { kind: 'aborted' }
  | { kind: 'timeout' }
  /** No usable git binary (never located, or it vanished). */
  | { kind: 'missing' }
  /** The binary exists but the working directory does not (the Project directory was removed). */
  | { kind: 'cwd_missing' }
  | { kind: 'spawn_failed'; message: string }

export interface GitRunner {
  run(request: GitRunRequest): Promise<GitRunResult>
  /**
   * Rejects queued work, kills every running child of the Project (SIGKILL to the whole process group) and waits for
   * the exit. Throws when an exit cannot be confirmed in time, so the caller can keep the Project open and retry.
   */
  terminateProject(projectId: string): Promise<void>
  terminateAll(): Promise<void>
  version(): Promise<string | null>
  /** Running plus queued runs; for tests and diagnostics. */
  pending(projectId?: string): number
}

export interface GitRunnerOptions {
  locate: GitLocator
  environment(): Promise<Env>
  spawn?: typeof nodeSpawn
  /** Signals a whole process group (negative pid). Injectable so tests with fake children never signal a real pid. */
  killGroup?: (pid: number, signal: NodeJS.Signals) => void
  /** Probes whether any member of the group is alive. Injectable together with `killGroup`. */
  groupAlive?: (pid: number) => boolean
  /** SIGTERM first for a superseded or timed-out run, SIGKILL after this long. */
  termGraceMs?: number
  /** How long a SIGKILL'd child may take to disappear before termination is reported as failed. */
  confirmMs?: number
  perProject?: number
  overall?: number
}

const STDERR_LIMIT = 64 * 1024

function defaultKillGroup(pid: number, signal: NodeJS.Signals): void {
  try { process.kill(-pid, signal) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

/** True while any member of the group is alive (signal 0 only probes). */
function defaultGroupAlive(pid: number): boolean {
  try { process.kill(-pid, 0); return true } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM' }
}

interface Tracked { pid: number; exited: Promise<void>; kill(signal: NodeJS.Signals): void }
interface Waiter { projectId: string; start(): void; cancel(): void }

export function createGitRunner(options: GitRunnerOptions): GitRunner {
  const spawn = options.spawn ?? nodeSpawn
  const killGroup = options.killGroup ?? defaultKillGroup
  const groupAlive = options.groupAlive ?? defaultGroupAlive
  const termGraceMs = options.termGraceMs ?? 1000
  const confirmMs = options.confirmMs ?? 3000
  const perProject = options.perProject ?? 2
  const overall = options.overall ?? 4
  const slots = new Map<string, number>()
  const children = new Map<string, Set<Tracked>>()
  // Executions that own a child, until they have fully settled (child gone): terminateProject waits for these too.
  const runs = new Map<string, Set<Promise<unknown>>>()
  const waiting: Waiter[] = []
  // A prelude (locate, environment, queue) that began before a terminate must not spawn after it.
  const epochs = new Map<string, number>()
  const epochOf = (projectId: string) => epochs.get(projectId) ?? 0
  let active = 0

  function dispatch(): void {
    for (let index = 0; index < waiting.length && active < overall;) {
      const waiter = waiting[index]!
      if ((slots.get(waiter.projectId) ?? 0) >= perProject) { index++; continue }
      waiting.splice(index, 1)
      waiter.start()
    }
  }

  /** Resolves with a release callback once a slot is free, or null when aborted while queued. */
  function acquire(projectId: string, signal: AbortSignal | undefined): Promise<(() => void) | null> {
    if (signal?.aborted) return Promise.resolve(null)
    return new Promise((resolve) => {
      let settled = false
      const onAbort = () => waiter.cancel()
      const waiter: Waiter = {
        projectId,
        start: () => {
          settled = true
          signal?.removeEventListener('abort', onAbort)
          active++
          slots.set(projectId, (slots.get(projectId) ?? 0) + 1)
          let released = false
          resolve(() => {
            if (released) return
            released = true
            active--
            const left = (slots.get(projectId) ?? 1) - 1
            if (left > 0) slots.set(projectId, left)
            else slots.delete(projectId)
            dispatch()
          })
        },
        cancel: () => {
          if (settled) return
          settled = true
          const at = waiting.indexOf(waiter)
          if (at >= 0) waiting.splice(at, 1)
          signal?.removeEventListener('abort', onAbort)
          resolve(null)
        }
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      waiting.push(waiter)
      dispatch()
    })
  }

  async function execute(request: GitRunRequest, path: string, env: Env, epoch: number): Promise<GitRunResult> {
    let isolatedIndex: Awaited<ReturnType<typeof prepareGitIndex>>
    try {
      isolatedIndex = await prepareGitIndex(request.cwd, env)
    } catch (error) {
      return { kind: 'spawn_failed', message: error instanceof Error ? error.message : String(error) }
    }
    // Preparing the private index is asynchronous. A cancelled or closed Project must not spawn after that wait.
    if (request.signal?.aborted || epochOf(request.projectId) !== epoch) {
      await isolatedIndex.cleanup()
      return { kind: 'aborted' }
    }
    let child: ChildProcess
    try {
      child = spawn(path, [...GIT_GLOBAL_ARGS, ...request.args], {
        cwd: request.cwd, env: isolatedIndex.env, stdio: ['ignore', 'pipe', 'pipe'], detached: true, windowsHide: true
      })
    } catch (error) {
      await isolatedIndex.cleanup()
      return { kind: 'spawn_failed', message: error instanceof Error ? error.message : String(error) }
    }
    // A failed spawn reports through 'error' (no pid); keep the listener so it never becomes an uncaught exception.
    const failed = new Promise<NodeJS.ErrnoException>((resolve) => child.once('error', resolve))
    let tracked: Tracked | undefined
    let set: Set<Tracked> | undefined
    if (child.pid !== undefined) {
      const pid = child.pid
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
      tracked = { pid, exited, kill: (signal) => killGroup(pid, signal) }
      set = children.get(request.projectId) ?? new Set<Tracked>()
      children.set(request.projectId, set)
      set.add(tracked)
    }
    const untrack = () => {
      if (!tracked || !set) return
      set.delete(tracked)
      if (!set.size && children.get(request.projectId) === set) children.delete(request.projectId)
    }
    const stop = (signal: NodeJS.Signals) => { try { tracked?.kill(signal) } catch { /* the exit below decides */ } }
    const chunks: Buffer[] = []
    let size = 0, truncated = false, stderr = ''
    let aborted = false, timedOut = false
    let escalate: NodeJS.Timeout | undefined
    const terminate = () => {
      stop('SIGTERM')
      escalate ??= setTimeout(() => stop('SIGKILL'), termGraceMs)
    }
    child.stdout?.on('data', (chunk: Buffer) => {
      if (truncated) return
      const room = request.maxBytes - size
      if (chunk.length > room) {
        if (room > 0) chunks.push(chunk.subarray(0, room))
        size = request.maxBytes
        truncated = true
        terminate()
        return
      }
      chunks.push(chunk)
      size += chunk.length
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < STDERR_LIMIT) stderr += chunk.toString('utf8').slice(0, STDERR_LIMIT - stderr.length)
    })
    const timer = setTimeout(() => { timedOut = true; terminate() }, request.timeoutMs)
    const onAbort = () => { aborted = true; terminate() }
    if (request.signal?.aborted) onAbort()
    else request.signal?.addEventListener('abort', onAbort, { once: true })
    const outcome = await new Promise<{ code: number } | { error: NodeJS.ErrnoException }>((resolve) => {
      let done = false
      const finish = (value: { code: number } | { error: NodeJS.ErrnoException }) => { if (!done) { done = true; resolve(value) } }
      void failed.then((error) => finish({ error }))
      child.once('close', (code) => finish({ code: code ?? -1 }))
      // A grandchild that inherited the pipes must not hold the run open once the leader is gone.
      child.once('exit', (code) => setTimeout(() => finish({ code: code ?? -1 }), 250).unref())
    })
    clearTimeout(timer)
    clearTimeout(escalate)
    request.signal?.removeEventListener('abort', onAbort)
    // The leader is gone; reap anything it left in its group so no filter or helper outlives the run.
    if (tracked && groupAlive(tracked.pid)) stop('SIGKILL')
    untrack()
    await isolatedIndex.cleanup()
    if ('error' in outcome) {
      const code = outcome.error.code
      if (code !== 'ENOENT' && code !== 'EACCES') return { kind: 'spawn_failed', message: outcome.error.message }
      // Node reports a missing cwd as ENOENT of the program; tell the two apart by probing the binary itself.
      const binary = await access(path, constants.X_OK).then(() => true, () => false)
      return binary && code === 'ENOENT' ? { kind: 'cwd_missing' } : { kind: 'missing' }
    }
    if (aborted) return { kind: 'aborted' }
    if (timedOut) return { kind: 'timeout' }
    return { kind: 'done', code: outcome.code, stdout: Buffer.concat(chunks), stderr, truncated }
  }

  async function runOnce(request: GitRunRequest): Promise<GitRunResult> {
    const epoch = epochOf(request.projectId)
    if (request.signal?.aborted) return { kind: 'aborted' }
    const location = await options.locate()
    if (location.status === 'missing') return { kind: 'missing' }
    const env = scrubbedGitEnv(await options.environment())
    if (request.signal?.aborted || epochOf(request.projectId) !== epoch) return { kind: 'aborted' }
    const release = await acquire(request.projectId, request.signal)
    if (!release) return { kind: 'aborted' }
    try {
      if (request.signal?.aborted || epochOf(request.projectId) !== epoch) return { kind: 'aborted' }
      const execution = execute(request, location.path, env, epoch)
      const set = runs.get(request.projectId) ?? new Set<Promise<unknown>>()
      runs.set(request.projectId, set)
      set.add(execution)
      const forget = () => { set.delete(execution); if (!set.size && runs.get(request.projectId) === set) runs.delete(request.projectId) }
      execution.then(forget, forget)
      const result = await execution
      if (result.kind === 'missing') options.locate.invalidate()
      return result
    } finally { release() }
  }

  const runner: GitRunner = {
    run: runOnce,
    async terminateProject(projectId) {
      epochs.set(projectId, epochOf(projectId) + 1)
      for (const waiter of waiting.filter((item) => item.projectId === projectId)) waiter.cancel()
      const targets = [...(children.get(projectId) ?? [])]
      for (const target of targets) { try { target.kill('SIGKILL') } catch { /* confirmed below */ } }
      const unconfirmed: number[] = []
      await Promise.all(targets.map(async (target) => {
        const deadline = Date.now() + confirmMs
        let timer: NodeJS.Timeout | undefined
        const exited = await Promise.race([
          target.exited.then(() => true),
          new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), confirmMs) })
        ])
        clearTimeout(timer)
        // The leader's exit is not enough: the whole group has to be gone.
        while (exited && groupAlive(target.pid) && Date.now() < deadline) {
          try { target.kill('SIGKILL') } catch { /* keep polling */ }
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
        if (!exited || groupAlive(target.pid)) unconfirmed.push(target.pid)
      }))
      if (unconfirmed.length) throw new Error(`Git process exit could not be confirmed (pid ${unconfirmed.join(', ')})`)
      // Exits are confirmed; let the runs that owned those children finish releasing their slots.
      await Promise.allSettled([...(runs.get(projectId) ?? [])])
    },
    async terminateAll() {
      const ids = new Set<string>([...children.keys(), ...runs.keys(), ...waiting.map((item) => item.projectId)])
      const results = await Promise.allSettled([...ids].map((id) => runner.terminateProject(id)))
      const failures = results.flatMap((result) => (result.status === 'rejected' ? [result.reason instanceof Error ? result.reason.message : String(result.reason)] : []))
      if (failures.length) throw new Error(failures.join('; '))
    },
    async version() {
      const location = await options.locate()
      return location.status === 'ok' ? location.version : null
    },
    pending(projectId) {
      const queued = waiting.filter((item) => !projectId || item.projectId === projectId).length
      return (projectId ? slots.get(projectId) ?? 0 : active) + queued
    }
  }
  return runner
}
