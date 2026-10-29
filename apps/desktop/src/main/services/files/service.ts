import {
  parseProjectPath, projectPathParent,
  type ExternalEditors, type FileImageResult, type FileIndexResult, type FileOpenRequest, type FileOpenResult,
  type FileOperationResult, type FileReadRequest, type FileReadResult, type FileReferenceFailureReason, type FileReferenceRejection,
  type FileReferenceResolver, type FileReferenceResult, type FilesChanged, type FilesListResult,
  type FilesSubscription, type FilesWatchChanged, type ProjectPath
} from '@shared/tools/files'
import { listDirectory, type ListOutcome } from './list'
import { readTextFile, type ReadOutcome } from './read'
import { rejectAll, resolveFileReferences, type ResolveOutcome } from './references'
import { createFilesWatcher, type FilesWatcherOptions } from './watcher'
import { listProjectFiles } from './file-index'
import { readImageFile } from './image'
import { absoluteOf, copyEntries, createEntry, moveEntries, renameEntry, trashEntries } from './operations'
import { resolveEntry } from './safe-path'

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
  /** System integrations (Electron `shell` / `app` in production). */
  system?: {
    trash(absolute: string): Promise<void>
    reveal(absolute: string): void
    /** Opens with the default application; resolves to an error message, '' on success (Electron `shell.openPath`). */
    openPath(absolute: string): Promise<string>
    openExternal(url: string): Promise<void>
    editors(): ExternalEditors
    ripgrep(): Promise<string>
  }
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
  create(projectId: string, parent: ProjectPath, name: string, kind: 'file' | 'directory'): Promise<FileOperationResult>
  rename(projectId: string, path: ProjectPath, name: string): Promise<FileOperationResult>
  move(projectId: string, paths: readonly ProjectPath[], target: ProjectPath): Promise<FileOperationResult>
  copy(projectId: string, paths: readonly ProjectPath[], target: ProjectPath): Promise<FileOperationResult>
  trash(projectId: string, paths: readonly ProjectPath[]): Promise<FileOperationResult>
  open(request: FileOpenRequest): Promise<FileOpenResult>
  editors(): ExternalEditors
  stat(projectId: string, paths: readonly ProjectPath[]): Promise<('file' | 'directory' | null)[]>
  index(projectId: string): Promise<FileIndexResult>
  readImage(projectId: string, path: ProjectPath): Promise<FileImageResult>
  /** Absolute path of a Project directory, for starting a Terminal there (main-only). */
  resolveDirectory(projectId: string, path: ProjectPath): Promise<string>
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
  const mutations = new Map<string, Promise<FileOperationResult>>()
  const indexes = new Map<string, Set<AbortController>>()
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

  function requireSystem(): NonNullable<FilesServiceOptions['system']> {
    if (!options.system) throw new Error('Files system integration unavailable')
    return options.system
  }

  /**
   * Runs a file operation for an open Project. No request deadline: a large copy may legitimately take long. The
   * affected directories are announced right away, so the tree refreshes even while the watcher is degraded.
   */
  async function operate(projectId: string, dirs: ProjectPath[], work: (root: string) => Promise<FileOperationResult>): Promise<FileOperationResult> {
    const stamp = stampOf(projectId)
    const first = dirs[0] ?? ''
    // Destination checks and the mutation must share one Project queue. Otherwise two rename / move requests can
    // both see a missing destination and the second fs.rename would replace the first one's data.
    const previous = mutations.get(projectId)
    const task = (async (): Promise<FileOperationResult> => {
      await previous?.catch(() => {})
      const opened = gate(projectId)
      if (stampOf(projectId) !== stamp || 'reason' in opened) return { status: 'failed', reason: 'reason' in opened ? opened.reason : 'project_closing', path: first, done: [] }
      const result = await work(opened.root)
      if (stampOf(projectId) === stamp && !disposed && (result.status === 'ok' || result.done.length)) options.changed({ projectId, revision: nextRevision(), dirs: [...new Set(dirs)], overflow: false })
      return result
    })()
    mutations.set(projectId, task)
    try { return await task } finally { if (mutations.get(projectId) === task) mutations.delete(projectId) }
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
    async create(projectId, parent, name, kind) {
      return operate(projectId, [parent], (root) => createEntry(root, parent, name, kind))
    },
    async rename(projectId, path, name) {
      return operate(projectId, [projectPathParent(path)], (root) => renameEntry(root, path, name))
    },
    async move(projectId, paths, target) {
      return operate(projectId, [target, ...paths.map(projectPathParent)], (root) => moveEntries(root, paths, target))
    },
    async copy(projectId, paths, target) {
      return operate(projectId, [target], (root) => copyEntries(root, paths, target))
    },
    async trash(projectId, paths) {
      const system = requireSystem()
      return operate(projectId, paths.map(projectPathParent), (root) => trashEntries(root, paths, system.trash))
    },
    async open(request) {
      const system = requireSystem()
      const opened = gate(request.projectId)
      if ('reason' in opened) return { status: 'failed', reason: opened.reason }
      const resolved = await absoluteOf(opened.root, request.path)
      if (!resolved.ok) return { status: 'failed', reason: resolved.reason }
      const absolute = resolved.value
      try {
        if (request.target === 'finder') { system.reveal(absolute); return { status: 'ok' } }
        if (request.target === 'default') {
          const error = await system.openPath(absolute)
          return error ? { status: 'failed', reason: 'failed', detail: error } : { status: 'ok' }
        }
        if (!system.editors()[request.target]) return { status: 'failed', reason: 'app_missing' }
        // vscode://file/<absolute path>[:line] (cursor:// accepts the same form). Each segment is percent-encoded.
        const line = request.line && Number.isSafeInteger(request.line) && request.line > 0 ? `:${request.line}:1` : ''
        await system.openExternal(`${request.target}://file${absolute.split('/').map(encodeURIComponent).join('/')}${line}`)
        return { status: 'ok' }
      } catch (error) { return { status: 'failed', reason: 'failed', detail: error instanceof Error ? error.message : String(error) } }
    },
    editors: () => options.system?.editors() ?? { vscode: false, cursor: false },
    async stat(projectId, paths) {
      const opened = gate(projectId)
      if ('reason' in opened) return paths.map(() => null)
      return Promise.all(paths.map(async (path) => {
        try { parseProjectPath(path) } catch { return null }
        const file = await resolveEntry(opened.root, path, 'file')
        if (file.ok) return 'file' as const
        return file.reason === 'not_file' && (await resolveEntry(opened.root, path, 'directory')).ok ? 'directory' as const : null
      }))
    },
    async index(projectId) {
      const system = requireSystem()
      const opened = gate(projectId)
      if ('reason' in opened) return { status: 'unavailable', reason: opened.reason }
      const controller = new AbortController()
      let active = indexes.get(projectId)
      if (!active) { active = new Set(); indexes.set(projectId, active) }
      active.add(controller)
      try { return await listProjectFiles(opened.root, { rg: await system.ripgrep(), signal: controller.signal }) }
      finally { active.delete(controller); if (!active.size && indexes.get(projectId) === active) indexes.delete(projectId) }
    },
    async readImage(projectId, path) {
      const opened = gate(projectId)
      if ('reason' in opened) return { status: 'unavailable', path, reason: opened.reason }
      try { parseProjectPath(path) } catch { return { status: 'unavailable', path, reason: 'invalid_path' } }
      return { ...(await readImageFile(opened.root, path)), path }
    },
    async resolveDirectory(projectId, path) {
      const opened = gate(projectId)
      if ('reason' in opened) throw new Error(opened.reason === 'project_closing' ? 'Project is closing' : 'Unknown project')
      const resolved = await absoluteOf(opened.root, path, 'directory')
      if (!resolved.ok) throw new Error(`Directory unavailable: ${resolved.reason}`)
      return resolved.value
    },
    subscribe: (projectId, owner) => watcher.subscribe(projectId, owner),
    unsubscribe: (projectId, subscriptionId, owner) => watcher.unsubscribe(projectId, subscriptionId, owner),
    detachOwner: (owner) => watcher.detachOwner(owner),
    async closeProject(projectId) {
      epochs.set(projectId, (epochs.get(projectId) ?? 0) + 1)
      for (const controller of indexes.get(projectId) ?? []) controller.abort()
      watcher.closeProject(projectId)
      await mutations.get(projectId)
    },
    async closeAll() {
      allEpoch++
      for (const active of indexes.values()) for (const controller of active) controller.abort()
      watcher.closeAll()
      await Promise.all(mutations.values())
    },
    async dispose() {
      disposed = true
      for (const active of indexes.values()) for (const controller of active) controller.abort()
      watcher.dispose()
      await Promise.all(mutations.values())
    }
  }
  return service
}
