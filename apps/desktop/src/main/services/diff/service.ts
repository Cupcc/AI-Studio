// The project Diff service: per-Project single-flight snapshots with `settled` semantics, per-file queries, a watcher
// that exists only while a panel is subscribed, and a lifecycle that can prove no git child outlives its Project.
//
// Revisions: one counter for the whole service. A query takes its number when it STARTS; an invalidation takes one
// when it is announced. A renderer that holds a snapshot older than the latest invalidation knows to ask again.
import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import {
  DIFF_LIMITS,
  DIFF_IGNORED_LIMITS,
  type DiffFileRequest, type DiffFileResult, type DiffIgnored, type DiffInvalidated, type DiffSnapshot, type DiffSubscription,
  type DiffWatchChanged, type DiffWatchState
} from '@shared/tools/diff'
import { queryFile } from './file'
import type { GitRunner } from './git-runner'
import { failureOfExit, gitStep, QueryAborted, QueryFailure, sanitizeDetail, type QueryContext } from './query'
import { splitNul, toProjectPath } from './parse'
import { querySnapshot, type SnapshotParts } from './snapshot'
import { createDebouncer, createDiffWatcher, type Debouncer, type DiffWatcher, type WatchEventKind, type WatchFn } from './watcher'

/** Concurrent per-file queries a Project may have in flight; a flood is an error, not an unbounded queue. */
export const DIFF_FILE_CALL_LIMIT = 16
/** `.git`-only events seen during a query cause at most one follow-up notification per this interval. */
const GIT_DEFERRED_MIN_INTERVAL_MS = 2000

export interface DiffServiceOptions {
  projectPath(projectId: string): string | null
  canOperate?(projectId: string): boolean
  runner: GitRunner
  invalidated(event: DiffInvalidated): void
  watchChanged(event: DiffWatchChanged): void
  watch?: WatchFn
  newId?: () => string
  now?: () => number
  settleRetries?: number
  debounceMs?: number
  maxWaitMs?: number
}

export interface DiffService {
  getSnapshot(projectId: string): Promise<DiffSnapshot>
  getFile(request: DiffFileRequest): Promise<DiffFileResult>
  /** Ignored entries below the Project, for dimming in the Files tree. */
  getIgnored(projectId: string): Promise<DiffIgnored>
  subscribe(projectId: string, owner?: number): DiffSubscription
  unsubscribe(projectId: string, subscriptionId: string, owner?: number): void
  /** The renderer (a window) went away: drop every subscription it held. */
  detachOwner(owner: number): void
  /** Aborts and awaits every git child of the Project; throws if an exit cannot be confirmed (the close then fails and can be retried). */
  closeProject(projectId: string): Promise<void>
  closeAll(): Promise<void>
  dispose(): Promise<void>
}

interface Flight { controller: AbortController; promise: Promise<DiffSnapshot> }

interface ProjectState {
  id: string
  root: string
  /** Counts file system events that can change the Diff; a query compares it before and after. */
  invalidation: number
  /** The query that is running. */
  flight: Flight | null
  /** The latest query started, running or done: what an older, superseded caller is answered with. */
  newest: Flight | null
  fileControllers: Set<AbortController>
  files: Set<Promise<unknown>>
  subscriptions: Map<string, number>
  watcher: DiffWatcher | null
  debouncer: Debouncer | null
  watch: DiffWatchState
  closing: boolean
  gitDeferred: boolean
  lastDeferredAt: number
}

