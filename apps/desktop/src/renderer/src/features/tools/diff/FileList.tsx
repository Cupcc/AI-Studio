import { displayName } from '../../../lib/display-path'
import { memo, useRef, useState, type KeyboardEvent } from 'react'
import type { DiffFileEntry } from '@shared/tools/diff'
import { entryLabel, isModeOnly, splitPath } from './diff-format'
import { D, KIND_LETTER } from './strings'

export interface FileListProps {
  files: DiffFileEntry[]
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
export const FileList = memo(function FileList({ files, selectedPath, showUntracked, stale, onSelect }: FileListProps) {
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
  return <div className={`diff-list ${stale ? 'is-stale' : ''}`} role="listbox" aria-label={D.listLabel}>
    {files.map((entry, index) => <Row key={entry.path} entry={entry} index={index} selected={entry.path === selectedPath} tabbable={index === focusIndex}
      showUntracked={showUntracked} onSelect={onSelect} onFocusRow={setFocusPath} onKey={onKey} register={register} />)}
  </div>
})
