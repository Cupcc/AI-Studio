// Search service (FR-TOOL-005): one running search per window and Project; a newer one cancels the older.
import type { SearchOptions, SearchResult } from '@shared/tools/search'
import type { CoreServices } from '../core'
import { ripgrepPath } from '../files/file-index'
import { projectShellFor } from '../project'
import { runSearch } from './ripgrep-search'

export interface SearchServiceOptions {
  projectRoot(projectId: string): string | null
  canOperate(projectId: string): boolean
  ripgrep(): Promise<string>
}

export interface SearchService {
  run(projectId: string, searchId: string, options: SearchOptions, owner: number): Promise<SearchResult>
  cancel(projectId: string, searchId: string, owner: number): void
  closeProject(projectId: string): Promise<void>
  dispose(): Promise<void>
}

export function createSearchService(options: SearchServiceOptions): SearchService {
  const running = new Map<string, { searchId: string; projectId: string; controller: AbortController; done: Promise<SearchResult> }>()
  let disposed = false
  const keyOf = (owner: number, projectId: string) => `${owner}\u0000${projectId}`
  return {
    async run(projectId, searchId, request, owner) {
      const key = keyOf(owner, projectId)
      running.get(key)?.controller.abort()
      const root = options.projectRoot(projectId)
      if (!root) return { status: 'unavailable', searchId, reason: 'project_unavailable' }
      if (disposed || !options.canOperate(projectId)) return { status: 'unavailable', searchId, reason: 'project_closing' }
      const controller = new AbortController()
      const done = options.ripgrep().then(rg => runSearch(root, rg, searchId, request, controller.signal),
        (error: unknown): SearchResult => ({ status: 'unavailable', searchId, reason: 'failed', message: error instanceof Error ? error.message : String(error) }))
      const entry = { searchId, projectId, controller, done }
      running.set(key, entry)
      try { return await done } finally { if (running.get(key) === entry) running.delete(key) }
    },
    cancel(projectId, searchId, owner) {
      const entry = running.get(keyOf(owner, projectId))
      if (entry?.searchId === searchId) entry.controller.abort()
    },
    async closeProject(projectId) {
      const pending = [...running.values()].filter(entry => entry.projectId === projectId)
      for (const entry of pending) entry.controller.abort()
      await Promise.allSettled(pending.map(entry => entry.done))
    },
    async dispose() {
      disposed = true
      const pending = [...running.values()]
      for (const entry of pending) entry.controller.abort()
      await Promise.allSettled(pending.map(entry => entry.done))
    }
  }
}

const services = new WeakMap<CoreServices, SearchService>()
export function searchFor(core: CoreServices): SearchService {
  let service = services.get(core)
  if (!service) {
    const shell = projectShellFor(core)
    const lifecycle = shell as typeof shell & { isProjectClosing?(id: string): boolean; isQuitting?(): boolean }
    service = createSearchService({
      projectRoot: (id) => shell.projects.getProject(id)?.canonicalPath ?? null,
      canOperate: (id) => !lifecycle.isProjectClosing?.(id) && !lifecycle.isQuitting?.(),
      ripgrep: ripgrepPath
    })
    services.set(core, service)
  }
  return service
}
