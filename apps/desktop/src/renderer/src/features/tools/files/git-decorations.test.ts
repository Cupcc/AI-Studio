import { describe, expect, it } from 'vitest'
import type { DiffFileEntry, DiffSnapshot } from '@shared/tools/diff'
import { buildDecorations } from './git-decorations'

const entry = (path: string, kind: DiffFileEntry['kind'], untracked = false): DiffFileEntry => ({
  path, oldPath: null, kind, untracked, binary: false, additions: 1, deletions: 0, oldMode: null, newMode: null, renameScore: null, special: null
})
const snapshot = (files: DiffFileEntry[], status: DiffSnapshot['status'] = 'ready'): DiffSnapshot => ({
  projectId: 'p', revision: 1, settled: true, status, head: null, repoPrefix: '', files, truncated: false, detail: null, gitVersion: null, computedAt: 0
})

describe('Git decorations in the Files tree', () => {
  it('letters files like VS Code and colours their folders with the strongest change', () => {
    const decorations = buildDecorations(snapshot([
      entry('src/a.ts', 'modified'), entry('src/new.ts', 'added', true), entry('src/lib/conflict.ts', 'conflicted'),
      entry('docs/old.md', 'deleted'), entry('README.md', 'renamed')
    ]), [])
    expect(decorations.files.get('src/a.ts')).toMatchObject({ letter: 'M', tone: 'modified' })
    expect(decorations.files.get('src/new.ts')).toMatchObject({ letter: 'U', tone: 'added' })
    expect(decorations.files.get('README.md')).toMatchObject({ letter: 'R' })
    expect(decorations.files.has('docs/old.md')).toBe(false)
    expect(decorations.folders.get('src')).toBe('conflict')
    expect(decorations.folders.get('src/lib')).toBe('conflict')
    expect(decorations.folders.get('docs')).toBe('modified')
  })

  it('dims ignored entries and everything below an ignored folder; failures show nothing', () => {
    const decorations = buildDecorations(snapshot([], 'not_git'), ['node_modules', 'debug.log'])
    expect(decorations.ignored('node_modules/pkg/index.js')).toBe(true)
    expect(decorations.ignored('debug.log')).toBe(true)
    expect(decorations.ignored('src/debug.log')).toBe(false)
    expect(decorations.files.size).toBe(0)
  })
})
