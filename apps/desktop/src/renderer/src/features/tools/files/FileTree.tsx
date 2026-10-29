import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { projectPathParent, type ProjectPath } from '@shared/tools/files'
import { Icon } from '../../../app/Icon'
import { FileIcon } from './file-icon'
import type { FilesEdit } from './files-store'
import { navigate, type EntryRow, type TreeRow } from './files-tree'
import type { GitDecorations } from './git-decorations'
import { displayName, FILES_TEXT } from './strings'

const NAVIGATION_KEYS = new Set(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'])
const FOLDER_GIT_LABELS = { added: '新增', modified: '修改', conflict: '冲突', renamed: '重命名' } as const
/** Drag payload between the tree, the tree itself and the Terminal (a JSON list of Project paths). */
export const FILES_DRAG_TYPE = 'application/x-studio-files'

export type TreeKeyAction = 'rename' | 'delete' | 'copy' | 'cut' | 'paste' | 'clear'

export interface FileTreeProps {
  rows: TreeRow[]
  /** The file shown in the viewer. */
  selected: string | null
  /** Tree selection (multi). */
  marked: readonly ProjectPath[]
  decorations?: GitDecorations
  edit?: FilesEdit | null
  /** Paths of the Files clipboard when it holds a cut: shown dimmed. */
  cut?: readonly ProjectPath[]
  projectId?: string
  onToggle(path: string): void
  /** Opens a file; `pin` for a double-click (VS Code keeps the tab). */
  onOpen(path: string, pin?: boolean): void
  onMark?(path: ProjectPath, mode: 'replace' | 'toggle' | 'range', order: ProjectPath[]): void
  /** Right-click on a row, or on the empty area (row = null). */
  onContextMenu?(row: EntryRow | null, event: MouseEvent): void
  onKeyAction?(action: TreeKeyAction, row: EntryRow): void
  /** Dropped tree entries on a folder ('' = Project root); `copy` while ⌥ is held, as in VS Code. */
  onDrop?(paths: ProjectPath[], target: ProjectPath, copy: boolean): void
  onEditCommit?(name: string): void
  onEditCancel?(): void
}

function NameInput({ initial, depth, kind, onCommit, onCancel }: { initial: string; depth: number; kind: 'file' | 'directory'; onCommit(name: string): void; onCancel(): void }) {
  const input = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(initial)
  const done = useRef(false)
  useEffect(() => {
    const node = input.current
    if (!node) return
    node.focus()
    // Like VS Code: the stem is selected when renaming `name.ext`.
    const dot = initial.lastIndexOf('.')
    node.setSelectionRange(0, dot > 0 ? dot : initial.length)
  }, [initial])
  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    const name = value.trim()
    if (commit && name && name !== initial) onCommit(name); else onCancel()
  }
  return <div className="files-row files-row--editing" style={{ paddingInlineStart: `calc(var(--space-2) + ${depth} * var(--files-indent))` }}>
    <span className="files-row__chevron" aria-hidden="true" />
    <FileIcon name={value} kind={kind} />
    <input ref={input} className="files-row__input" aria-label={initial ? FILES_TEXT.renameLabel : kind === 'directory' ? FILES_TEXT.newFolderLabel : FILES_TEXT.newFileLabel}
      value={value} spellCheck={false} autoComplete="off"
      onChange={event => setValue(event.target.value)}
      onKeyDown={event => {
        event.stopPropagation()
        if (event.key === 'Enter') { event.preventDefault(); finish(true) }
        else if (event.key === 'Escape') { event.preventDefault(); finish(false) }
      }}
      onBlur={() => finish(true)} />
  </div>
}

/**
 * WAI-ARIA tree: one tab stop (roving tabindex), arrows / Home / End move, Right and Left expand, collapse or step
 * into and out of a directory, Enter and Space activate. Rows are a flat list with aria-level. VS Code explorer
 * additions (DEC-25): ⌘ / ⇧ multi-selection, double-click pins, F2 renames, ⌘⌫ deletes, ⌘C / ⌘X / ⌘V, drag to move.
 */
