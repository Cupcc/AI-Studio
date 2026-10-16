import {
  parseProjectPath,
  type FileReadRequest, type FileReadResult, type FileReferenceFailureReason, type FileReferenceRejection,
  type FileReferenceResolver, type FileReferenceResult, type FilesChanged, type FilesListResult,
  type FilesSubscription, type FilesWatchChanged, type ProjectPath
} from '@shared/tools/files'
import { listDirectory, type ListOutcome } from './list'
import { readTextFile, type ReadOutcome } from './read'
import { rejectAll, resolveFileReferences, type ResolveOutcome } from './references'
import { createFilesWatcher, type FilesWatcherOptions } from './watcher'

export const FILES_REQUEST_TIMEOUT_MS = 5000
/** Slow or stalled volumes cannot take every libuv thread (default pool of 4) away from the rest of the app. */
export const FILES_CONCURRENCY = 3

export interface FilesServiceOptions {
  projectRoot(projectId: string): string | null
  /** False while the Project (or the app) is closing: reads answer `project_closing`. */
  canOperate?(projectId: string): boolean
  changed(event: FilesChanged): void
  watchChanged(event: FilesWatchChanged): void
  watch?: FilesWatcherOptions['watch']
  watchOwner?: FilesWatcherOptions['watchOwner']
  newId?: FilesWatcherOptions['newId']
  /** Locale of the name ordering; undefined uses the runtime default. */
  locale?: string
  timeoutMs?: number
  concurrency?: number
  /** Test seams, see list.ts / read.ts. */
  hooks?: {
    afterListOpen?: (absolute: string) => Promise<void>
    afterOpen?: (absolute: string) => Promise<void>
    afterRead?: (absolute: string) => Promise<void>
  }
}

export interface FilesService extends FileReferenceResolver {
  list(projectId: string, path: ProjectPath): Promise<FilesListResult>
  read(request: FileReadRequest): Promise<FileReadResult>
  /** The renderer-facing form of `resolve`: no absolute paths. */
  resolveReference(projectId: string, paths: readonly ProjectPath[]): Promise<FileReferenceResult>
  subscribe(projectId: string, owner: number): FilesSubscription
  unsubscribe(projectId: string, subscriptionId: string, owner: number): void
  detachOwner(owner: number): void
  /** Idempotent. Stops the Project's watcher and broadcasts `stopped`; later calls may subscribe again. */
  closeProject(projectId: string): Promise<void>
  closeAll(): Promise<void>
  dispose(): Promise<void>
}

function createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0
  const waiting: (() => void)[] = []
  return async (task) => {
    // A finished task hands its slot straight to the next waiter, so the limit is never exceeded.
    if (active < max) active++
    else await new Promise<void>((resolve) => waiting.push(resolve))
    try { return await task() } finally {
      const next = waiting.shift()
      if (next) next()
      else active--
    }
  }
}

