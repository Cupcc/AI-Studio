import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { groupSessions } from '@shared/session/presentation'
import { SESSION_TITLE_MAX_LENGTH } from '@shared/ipc/session'
import type { SessionSummary } from '@shared/session/types'
import type { ShellSlotProps } from '../project/integration'
import { useProjectShell } from '../project/store'
import { useSessions } from './store'
import { CliBadge, SessionStatusIndicator } from './Status'

type Row = { id: string; top: number; height: number } & ({ kind: 'heading'; label: string } | { kind: 'session'; session: SessionSummary })
export function historyRows(sessions: SessionSummary[], now?: Date): Row[] {
  const rows: Row[] = []
  let top = 0
  for (const group of groupSessions(sessions, now)) {
    rows.push({ id: `group:${group.id}`, top, height: 24, kind: 'heading', label: group.label }); top += 24
    for (const session of group.sessions) { rows.push({ id: session.id, top, height: 32, kind: 'session', session }); top += 32 }
  }
  return rows
}
export function visibleHistoryRows(rows: Row[], scrollTop: number, height: number): Row[] {
  let low = 0, high = rows.length
  while (low < high) {
    const mid = (low + high) >>> 1, row = rows[mid]!
    if (row.top + row.height < scrollTop) low = mid + 1; else high = mid
  }
  let end = low
  while (end < rows.length && rows[end]!.top < scrollTop + height) end++
  return rows.slice(Math.max(0, low - 6), Math.min(rows.length, end + 6))
}
const offsets = new Map<string, number>()

