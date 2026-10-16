import type { FileEntryKind, ProjectPath } from '@shared/tools/files'
import { childPath } from './files-store'
import type { DirListing } from './files-store'
import { directoryReasonText, FILES_TEXT } from './strings'

export interface EntryRow {
  type: 'entry'
  /** Unique, stable row id: the Project path, or a synthetic id for a name that is not a valid path segment. */
  id: string
  /** null: the name cannot form a valid path, so the row is listed but cannot be opened. */
  path: ProjectPath | null
  name: string
  kind: FileEntryKind
  linkTarget?: string
  depth: number
  expanded: boolean
  posInSet: number
  setSize: number
}
/** Loading, empty, truncated and failed states inside the tree. They are announced but never focusable. */
export interface NoteRow { type: 'note'; id: string; depth: number; tone: 'loading' | 'muted' | 'error'; text: string }
export type TreeRow = EntryRow | NoteRow

/** Flattens the loaded directories into the visible rows. Only expanded directories contribute their children. */
export function flattenTree(dirs: ReadonlyMap<ProjectPath, DirListing>, expanded: ReadonlySet<ProjectPath>): TreeRow[] {
  const rows: TreeRow[] = []
  const walk = (dirPath: ProjectPath, depth: number) => {
    const dir = dirs.get(dirPath)
    const note = (suffix: string, tone: NoteRow['tone'], text: string) => rows.push({ type: 'note', id: `${dirPath}\u0000${suffix}`, depth, tone, text })
    if (!dir || (dir.loading && dir.entries.length === 0 && !dir.reason)) { note('loading', 'loading', FILES_TEXT.loading); return }
    if (dir.reason) { note('error', 'error', directoryReasonText(dir.reason)); return }
    dir.entries.forEach((entry, index) => {
      const path = childPath(dirPath, entry.name)
      const isOpen = entry.kind === 'directory' && path !== null && expanded.has(path)
      rows.push({
        type: 'entry', id: path ?? `${dirPath}\u0000${entry.name}`, path, name: entry.name, kind: entry.kind,
        ...(entry.linkTarget === undefined ? {} : { linkTarget: entry.linkTarget }),
        depth, expanded: isOpen, posInSet: index + 1, setSize: dir.entries.length
      })
      if (isOpen && path !== null) walk(path, depth + 1)
    })
    if (dir.entries.length === 0 && !dir.omittedPaths) note('empty', 'muted', FILES_TEXT.emptyDirectory)
    if (dir.omittedPaths) note('omitted-paths', 'muted', FILES_TEXT.omittedPaths)
    if (dir.truncated) note('truncated', 'muted', FILES_TEXT.truncated)
  }
  walk('', 0)
  return rows
}

/** The row to move to for a key press; null leaves focus where it is. */
export function navigate(rows: readonly EntryRow[], currentId: string, key: 'ArrowDown' | 'ArrowUp' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End'): { focus?: string; toggle?: 'expand' | 'collapse' } | null {
  const index = rows.findIndex(row => row.id === currentId)
  const row = rows[index]
  if (!row) return null
  switch (key) {
    case 'ArrowDown': return rows[index + 1] ? { focus: rows[index + 1]!.id } : null
    case 'ArrowUp': return rows[index - 1] ? { focus: rows[index - 1]!.id } : null
    case 'Home': return { focus: rows[0]!.id }
    case 'End': return { focus: rows[rows.length - 1]!.id }
    case 'ArrowRight': {
      if (row.kind !== 'directory' || row.path === null) return null
      if (!row.expanded) return { toggle: 'expand' }
      const next = rows[index + 1]
      return next && next.depth > row.depth ? { focus: next.id } : null
    }
    case 'ArrowLeft': {
      if (row.kind === 'directory' && row.expanded) return { toggle: 'collapse' }
      for (let i = index - 1; i >= 0; i--) if (rows[i]!.depth < row.depth) return { focus: rows[i]!.id }
      return null
    }
  }
}
