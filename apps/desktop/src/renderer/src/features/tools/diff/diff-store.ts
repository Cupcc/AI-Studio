import { create } from 'zustand'
import type {
  DiffAvailability, DiffFileEntry, DiffFileResult, DiffInvalidated, DiffSnapshot, DiffWatchChanged, DiffWatchState
} from '@shared/tools/diff'
import type { ProjectPath } from '@shared/tools/files'
import { diffApi } from './api'
import { describeError } from './diff-format'

/** The selected row is kept by path; `oldPath` is the rename source the single-file query needs. */
export interface DiffSelection { path: ProjectPath; oldPath: ProjectPath | null }
export interface DiffFileState {
  /** The path `result` belongs to. A result is never shown for another path. */
  path: ProjectPath | null
  result: DiffFileResult | null
  appliedRevision: number
  loading: boolean
  error: string | null
}
export interface ProjectDiff {
  snapshot: DiffSnapshot | null
  appliedRevision: number
  loading: boolean
  /** The last query failed in transit (not a Git status): the snapshot, if any, is the previous and possibly stale one. */
  error: string | null
  selected: DiffSelection | null
  file: DiffFileState
  /** A selection that was dropped because the file no longer differs; shown as a dismissible notice. */
  clearedPath: ProjectPath | null
  watch: DiffWatchState | null
  /** Share of the panel height given to the file list while a file is open. */
  listRatio: number
}
interface DiffStore {
  projects: Record<string, ProjectDiff>
  /** The panel is visible: subscribe to changes and query. Returns the matching deactivation. */
  activate(projectId: string): () => void
  /** Coalesced re-query; ignored while the panel is not active. */
  refresh(projectId: string): void
  /** The refresh button: also tries to restore auto-refresh when no subscription is held. */
  reload(projectId: string): void
  select(projectId: string, entry: DiffFileEntry | null): void
  retryFile(projectId: string): void
  clearNotice(projectId: string): void
  setListRatio(projectId: string, ratio: number): void
  handleInvalidated(event: DiffInvalidated): void
  handleWatchChanged(event: DiffWatchChanged): void
  forget(projectId: string): void
}

export const LIST_RATIO = { initial: 0.4, min: 0.15, max: 0.85 } as const
/** Waits before another subscribe attempt after a failure or a `stopped` event (a cancelled Project close can need a moment). */
export const RESUBSCRIBE_DELAYS_MS = [500, 2000, 5000] as const
/** Only these statuses describe the working tree; the others are failures that must not clear a selection. */
const AUTHORITATIVE: ReadonlySet<DiffAvailability> = new Set<DiffAvailability>(['ready', 'clean', 'no_head'])

const emptyFile = (): DiffFileState => ({ path: null, result: null, appliedRevision: 0, loading: false, error: null })
const empty = (): ProjectDiff => ({
  snapshot: null, appliedRevision: 0, loading: false, error: null, selected: null, file: emptyFile(),
  clearedPath: null, watch: null, listRatio: LIST_RATIO.initial
})

// Module state mirrors terminal-store: an epoch per forgotten Project, request versions that make an older failure
// harmless, and the closed set that keeps late events from resurrecting a closed Project.
const epochs = new Map<string, number>()
const versions = new Map<string, number>()
const closed = new Set<string>()
/** Visible panels; the value tells a stale disposer from the current activation. */
const activations = new Map<string, number>()
/** The snapshot query in flight (its request version). One at a time; further requests set `trailing`. */
const inflight = new Map<string, number>()
const trailing = new Set<string>()
const subscriptions = new Map<string, string>()
const subscribing = new Map<string, Promise<void>>()
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>()
/** Counts watch events per Project: an event that arrives while `subscribe` is in flight is newer than its reply. */
const watchEvents = new Map<string, number>()
let activationCounter = 0

const currentEpoch = (projectId: string) => epochs.get(projectId) ?? 0
const bump = (map: Map<string, number>, key: string) => { const next = (map.get(key) ?? 0) + 1; map.set(key, next); return next }
const fileKey = (projectId: string) => `${projectId}\0file`
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

function unsubscribeQuietly(projectId: string, subscriptionId: string) {
  void (async () => {
    try { await diffApi().unsubscribe({ projectId, subscriptionId }) } catch { /* the service drops it when the Project closes */ }
  })()
}
function clearRetry(projectId: string) {
  const timer = retryTimers.get(projectId)
  if (timer !== undefined) clearTimeout(timer)
  retryTimers.delete(projectId)
}

