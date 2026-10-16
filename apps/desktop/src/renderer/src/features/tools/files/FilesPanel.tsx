import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { MainCanvas } from '@shared/project/types'
import { Icon } from '../../../app/Icon'
import { addToConversation, type AddOutcome } from './add-to-conversation'
import { FileTree } from './FileTree'
import { FileViewer } from './FileViewer'
import { entryOf, SPLIT_MAX, SPLIT_MIN, useFiles } from './files-store'
import { flattenTree } from './files-tree'
import { FILES_TEXT } from './strings'
import './files.css'

const NO_DIRS = new Map(), NO_EXPANDED = new Set<string>()
const FOCUS_REFRESH_MS = 2000
const SPLIT_STEP = 0.05

export interface FilesPanelProps {
  projectId: string
  /** The Project's main canvas: the conversation that "添加到对话" adds to. */
  canvas: MainCanvas
  /** Visible. A hidden panel issues no IPC, holds no subscription and mounts no editor. */
  active: boolean
  /** Accepted for parity with the other panels. The Files tool has no native view, so nothing is covered. */
  overlayBlocked?: boolean
}

export function FilesPanel({ projectId, canvas, active }: FilesPanelProps) {
  const state = useFiles(s => s.projects[projectId])
  const [message, setMessage] = useState<(AddOutcome & { path: string }) | null>(null)
  const [adding, setAdding] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  useEffect(() => {
    if (!active) return
    void useFiles.getState().activate(projectId)
    return () => useFiles.getState().deactivate(projectId)
  }, [projectId, active])

  // Without live events the window regaining focus is the cheap moment to look again (FSEvents can also miss changes).
  useEffect(() => {
    if (!active) return
    let last = 0
    const onFocus = () => {
      if (useFiles.getState().projects[projectId]?.watch === 'live' || Date.now() - last < FOCUS_REFRESH_MS) return
      last = Date.now()
      void useFiles.getState().refresh(projectId)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [projectId, active])

  const rows = useMemo(() => flattenTree(state?.dirs ?? NO_DIRS, state?.expanded ?? NO_EXPANDED), [state?.dirs, state?.expanded])
  const viewer = state?.viewer ?? null
  const split = state?.split ?? 0.45
  const selected = state?.selected ?? null
  // Adding is offered for the selected regular file only (a symlink or special file has nothing to reference).
  const canAdd = !!state && viewer !== null && selected === viewer.path && (entryOf(state, viewer.path)?.kind ?? 'file') === 'file'
  const watchLive = state?.watch === 'live'

  async function add() {
    if (!selected || adding) return
    const path = selected
    setAdding(true); setMessage(null)
    const outcome = await addToConversation({ projectId, canvas, path })
    setAdding(false); setMessage({ ...outcome, path })
  }

  const resize = (ratio: number) => useFiles.getState().setSplit(projectId, ratio)
  function onSplitKey(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = { ArrowUp: split - SPLIT_STEP, ArrowDown: split + SPLIT_STEP, Home: SPLIT_MIN, End: SPLIT_MAX }
    const next = moves[event.key]
    if (next === undefined) return
    event.preventDefault(); resize(next)
  }
  function onSplitMove(event: PointerEvent<HTMLDivElement>) {
    const rect = body.current?.getBoundingClientRect()
    if (dragging.current && rect && rect.height > 0) resize((event.clientY - rect.top) / rect.height)
  }

  return <div className="files-tool">
    <div className="files-header">
      {state?.watch && <span className={`files-watch ${watchLive ? '' : 'is-degraded'}`} title={watchLive ? FILES_TEXT.watchLiveTip : FILES_TEXT.watchUnavailableTip}>{watchLive ? FILES_TEXT.watchLive : FILES_TEXT.watchUnavailable}</span>}
      <span className="grow" />
      <button className="icon-button" aria-label={FILES_TEXT.refresh} data-tip={FILES_TEXT.refresh} data-tip-align="end" disabled={!active} onClick={() => void useFiles.getState().refresh(projectId)}><Icon name="refresh" size={15} /></button>
    </div>
    <div className="files-body" ref={body}>
      <div className="files-tree-pane" style={viewer ? { flex: `${split} 1 0px` } : undefined}>
        <FileTree rows={rows} selected={selected} onToggle={path => void useFiles.getState().toggle(projectId, path)} onOpen={path => void useFiles.getState().select(projectId, path)} />
      </div>
      {viewer && <>
        <div
          className="files-splitter" role="separator" aria-orientation="horizontal" aria-label={FILES_TEXT.splitter} tabIndex={0}
          aria-valuemin={Math.round(SPLIT_MIN * 100)} aria-valuemax={Math.round(SPLIT_MAX * 100)} aria-valuenow={Math.round(split * 100)}
          onKeyDown={onSplitKey}
          onPointerDown={event => { dragging.current = true; event.currentTarget.setPointerCapture?.(event.pointerId) }}
          onPointerMove={onSplitMove}
          onPointerUp={() => { dragging.current = false }} onPointerCancel={() => { dragging.current = false }}
        />
        <div className="files-viewer-pane" style={{ flex: `${1 - split} 1 0px` }}>
          <FileViewer
            projectId={projectId} viewer={viewer} canAdd={canAdd} active={active}
            message={message?.path === viewer.path ? message : null} adding={adding}
            onAdd={() => void add()} onClose={() => { useFiles.getState().closeViewer(projectId); setMessage(null) }}
            onRetry={() => void useFiles.getState().refresh(projectId)}
          />
        </div>
      </>}
    </div>
  </div>
}

export default FilesPanel
