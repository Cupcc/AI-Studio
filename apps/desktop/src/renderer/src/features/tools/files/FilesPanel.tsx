import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import type { MainCanvas } from '@shared/project/types'
import { projectPathName, projectPathParent, type ProjectPath } from '@shared/tools/files'
import { Icon } from '../../../app/Icon'
import { popupMenu, separator, type MenuItemSpec } from '../../../lib/menu'
import { showTool } from '../show-tool'
import { useTerminals } from '../terminal-store'
import { addToConversation, type AddOutcome } from './add-to-conversation'
import {
  absolutePath, copyEntries, copyText, createEntry, installedEditors, moveEntries, openWith, paste, renameEntry, trashEntries,
  useFilesClipboard, type ActionMessage
} from './file-actions'
import { FileTree, type TreeKeyAction } from './FileTree'
import { FileViewer } from './FileViewer'
import { entryOf, SPLIT_MAX, SPLIT_MIN, useFiles } from './files-store'
import { flattenTree, type EntryRow } from './files-tree'
import { useGitDecorations } from './git-decorations'
import { displayName, FILES_MENU, FILES_TEXT } from './strings'
import { openSearchIn } from '../search/search-store'
import './files.css'

const NO_DIRS = new Map(), NO_EXPANDED = new Set<string>(), NO_MARKS: string[] = []
const FOCUS_REFRESH_MS = 2000
const SPLIT_STEP = 0.05

export interface FilesPanelProps {
  projectId: string
  /** The Project's main canvas: the conversation that "添加到对话" adds to. */
  canvas: MainCanvas
  /** Visible. A hidden panel issues no IPC, holds no subscription and mounts no editor. */
  active: boolean
  /** The Project's canonical directory, for "复制路径". */
  root?: string
  /** Accepted for parity with the other panels. The Files tool has no native view, so nothing is covered. */
  overlayBlocked?: boolean
}

