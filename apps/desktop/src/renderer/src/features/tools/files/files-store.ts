import { create } from 'zustand'
import { joinProjectPath, projectPathParent } from '@shared/tools/files'
import type {
  FileEncoding, FileEntry, FileEntryKind, FileReadResult, FileUnavailableReason, FilesChanged, FilesListResult, FilesWatchChanged,
  FilesSubscription, FilesWatchState, ProjectPath
} from '@shared/tools/files'
import { filesApi } from './api'

export interface DirListing {
  entries: FileEntry[]
  truncated: boolean
  omittedPaths?: boolean
  /** Set when the listing failed. The entries are then empty: a failed read never shows the previous ones. */
  reason: FileUnavailableReason | null
  loading: boolean
  /** A change may have happened after the last request started. Re-listed as soon as the directory is shown. */
  dirty: boolean
}

export type FileViewer =
  | { path: ProjectPath; phase: 'loading' }
  | { path: ProjectPath; phase: 'ready'; text: string; version: string; size: number; encoding: FileEncoding; bom: boolean; lineEnding: 'lf' | 'crlf' | 'mixed' | 'none' }
  | { path: ProjectPath; phase: 'unavailable'; reason: FileUnavailableReason; size?: number }

/** An open file in the viewer's tab row. An unpinned tab is VS Code's preview tab: the next single-click replaces it. */
export interface FileTab { path: ProjectPath; pinned: boolean }
/** The inline name input in the tree: a new entry under `parent`, or renaming `path`. */
export type FilesEdit = { mode: 'create'; parent: ProjectPath; kind: 'file' | 'directory' } | { mode: 'rename'; path: ProjectPath }

export interface ProjectFiles {
  /** The loaded set: the Project root and every directory expanded at least once. */
  dirs: ReadonlyMap<ProjectPath, DirListing>
  expanded: ReadonlySet<ProjectPath>
  /** The file shown in the viewer. Null after a close or after the file disappeared (the viewer then keeps the notice). */
  selected: ProjectPath | null
  viewer: FileViewer | null
  /** null: not subscribed (hidden, or the subscription is being set up). */
  watch: FilesWatchState | null
  /** Share of the body height taken by the tree while a file is open. */
  split: number
  /** Tree selection (⌘-click / ⇧-click multi-selection), independent of the file in the viewer. */
  marked: ProjectPath[]
  /** Where a ⇧-click range starts. */
  anchor: ProjectPath | null
  tabs: FileTab[]
  edit: FilesEdit | null
  /** Line to show in the viewer (Quick Open, Search, Terminal links); `nonce` repeats a request for the same line. */
  reveal: { path: ProjectPath; line: number; nonce: number } | null
}

interface FilesStore {
  projects: Record<string, ProjectFiles>
  /** The panel is visible: load the root, subscribe and revalidate what was loaded before. */
  activate(projectId: string): Promise<void>
  /** The panel is hidden or unmounted: unsubscribe. The state stays in memory. */
  deactivate(projectId: string): void
  toggle(projectId: string, path: ProjectPath): Promise<void>
  /** Opens a file in the viewer. Never touches the conversation. `pin` keeps the tab (double-click); otherwise it is the preview tab. */
  select(projectId: string, path: ProjectPath, options?: { pin?: boolean }): Promise<void>
  /** Closes the viewer's current tab; the neighbour becomes current. */
  closeViewer(projectId: string): void
  closeTab(projectId: string, path: ProjectPath): void
  pinTab(projectId: string, path: ProjectPath): void
  /** Selects in the tree: one row, ⌘ toggle, or ⇧ range over the visible `order`. */
  mark(projectId: string, path: ProjectPath, mode: 'replace' | 'toggle' | 'range', order: readonly ProjectPath[]): void
  collapseAll(projectId: string): void
  /** Expands the ancestors, selects the row and opens the file (optionally at a line), like VS Code's reveal. */
  open(projectId: string, path: ProjectPath, options?: { line?: number; pin?: boolean }): Promise<void>
  startEdit(projectId: string, edit: FilesEdit): void
  cancelEdit(projectId: string): void
  /** Re-lists these directories now (after a file operation), whatever the watcher reports. */
  relist(projectId: string, dirs: readonly ProjectPath[]): Promise<void>
  /** A rename / move: open tabs and the selection follow the entry to its new path. */
  moved(projectId: string, from: ProjectPath, to: ProjectPath): void
  refresh(projectId: string): Promise<void>
  setSplit(projectId: string, split: number): void
  changed(event: FilesChanged): void
  watchChanged(event: FilesWatchChanged): void
  forget(projectId: string): void
}