export function createDiffService(options: DiffServiceOptions): DiffService {
  const states = new Map<string, ProjectState>()
  const newId = options.newId ?? randomUUID
  const now = options.now ?? Date.now
  const settleRetries = options.settleRetries ?? DIFF_LIMITS.settleRetries
  const debounceMs = options.debounceMs ?? DIFF_LIMITS.watcherDebounceMs
  const maxWaitMs = options.maxWaitMs ?? DIFF_LIMITS.watcherMaxWaitMs
  let revision = 0
  let disposed = false

  function requireState(projectId: string): ProjectState {
    const root = options.projectPath(projectId)
    if (!root) throw new Error('Unknown project')
    let state = states.get(projectId)
    if (!state) {
      state = {
        id: projectId, root, invalidation: 0, flight: null, newest: null, fileControllers: new Set(), files: new Set(),
        subscriptions: new Map(), watcher: null, debouncer: null, watch: 'stopped', closing: false, gitDeferred: false, lastDeferredAt: -Infinity
      }
      states.set(projectId, state)
    } else if (state.root !== root) {
      // The Project moved: whatever was watched or queried belongs to the old directory.
      state.root = root
      if (state.watcher) { detach(state); attach(state) }
    }
    return state
  }
  const operable = (state: ProjectState) => !disposed && !state.closing && options.canOperate?.(state.id) !== false

  const gitVersion = (): Promise<string | null> => options.runner.version().catch(() => null)

  function emptySnapshot(state: ProjectState, status: DiffSnapshot['status'], detail: string | null, version: string | null, at: number): DiffSnapshot {
    return {
      projectId: state.id, revision: at, settled: true, status, head: null, repoPrefix: '', files: [],
      truncated: false, detail, gitVersion: version, computedAt: now()
    }
  }

  function context(state: ProjectState, signal: AbortSignal, timeoutMs: number): QueryContext {
    return { projectId: state.id, root: state.root, signal, runner: options.runner, timeoutMs }
  }

  async function requireDirectory(root: string): Promise<void> {
    const info = await stat(root).catch(() => null)
    if (!info?.isDirectory()) throw new QueryFailure('project_unavailable')
  }

  // ---- watcher -----------------------------------------------------------------------------------------------

  function setWatch(state: ProjectState, watch: DiffWatchState): void {
    if (state.watch === watch) return
    state.watch = watch
    options.watchChanged({ projectId: state.id, revision: ++revision, watch })
  }

  function attach(state: ProjectState): void {
    const debouncer = createDebouncer(debounceMs, maxWaitMs, () => {
      // A running query re-queries on its own when the tree changed under it; announcing now would only abort it.
      if (state.closing || state.flight || !state.watcher) return
      options.invalidated({ projectId: state.id, revision: ++revision })
    })
    state.debouncer = debouncer
    state.watcher = createDiffWatcher({
      root: state.root,
      ...(options.watch ? { watch: options.watch } : {}),
      onEvent: (kind) => onWatchEvent(state, kind),
      onDegraded: () => setWatch(state, 'degraded')
    })
    state.watch = state.watcher.state()
  }

  function detach(state: ProjectState): void {
    state.debouncer?.cancel()
    state.watcher?.close()
    state.debouncer = null
    state.watcher = null
    state.watch = 'stopped'
    state.gitDeferred = false
  }

  function onWatchEvent(state: ProjectState, kind: WatchEventKind): void {
    if (state.closing) return
    // Git's own reads must never feed back into a loop: `.git` events seen during a query are remembered, not counted.
    if (kind === 'git' && state.flight) { state.gitDeferred = true; return }
    state.invalidation++
    state.debouncer?.poke()
  }

  // ---- snapshots ---------------------------------------------------------------------------------------------

  async function runFlight(state: ProjectState, flight: Flight): Promise<DiffSnapshot> {
    const signal = flight.controller.signal
    const gone = (): Promise<DiffSnapshot> | null => {
      if (!signal.aborted && state.newest === flight) return null
      // Closing: nothing is queried any more. Superseded: the newest query answers every older caller, even when it
      // has already finished, so a stale snapshot can never come back after a newer one.
      if (state.closing || disposed || !state.newest || state.newest === flight) return Promise.resolve(emptySnapshot(state, 'project_closing', null, null, ++revision))
      return state.newest.promise
    }
    let result: DiffSnapshot | null = null
    let settled = false
    try {
      for (let attempt = 0; attempt <= settleRetries; attempt++) {
        const mark = state.invalidation
        const at = ++revision
        let parts: SnapshotParts
        try {
          await requireDirectory(state.root)
          parts = await querySnapshot(context(state, signal, DIFF_LIMITS.listTimeoutMs))
        } catch (error) {
          const superseded = gone()
          if (superseded) return superseded
          if (error instanceof QueryAborted) return gone() ?? emptySnapshot(state, 'project_closing', null, null, at)
          const failure = error instanceof QueryFailure ? error : new QueryFailure('failed', sanitizeDetail(error instanceof Error ? error.message : String(error), state.root))
          result = emptySnapshot(state, failure.availability, failure.detail, await gitVersion(), at)
          settled = true
          break
        }
        const superseded = gone()
        if (superseded) return superseded
        result = { projectId: state.id, revision: at, settled: true, ...parts, gitVersion: await gitVersion(), computedAt: now() }
        if (state.invalidation === mark) { settled = true; break }
      }
      const superseded = gone()
      if (superseded) return superseded
      result!.settled = settled
      if (!settled) state.debouncer?.poke() // still changing: let the renderer ask again after the burst
      if (state.gitDeferred) {
        state.gitDeferred = false
        if (now() - state.lastDeferredAt >= GIT_DEFERRED_MIN_INTERVAL_MS) {
          state.lastDeferredAt = now()
          state.invalidation++
          state.debouncer?.poke()
        }
      }
      return result!
    } finally {
      if (state.flight === flight) state.flight = null
    }
  }

  async function getSnapshot(projectId: string): Promise<DiffSnapshot> {
    const state = requireState(projectId)
    if (!operable(state)) return emptySnapshot(state, 'project_closing', null, null, ++revision)
    const flight: Flight = { controller: new AbortController(), promise: undefined as unknown as Promise<DiffSnapshot> }
    const previous = state.flight
    state.flight = flight
    state.newest = flight
    flight.promise = runFlight(state, flight)
    previous?.controller.abort()
    return flight.promise
  }

  // ---- files -------------------------------------------------------------------------------------------------

  async function getFile(request: DiffFileRequest): Promise<DiffFileResult> {
    const state = requireState(request.projectId)
    const at = ++revision
    const unavailable = (availability: Extract<DiffFileResult, { status: 'unavailable' }>['availability']): DiffFileResult =>
      ({ status: 'unavailable', revision: at, path: request.path, availability })
    if (!operable(state)) return unavailable('project_closing')
    if (state.files.size >= DIFF_FILE_CALL_LIMIT) throw new Error('Too many diff file requests in flight')
    const controller = new AbortController()
    state.fileControllers.add(controller)
    const task = (async (): Promise<DiffFileResult> => {
      try {
        await requireDirectory(state.root)
        const result = await queryFile(context(state, controller.signal, DIFF_LIMITS.fileTimeoutMs), request)
        if (controller.signal.aborted) return unavailable('project_closing')
        if (result.status === 'unchanged') return { status: 'unchanged', revision: at, path: request.path }
        return { status: 'ok', revision: at, settled: result.settled, entry: result.entry, original: result.original, modified: result.modified, patch: result.patch }
      } catch (error) {
        if (error instanceof QueryAborted || controller.signal.aborted) return unavailable('project_closing')
        if (error instanceof QueryFailure) return unavailable(error.availability)
        return unavailable('failed')
      } finally {
        state.fileControllers.delete(controller)
      }
    })()
    state.files.add(task)
    void task.finally(() => state.files.delete(task))
    return task
  }

  // ---- ignored entries ---------------------------------------------------------------------------------------

  async function getIgnored(projectId: string): Promise<DiffIgnored> {
    const state = requireState(projectId)
    const at = ++revision
    const unavailable = (availability: Extract<DiffIgnored, { status: 'unavailable' }>['availability']): DiffIgnored => ({ status: 'unavailable', revision: at, availability })
    if (!operable(state)) return unavailable('project_closing')
    if (state.files.size >= DIFF_FILE_CALL_LIMIT) throw new Error('Too many diff requests in flight')
    const controller = new AbortController()
    state.fileControllers.add(controller)
    const task = (async (): Promise<DiffIgnored> => {
      try {
        await requireDirectory(state.root)
        const result = await gitStep(context(state, controller.signal, DIFF_IGNORED_LIMITS.timeoutMs),
          ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory', '--no-empty-directory'],
          { maxBytes: DIFF_IGNORED_LIMITS.outputBytes })
        // A capped listing ends early; what was read is still a valid prefix of the NUL-separated output.
        if (result.code !== 0 && !result.truncated) throw failureOfExit(result, state.root)
        if (controller.signal.aborted) return unavailable('project_closing')
        const { tokens, incomplete } = splitNul(result.stdout)
        const paths: string[] = []
        for (const token of tokens) {
          if (paths.length >= DIFF_IGNORED_LIMITS.entries) break
          const path = toProjectPath(token.toString('utf8').replace(/\/$/, ''))
          if (path) paths.push(path)
        }
        return { status: 'ok', revision: at, paths, truncated: incomplete || result.truncated || tokens.length > paths.length }
      } catch (error) {
        if (error instanceof QueryAborted || controller.signal.aborted) return unavailable('project_closing')
        if (error instanceof QueryFailure) return unavailable(error.availability)
        return unavailable('failed')
      } finally {
        state.fileControllers.delete(controller)
      }
    })()
    state.files.add(task)
    void task.finally(() => state.files.delete(task))
    return task
  }

  // ---- subscriptions -----------------------------------------------------------------------------------------

  function subscribe(projectId: string, owner = 0): DiffSubscription {
    const state = requireState(projectId)
    if (!operable(state)) throw new Error('Project is closing; diff operation rejected')
    const subscriptionId = newId()
    state.subscriptions.set(subscriptionId, owner)
    if (!state.watcher) attach(state)
    return { projectId, subscriptionId, revision: ++revision, watch: state.watch }
  }

  function release(state: ProjectState): void {
    if (!state.subscriptions.size && state.watcher) detach(state)
  }

  function unsubscribe(projectId: string, subscriptionId: string, owner = 0): void {
    // A late cleanup of a Project that is gone, or of a subscription already dropped, is not an error.
    const state = states.get(projectId)
    const holder = state?.subscriptions.get(subscriptionId)
    if (!state || holder === undefined) return
    if (holder !== owner) throw new Error('Diff subscription sender mismatch')
    state.subscriptions.delete(subscriptionId)
    release(state)
  }

  function detachOwner(owner: number): void {
    for (const state of states.values()) {
      for (const [id, holder] of [...state.subscriptions]) if (holder === owner) state.subscriptions.delete(id)
      release(state)
    }
  }

  // ---- lifecycle ---------------------------------------------------------------------------------------------

  async function closeProject(projectId: string): Promise<void> {
    const state = states.get(projectId)
    if (!state) { await options.runner.terminateProject(projectId); return }
    state.closing = true
    try {
      state.flight?.controller.abort()
      for (const controller of state.fileControllers) controller.abort()
      const hadSubscriptions = state.subscriptions.size > 0
      detach(state)
      state.subscriptions.clear()
      // Renderers may subscribe again if the Project close is cancelled or fails.
      if (hadSubscriptions) options.watchChanged({ projectId, revision: ++revision, watch: 'stopped' })
      await options.runner.terminateProject(projectId)
      await Promise.allSettled([state.flight?.promise, ...state.files])
      state.newest = null
      states.delete(projectId)
    } finally {
      state.closing = false
    }
  }

  async function closeAll(): Promise<void> {
    const errors: string[] = []
    const results = await Promise.allSettled([...states.keys()].map((id) => closeProject(id)))
    for (const result of results) if (result.status === 'rejected') errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
    try { await options.runner.terminateAll() } catch (error) { errors.push(error instanceof Error ? error.message : String(error)) }
    if (errors.length) throw new Error(errors.join('; '))
  }

  return {
    getSnapshot, getFile, getIgnored, subscribe, unsubscribe, detachOwner, closeProject, closeAll,
    async dispose() {
      disposed = true
      await closeAll()
    }
  }
}
