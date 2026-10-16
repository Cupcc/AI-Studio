import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from '../../../app/Icon'
import { navigate, type EntryRow, type TreeRow } from './files-tree'
import { displayName, FILES_TEXT } from './strings'

const NAVIGATION_KEYS = new Set(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'])

/**
 * WAI-ARIA tree: one tab stop (roving tabindex), arrows / Home / End move, Right and Left expand, collapse or step
 * into and out of a directory, Enter and Space activate. Rows are a flat list with aria-level.
 */
export function FileTree({ rows, selected, onToggle, onOpen }: { rows: TreeRow[]; selected: string | null; onToggle(path: string): void; onOpen(path: string): void }) {
  const entries = useMemo(() => rows.filter((row): row is EntryRow => row.type === 'entry'), [rows])
  const [focusId, setFocusId] = useState<string | null>(null)
  const elements = useRef(new Map<string, HTMLDivElement>())
  // The tab stop is the row that last had focus while it exists, else the selected file, else the first row.
  const stopId = entries.some(row => row.id === focusId) ? focusId : entries.some(row => row.id === selected) ? selected : entries[0]?.id ?? null
  const busy = rows.some(row => row.type === 'note' && row.tone === 'loading')

  function activate(row: EntryRow) {
    if (row.path === null) return
    if (row.kind === 'directory') onToggle(row.path)
    else onOpen(row.path)
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>, row: EntryRow) {
    // Keys typed inside a descendant control are not the tree's.
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(row); return }
    if (!NAVIGATION_KEYS.has(event.key)) return
    event.preventDefault()
    const move = navigate(entries, row.id, event.key as Parameters<typeof navigate>[2])
    if (!move) return
    if (move.toggle && row.path !== null) onToggle(row.path)
    if (move.focus) elements.current.get(move.focus)?.focus()
  }

  return <div className="files-tree" role="tree" aria-label={FILES_TEXT.tree} aria-busy={busy}>
    {rows.map(row => {
      const indent = { paddingInlineStart: `calc(var(--space-2) + ${row.depth} * var(--files-indent))` }
      if (row.type === 'note') {
        return <div key={row.id} className={`files-note files-note--${row.tone}`} role="treeitem" aria-disabled="true" aria-level={row.depth + 1} style={indent}>
          {row.tone === 'loading' && <span className="files-skeleton" aria-hidden="true" />}
          <span>{row.text}</span>
        </div>
      }
      const directory = row.kind === 'directory', openable = row.path !== null
      const tip = row.kind === 'symlink' ? FILES_TEXT.symlinkTip(row.linkTarget) : row.kind === 'other' ? FILES_TEXT.otherTip : !openable ? FILES_TEXT.invalidName : undefined
      const chosen = openable && row.path === selected
      return <div
        key={row.id} role="treeitem" className={`files-row ${chosen ? 'is-selected' : ''}`}
        ref={element => { if (element) elements.current.set(row.id, element); else elements.current.delete(row.id) }}
        tabIndex={row.id === stopId ? 0 : -1}
        aria-level={row.depth + 1} aria-posinset={row.posInSet} aria-setsize={row.setSize}
        aria-expanded={directory ? row.expanded : undefined}
        aria-selected={directory ? undefined : chosen}
        aria-disabled={openable ? undefined : true}
        data-kind={row.kind}
        title={tip ?? displayName(row.name)}
        style={indent}
        onFocus={() => setFocusId(row.id)}
        onClick={() => activate(row)}
        onKeyDown={event => onKeyDown(event, row)}
      >
        <span className="files-row__chevron" aria-hidden="true">{directory && <Icon name="chevron" size={12} />}</span>
        <Icon name={directory ? 'files' : 'file'} size={14} />
        <span className="files-row__name">{displayName(row.name)}</span>
        {row.kind === 'symlink' && <span className="files-row__badge">{FILES_TEXT.symlink}</span>}
        {row.kind === 'other' && <span className="files-row__badge">{FILES_TEXT.other}</span>}
      </div>
    })}
  </div>
}
