// The Diff's own recursive watcher (independent of the Files watcher). It reports whether a file system event can
// change the project Diff and leaves timing to the service, which knows whether a query is running. Attached only
// while a panel is subscribed.
import { watch as nodeWatch, type FSWatcher, type WatchEventType } from 'node:fs'
import { FILES_WATCH_IGNORED } from '@shared/tools/files'

export type WatchEventKind = 'worktree' | 'git'
export type WatchFn = (root: string, options: { recursive: true; persistent: false }, listener: (event: WatchEventType, filename: string | null) => void) => Pick<FSWatcher, 'close' | 'on'>

/** Files directly in `.git` whose change can move HEAD, the index or a ref. Everything else (objects, logs, lfs, locks, hooks) is noise. */
const GIT_FILES = new Set(['index', 'HEAD', 'packed-refs', 'MERGE_HEAD', 'ORIG_HEAD'])

/**
 * Decides what an event at `filename` (relative to the Project root) means.
 *  - null: ignored. Nested `.git` content, `node_modules/*` content and `.git` internals other than the ref / index files.
 *  - 'git': `.git/index`, `HEAD`, `refs/**`, `packed-refs`, `MERGE_HEAD`, `ORIG_HEAD`, or `.git` itself appearing / vanishing.
 *  - 'worktree': anything else, including an unknown file name (the platform did not say what changed).
 */
export function classifyWatchPath(filename: string | null): WatchEventKind | null {
  if (!filename) return 'worktree'
  const segments = filename.split('/').filter(Boolean)
  const [ignoredAnywhere] = FILES_WATCH_IGNORED.anywhere
  if (segments[0] === ignoredAnywhere) {
    if (segments.length === 1) return 'git'
    const second = segments[1]!
    if (segments.length === 2 && GIT_FILES.has(second)) return 'git'
    return second === 'refs' ? 'git' : null
  }
  if (segments.some((segment) => (FILES_WATCH_IGNORED.anywhere as readonly string[]).includes(segment))) return null
  // `node_modules` itself is a normal entry; what is inside it is not a project change worth a Git query.
  const [belowFirstLevel] = FILES_WATCH_IGNORED.belowFirstLevel
  if (segments.slice(0, -1).includes(belowFirstLevel)) return null
  return 'worktree'
}

export interface DiffWatcher {
  close(): void
  /** 'degraded' once the platform watcher failed; manual and focus refresh still work. */
  state(): 'live' | 'degraded'
}

export interface DiffWatcherOptions {
  root: string
  watch?: WatchFn
  onEvent(kind: WatchEventKind): void
  onDegraded(): void
}

export function createDiffWatcher(options: DiffWatcherOptions): DiffWatcher {
  const watch = options.watch ?? (nodeWatch as unknown as WatchFn)
  let state: 'live' | 'degraded' = 'live'
  let handle: Pick<FSWatcher, 'close' | 'on'> | null = null
  let closed = false
  const degrade = () => {
    if (closed || state === 'degraded') return
    state = 'degraded'
    try { handle?.close() } catch { /* already closed */ }
    handle = null
    options.onDegraded()
  }
  try {
    handle = watch(options.root, { recursive: true, persistent: false }, (_event, filename) => {
      if (closed || state === 'degraded') return
      const kind = classifyWatchPath(filename === null ? null : String(filename))
      if (kind) options.onEvent(kind)
    })
    handle.on('error', degrade)
  } catch {
    state = 'degraded'
  }
  return {
    close() {
      closed = true
      try { handle?.close() } catch { /* already closed */ }
      handle = null
    },
    state: () => state
  }
}

export interface Debouncer {
  /** An event happened: (re)arm the trailing timer; the max-wait timer starts with the first event of a burst. */
  poke(): void
  cancel(): void
  pending(): boolean
}

/** Trailing debounce with a maximum wait, so a steady stream of events still produces a flush. */
export function createDebouncer(debounceMs: number, maxWaitMs: number, fire: () => void): Debouncer {
  let trailing: ReturnType<typeof setTimeout> | undefined
  let ceiling: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    clearTimeout(trailing); clearTimeout(ceiling)
    trailing = ceiling = undefined
    fire()
  }
  return {
    poke() {
      clearTimeout(trailing)
      trailing = setTimeout(flush, debounceMs)
      ceiling ??= setTimeout(flush, maxWaitMs)
    },
    cancel() {
      clearTimeout(trailing); clearTimeout(ceiling)
      trailing = ceiling = undefined
    },
    pending: () => trailing !== undefined
  }
}