export const useDiff = create<DiffStore>((set, get) => {
  const patch = (projectId: string, update: Partial<ProjectDiff>) => {
    if (closed.has(projectId)) return
    set(s => ({ projects: { ...s.projects, [projectId]: { ...(s.projects[projectId] ?? empty()), ...update } } }))
  }

  function refresh(projectId: string) {
    if (closed.has(projectId) || !activations.has(projectId)) return
    if (inflight.has(projectId)) { trailing.add(projectId); return }
    void runSnapshot(projectId)
  }

  async function runSnapshot(projectId: string) {
    const epoch = currentEpoch(projectId), version = bump(versions, projectId)
    inflight.set(projectId, version)
    patch(projectId, { loading: true })
    try {
      const snapshot = await diffApi().getSnapshot({ projectId })
      if (currentEpoch(projectId) === epoch) applySnapshot(projectId, snapshot)
    } catch (error) {
      if (currentEpoch(projectId) === epoch && versions.get(projectId) === version) patch(projectId, { error: describeError(error) })
    } finally {
      if (currentEpoch(projectId) === epoch && inflight.get(projectId) === version) {
        inflight.delete(projectId)
        patch(projectId, { loading: false })
        // Everything that asked while this query ran is answered by one more query started after it.
        if (trailing.delete(projectId)) refresh(projectId)
      }
    }
  }

  function applySnapshot(projectId: string, snapshot: DiffSnapshot) {
    const current = get().projects[projectId]
    // A slower, older query must not overwrite what a newer one already showed.
    if (!current || snapshot.projectId !== projectId || snapshot.revision < current.appliedRevision) return
    const update: Partial<ProjectDiff> = { snapshot, appliedRevision: snapshot.revision, error: null }
    let refetch = false
    const selected = current.selected
    if (selected) {
      if (!AUTHORITATIVE.has(snapshot.status)) {
        // A failure says nothing about the file: keep the selection, drop the content so it cannot be shown as current.
        update.file = emptyFile()
      } else {
        const entry = snapshot.files.find(file => file.path === selected.path)
        if (entry) { update.selected = { path: entry.path, oldPath: entry.oldPath }; refetch = true }
        // A truncated list cannot prove the file is gone: the single-file query decides.
        else if (snapshot.truncated) refetch = true
        else { update.selected = null; update.file = emptyFile(); update.clearedPath = selected.path }
      }
    }
    // The file differs again: the notice about it is obsolete.
    if (update.clearedPath === undefined && current.clearedPath && snapshot.files.some(file => file.path === current.clearedPath)) update.clearedPath = null
    patch(projectId, update)
    // The list changing says nothing about this file's content (same counts, different text), so it is always re-read.
    if (refetch) fetchFile(projectId)
  }

  function fetchFile(projectId: string) {
    const selection = get().projects[projectId]?.selected
    if (!selection || closed.has(projectId) || !activations.has(projectId)) return
    const epoch = currentEpoch(projectId), key = fileKey(projectId), version = bump(versions, key)
    const file = get().projects[projectId]!.file
    // The previous content of the SAME file stays while it is re-read (the panel marks it as refreshing); another file's never.
    patch(projectId, { file: file.path === selection.path ? { ...file, loading: true, error: null } : { ...emptyFile(), path: selection.path, loading: true } })
    void (async () => {
      try {
        const result = await diffApi().getFile({ projectId, path: selection.path, oldPath: selection.oldPath })
        if (currentEpoch(projectId) === epoch) applyFile(projectId, selection.path, result)
      } catch (error) {
        const stillSelected = get().projects[projectId]?.selected?.path === selection.path
        if (currentEpoch(projectId) === epoch && versions.get(key) === version && stillSelected) {
          // After a failure nothing of the previous content stays on screen.
          patch(projectId, { file: { ...emptyFile(), path: selection.path, error: describeError(error) } })
        }
      } finally {
        const latest = get().projects[projectId]?.file
        if (currentEpoch(projectId) === epoch && versions.get(key) === version && latest?.path === selection.path) patch(projectId, { file: { ...latest, loading: false } })
      }
    })()
  }

  function applyFile(projectId: string, path: ProjectPath, result: DiffFileResult) {
    const project = get().projects[projectId]
    if (!project || project.selected?.path !== path) return
    const resultPath = result.status === 'ok' ? result.entry.path : result.path
    const same = project.file.path === path
    if (resultPath !== path || result.revision < (same ? project.file.appliedRevision : 0)) return
    patch(projectId, { file: { path, result, appliedRevision: result.revision, loading: same ? project.file.loading : false, error: null } })
  }

  function scheduleRetry(projectId: string, attempt: number) {
    const delay = RESUBSCRIBE_DELAYS_MS[attempt]
    if (delay === undefined || !activations.has(projectId) || closed.has(projectId)) return
    clearRetry(projectId)
    retryTimers.set(projectId, setTimeout(() => { retryTimers.delete(projectId); void subscribeWatch(projectId, attempt + 1, true) }, delay))
  }

  /** Attaches the service watcher. Resolves when the attempt is settled; failures degrade the badge and retry a few times. */
  function subscribeWatch(projectId: string, attempt: number, refreshAfter: boolean): Promise<void> {
    const pending = subscribing.get(projectId)
    if (pending) return pending
    if (subscriptions.has(projectId) || !activations.has(projectId) || closed.has(projectId)) return Promise.resolve()
    const epoch = currentEpoch(projectId), eventsBefore = watchEvents.get(projectId) ?? 0
    const self: { run?: Promise<void> } = {}
    const run = self.run = (async () => {
      try {
        const subscription = await diffApi().subscribe({ projectId })
        // The panel hid or the Project closed meanwhile: give the subscription back instead of leaking a watcher.
        if (currentEpoch(projectId) !== epoch || !activations.has(projectId)) { unsubscribeQuietly(projectId, subscription.subscriptionId); return }
        const eventsSince = (watchEvents.get(projectId) ?? 0) !== eventsBefore
        // `stopped` during the call, or a service that is already closing: this subscription is not usable.
        if ((eventsSince && get().projects[projectId]?.watch === 'stopped') || subscription.watch === 'stopped') {
          unsubscribeQuietly(projectId, subscription.subscriptionId)
          patch(projectId, { watch: 'stopped' })
          scheduleRetry(projectId, attempt)
          return
        }
        subscriptions.set(projectId, subscription.subscriptionId)
        if (!eventsSince) patch(projectId, { watch: subscription.watch })
        // Changes made while nothing watched are only found by asking.
        if (refreshAfter) refresh(projectId)
      } catch {
        if (currentEpoch(projectId) === epoch && activations.has(projectId)) { patch(projectId, { watch: 'degraded' }); scheduleRetry(projectId, attempt) }
      } finally {
        if (subscribing.get(projectId) === self.run) subscribing.delete(projectId)
      }
    })()
    subscribing.set(projectId, run)
    return run
  }

  function deactivate(projectId: string) {
    activations.delete(projectId); trailing.delete(projectId); clearRetry(projectId)
    const subscriptionId = subscriptions.get(projectId)
    subscriptions.delete(projectId)
    if (get().projects[projectId]) patch(projectId, { watch: null })
    if (subscriptionId) unsubscribeQuietly(projectId, subscriptionId)
  }

  return {
    projects: {},
    activate(projectId) {
      closed.delete(projectId)
      const token = ++activationCounter
      activations.set(projectId, token)
      if (!get().projects[projectId]) patch(projectId, {})
      // Attach the watcher first so nothing that changes after the query starts is missed, then read.
      // Only the newest activation reads (React StrictMode mounts, unmounts and mounts again).
      void subscribeWatch(projectId, 0, false).then(() => { if (activations.get(projectId) === token) refresh(projectId) })
      return () => { if (activations.get(projectId) === token) deactivate(projectId) }
    },
    refresh,
    reload(projectId) {
      if (!activations.has(projectId) || closed.has(projectId)) return
      if (!subscriptions.has(projectId) && !subscribing.has(projectId)) { clearRetry(projectId); void subscribeWatch(projectId, 0, false) }
      refresh(projectId)
    },
    select(projectId, entry) {
      const project = get().projects[projectId]
      if (!project || (entry && project.selected?.path === entry.path)) return
      // A new version makes the failure of a request for the previous selection harmless.
      bump(versions, fileKey(projectId))
      if (!entry) { patch(projectId, { selected: null, file: emptyFile(), clearedPath: null }); return }
      patch(projectId, { selected: { path: entry.path, oldPath: entry.oldPath }, file: emptyFile(), clearedPath: null })
      fetchFile(projectId)
    },
    retryFile: fetchFile,
    clearNotice: projectId => patch(projectId, { clearedPath: null }),
    setListRatio: (projectId, ratio) => patch(projectId, { listRatio: clamp(ratio, LIST_RATIO.min, LIST_RATIO.max) }),
    handleInvalidated({ projectId }) {
      // A hint only (the revision is not compared): a query that started later simply finds the same state.
      refresh(projectId)
    },
    handleWatchChanged({ projectId, watch }) {
      if (closed.has(projectId) || !activations.has(projectId)) return
      const previous = get().projects[projectId]?.watch
      bump(watchEvents, projectId)
      patch(projectId, { watch })
      if (watch === 'stopped') {
        // The service closed the watcher (Project close attempt); a cancelled close leaves the Project usable.
        subscriptions.delete(projectId); clearRetry(projectId)
        void subscribeWatch(projectId, 0, true)
      } else if (watch === 'live' && previous && previous !== 'live') refresh(projectId)
    },
    forget(projectId) {
      closed.add(projectId); bump(epochs, projectId); bump(versions, projectId); bump(versions, fileKey(projectId))
      activations.delete(projectId); inflight.delete(projectId); trailing.delete(projectId); subscribing.delete(projectId)
      watchEvents.delete(projectId); clearRetry(projectId)
      const subscriptionId = subscriptions.get(projectId)
      subscriptions.delete(projectId)
      if (subscriptionId) unsubscribeQuietly(projectId, subscriptionId)
      set(s => { const projects = { ...s.projects }; delete projects[projectId]; return { projects } })
    }
  }
})
