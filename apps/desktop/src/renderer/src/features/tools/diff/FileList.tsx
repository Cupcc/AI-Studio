import { displayName } from '../../../lib/display-path'
import { memo, useRef, useState, type KeyboardEvent } from 'react'
import type { DiffFileEntry } from '@shared/tools/diff'
import { entryLabel, isModeOnly, splitPath } from './diff-format'
import { D, KIND_LETTER } from './strings'
import { Icon } from '../../../app/Icon'

export interface FileListProps {
  files: DiffFileEntry[]
  /** Grouped under their folders (VS Code's "View as Tree"); keyboard order stays the list order. */
  tree?: boolean
  selectedPath: string | null
  /** With no HEAD every file is untracked: the marker would say nothing, so it is hidden there. */
  showUntracked: boolean
  stale: boolean
  onSelect(entry: DiffFileEntry): void
}

function Row({ entry, index, selected, tabbable, showUntracked, onSelect, onFocusRow, onKey, register }: {
  entry: DiffFileEntry; index: number; selected: boolean; tabbable: boolean; showUntracked: boolean
  onSelect(entry: DiffFileEntry): void; onFocusRow(path: string): void
  onKey(event: KeyboardEvent<HTMLElement>, index: number, entry: DiffFileEntry): void
  register(path: string, node: HTMLElement | null): void
}) {
  const { name, dir } = splitPath(entry.path)
  const modeOnly = isModeOnly(entry)
  const renamed = entry.oldPath !== null && entry.oldPath !== entry.path
  return <div role="option" aria-selected={selected} aria-label={entryLabel(entry, showUntracked)} title={displayName(entry.path)}
    className={`diff-row ${selected ? 'is-selected' : ''}`} tabIndex={tabbable ? 0 : -1} ref={node => register(entry.path, node)}
    onClick={() => onSelect(entry)} onFocus={() => onFocusRow(entry.path)} onKeyDown={event => onKey(event, index, entry)}>
    <span className={`diff-badge diff-badge--${entry.kind}`} aria-hidden="true">{KIND_LETTER[entry.kind]}</span>
    <span className="diff-row__body" aria-hidden="true">
      <span className="diff-row__path"><span className="diff-row__name">{displayName(name)}</span>{dir && <span className="diff-row__dir">{displayName(dir)}</span>}</span>
      {renamed && <span className="diff-row__rename">{displayName(entry.oldPath!)} {D.renameArrow} {displayName(entry.path)}</span>}
      {(modeOnly || entry.binary || entry.special || (entry.untracked && showUntracked)) && <span className="diff-row__tags">
        {modeOnly && <span className="diff-tag">{D.modeOnly}</span>}
        {entry.binary && <span className="diff-tag">{D.binary}</span>}
        {entry.special && <span className="diff-tag">{D[entry.special]}</span>}
        {entry.untracked && showUntracked && <span className="diff-tag">{D.untracked}</span>}
      </span>}
    </span>
    {!modeOnly && !entry.binary && (entry.additions !== null || entry.deletions !== null) && <span className="diff-row__counts" aria-hidden="true">
      {!!entry.additions && <span className="diff-count diff-count--add">{D.additions(entry.additions)}</span>}
      {!!entry.deletions && <span className="diff-count diff-count--del">{D.deletions(entry.deletions)}</span>}
    </span>}
  </div>
}

/** Listbox of changed files. Arrow keys / Home / End move focus; Enter or Space opens the file (selecting never loads while arrowing). */
export const FileList = memo(function FileList({ files, tree = false, selectedPath, showUntracked, stale, onSelect }: FileListProps) {
  const [focusPath, setFocusPath] = useState<string | null>(null)
  const nodes = useRef(new Map<string, HTMLElement>())
  const focusIndex = Math.max(0, files.findIndex(file => file.path === (focusPath ?? selectedPath)))
  const moveTo = (index: number) => {
    const target = files[Math.max(0, Math.min(files.length - 1, index))]
    if (!target) return
    setFocusPath(target.path)
    nodes.current.get(target.path)?.focus()
  }
  const onKey = (event: KeyboardEvent<HTMLElement>, index: number, entry: DiffFileEntry) => {
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); moveTo(index + 1); break
      case 'ArrowUp': event.preventDefault(); moveTo(index - 1); break
      case 'Home': event.preventDefault(); moveTo(0); break
      case 'End': event.preventDefault(); moveTo(files.length - 1); break
      case 'Enter': case ' ': event.preventDefault(); onSelect(entry); break
    }
  }
  const register = (path: string, node: HTMLElement | null) => { if (node) nodes.current.set(path, node); else nodes.current.delete(path) }
  const row = (entry: DiffFileEntry, index: number) => <Row key={entry.path} entry={entry} index={index} selected={entry.path === selectedPath} tabbable={index === focusIndex}
    showUntracked={showUntracked} onSelect={onSelect} onFocusRow={setFocusPath} onKey={onKey} register={register} />
  if (tree) {
    // Folder groups in path order; the rows keep their index in `files` so arrow keys move as in the list.
    const groups = new Map<string, { entry: DiffFileEntry; index: number }[]>()
    files.forEach((entry, index) => { const dir = splitPath(entry.path).dir; groups.set(dir, [...(groups.get(dir) ?? []), { entry, index }]) })
    const ordered = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
    return <div className={`diff-list diff-list--tree ${stale ? 'is-stale' : ''}`} role="listbox" aria-label={D.listLabel}>
      {ordered.map(([dir, items]) => <div key={dir || '.'} role="group" aria-label={dir ? displayName(dir) : D.rootFolder} className="diff-group">
        <div className="diff-group__label" aria-hidden="true"><Icon name="files" size={13} /><span>{dir ? displayName(dir) : D.rootFolder}</span></div>
        {items.map(item => row(item.entry, item.index))}
      </div>)}
    </div>
  }
  return <div className={`diff-list ${stale ? 'is-stale' : ''}`} role="listbox" aria-label={D.listLabel}>
    {files.map((entry, index) => row(entry, index))}
  </div>
})
