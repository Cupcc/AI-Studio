import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import { projectPathName, projectPathParent, type ProjectPath } from '@shared/tools/files'
import { displayName } from '../../../lib/display-path'
import { filesApi } from '../files/api'
import { FileIcon } from '../files/file-icon'
import { useFiles } from '../files/files-store'
import { showTool } from '../show-tool'
import { parseQuickOpenQuery, rankPaths } from './fuzzy'
import './quick-open.css'

const RESULT_LIMIT = 50
/** A listing older than this is refreshed in the background when Quick Open opens. */
const INDEX_MAX_AGE_MS = 30_000
const RECENT_LIMIT = 30

interface ProjectIndex { paths: ProjectPath[]; truncated: boolean; loadedAt: number; stale: boolean; loading: boolean; error: boolean }
interface QuickOpenStore {
  projectId: string | null
  indexes: Record<string, ProjectIndex>
  recent: Record<string, ProjectPath[]>
  show(projectId: string): void
  hide(): void
  load(projectId: string): Promise<void>
  invalidate(projectId: string): void
  opened(projectId: string, path: ProjectPath): void
  forget(projectId: string): void
}

export const useQuickOpen = create<QuickOpenStore>((set, get) => ({
  projectId: null, indexes: {}, recent: {},
  show(projectId) {
    set({ projectId })
    const index = get().indexes[projectId]
    if (!index || index.stale || Date.now() - index.loadedAt > INDEX_MAX_AGE_MS) void get().load(projectId)
  },
  hide: () => set({ projectId: null }),
  async load(projectId) {
    const current = get().indexes[projectId]
    if (current?.loading) return
    const base: ProjectIndex = current ?? { paths: [], truncated: false, loadedAt: 0, stale: true, loading: false, error: false }
    set(state => ({ indexes: { ...state.indexes, [projectId]: { ...base, loading: true } } }))
    let next: ProjectIndex
    try {
      const result = await filesApi().index({ projectId })
      next = result.status === 'ok'
        ? { paths: result.paths, truncated: result.truncated, loadedAt: Date.now(), stale: false, loading: false, error: false }
        : { ...base, loading: false, error: true }
    } catch { next = { ...base, loading: false, error: true } }
    set(state => state.indexes[projectId] ? { indexes: { ...state.indexes, [projectId]: next } } : state)
  },
  invalidate(projectId) {
    const index = get().indexes[projectId]
    if (index && !index.stale) set(state => ({ indexes: { ...state.indexes, [projectId]: { ...index, stale: true } } }))
  },
  opened(projectId, path) {
    set(state => ({ recent: { ...state.recent, [projectId]: [path, ...(state.recent[projectId] ?? []).filter(item => item !== path)].slice(0, RECENT_LIMIT) } }))
  },
  forget(projectId) {
    set(state => {
      const indexes = { ...state.indexes }, recent = { ...state.recent }
      delete indexes[projectId]; delete recent[projectId]
      return { indexes, recent, projectId: state.projectId === projectId ? null : state.projectId }
    })
  }
}))

/** Opens a Project file in the Files tool, as choosing it in Quick Open does. */
export function openProjectFile(projectId: string, path: ProjectPath, line?: number): void {
  useQuickOpen.getState().opened(projectId, path)
  showTool(projectId, 'files')
  void useFiles.getState().open(projectId, path, { pin: true, ...(line ? { line } : {}) })
}

function Marked({ text, positions, offset }: { text: string; positions: ReadonlySet<number>; offset: number }) {
  const parts: ReactNode[] = []
  let run = ''
  let marked = false
  for (let index = 0; index < text.length; index++) {
    const hit = positions.has(index + offset)
    if (hit !== marked && run) { parts.push(marked ? <mark key={index}>{run}</mark> : run); run = '' }
    marked = hit; run += text[index]
  }
  if (run) parts.push(marked ? <mark key="end">{run}</mark> : run)
  return <>{parts}</>
}

/** VS Code's Quick Open (⌘P): a top-centred picker over every non-ignored file of the current Project. */
export function QuickOpen() {
  const projectId = useQuickOpen(state => state.projectId)
  const index = useQuickOpen(state => projectId ? state.indexes[projectId] : undefined)
  const recent = useQuickOpen(state => projectId ? state.recent[projectId] : undefined)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => { if (projectId) { setQuery(''); setActive(0); requestAnimationFrame(() => input.current?.focus()) } }, [projectId])
  const parsed = useMemo(() => parseQuickOpenQuery(query), [query])
  const results = useMemo(() => rankPaths(index?.paths ?? [], parsed, RESULT_LIMIT, recent ?? []), [index?.paths, parsed, recent])
  useEffect(() => setActive(0), [query])
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active])
  if (!projectId) return null

  const close = () => useQuickOpen.getState().hide()
  const choose = (path: ProjectPath | undefined) => {
    if (!path) return
    close()
    openProjectFile(projectId, path, parsed.line)
  }
  const status = index?.error ? '无法列出文件' : !index || (index.loading && !index.paths.length) ? '正在列出文件…' : !results.length ? '没有匹配的文件' : null

  return <div className="quick-open-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
    <div className="quick-open" role="dialog" aria-label="快速打开文件" aria-modal="true">
      <input ref={input} className="quick-open__input" role="combobox" aria-expanded={results.length > 0} aria-controls="quick-open-list" aria-autocomplete="list"
        aria-activedescendant={results[active] ? `quick-open-${active}` : undefined} aria-label="按名称搜索文件" placeholder="按名称搜索文件（追加 :行号 跳转到行）"
        value={query} spellCheck={false} autoComplete="off"
        onChange={event => setQuery(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); close() }
          else if (event.key === 'ArrowDown') { event.preventDefault(); setActive(value => Math.min(results.length - 1, value + 1)) }
          else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(value => Math.max(0, value - 1)) }
          else if (event.key === 'Enter') { event.preventDefault(); choose(results[active]?.path) }
        }}
        onBlur={event => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) close() }} />
      <div className="quick-open__list" id="quick-open-list" role="listbox" ref={list} aria-label="匹配的文件">
        {results.map((item, position) => {
          const name = projectPathName(item.path), dir = projectPathParent(item.path), offset = item.path.length - name.length
          const marks = new Set(item.positions)
          return <div key={item.path} id={`quick-open-${position}`} data-index={position} role="option" aria-selected={position === active}
            className={`quick-open__item ${position === active ? 'is-active' : ''}`} title={displayName(item.path)}
            onMouseMove={() => setActive(position)} onMouseDown={event => { event.preventDefault(); choose(item.path) }}>
            <FileIcon name={name} kind="file" />
            <span className="quick-open__name"><Marked text={displayName(name)} positions={marks} offset={offset} /></span>
            {dir && <span className="quick-open__dir"><Marked text={displayName(dir)} positions={marks} offset={0} /></span>}
            {!query && recent?.includes(item.path) && <span className="quick-open__tag">最近打开</span>}
          </div>
        })}
        {status && <p className="quick-open__status" role="status">{status}</p>}
        {index?.truncated && <p className="quick-open__status">文件过多，只列出前一部分</p>}
      </div>
    </div>
  </div>
}