export const SPLIT_MIN = 0.2
export const SPLIT_MAX = 0.8
const RESUBSCRIBE_BASE_MS = 500
const RESUBSCRIBE_MAX_MS = 10_000

const emptyDir = (): DirListing => ({ entries: [], truncated: false, reason: null, loading: false, dirty: false })
const emptyProject = (): ProjectFiles => ({ dirs: new Map(), expanded: new Set(), selected: null, viewer: null, watch: null, split: 0.45, marked: [], anchor: null, tabs: [], edit: null, reveal: null })
const MAX_TABS = 20
let revealNonce = 0
/** Moves a path (or anything under it) from one place to another. */
const relocate = (path: ProjectPath, from: ProjectPath, to: ProjectPath): ProjectPath | null => path === from ? to : path.startsWith(`${from}/`) ? to + path.slice(from.length) : null

// Module-level bookkeeping, like terminal-store.ts: it must outlive the panel and reset on `forget`.
const epochs = new Map<string, number>()
const closed = new Set<string>()
/** Projects whose panel is visible. Only these may issue IPC or hold a subscription. */
const active = new Set<string>()
/** Highest applied revision per Project and key (`l:<dir>`, `r:<file>`). Survives pruning, so a late old response is still dropped. */
const applied = new Map<string, Map<string, number>>()
/** Newest request per Project and key: only it clears the loading flag. */
const tokens = new Map<string, Map<string, number>>()
const subscriptions = new Map<string, string>()
const subscribing = new Map<string, number>()
/** Revision of the live subscription. A result at or below it may predate the first event and must be revalidated. */
const subscribedAt = new Map<string, number>()
const revalidated = new Map<string, Map<string, 1>>()
const watchRevisions = new Map<string, number>()
const retries = new Map<string, { attempt: number; timer?: ReturnType<typeof setTimeout> }>()
let subscribeSeq = 0

const currentEpoch = (projectId: string) => epochs.get(projectId) ?? 0
const isCurrent = (projectId: string, epoch: number) => !closed.has(projectId) && currentEpoch(projectId) === epoch
const perProject = <T,>(map: Map<string, Map<string, T>>, projectId: string) => {
  let inner = map.get(projectId)
  if (!inner) map.set(projectId, inner = new Map())
  return inner
}
const nextToken = (projectId: string, key: string) => {
  const inner = perProject(tokens, projectId), token = (inner.get(key) ?? 0) + 1
  inner.set(key, token)
  return token
}
const isLatest = (projectId: string, key: string, token: number) => perProject(tokens, projectId).get(key) === token
/** True when `revision` is not older than the last applied result for the key; records it. */
const acceptRevision = (projectId: string, key: string, revision: number) => {
  const inner = perProject(applied, projectId)
  if (revision < (inner.get(key) ?? -Infinity)) return false
  inner.set(key, revision)
  return true
}
/**
 * True when a result predates the live subscription and must be read again. Answered once per key and subscription, so a
 * service whose revisions do not order against the subscription's can cost one extra read, never a loop.
 */
