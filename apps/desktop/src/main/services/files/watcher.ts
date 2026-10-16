// Recursive Project watcher for the Files tree (FR-TOOL-001 item 2): one fs.watch per Project that has subscribers,
// events filtered inside the callback (a `pnpm install` produces ~1.2 events per file written; the filter costs
// about 0.2 µs per event, spike SP2), coalesced with a trailing debounce plus a maximum wait, and degraded to an
// `overflow` signal instead of an unbounded list. Subscriptions are counted per (owner, subscriptionId); the last
// one leaving starts a grace period so quick tool switches keep the watcher.
import { randomUUID } from 'node:crypto'
import { watch as nodeWatch } from 'node:fs'
import {
  FILES_LIMITS, FILES_WATCH_IGNORED,
  type FilesChanged, type FilesSubscription, type FilesWatchChanged, type FilesWatchState
} from '@shared/tools/files'
import { isExcludedName } from './safe-path'

export const MAX_LIVE_WATCHERS = 4
/** Minimum spacing between two overflow signals: the renderer re-lists everything for each one. */
export const OVERFLOW_INTERVAL_MS = 1000

export type WatchListener = (event: string, filename: string | Buffer | null) => void
export interface WatcherHandle {
  close(): void
  on(event: 'error', listener: (error: Error) => void): unknown
}
export type WatchFn = (path: string, options: { recursive: true; persistent: false }, listener: WatchListener) => WatcherHandle

const defaultWatch: WatchFn = (path, options, listener) => nodeWatch(path, options, listener)

/**
 * True for events that never reach the tree: anything below a `.git` segment (the directory is hidden), and anything
 * more than one level below a `node_modules` segment (`node_modules/<pkg>` itself still shows).
 */
export function isIgnoredWatchPath(relativePath: string): boolean {
  const segments = relativePath.split('/')
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!
    if (isExcludedName(segment)) return true
    if (segments.length > index + 2 && FILES_WATCH_IGNORED.belowFirstLevel.some((name) => name === segment)) return true
  }
  return false
}

interface Subscription { owner: number }
interface ProjectWatch {
  projectId: string
  root: string
  subscriptions: Map<string, Subscription>
  handle: WatcherHandle | null
  status: FilesWatchState
  /** Why there is no live watcher: capacity is retried when a slot frees, an error only on the next subscribe. */
  degradedBy?: 'capacity' | 'error'
  dirs: Set<string>
  overflow: boolean
  firstEventAt?: number
  lastOverflowAt: number
  timer?: ReturnType<typeof setTimeout>
  grace?: ReturnType<typeof setTimeout>
}

export interface FilesWatcherOptions {
  projectRoot(projectId: string): string | null
  canOperate?(projectId: string): boolean
  /** Service-wide monotonic number shared with list / read results. */
  nextRevision(): number
  changed(event: FilesChanged): void
  watchChanged(event: FilesWatchChanged): void
  watch?: WatchFn
  newId?: () => string
  /** Calls `onGone` when the owner (a renderer) is destroyed or crashes; returns a release function. */
  watchOwner?(owner: number, onGone: () => void): () => void
  now?: () => number
  debounceMs?: number
  maxWaitMs?: number
  graceMs?: number
  maxWatchers?: number
}

export interface FilesWatcher {
  subscribe(projectId: string, owner: number): FilesSubscription
  unsubscribe(projectId: string, subscriptionId: string, owner: number): void
  detachOwner(owner: number): void
  /** Idempotent: stops the Project's watcher, drops its subscriptions and broadcasts `stopped` when there were any. */
  closeProject(projectId: string): void
  closeAll(): void
  /** closeAll, then refuses new subscriptions. */
  dispose(): void
  liveCount(): number
}