export function SessionHistory({ project, canvas, active }: ShellSlotProps) {
  const summaries = useSessions((s) => s.summaries), projectState = useSessions((s) => s.projects[project.id])
  const errors = useSessions((s) => s.errors), pending = useSessions((s) => s.pending)
  const [day, setDay] = useState(() => new Date().toDateString())
  const rows = useMemo(() => historyRows(Object.values(summaries).filter((s) => s.projectId === project.id)), [summaries, project.id, day])
  const ref = useRef<HTMLDivElement>(null)
  const previousRows = useRef<Row[]>([])
  const [scrollTop, setScrollTop] = useState(offsets.get(project.id) ?? 0), [height, setHeight] = useState(320)
  const [menu, setMenu] = useState<string | null>(null), [renaming, setRenaming] = useState<string | null>(null), [title, setTitle] = useState('')
  const renameInput = useRef<HTMLInputElement>(null), menuRef = useRef<HTMLDivElement>(null), cancelRename = useRef(false), renameCommitted = useRef(false)
  const selectedId = canvas.mode === 'session' ? canvas.sessionId : null
  const priorSelected = useRef<string | null>(selectedId)
  const [focusId, setFocusId] = useState<string | null>(selectedId)
  useEffect(() => { void useSessions.getState().loadProject(project.id) }, [project.id])
  useEffect(() => {
    const timer = window.setInterval(() => setDay(new Date().toDateString()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    node.scrollTop = offsets.get(project.id) ?? 0
    const measure = () => { if (node.clientHeight) setHeight(node.clientHeight) }
    const observer = new ResizeObserver(measure); observer.observe(node); measure()
    return () => observer.disconnect()
  }, [project.id])
  useLayoutEffect(() => {
    const node = ref.current
    if (!node || !rows.length) return
    if (selectedId && (priorSelected.current !== selectedId || previousRows.current.length === 0)) {
      const selected = rows.find((row) => row.id === selectedId)
      if (selected && (selected.top < node.scrollTop || selected.top + selected.height > node.scrollTop + height)) node.scrollTop = Math.max(0, selected.top - height / 2)
    } else {
      const anchor = previousRows.current.find((row) => row.top + row.height > node.scrollTop)
      const next = anchor && rows.find((row) => row.id === anchor.id)
      if (anchor && next) node.scrollTop += next.top - anchor.top
    }
    priorSelected.current = selectedId; previousRows.current = rows
    offsets.set(project.id, node.scrollTop); setScrollTop(node.scrollTop)
  }, [rows, selectedId, height, project.id])
  useLayoutEffect(() => { if (renaming) { renameInput.current?.focus(); renameInput.current?.select() } }, [renaming])
  useEffect(() => {
    if (!menu) return
    const outside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(null) }
    document.addEventListener('pointerdown', outside)
    menuRef.current?.querySelector('button')?.focus()
    return () => document.removeEventListener('pointerdown', outside)
  }, [menu])
  useEffect(() => { if (!active) { setMenu(null); renameInput.current?.blur() } }, [active])
  function commitRename() {
    const id = renaming
    if (!id || renameCommitted.current) return
    renameCommitted.current = true
    setRenaming(null)
    const next = title.trim()
    if (!cancelRename.current && next && next !== summaries[id]?.title) void useSessions.getState().rename(id, next)
  }
  function keyNavigation(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    const sessionRows = rows.filter((row) => row.kind === 'session'), index = sessionRows.findIndex((row) => row.id === id)
    let next: number | undefined
    if (event.key === 'ArrowDown') next = Math.min(sessionRows.length - 1, index + 1)
    if (event.key === 'ArrowUp') next = Math.max(0, index - 1)
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = sessionRows.length - 1
    if (event.key === 'ArrowRight') { event.preventDefault(); ref.current?.querySelector<HTMLButtonElement>(`[data-session-row="${CSS.escape(id)}"] .session-row__more`)?.focus() }
    if (next === undefined) return
    event.preventDefault()
    const row = sessionRows[next]!
    setFocusId(row.id)
    const node = ref.current!
    if (row.top < node.scrollTop) node.scrollTop = row.top
    if (row.top + row.height > node.scrollTop + height) node.scrollTop = row.top + row.height - height
    setScrollTop(node.scrollTop)
    requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>(`[data-session-row="${CSS.escape(row.id)}"] .session-row__open`)?.focus())
  }
  if (projectState?.error) return <div className="navigation__empty"><p role="alert">{projectState.error}</p><button onClick={() => void useSessions.getState().loadProject(project.id)}>重试</button></div>
  if (!rows.length) return <div className="navigation__empty">{projectState?.loading ? <p>正在加载对话…</p> : <><p>还没有对话</p><button className="text-button" onClick={() => useProjectShell.getState().startDraft(project.id)}>New Chat</button></>}</div>
  const visible = visibleHistoryRows(rows, scrollTop, height)
  const totalHeight = rows.at(-1)!.top + rows.at(-1)!.height
  return <div className="session-history" aria-label="Session History" ref={ref} onScroll={(event) => { const top = event.currentTarget.scrollTop; setScrollTop(top); offsets.set(project.id, top) }}>
    <div className="session-history__rows" style={{ height: totalHeight }}>
      {visible.map((row) => row.kind === 'heading'
        ? <h3 key={row.id} className="session-history__date" style={{ top: row.top, height: row.height }}>{row.label}</h3>
        : <div key={row.id} data-session-row={row.id} className={`session-row ${selectedId === row.id ? 'is-selected' : ''}`} style={{ top: row.top, height: row.height }}>
          <CliBadge cli={row.session.cli} />
          {renaming === row.id ? <input ref={renameInput} className="session-row__rename" aria-label="Session 标题" maxLength={SESSION_TITLE_MAX_LENGTH} value={title} onChange={(event) => setTitle(event.target.value)} onBlur={commitRename} onKeyDown={(event) => {
            event.stopPropagation()
            if (event.nativeEvent.isComposing || event.keyCode === 229) return
            if (event.key === 'Enter') { event.preventDefault(); commitRename() }
            if (event.key === 'Escape') { event.preventDefault(); cancelRename.current = true; commitRename() }
          }} /> : <button className="session-row__open" title={row.session.title} aria-current={selectedId === row.id ? 'page' : undefined} tabIndex={(focusId ?? rows.find((r) => r.kind === 'session')?.id) === row.id ? 0 : -1} onFocus={() => setFocusId(row.id)} onKeyDown={(event) => keyNavigation(event, row.id)} onClick={() => useProjectShell.getState().openSession(project.id, row.id)}>{row.session.title}</button>}
          {renaming !== row.id && <button className={`session-row__more icon-button ${menu === row.id ? 'is-open' : ''}`} aria-label={`更多操作 ${row.session.title}`} aria-expanded={menu === row.id} onClick={() => setMenu(menu === row.id ? null : row.id)}>⋯</button>}
          <SessionStatusIndicator status={row.session.status} />
          {pending[`rename:${row.id}`] && <span className="sr-only">正在保存标题</span>}
          {errors[`rename:${row.id}`] && <span className="session-row__error" role="alert" title={errors[`rename:${row.id}`] ?? undefined}>标题保存失败</span>}
          {menu === row.id && <div className="session-row__menu" role="menu" ref={menuRef} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setMenu(null); ref.current?.querySelector<HTMLButtonElement>(`[data-session-row="${CSS.escape(row.id)}"] .session-row__more`)?.focus() } }}>
            <button role="menuitem" onClick={() => { cancelRename.current = false; renameCommitted.current = false; setTitle(row.session.title); setRenaming(row.id); setMenu(null) }}>Rename</button>
          </div>}
        </div>)}
    </div>
  </div>
}
