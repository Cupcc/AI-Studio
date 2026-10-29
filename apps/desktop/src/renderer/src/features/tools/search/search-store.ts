import { create } from 'zustand'
import type { FeatureBridge } from '@shared/ipc/contract'
import type { searchContract } from '@shared/ipc/search'
import type { ProjectPath } from '@shared/tools/files'
import type { SearchOptions, SearchResult } from '@shared/tools/search'
import { studio } from '../../../lib/studio'
import { showTool } from '../show-tool'

export type SearchApi = FeatureBridge<typeof searchContract>
export const searchApi = (): SearchApi => (studio() as ReturnType<typeof studio> & { search: SearchApi }).search

export interface ProjectSearch extends SearchOptions {
  /** Include / exclude fields shown (VS Code's "…" toggle). */
  details: boolean
  searching: boolean
  result: SearchResult | null
  /** Files whose matches are folded. */
  collapsed: ReadonlySet<ProjectPath>
  /** Bumped to move focus into the query field (⌘⇧F, "在文件夹中查找"). */
  focus: number
}

interface SearchStore {
  projects: Record<string, ProjectSearch>
  /** Updates the query or options; a search runs after a short pause, like VS Code's search-as-you-type. */
  update(projectId: string, patch: Partial<SearchOptions & { details: boolean }>): void
  run(projectId: string): Promise<void>
  clear(projectId: string): void
  toggleFile(projectId: string, path: ProjectPath): void
  collapseAll(projectId: string, collapse: boolean): void
  focus(projectId: string): void
  forget(projectId: string): void
}

export const SEARCH_DEBOUNCE_MS = 300
const empty = (): ProjectSearch => ({
  query: '', isRegex: false, caseSensitive: false, wholeWord: false, include: '', exclude: '',
  details: false, searching: false, result: null, collapsed: new Set(), focus: 0
})
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const latest = new Map<string, string>()
let sequence = 0

export const useSearch = create<SearchStore>((set, get) => {
  const patch = (projectId: string, update: Partial<ProjectSearch>) =>
    set(state => ({ projects: { ...state.projects, [projectId]: { ...(state.projects[projectId] ?? empty()), ...update } } }))
  return {
    projects: {},
    update(projectId, update) {
      patch(projectId, update)
      const keys = Object.keys(update)
      if (keys.length === 1 && keys[0] === 'details') return
      clearTimeout(timers.get(projectId))
      timers.set(projectId, setTimeout(() => { timers.delete(projectId); void get().run(projectId) }, SEARCH_DEBOUNCE_MS))
    },
    async run(projectId) {
      clearTimeout(timers.get(projectId)); timers.delete(projectId)
      const current = get().projects[projectId] ?? empty()
      const previous = latest.get(projectId)
      if (previous) void searchApi().cancel({ projectId, searchId: previous }).catch(() => {})
      if (!current.query) { latest.delete(projectId); patch(projectId, { searching: false, result: null }); return }
      const searchId = `search-${++sequence}`
      latest.set(projectId, searchId)
      patch(projectId, { searching: true })
      const { query, isRegex, caseSensitive, wholeWord, include, exclude } = current
      let result: SearchResult
      try { result = await searchApi().run({ projectId, searchId, query, isRegex, caseSensitive, wholeWord, include, exclude }) }
      catch (error) { result = { status: 'unavailable', searchId, reason: 'failed', message: String(error) } }
      if (latest.get(projectId) !== searchId || result.status === 'cancelled') return
      latest.delete(projectId)
      patch(projectId, { searching: false, result, collapsed: new Set() })
    },
    clear(projectId) {
      clearTimeout(timers.get(projectId)); timers.delete(projectId)
      const previous = latest.get(projectId)
      if (previous) void searchApi().cancel({ projectId, searchId: previous }).catch(() => {})
      latest.delete(projectId)
      patch(projectId, { query: '', searching: false, result: null, collapsed: new Set() })
    },
    toggleFile(projectId, path) {
      const collapsed = new Set(get().projects[projectId]?.collapsed ?? [])
      if (!collapsed.delete(path)) collapsed.add(path)
      patch(projectId, { collapsed })
    },
    collapseAll(projectId, collapse) {
      const result = get().projects[projectId]?.result
      patch(projectId, { collapsed: new Set(collapse && result?.status === 'ok' ? result.files.map(file => file.path) : []) })
    },
    focus(projectId) {
      patch(projectId, { focus: (get().projects[projectId]?.focus ?? 0) + 1 })
    },
    forget(projectId) {
      clearTimeout(timers.get(projectId)); timers.delete(projectId); latest.delete(projectId)
      set(state => { const projects = { ...state.projects }; delete projects[projectId]; return { projects } })
    }
  }
})

/** Files "在文件夹中查找" (⌥⇧F in VS Code): Search with this folder as the include pattern. */
export function openSearchIn(projectId: string, folder: ProjectPath): void {
  const store = useSearch.getState()
  store.update(projectId, { include: folder, details: true })
  showTool(projectId, 'search')
  store.focus(projectId)
}