export function FileTree({ rows, selected, marked, decorations, edit = null, cut = [], projectId, onToggle, onOpen, onMark, onContextMenu, onKeyAction, onDrop, onEditCommit, onEditCancel }: FileTreeProps) {
  const entries = useMemo(() => rows.filter((row): row is EntryRow => row.type === 'entry'), [rows])
  const order = useMemo(() => entries.flatMap(row => row.path === null ? [] : [row.path]), [entries])
  const markedSet = useMemo(() => new Set(marked), [marked])
  const cutSet = useMemo(() => new Set(cut), [cut])
  const [focusId, setFocusId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<ProjectPath | null>(null)
  const elements = useRef(new Map<string, HTMLDivElement>())
  // The tab stop is the row that last had focus while it exists, else the selected file, else the first row.
  const stopId = entries.some(row => row.id === focusId) ? focusId : entries.some(row => row.id === selected) ? selected : entries[0]?.id ?? null
  const busy = rows.some(row => row.type === 'note' && row.tone === 'loading')

  function activate(row: EntryRow, pin = false) {
    if (row.path === null) return
    if (row.kind === 'directory') onToggle(row.path)
    else onOpen(row.path, pin)
  }
  function onClick(event: MouseEvent, row: EntryRow) {
    if (row.path === null) return
    if (event.metaKey || event.ctrlKey) { onMark?.(row.path, 'toggle', order); return }
    if (event.shiftKey) { onMark?.(row.path, 'range', order); return }
    onMark?.(row.path, 'replace', order)
    activate(row)
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>, row: EntryRow) {
    // Keys typed inside a descendant control are not the tree's.
    if (event.target !== event.currentTarget) return
    const command = event.metaKey || event.ctrlKey
    const action: TreeKeyAction | null =
      event.key === 'F2' ? 'rename'
      : (command && event.key === 'Backspace') || event.key === 'Delete' ? 'delete'
      : command && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'c' ? 'copy'
      : command && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'x' ? 'cut'
      : command && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'v' ? 'paste'
      : event.key === 'Escape' ? 'clear' : null
    if (action && row.path !== null && onKeyAction) { event.preventDefault(); onKeyAction(action, row); return }
    if (command && event.key === 'ArrowDown') { event.preventDefault(); activate(row, true); return }
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (row.path !== null) onMark?.(row.path, 'replace', order); activate(row); return }
    if (!NAVIGATION_KEYS.has(event.key)) return
    event.preventDefault()
    const move = navigate(entries, row.id, event.key as Parameters<typeof navigate>[2])
    if (!move) return
    if (move.toggle && row.path !== null) onToggle(row.path)
    if (move.focus) elements.current.get(move.focus)?.focus()
  }

  // ---- drag and drop ---------------------------------------------------------------------------------------------
  const dragPaths = (row: EntryRow): ProjectPath[] => row.path === null ? [] : markedSet.has(row.path) ? order.filter(path => markedSet.has(path)) : [row.path]
  function onDragStart(event: DragEvent, row: EntryRow) {
    const paths = dragPaths(row)
    if (!paths.length) { event.preventDefault(); return }
    event.dataTransfer.setData(FILES_DRAG_TYPE, JSON.stringify({ projectId, paths }))
    event.dataTransfer.setData('text/plain', paths.join('\n'))
    event.dataTransfer.effectAllowed = 'copyMove'
  }
  const folderOf = (row: EntryRow | null): ProjectPath => row === null || row.path === null ? '' : row.kind === 'directory' ? row.path : projectPathParent(row.path)
  function onDragOver(event: DragEvent, row: EntryRow | null) {
    if (!onDrop || !event.dataTransfer.types.includes(FILES_DRAG_TYPE)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = event.altKey ? 'copy' : 'move'
    setDropTarget(folderOf(row))
  }
  function onDropRow(event: DragEvent, row: EntryRow | null) {
    setDropTarget(null)
    if (!onDrop) return
    const raw = event.dataTransfer.getData(FILES_DRAG_TYPE)
    if (!raw) return
    event.preventDefault()
    event.stopPropagation()
    try {
      const payload = JSON.parse(raw) as { projectId?: string; paths?: unknown }
      if (payload.projectId !== projectId || !Array.isArray(payload.paths)) return
      onDrop(payload.paths.filter((path): path is string => typeof path === 'string'), folderOf(row), event.altKey)
    } catch { /* not ours */ }
  }

  const createAt = edit?.mode === 'create' ? edit : null
  const createIndex = createAt === null ? -1 : createAt.parent === '' ? 0 : rows.findIndex(row => row.type === 'entry' && row.path === createAt.parent) + 1
  const createDepth = createAt === null ? 0 : createAt.parent === '' ? 0 : (rows[createIndex - 1]?.depth ?? -1) + 1

  return <div className={`files-tree ${dropTarget === '' ? 'is-drop-target' : ''}`} role="tree" aria-label={FILES_TEXT.tree} aria-busy={busy} aria-multiselectable={true}
    onContextMenu={event => { if (event.target === event.currentTarget && onContextMenu) { event.preventDefault(); onContextMenu(null, event) } }}
    onDragOver={event => onDragOver(event, null)} onDragLeave={event => { if (event.target === event.currentTarget) setDropTarget(null) }} onDrop={event => onDropRow(event, null)}>
    {rows.map((row, index) => {
      const input = index === createIndex && createAt
        ? <NameInput key="\u0000create" initial="" depth={createDepth} kind={createAt.kind} onCommit={name => onEditCommit?.(name)} onCancel={() => onEditCancel?.()} />
        : null
      const indent = { paddingInlineStart: `calc(var(--space-2) + ${row.depth} * var(--files-indent))` }
      if (row.type === 'note') {
        return [input, <div key={row.id} className={`files-note files-note--${row.tone}`} role="treeitem" aria-disabled="true" aria-level={row.depth + 1} style={indent}>
          {row.tone === 'loading' && <span className="files-skeleton" aria-hidden="true" />}
          <span>{row.text}</span>
        </div>]
      }
      if (edit?.mode === 'rename' && row.path === edit.path) {
        return [input, <NameInput key={row.id} initial={row.name} depth={row.depth} kind={row.kind === 'directory' ? 'directory' : 'file'} onCommit={name => onEditCommit?.(name)} onCancel={() => onEditCancel?.()} />]
      }
      const directory = row.kind === 'directory', openable = row.path !== null
      const decoration = row.path === null ? undefined : directory ? undefined : decorations?.files.get(row.path)
      const folderTone = row.path !== null && directory ? decorations?.folders.get(row.path) : undefined
      const ignored = row.path !== null && !!decorations?.ignored(row.path)
      const gitLabel = decoration?.label ?? (folderTone ? `包含${FOLDER_GIT_LABELS[folderTone]}` : ignored ? '已忽略' : undefined)
      const tip = row.kind === 'symlink' ? FILES_TEXT.symlinkTip(row.linkTarget) : row.kind === 'other' ? FILES_TEXT.otherTip : !openable ? FILES_TEXT.invalidName : undefined
      const chosen = openable && row.path === selected
      const isMarked = openable && markedSet.has(row.path!)
      const classes = ['files-row', chosen ? 'is-selected' : '', isMarked ? 'is-marked' : '', ignored ? 'is-ignored' : '',
        row.path !== null && cutSet.has(row.path) ? 'is-cut' : '', directory && row.path === dropTarget ? 'is-drop-target' : ''].filter(Boolean).join(' ')
      return [input, <div
        key={row.id} role="treeitem" className={classes}
        ref={element => { if (element) elements.current.set(row.id, element); else elements.current.delete(row.id) }}
        tabIndex={row.id === stopId ? 0 : -1}
        aria-level={row.depth + 1} aria-posinset={row.posInSet} aria-setsize={row.setSize}
        aria-expanded={directory ? row.expanded : undefined}
        aria-selected={openable ? isMarked || chosen : undefined}
        aria-disabled={openable ? undefined : true}
        aria-label={gitLabel ? [displayName(row.name), row.kind === 'symlink' ? FILES_TEXT.symlink : row.kind === 'other' ? FILES_TEXT.other : undefined, gitLabel].filter(Boolean).join('，') : undefined}
        data-kind={row.kind}
        data-git={decoration?.tone ?? folderTone}
        title={tip ?? (decoration ? `${displayName(row.name)} · ${decoration.label}` : displayName(row.name))}
        style={indent}
        draggable={openable}
        onFocus={() => setFocusId(row.id)}
        onClick={event => onClick(event, row)}
        onDoubleClick={() => { if (!directory) activate(row, true) }}
        onKeyDown={event => onKeyDown(event, row)}
        onContextMenu={event => { if (!onContextMenu || row.path === null) return; event.preventDefault(); event.stopPropagation(); onContextMenu(row, event) }}
        onDragStart={event => onDragStart(event, row)}
        onDragOver={event => onDragOver(event, row)}
        onDrop={event => onDropRow(event, row)}
        onDragEnd={() => setDropTarget(null)}
      >
        <span className="files-row__chevron" aria-hidden="true">{directory && <Icon name="chevron" size={12} />}</span>
        <FileIcon name={row.name} kind={row.kind} expanded={row.expanded} />
        <span className="files-row__name">{displayName(row.name)}</span>
        {row.kind === 'symlink' && <span className="files-row__badge">{FILES_TEXT.symlink}</span>}
        {row.kind === 'other' && <span className="files-row__badge">{FILES_TEXT.other}</span>}
        {decoration && <span className="files-row__git" aria-hidden="true">{decoration.letter}</span>}
        {folderTone && <span className="files-row__dot" aria-hidden="true" />}
      </div>]
    })}
    {createAt && createIndex >= rows.length && <NameInput key="\u0000create" initial="" depth={createDepth} kind={createAt.kind} onCommit={name => onEditCommit?.(name)} onCancel={() => onEditCancel?.()} />}
  </div>
}
