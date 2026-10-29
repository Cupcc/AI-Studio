// Git status in the Files tree, like VS Code's explorer decorations (FR-TOOL-001 2026-10-26). Changes come from the
// project Diff snapshot (same source as the Diff tool, so both agree); ignored entries from `diff.getIgnored`.
import { useEffect, useMemo, useState } from 'react'
import { projectPathParent, type ProjectPath } from '@shared/tools/files'
import type { DiffFileEntry, DiffSnapshot } from '@shared/tools/diff'
import { diffApi } from '../diff/api'
import { useDiff } from '../diff/diff-store'
import { filesApi } from './api'

export type GitTone = 'added' | 'modified' | 'conflict' | 'renamed'
export interface GitDecoration { letter: string; tone: GitTone; label: string }
export interface GitDecorations {
  files: ReadonlyMap<ProjectPath, GitDecoration>
  /** Folders that contain a change: their name takes the strongest tone (no letter), as in VS Code. */
  folders: ReadonlyMap<ProjectPath, GitTone>
  ignored(path: ProjectPath): boolean
}

const RANK: Record<GitTone, number> = { conflict: 3, modified: 2, renamed: 1, added: 1 }

export function decorationOf(entry: DiffFileEntry): GitDecoration | null {
  if (entry.kind === 'deleted') return null
  if (entry.kind === 'conflicted') return { letter: '!', tone: 'conflict', label: '冲突' }
  if (entry.untracked) return { letter: 'U', tone: 'added', label: '未跟踪' }
  if (entry.kind === 'added' || entry.kind === 'copied') return { letter: 'A', tone: 'added', label: '新增' }
  if (entry.kind === 'renamed') return { letter: 'R', tone: 'renamed', label: '重命名' }
  return { letter: 'M', tone: 'modified', label: '已修改' }
}

export function buildDecorations(snapshot: DiffSnapshot | null | undefined, ignored: readonly ProjectPath[]): GitDecorations {
  const files = new Map<ProjectPath, GitDecoration>()
  const folders = new Map<ProjectPath, GitTone>()
  const describesTree = snapshot && (snapshot.status === 'ready' || snapshot.status === 'no_head')
  for (const entry of describesTree ? snapshot.files : []) {
    const decoration = decorationOf(entry)
    // A deleted file has no row, but its folder still shows that something changed.
    const tone: GitTone = decoration?.tone ?? 'modified'
    if (decoration) files.set(entry.path, decoration)
    for (let dir = projectPathParent(entry.path); dir !== ''; dir = projectPathParent(dir)) {
      const current = folders.get(dir)
      if (current && RANK[current] >= RANK[tone]) break
      folders.set(dir, tone)
    }
  }
  const ignoredSet = new Set(ignored)
  return {
    files, folders,
    ignored: (path) => {
      if (!ignoredSet.size) return false
      for (let at = path; at !== ''; at = projectPathParent(at)) if (ignoredSet.has(at)) return true
      return false
    }
  }
}

const IGNORED_REFRESH_MS = 800

/** Keeps the Diff snapshot and the ignored list current while the Files panel is visible. */
export function useGitDecorations(projectId: string, active: boolean): GitDecorations {
  const snapshot = useDiff(state => state.projects[projectId]?.snapshot)
  const [ignored, setIgnored] = useState<readonly ProjectPath[]>([])
  useEffect(() => (active ? useDiff.getState().activate(projectId) : undefined), [projectId, active])
  useEffect(() => {
    if (!active) return undefined
    let disposed = false, timer: ReturnType<typeof setTimeout> | undefined, revision = 0
    const load = () => {
      const asked = ++revision
      // Decoration is a nicety: a missing bridge or a failed query only means no dimming.
      void Promise.resolve().then(() => diffApi().getIgnored({ projectId })).then(result => {
        if (!disposed && asked === revision) setIgnored(result.status === 'ok' ? result.paths : [])
      }).catch(() => { if (!disposed && asked === revision) setIgnored([]) })
    }
    load()
    // New build output or a changed .gitignore changes what is ignored.
    let off = () => {}
    try {
      off = filesApi().onChanged(event => {
        if (event.projectId !== projectId) return
        clearTimeout(timer); timer = setTimeout(load, IGNORED_REFRESH_MS)
      })
    } catch { /* no live updates */ }
    return () => { disposed = true; clearTimeout(timer); off() }
  }, [projectId, active])
  return useMemo(() => buildDecorations(snapshot, ignored), [snapshot, ignored])
}