const predatesSubscription = (projectId: string, key: string, revision: number) => {
  const at = subscribedAt.get(projectId)
  if (at === undefined || revision > at) return false
  const seen = perProject(revalidated, projectId)
  if (seen.has(key)) return false
  seen.set(key, 1)
  return true
}
/** Null when the name cannot form a valid path (the contract guarantees valid names; this keeps a bad one from throwing). */
export const childPath = (parent: ProjectPath, name: string): ProjectPath | null => {
  try { return joinProjectPath(parent, name) } catch { return null }
}
const within = (path: ProjectPath, dir: ProjectPath) => dir === '' ? path !== '' : path === dir || path.startsWith(`${dir}/`)

/** A directory is shown when it and every ancestor is expanded and every parent listing succeeded. The root is always shown. */
function shown(project: ProjectFiles, path: ProjectPath): boolean {
  for (let dir = path; dir !== ''; dir = projectPathParent(dir)) {
    const parent = project.dirs.get(projectPathParent(dir))
    if (!project.expanded.has(dir) || !parent || parent.reason) return false
  }
  return true
}
export function entryOf(project: ProjectFiles, path: ProjectPath): FileEntry | undefined {
  const parent = projectPathParent(path), name = path.slice(parent === '' ? 0 : parent.length + 1)
  return project.dirs.get(parent)?.entries.find(entry => entry.name === name)
}
const localReason = (kind: FileEntryKind): FileUnavailableReason | null => kind === 'symlink' ? 'symlink_refused' : kind === 'other' ? 'not_file' : null

/** Drops the loaded data below `root` (and `root` itself when `dropRoot`), and optionally its expansion flags. */
function pruneBelow(dirs: Map<ProjectPath, DirListing>, expanded: Set<ProjectPath>, root: ProjectPath, { dropRoot, forgetExpansion }: { dropRoot: boolean; forgetExpansion: boolean }) {
  for (const path of [...dirs.keys()]) if (within(path, root) && (dropRoot || path !== root)) dirs.delete(path)
  if (forgetExpansion) for (const path of [...expanded]) if (within(path, root) && (dropRoot || path !== root)) expanded.delete(path)
}

/** Adds the tab, or replaces the preview tab (VS Code: a single-click opens in the reused preview tab). */
function withTab(tabs: FileTab[], path: ProjectPath, pin: boolean): FileTab[] {
  const existing = tabs.find(tab => tab.path === path)
  if (existing) return pin && !existing.pinned ? tabs.map(tab => tab.path === path ? { ...tab, pinned: true } : tab) : tabs
  const preview = tabs.findIndex(tab => !tab.pinned)
  const next = preview >= 0 ? tabs.map((tab, index) => index === preview ? { path, pinned: pin } : tab) : [...tabs, { path, pinned: pin }]
  // The oldest pinned tabs go first when there are too many.
  return next.length > MAX_TABS ? next.slice(next.length - MAX_TABS) : next
}