export function FilesPanel({ projectId, canvas, active, root = '' }: FilesPanelProps) {
  const state = useFiles(s => s.projects[projectId])
  const clipboard = useFilesClipboard()
  const decorations = useGitDecorations(projectId, active)
  const [message, setMessage] = useState<(AddOutcome & { path: string }) | null>(null)
  const [notice, setNotice] = useState<ActionMessage | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ProjectPath[] | null>(null)
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
  const marked = state?.marked ?? NO_MARKS
  // Adding is offered for the selected regular file only (a symlink or special file has nothing to reference).
  const canAdd = !!state && viewer !== null && selected === viewer.path && (entryOf(state, viewer.path)?.kind ?? 'file') === 'file'
  const watchLive = state?.watch === 'live'
  const files = useFiles.getState()

  const say = (next: ActionMessage | null) => setNotice(next)
  async function add(path: ProjectPath | null = selected, type: 'file' | 'image' = 'file') {
    if (!path || adding) return
    setAdding(true); setMessage(null)
    const outcome = await addToConversation({ projectId, canvas, path, type })
    setAdding(false); setMessage({ ...outcome, path })
    if (path !== selected) say(outcome)
  }

  /** The rows an action applies to: the marked set when the clicked row belongs to it, otherwise the row alone. */
  const targetsOf = (row: EntryRow): ProjectPath[] => row.path === null ? [] : marked.includes(row.path) ? marked : [row.path]
  const folderOf = (row: EntryRow | null): ProjectPath => !row || row.path === null ? '' : row.kind === 'directory' ? row.path : projectPathParent(row.path)

  function startCreate(parent: ProjectPath, kind: 'file' | 'directory') { say(null); files.startEdit(projectId, { mode: 'create', parent, kind }) }
  function openInTerminal(dir: ProjectPath) { showTool(projectId, 'terminal'); void useTerminals.getState().create(projectId, dir) }
  function copyToClipboard(paths: ProjectPath[], cut: boolean) {
    if (!paths.length) return
    useFilesClipboard.getState().set(projectId, paths, cut)
    say({ tone: 'ok', text: cut ? `已剪切 ${paths.length} 项` : `已复制 ${paths.length} 项` })
  }

  async function onContextMenu(row: EntryRow | null, event: MouseEvent) {
    const at = { x: event.clientX, y: event.clientY }
    if (row?.path) { if (!marked.includes(row.path)) files.mark(projectId, row.path, 'replace', []) }
    const targets = row ? targetsOf(row) : []
    const single = targets.length <= 1
    const path = row?.path ?? ''
    const isFile = !!row && row.kind === 'file'
    const folder = folderOf(row)
    const canPaste = clipboard.projectId === projectId && clipboard.paths.length > 0
    const editors = await installedEditors()
    const items: MenuItemSpec[] = []
    if (!row || row.kind === 'directory') items.push({ id: 'new-file', label: FILES_MENU.newFile }, { id: 'new-folder', label: FILES_MENU.newFolder }, separator)
    if (row && isFile && single) items.push({ id: 'open', label: FILES_MENU.open }, { id: 'pin', label: FILES_MENU.openToSide })
    if (single) {
      if (editors.vscode) items.push({ id: 'vscode', label: FILES_MENU.openVSCode })
      if (editors.cursor) items.push({ id: 'cursor', label: FILES_MENU.openCursor })
      if (row) items.push({ id: 'default', label: FILES_MENU.openDefault })
      items.push({ id: 'reveal', label: FILES_MENU.reveal, accelerator: 'Alt+Cmd+R' }, { id: 'terminal', label: FILES_MENU.openTerminal })
      if (!isFile) items.push({ id: 'find', label: FILES_MENU.findInFolder, accelerator: 'Alt+Shift+F' })
    }
    if (row && isFile && single) items.push(separator, { id: 'add', label: FILES_MENU.addToConversation })
    items.push(separator)
    if (row) items.push({ id: 'cut', label: FILES_MENU.cut, accelerator: 'Cmd+X' }, { id: 'copy', label: FILES_MENU.copy, accelerator: 'Cmd+C' })
    items.push({ id: 'paste', label: FILES_MENU.paste, accelerator: 'Cmd+V', enabled: canPaste })
    if (single) items.push(separator, { id: 'copy-path', label: FILES_MENU.copyPath, accelerator: 'Alt+Cmd+C' }, { id: 'copy-relative', label: FILES_MENU.copyRelativePath, accelerator: 'Alt+Shift+Cmd+C' })
    if (row) items.push(separator, ...(single ? [{ id: 'rename', label: FILES_MENU.rename, accelerator: 'F2' }] : []), { id: 'delete', label: FILES_MENU.delete, accelerator: 'Cmd+Backspace' })
    if (!row) items.push(separator, { id: 'refresh', label: FILES_MENU.refresh }, { id: 'collapse', label: FILES_MENU.collapseAll })
    const choice = await popupMenu(items, at)
    switch (choice) {
      case 'new-file': startCreate(folder, 'file'); break
      case 'new-folder': startCreate(folder, 'directory'); break
      case 'open': void files.open(projectId, path); break
      case 'pin': void files.open(projectId, path, { pin: true }); break
      case 'vscode': case 'cursor': case 'default': say(await openWith(projectId, path, choice)); break
      case 'reveal': say(await openWith(projectId, path, 'finder')); break
      case 'terminal': openInTerminal(folder); break
      case 'find': openSearchIn(projectId, folder); break
      case 'add': void add(path); break
      case 'cut': copyToClipboard(targets, true); break
      case 'copy': copyToClipboard(targets, false); break
      case 'paste': say(await paste(projectId, folder)); break
      case 'copy-path': say(await copyText(absolutePath(root, path), FILES_TEXT.copied)); break
      case 'copy-relative': say(await copyText(path || '.', FILES_TEXT.copiedRelative)); break
      case 'rename': files.startEdit(projectId, { mode: 'rename', path }); break
      case 'delete': setConfirmDelete(targets); break
      case 'refresh': void files.refresh(projectId); break
      case 'collapse': files.collapseAll(projectId); break
    }
  }

  function onKeyAction(action: TreeKeyAction, row: EntryRow) {
    const targets = targetsOf(row)
    switch (action) {
      case 'rename': if (row.path) files.startEdit(projectId, { mode: 'rename', path: row.path }); break
      case 'delete': if (targets.length) setConfirmDelete(targets); break
      case 'copy': copyToClipboard(targets, false); break
      case 'cut': copyToClipboard(targets, true); break
      case 'paste': void paste(projectId, folderOf(row)).then(say); break
      case 'clear': files.mark(projectId, row.path ?? '', 'replace', []); useFilesClipboard.getState().clear(); break
    }
  }

  async function commitEdit(name: string) {
    const edit = state?.edit
    files.cancelEdit(projectId)
    if (!edit) return
    say(edit.mode === 'create' ? await createEntry(projectId, edit.parent, name, edit.kind) : await renameEntry(projectId, edit.path, name))
  }

  async function onDrop(paths: ProjectPath[], target: ProjectPath, copy: boolean) {
    const moving = paths.filter(path => projectPathParent(path) !== target || copy)
    if (!moving.length) return
    say(copy ? await copyEntries(projectId, moving, target) : await moveEntries(projectId, moving, target))
  }

  async function confirmTrash() {
    const paths = confirmDelete
    setConfirmDelete(null)
    if (paths?.length) say(await trashEntries(projectId, paths))
  }

  const resize = (ratio: number) => files.setSplit(projectId, ratio)
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
  /** New entries go into the selected folder, or next to the selected file, as VS Code does. */
  const newTarget = (): ProjectPath => {
    const last = marked.at(-1)
    if (!last || !state) return ''
    return entryOf(state, last)?.kind === 'directory' ? last : projectPathParent(last)
  }

  return <div className="files-tool">
    <div className="files-header">
      {state?.watch && <span className={`files-watch ${watchLive ? '' : 'is-degraded'}`} title={watchLive ? FILES_TEXT.watchLiveTip : FILES_TEXT.watchUnavailableTip}>{watchLive ? FILES_TEXT.watchLive : FILES_TEXT.watchUnavailable}</span>}
      <span className="grow" />
      <button className="icon-button" aria-label={FILES_TEXT.newFile} data-tip={FILES_TEXT.newFile} disabled={!active || !state} onClick={() => startCreate(newTarget(), 'file')}><Icon name="file-plus" size={15} /></button>
      <button className="icon-button" aria-label={FILES_TEXT.newFolder} data-tip={FILES_TEXT.newFolder} disabled={!active || !state} onClick={() => startCreate(newTarget(), 'directory')}><Icon name="folder-plus" size={15} /></button>
      <button className="icon-button" aria-label={FILES_TEXT.refresh} data-tip={FILES_TEXT.refresh} disabled={!active} onClick={() => void files.refresh(projectId)}><Icon name="refresh" size={15} /></button>
      <button className="icon-button" aria-label={FILES_TEXT.collapseAll} data-tip={FILES_TEXT.collapseAll} data-tip-align="end" disabled={!active || !state?.expanded.size} onClick={() => files.collapseAll(projectId)}><Icon name="collapse" size={15} /></button>
    </div>
    {notice && <div className="files-notice" role="status" data-tone={notice.tone}><span>{notice.text}</span><button className="icon-button" aria-label="关闭提示" onClick={() => setNotice(null)}><Icon name="close" size={12} /></button></div>}
    {confirmDelete && <div className="files-confirm" role="alertdialog" aria-label={FILES_TEXT.deleteTitle(confirmDelete.length, displayName(projectPathName(confirmDelete[0]!)))}>
      <p>{FILES_TEXT.deleteTitle(confirmDelete.length, displayName(projectPathName(confirmDelete[0]!)))}</p><span className="muted">{FILES_TEXT.deleteBody}</span>
      <div className="files-confirm__actions">
        <button className="secondary-button button--small" onClick={() => setConfirmDelete(null)}>{FILES_TEXT.cancel}</button>
        <button className="danger-button button--small" autoFocus onClick={() => void confirmTrash()}>{FILES_TEXT.deleteConfirm}</button>
      </div>
    </div>}
    <div className="files-body" ref={body}>
      <div className="files-tree-pane" style={viewer ? { flex: `${split} 1 0px` } : undefined}
        onContextMenu={event => { if (event.target === event.currentTarget) { event.preventDefault(); void onContextMenu(null, event) } }}>
        <FileTree rows={rows} selected={selected} marked={marked} decorations={decorations} edit={state?.edit ?? null} projectId={projectId}
          cut={clipboard.cut && clipboard.projectId === projectId ? clipboard.paths : []}
          onToggle={path => void files.toggle(projectId, path)}
          onOpen={(path, pin) => void files.select(projectId, path, { pin: pin ?? false })}
          onMark={(path, mode, order) => files.mark(projectId, path, mode, order)}
          onContextMenu={(row, event) => void onContextMenu(row, event)}
          onKeyAction={onKeyAction}
          onDrop={(paths, target, copy) => void onDrop(paths, target, copy)}
          onEditCommit={name => void commitEdit(name)}
          onEditCancel={() => files.cancelEdit(projectId)} />
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
            projectId={projectId} viewer={viewer} canAdd={canAdd} active={active} tabs={state?.tabs ?? []} reveal={state?.reveal ?? null}
            message={message?.path === viewer.path ? message : null} adding={adding}
            onAdd={() => void add()} onAddImage={() => void add(selected, 'image')} onClose={() => { files.closeViewer(projectId); setMessage(null) }}
            onRetry={() => void files.refresh(projectId)}
            onSelectTab={(path, pinned) => void files.select(projectId, path, { pin: pinned })}
            onCloseTab={path => files.closeTab(projectId, path)}
            onPinTab={path => files.pinTab(projectId, path)}
            onNotice={say}
          />
        </div>
      </>}
    </div>
  </div>
}

export default FilesPanel