export function createFilesService(options: FilesServiceOptions): FilesService {
  let revision = 0
  let disposed = false
  let allEpoch = 0
  const epochs = new Map<string, number>()
  const timeoutMs = options.timeoutMs ?? FILES_REQUEST_TIMEOUT_MS
  const limited = createLimiter(options.concurrency ?? FILES_CONCURRENCY)
  const nextRevision = () => ++revision
  const watcher = createFilesWatcher({
    projectRoot: options.projectRoot,
    nextRevision,
    changed: options.changed,
    watchChanged: options.watchChanged,
    ...(options.canOperate ? { canOperate: options.canOperate } : {}),
    ...(options.watch ? { watch: options.watch } : {}),
    ...(options.watchOwner ? { watchOwner: options.watchOwner } : {}),
    ...(options.newId ? { newId: options.newId } : {})
  })
  const stampOf = (projectId: string) => `${allEpoch}:${epochs.get(projectId) ?? 0}`

  function gate(projectId: string): { root: string } | { reason: 'project_unavailable' | 'project_closing' } {
    const root = options.projectRoot(projectId)
    if (!root) return { reason: 'project_unavailable' }
    if (disposed || options.canOperate?.(projectId) === false) return { reason: 'project_closing' }
    return { root }
  }

  /**
   * Runs `work` for the Project under the concurrency limit and the request deadline. The underlying fs calls cannot
   * be aborted, but a timed-out task stops at its next step and closes its descriptor. A Project closed while the
   * work was running never delivers its result.
   */
  async function guarded<T>(projectId: string, root: string, work: (root: string, stop: () => boolean) => Promise<T>, fallback: { timeout: T; closing: T; failed: T }): Promise<T> {
    const stamp = stampOf(projectId)
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<T>((resolve) => { timer = setTimeout(() => { stopped = true; resolve(fallback.timeout) }, timeoutMs) })
    const shouldStop = () => stopped || disposed || stampOf(projectId) !== stamp || options.canOperate?.(projectId) === false
    const task = limited(() => (shouldStop() ? Promise.resolve(fallback.timeout) : work(root, shouldStop))).catch(() => fallback.failed)
    try {
      const value = await Promise.race([task, deadline])
      return stampOf(projectId) === stamp && !disposed ? value : fallback.closing
    } finally { clearTimeout(timer) }
  }

  const service: FilesService = {
    async list(projectId, path) {
      const issued = nextRevision()
      const unavailable = (reason: Extract<FilesListResult, { status: 'unavailable' }>['reason']): FilesListResult => ({ status: 'unavailable', revision: issued, path, reason })
      try { parseProjectPath(path) } catch { return unavailable('invalid_path') }
      const opened = gate(projectId)
      if ('reason' in opened) return unavailable(opened.reason)
      const outcome = await guarded<ListOutcome>(projectId, opened.root,
        (root, stop) => listDirectory(root, path, { shouldStop: stop, ...(options.locale ? { locale: options.locale } : {}), ...(options.hooks?.afterListOpen ? { afterOpen: options.hooks.afterListOpen } : {}) }),
        { timeout: { ok: false, reason: 'timeout' }, closing: { ok: false, reason: 'project_closing' }, failed: { ok: false, reason: 'unreadable' } })
      return outcome.ok ? { status: 'ok', revision: issued, path, entries: outcome.entries, truncated: outcome.truncated, ...(outcome.omittedPaths ? { omittedPaths: true } : {}) } : unavailable(outcome.reason)
    },
    async read(request) {
      const issued = nextRevision()
      const { path } = request
      const unavailable = (reason: Extract<FileReadResult, { status: 'unavailable' }>['reason']): FileReadResult => ({ status: 'unavailable', revision: issued, path, reason })
      try { parseProjectPath(path) } catch { return unavailable('invalid_path') }
      const opened = gate(request.projectId)
      if ('reason' in opened) return unavailable(opened.reason)
      const outcome = await guarded<ReadOutcome>(request.projectId, opened.root,
        (root, stop) => readTextFile(root, path, request.ifVersion, {
          shouldStop: stop,
          ...(options.hooks?.afterOpen ? { afterOpen: options.hooks.afterOpen } : {}),
          ...(options.hooks?.afterRead ? { afterRead: options.hooks.afterRead } : {})
        }),
        { timeout: { status: 'unavailable', reason: 'timeout' }, closing: { status: 'unavailable', reason: 'project_closing' }, failed: { status: 'unavailable', reason: 'unreadable' } })
      return { ...outcome, revision: issued, path }
    },
    async resolve(projectId, paths): Promise<ResolveOutcome> {
      if (paths.length === 0) return { status: 'ok', files: [] }
      const opened = gate(projectId)
      if ('reason' in opened) return rejectAll(paths, opened.reason)
      const rejection = (reason: FileReferenceFailureReason): FileReferenceRejection => rejectAll(paths, reason)
      return guarded<ResolveOutcome>(projectId, opened.root, (root, stop) => resolveFileReferences(root, paths, stop),
        { timeout: rejection('timeout'), closing: rejection('project_closing'), failed: rejection('unreadable') })
    },
    async resolveReference(projectId, paths) {
      const result = await service.resolve(projectId, paths)
      if (result.status === 'rejected') return result
      // The absolute path stays in the main process.
      return { status: 'ok', files: result.files.map(({ path, name, size, version }) => ({ path, name, size, version })) }
    },
    subscribe: (projectId, owner) => watcher.subscribe(projectId, owner),
    unsubscribe: (projectId, subscriptionId, owner) => watcher.unsubscribe(projectId, subscriptionId, owner),
    detachOwner: (owner) => watcher.detachOwner(owner),
    async closeProject(projectId) {
      epochs.set(projectId, (epochs.get(projectId) ?? 0) + 1)
      watcher.closeProject(projectId)
    },
    async closeAll() {
      allEpoch++
      watcher.closeAll()
    },
    async dispose() {
      disposed = true
      watcher.dispose()
    }
  }
  return service
}