export const useFiles = create<FilesStore>((set, get) => {
  const project = (projectId: string) => get().projects[projectId]
  const patchProject = (projectId: string, update: Partial<ProjectFiles> | ((current: ProjectFiles) => Partial<ProjectFiles>)) => set(state => {
    const current = state.projects[projectId]
    // Never re-creates a forgotten Project: late results simply vanish.
    if (!current) return state
    return { projects: { ...state.projects, [projectId]: { ...current, ...(typeof update === 'function' ? update(current) : update) } } }
  })
  const patchDir = (projectId: string, path: ProjectPath, update: Partial<DirListing>) => patchProject(projectId, current => {
    const dirs = new Map(current.dirs)
    dirs.set(path, { ...(dirs.get(path) ?? emptyDir()), ...update })
    return { dirs }
  })
  const markDirty = (projectId: string, include: (path: ProjectPath, dir: DirListing) => boolean) => patchProject(projectId, current => {
    let changed = false
    const dirs = new Map(current.dirs)
    for (const [path, dir] of current.dirs) if (!dir.dirty && include(path, dir)) { dirs.set(path, { ...dir, dirty: true }); changed = true }
    return changed ? { dirs } : {}
  })

  // ---- directories -------------------------------------------------------------------------------------------

  async function listDir(projectId: string, path: ProjectPath, force = false): Promise<void> {
    const current = project(projectId)
    if (!current || closed.has(projectId) || !active.has(projectId)) return
    // One request per directory at a time; a manual refresh may start another and the revision decides which one wins.
    if (current.dirs.get(path)?.loading && !force) return
    const epoch = currentEpoch(projectId), key = `l:${path}`, token = nextToken(projectId, key)
    patchDir(projectId, path, { loading: true, dirty: false })
    let result: FilesListResult | null = null
    try { result = await filesApi().list({ projectId, path }) } catch { /* shown as an unreadable directory */ }
    if (!isCurrent(projectId, epoch)) return
    applyList(projectId, path, result, key, token)
  }

  function applyList(projectId: string, path: ProjectPath, result: FilesListResult | null, key: string, token: number) {
    const current = project(projectId)
    if (!current?.dirs.has(path)) return
    const latest = isLatest(projectId, key, token)
    if (result && !acceptRevision(projectId, key, result.revision)) {
      if (latest) patchDir(projectId, path, { loading: false })
      return
    }
    // A failed request without a newer one on its way replaces the entries: never show the old listing as current.
    if (!result && !latest) return
    const reason: FileUnavailableReason | null = !result ? 'unreadable' : result.status === 'unavailable' ? result.reason : null
    const entries = result?.status === 'ok' ? result.entries : []
    patchProject(projectId, state => {
      const dirs = new Map(state.dirs), expanded = new Set(state.expanded)
      const previous = dirs.get(path) ?? emptyDir()
      if (reason === null) {
        // Children that disappeared (or stopped being directories) take their loaded data and expansion with them.
        const kept = new Set(entries.filter(entry => entry.kind === 'directory').map(entry => entry.name))
        for (const old of previous.entries) {
          if (old.kind !== 'directory' || kept.has(old.name)) continue
          const gone = childPath(path, old.name)
          if (gone !== null) pruneBelow(dirs, expanded, gone, { dropRoot: true, forgetExpansion: true })
        }
      } else {
        // Nothing below an unreadable directory can be shown. Expansion is forgotten only when the directory is gone.
        pruneBelow(dirs, expanded, path, { dropRoot: false, forgetExpansion: reason === 'missing' || reason === 'not_directory' })
      }
      dirs.set(path, {
        entries, truncated: result?.status === 'ok' ? result.truncated : false, reason,
        ...(result?.status === 'ok' && result.omittedPaths ? { omittedPaths: true } : {}),
        loading: latest ? false : previous.loading,
        dirty: previous.dirty || (result !== null && predatesSubscription(projectId, key, result.revision))
      })
      return { dirs, expanded }
    })
    reconcileSelection(projectId, path, reason, entries)
    void settle(projectId)
  }

  /** A listing that no longer contains the selected file (or its ancestor) means the file is gone. */
  function reconcileSelection(projectId: string, dirPath: ProjectPath, reason: FileUnavailableReason | null, entries: FileEntry[]) {
    const selected = project(projectId)?.selected
    if (!selected || !within(selected, dirPath)) return
    if (reason !== null) {
      if (reason === 'missing' || reason === 'not_directory') markDeleted(projectId, selected)
      return
    }
    const rest = selected.slice(dirPath === '' ? 0 : dirPath.length + 1), [first = ''] = rest.split('/'), deeper = rest !== first
    const entry = entries.find(item => item.name === first)
    if (!entry || (deeper && entry.kind !== 'directory')) { markDeleted(projectId, selected); return }
    const refused = deeper ? null : localReason(entry.kind)
    if (refused) patchProject(projectId, { viewer: { path: selected, phase: 'unavailable', reason: refused } })
    else if (!deeper && entry.kind === 'directory') patchProject(projectId, { selected: null, viewer: { path: selected, phase: 'unavailable', reason: 'not_file' } })
  }

  /** Loads what is shown but missing, and re-lists shown directories that changed. Never runs while hidden. */
  function settle(projectId: string): Promise<void> {
    const current = project(projectId)
    if (!current || closed.has(projectId) || !active.has(projectId)) return Promise.resolve()
    const jobs: Promise<void>[] = []
    if (!current.dirs.has('')) jobs.push(listDir(projectId, ''))
    for (const path of current.expanded) if (!current.dirs.has(path) && shown(current, path)) jobs.push(listDir(projectId, path))
    for (const [path, dir] of current.dirs) if (dir.dirty && !dir.loading && shown(current, path)) jobs.push(listDir(projectId, path))
    return Promise.all(jobs).then(() => undefined)
  }

  // ---- the open file -----------------------------------------------------------------------------------------

  async function readFile(projectId: string, path: ProjectPath, fresh = false): Promise<void> {
    const current = project(projectId)
    if (!current || closed.has(projectId) || !active.has(projectId) || current.selected !== path) return
    const viewer = current.viewer
    // Only an intact copy may be revalidated; after a failure the next read starts from scratch.
    const ifVersion = !fresh && viewer?.path === path && viewer.phase === 'ready' ? viewer.version : undefined
    const epoch = currentEpoch(projectId), key = `r:${path}`, token = nextToken(projectId, key)
    let result: FileReadResult | null = null
    try { result = await filesApi().read(ifVersion === undefined ? { projectId, path } : { projectId, path, ifVersion }) } catch { /* shown as unreadable */ }
    if (!isCurrent(projectId, epoch)) return
    applyRead(projectId, path, result, key, token)
  }

  function applyRead(projectId: string, path: ProjectPath, result: FileReadResult | null, key: string, token: number) {
    const current = project(projectId)
    // The user moved on, closed the viewer, or the file was found deleted: the result no longer has a place.
    if (!current || current.selected !== path || current.viewer?.path !== path) return
    if (result && !acceptRevision(projectId, key, result.revision)) return
    if (!result) {
      if (isLatest(projectId, key, token)) patchProject(projectId, { viewer: { path, phase: 'unavailable', reason: 'unreadable' } })
      return
    }
    if (result.status === 'ok') {
      patchProject(projectId, { viewer: { path, phase: 'ready', text: result.text, version: result.version, size: result.size, encoding: result.encoding, bom: result.bom, lineEnding: result.lineEnding } })
    } else if (result.status === 'unchanged') {
      const viewer = current.viewer
      // Unchanged only makes sense for the copy we asked about; anything else is read again in full.
      if (!(viewer.phase === 'ready' && viewer.version === result.version)) { void readFile(projectId, path, true); return }
    } else if (result.reason === 'missing') {
      markDeleted(projectId, path)
    } else {
      patchProject(projectId, { viewer: { path, phase: 'unavailable', reason: result.reason, ...(result.size === undefined ? {} : { size: result.size }) } })
    }
    if (result.status !== 'unavailable' && predatesSubscription(projectId, key, result.revision)) void readFile(projectId, path)
  }

  /** The tree selection goes away, the viewer keeps a notice until another file is selected or the viewer is closed. */
  function markDeleted(projectId: string, path: ProjectPath) {
    patchProject(projectId, current => current.selected === path ? { selected: null, viewer: { path, phase: 'unavailable', reason: 'missing' } } : {})
  }

  function revalidateViewer(projectId: string, force = false) {
    const current = project(projectId)
    const viewer = current?.viewer
    if (!current || !viewer || current.selected !== viewer.path) return
    // Symlinks and special files are never read; a read in flight will report for itself.
    if (localReason(entryOf(current, viewer.path)?.kind ?? 'file')) return
    if (viewer.phase === 'loading' && !force) return
    void readFile(projectId, viewer.path, viewer.phase !== 'ready')
  }

  function revalidateAll(projectId: string) {
    markDirty(projectId, () => true)
    void settle(projectId)
    revalidateViewer(projectId)
  }

  // ---- subscription ------------------------------------------------------------------------------------------

  function dropSubscription(projectId: string): string | undefined {
    const subscriptionId = subscriptions.get(projectId)
    subscriptions.delete(projectId); subscribedAt.delete(projectId); watchRevisions.delete(projectId); revalidated.delete(projectId)
    return subscriptionId
  }
  function clearRetry(projectId: string) {
    const retry = retries.get(projectId)
    if (retry?.timer) clearTimeout(retry.timer)
    retries.delete(projectId)
  }
  const release = (projectId: string, subscriptionId: string | undefined) => {
    if (!subscriptionId) return
    try { void Promise.resolve(filesApi().unsubscribe({ projectId, subscriptionId })).catch(() => {}) } catch { /* the service drops it with the Project */ }
  }

  function scheduleResubscribe(projectId: string) {
    if (!active.has(projectId) || closed.has(projectId)) return
    const retry = retries.get(projectId) ?? { attempt: 0 }
    if (retry.timer) clearTimeout(retry.timer)
    const delay = Math.min(RESUBSCRIBE_BASE_MS * 2 ** retry.attempt, RESUBSCRIBE_MAX_MS)
    retry.attempt++
    retry.timer = setTimeout(() => { retry.timer = undefined; void subscribeProject(projectId) }, delay)
    retries.set(projectId, retry)
  }

  async function subscribeProject(projectId: string): Promise<void> {
    if (!active.has(projectId) || closed.has(projectId) || subscriptions.has(projectId) || subscribing.has(projectId)) return
    const epoch = currentEpoch(projectId), token = ++subscribeSeq
    subscribing.set(projectId, token)
    let subscription: FilesSubscription
    try {
      subscription = await filesApi().subscribe({ projectId })
    } catch {
      if (subscribing.get(projectId) !== token) return
      subscribing.delete(projectId)
      if (!isCurrent(projectId, epoch) || !active.has(projectId)) return
      // No events will come: say so, read everything again once, and keep trying in the background.
      patchProject(projectId, { watch: 'degraded' })
      revalidateAll(projectId)
      scheduleResubscribe(projectId)
      return
    }
    if (!isCurrent(projectId, epoch) || !active.has(projectId) || subscribing.get(projectId) !== token) { release(projectId, subscription.subscriptionId); return }
    subscribing.delete(projectId)
    watchRevisions.set(projectId, subscription.revision)
    patchProject(projectId, { watch: subscription.watch })
    if (subscription.watch === 'stopped') { scheduleResubscribe(projectId); return }
    subscriptions.set(projectId, subscription.subscriptionId)
    subscribedAt.set(projectId, subscription.revision)
    revalidated.delete(projectId)
    retries.delete(projectId)
    // Events only describe what happens from now on: whatever was read before the subscription may already be stale.
    markDirty(projectId, (path, dir) => !dir.loading && (applied.get(projectId)?.get(`l:${path}`) ?? -Infinity) <= subscription.revision)
    void settle(projectId)
    const viewer = project(projectId)?.viewer
    if (viewer && viewer.phase !== 'loading' && (applied.get(projectId)?.get(`r:${viewer.path}`) ?? -Infinity) <= subscription.revision) revalidateViewer(projectId)
  }

  return {
    projects: {},

    async activate(projectId) {
      closed.delete(projectId)
      active.add(projectId)
      if (!project(projectId)) set(state => ({ projects: { ...state.projects, [projectId]: emptyProject() } }))
      // A file opened while the panel was hidden (Quick Open, Search, a Terminal link) is read now.
      const pending = project(projectId)?.viewer
      const read = pending?.phase === 'loading' && project(projectId)?.selected === pending.path ? readFile(projectId, pending.path) : Promise.resolve()
      await Promise.all([subscribeProject(projectId), settle(projectId), read])
    },

    deactivate(projectId) {
      active.delete(projectId)
      clearRetry(projectId)
      subscribing.delete(projectId)
      release(projectId, dropSubscription(projectId))
      patchProject(projectId, { watch: null })
    },

    async toggle(projectId, path) {
      const current = project(projectId)
      if (!current) return
      const expanded = new Set(current.expanded)
      if (expanded.delete(path)) { patchProject(projectId, { expanded }); return }
      expanded.add(path)
      patchProject(projectId, { expanded })
      await settle(projectId)
    },

    async select(projectId, path, options = {}) {
      const current = project(projectId)
      if (!current) return
      const kind = entryOf(current, path)?.kind ?? 'file'
      if (kind === 'directory') return get().toggle(projectId, path)
      const tabs = withTab(current.tabs, path, options.pin ?? false)
      const refused = localReason(kind)
      if (refused) { patchProject(projectId, { selected: path, tabs, viewer: { path, phase: 'unavailable', reason: refused } }); return }
      const same = current.viewer?.path === path
      // Selecting the open file again keeps what is shown and revalidates it; a failed or deleted state starts over.
      patchProject(projectId, { selected: path, tabs, viewer: same && current.viewer?.phase === 'ready' ? current.viewer : { path, phase: 'loading' } })
      await readFile(projectId, path)
    },

    closeViewer(projectId) {
      const current = project(projectId)
      if (!current) return
      const path = current.viewer?.path ?? current.selected
      if (path !== null && current.tabs.some(tab => tab.path === path)) get().closeTab(projectId, path)
      else patchProject(projectId, { selected: null, viewer: null })
    },

    closeTab(projectId, path) {
      const current = project(projectId)
      if (!current) return
      const index = current.tabs.findIndex(tab => tab.path === path)
      const tabs = current.tabs.filter(tab => tab.path !== path)
      if (current.viewer?.path !== path) { patchProject(projectId, { tabs }); return }
      const next = tabs[Math.min(Math.max(index, 0), tabs.length - 1)]
      patchProject(projectId, { tabs, selected: null, viewer: null })
      if (next) void get().select(projectId, next.path, { pin: next.pinned })
    },

    pinTab(projectId, path) {
      patchProject(projectId, current => ({ tabs: current.tabs.map(tab => tab.path === path ? { ...tab, pinned: true } : tab) }))
    },

    mark(projectId, path, mode, order) {
      patchProject(projectId, current => {
        if (mode === 'toggle') {
          const marked = current.marked.includes(path) ? current.marked.filter(item => item !== path) : [...current.marked, path]
          return { marked, anchor: path }
        }
        if (mode === 'range' && current.anchor !== null) {
          const from = order.indexOf(current.anchor), to = order.indexOf(path)
          if (from >= 0 && to >= 0) return { marked: order.slice(Math.min(from, to), Math.max(from, to) + 1) }
        }
        return { marked: [path], anchor: path }
      })
    },

    collapseAll(projectId) {
      patchProject(projectId, { expanded: new Set() })
    },

    async open(projectId, path, options = {}) {
      if (!project(projectId)) set(state => ({ projects: { ...state.projects, [projectId]: emptyProject() } }))
      const expanded = new Set(project(projectId)!.expanded)
      for (let dir = projectPathParent(path); dir !== ''; dir = projectPathParent(dir)) expanded.add(dir)
      patchProject(projectId, { expanded, marked: [path], anchor: path, ...(options.line ? { reveal: { path, line: options.line, nonce: ++revealNonce } } : {}) })
      void settle(projectId)
      await get().select(projectId, path, { pin: options.pin ?? false })
    },

    startEdit(projectId, edit) {
      const current = project(projectId)
      if (!current) return
      if (edit.mode === 'create' && edit.parent !== '' && !current.expanded.has(edit.parent)) {
        const expanded = new Set(current.expanded); expanded.add(edit.parent)
        patchProject(projectId, { expanded, edit })
        void settle(projectId)
        return
      }
      patchProject(projectId, { edit })
    },

    cancelEdit(projectId) {
      patchProject(projectId, { edit: null })
    },

    async relist(projectId, dirs) {
      const current = project(projectId)
      if (!current || !active.has(projectId)) return
      await Promise.all([...new Set(dirs)].filter(dir => dir === '' || current.dirs.has(dir)).map(dir => listDir(projectId, dir, true)))
    },

    moved(projectId, from, to) {
      patchProject(projectId, current => {
        const tabs = current.tabs.map(tab => ({ ...tab, path: relocate(tab.path, from, to) ?? tab.path }))
        const marked = current.marked.map(path => relocate(path, from, to) ?? path)
        const expanded = new Set([...current.expanded].map(path => relocate(path, from, to) ?? path))
        const selected = current.selected === null ? null : relocate(current.selected, from, to) ?? current.selected
        // The viewer re-reads the file under its new path; the old text stays until the read answers.
        const viewer = current.viewer && relocate(current.viewer.path, from, to) !== null ? { ...current.viewer, path: relocate(current.viewer.path, from, to)! } : current.viewer
        return { tabs, marked, expanded, selected, viewer }
      })
      const after = project(projectId)
      if (after?.selected && after.viewer?.path === after.selected) void readFile(projectId, after.selected, true)
    },

    async refresh(projectId) {
      const current = project(projectId)
      if (!current || !active.has(projectId)) return
      markDirty(projectId, () => true)
      // Manual refresh is explicit: it re-lists even a directory whose request is in flight (the revision picks the winner).
      const jobs = [...current.dirs.keys()].filter(path => shown(current, path)).map(path => listDir(projectId, path, true))
      revalidateViewer(projectId, true)
      if (!subscriptions.has(projectId) && !subscribing.has(projectId)) { clearRetry(projectId); jobs.push(subscribeProject(projectId)) }
      await Promise.all(jobs)
    },

    setSplit(projectId, split) {
      patchProject(projectId, { split: Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, split)) })
    },

    changed(event) {
      const { projectId } = event, current = project(projectId)
      if (!current || closed.has(projectId) || !active.has(projectId)) return
      const dirs = new Set(event.dirs)
      markDirty(projectId, path => event.overflow || dirs.has(path))
      void settle(projectId)
      // The open file is revalidated when its directory changed (or everything may have).
      const viewer = current.viewer
      if (viewer && current.selected === viewer.path && (event.overflow || dirs.has(projectPathParent(viewer.path)))) revalidateViewer(projectId)
    },

    watchChanged(event) {
      const { projectId } = event, current = project(projectId)
      if (!current || closed.has(projectId) || !active.has(projectId)) return
      if (event.revision < (watchRevisions.get(projectId) ?? -Infinity)) return
      watchRevisions.set(projectId, event.revision)
      patchProject(projectId, { watch: event.watch })
      if (event.watch === 'stopped') {
        // The service dropped the subscription (Project closing). Subscribe again; the retry stops when the Project is forgotten.
        subscriptions.delete(projectId); subscribedAt.delete(projectId); revalidated.delete(projectId)
        scheduleResubscribe(projectId)
      } else if (event.watch === 'live' && (current.watch === 'degraded' || current.watch === 'stopped')) {
        // Events may have been lost while the watcher was degraded.
        revalidateAll(projectId)
      }
    },

    forget(projectId) {
      closed.add(projectId); active.delete(projectId); epochs.set(projectId, currentEpoch(projectId) + 1)
      clearRetry(projectId); subscribing.delete(projectId)
      release(projectId, dropSubscription(projectId))
      applied.delete(projectId); tokens.delete(projectId)
      set(state => { const projects = { ...state.projects }; delete projects[projectId]; return { projects } })
    }
  }
})