export function createFilesWatcher(options: FilesWatcherOptions): FilesWatcher {
  const projects = new Map<string, ProjectWatch>()
  const owners = new Map<number, { count: number; release: () => void }>()
  const watch = options.watch ?? defaultWatch
  const now = options.now ?? Date.now
  const newId = options.newId ?? randomUUID
  const debounceMs = options.debounceMs ?? FILES_LIMITS.watcherDebounceMs
  const maxWaitMs = options.maxWaitMs ?? FILES_LIMITS.watcherMaxWaitMs
  const graceMs = options.graceMs ?? FILES_LIMITS.unsubscribeGraceMs
  const maxWatchers = options.maxWatchers ?? MAX_LIVE_WATCHERS
  let closed = false

  const liveCount = () => [...projects.values()].filter((state) => state.handle).length
  const announce = (state: ProjectWatch) =>
    options.watchChanged({ projectId: state.projectId, revision: options.nextRevision(), watch: state.status })

  function trackOwner(owner: number): void {
    const known = owners.get(owner)
    if (known) { known.count++; return }
    const release = options.watchOwner?.(owner, () => detachOwner(owner)) ?? (() => {})
    owners.set(owner, { count: 1, release })
  }
  function untrackOwner(owner: number): void {
    const known = owners.get(owner)
    if (!known) return
    if (--known.count > 0) return
    owners.delete(owner)
    known.release()
  }

  function emit(state: ProjectWatch): void {
    const { projectId } = state
    if (state.overflow) {
      state.overflow = false
      state.dirs.clear()
      state.lastOverflowAt = now()
      options.changed({ projectId, revision: options.nextRevision(), dirs: [], overflow: true })
    } else if (state.dirs.size) {
      const dirs = [...state.dirs].sort()
      state.dirs.clear()
      options.changed({ projectId, revision: options.nextRevision(), dirs, overflow: false })
    }
  }

  function flush(state: ProjectWatch): void {
    state.timer = undefined
    state.firstEventAt = undefined
    if (!state.subscriptions.size) { state.dirs.clear(); state.overflow = false; return }
    if (state.overflow) {
      const wait = state.lastOverflowAt + OVERFLOW_INTERVAL_MS - now()
      // Events keep accumulating as one overflow until the interval has passed.
      if (wait > 0) { state.timer = setTimeout(() => flush(state), wait); state.timer.unref?.(); return }
    }
    emit(state)
  }

  function schedule(state: ProjectWatch): void {
    const at = now()
    state.firstEventAt ??= at
    const due = Math.min(at + debounceMs, state.firstEventAt + maxWaitMs)
    clearTimeout(state.timer)
    state.timer = setTimeout(() => flush(state), Math.max(0, due - at))
    state.timer.unref?.()
  }

  function onEvent(state: ProjectWatch, filename: string | Buffer | null): void {
    if (projects.get(state.projectId) !== state || !state.handle || !state.subscriptions.size) return
    const path = filename === null || filename === undefined ? '' : typeof filename === 'string' ? filename : filename.toString('utf8')
    // FSEvents can lose the name (or coalesce): without one the whole tree is stale.
    if (path === '') state.overflow = true
    else if (isIgnoredWatchPath(path)) return
    else if (!state.overflow) {
      const slash = path.lastIndexOf('/')
      state.dirs.add(slash < 0 ? '' : path.slice(0, slash))
      if (state.dirs.size > FILES_LIMITS.eventDirectories) { state.overflow = true; state.dirs.clear() }
    }
    schedule(state)
  }

  function stopHandle(state: ProjectWatch): void {
    const handle = state.handle
    state.handle = null
    try { handle?.close() } catch { /* already closed */ }
  }

  function onError(state: ProjectWatch): void {
    if (projects.get(state.projectId) !== state || !state.handle) return
    stopHandle(state)
    state.status = 'degraded'
    state.degradedBy = 'error'
    announce(state)
    // Events may have been lost: tell the tree once to re-list, regardless of the overflow spacing.
    clearTimeout(state.timer)
    state.timer = undefined
    if (state.subscriptions.size) { state.overflow = true; emit(state) }
    fillSlots()
  }

  /** Starts the fs watcher when the Project has none and a slot is free (idle grace watchers give way). */
  function ensureWatcher(state: ProjectWatch): void {
    if (state.handle) return
    if (liveCount() >= maxWatchers) {
      for (const other of [...projects.values()]) {
        if (liveCount() < maxWatchers) break
        if (other !== state && other.handle && !other.subscriptions.size) closeState(other, false)
      }
    }
    if (liveCount() >= maxWatchers) { state.status = 'degraded'; state.degradedBy = 'capacity'; return }
    try {
      const handle = watch(state.root, { recursive: true, persistent: false }, (_event, filename) => onEvent(state, filename))
      handle.on('error', () => onError(state))
      state.handle = handle
      state.status = 'live'
      state.degradedBy = undefined
    } catch {
      state.status = 'degraded'
      state.degradedBy = 'error'
    }
  }

  /** A freed slot is offered to Projects that were degraded for lack of one. */
  function fillSlots(): void {
    for (const state of [...projects.values()]) {
      if (state.handle || state.degradedBy !== 'capacity' || !state.subscriptions.size || liveCount() >= maxWatchers) continue
      ensureWatcher(state)
      if (state.status === 'live') announce(state)
    }
  }

  function closeState(state: ProjectWatch, broadcast: boolean): void {
    if (projects.get(state.projectId) !== state) return
    projects.delete(state.projectId)
    clearTimeout(state.timer)
    clearTimeout(state.grace)
    stopHandle(state)
    const had = state.subscriptions.size > 0
    for (const subscription of state.subscriptions.values()) untrackOwner(subscription.owner)
    state.subscriptions.clear()
    state.dirs.clear()
    state.status = 'stopped'
    if (broadcast && had) announce(state)
  }

  function removeSubscription(state: ProjectWatch, subscriptionId: string): void {
    const subscription = state.subscriptions.get(subscriptionId)
    if (!subscription) return
    state.subscriptions.delete(subscriptionId)
    untrackOwner(subscription.owner)
    if (state.subscriptions.size) return
    clearTimeout(state.timer)
    state.timer = undefined
    state.dirs.clear()
    state.overflow = false
    // Quick tool switches resubscribe within the grace period and keep the watcher.
    state.grace = setTimeout(() => { closeState(state, false); fillSlots() }, graceMs)
    state.grace.unref?.()
  }

  function detachOwner(owner: number): void {
    for (const state of [...projects.values()]) {
      for (const [id, subscription] of [...state.subscriptions]) if (subscription.owner === owner) removeSubscription(state, id)
    }
  }

  return {
    subscribe(projectId, owner) {
      const subscriptionId = newId()
      const revision = options.nextRevision()
      const root = options.projectRoot(projectId)
      if (closed || !root || options.canOperate?.(projectId) === false) return { projectId, subscriptionId, revision, watch: 'stopped' }
      let state = projects.get(projectId)
      if (state && state.root !== root) { closeState(state, true); state = undefined }
      const fresh = !state
      if (!state) {
        state = { projectId, root, subscriptions: new Map(), handle: null, status: 'degraded', dirs: new Set(), overflow: false, lastOverflowAt: -Infinity }
        projects.set(projectId, state)
      }
      clearTimeout(state.grace)
      state.grace = undefined
      state.subscriptions.set(subscriptionId, { owner })
      trackOwner(owner)
      const before = state.status
      // A Project degraded by an earlier error gets a new attempt when someone subscribes again.
      ensureWatcher(state)
      if (!fresh && state.status !== before) announce(state)
      return { projectId, subscriptionId, revision, watch: state.status }
    },
    unsubscribe(projectId, subscriptionId, owner) {
      const state = projects.get(projectId)
      if (!state || state.subscriptions.get(subscriptionId)?.owner !== owner) return
      removeSubscription(state, subscriptionId)
    },
    detachOwner,
    closeProject(projectId) {
      const state = projects.get(projectId)
      if (!state) return
      closeState(state, true)
      fillSlots()
    },
    closeAll() {
      for (const state of [...projects.values()]) closeState(state, true)
    },
    dispose() {
      closed = true
      for (const state of [...projects.values()]) closeState(state, true)
    },
    liveCount
  }
}
