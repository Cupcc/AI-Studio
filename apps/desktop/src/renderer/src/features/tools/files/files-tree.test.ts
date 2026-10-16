import { describe, expect, it } from 'vitest'
import type { FileEntry } from '@shared/tools/files'
import { dir, file, link } from './fake-files'
import type { DirListing } from './files-store'
import { flattenTree, navigate, type EntryRow } from './files-tree'

const listing = (entries: FileEntry[], extra: Partial<DirListing> = {}): DirListing => ({ entries, truncated: false, reason: null, loading: false, dirty: false, ...extra })
const entries = (rows: ReturnType<typeof flattenTree>) => rows.filter((row): row is EntryRow => row.type === 'entry')

describe('flattenTree', () => {
  const dirs = new Map([
    ['', listing([dir('src'), dir('empty'), file('README.md')])],
    ['src', listing([dir('sub'), file('a.ts')])],
    ['src/sub', listing([file('deep.ts')])],
    ['empty', listing([])]
  ])

  it('lists only the root while nothing is expanded', () => {
    expect(entries(flattenTree(dirs, new Set())).map(row => [row.id, row.depth, row.expanded])).toEqual([['src', 0, false], ['empty', 0, false], ['README.md', 0, false]])
  })

  it('walks expanded directories in order with their depth and position', () => {
    const rows = entries(flattenTree(dirs, new Set(['src', 'src/sub'])))
    expect(rows.map(row => [row.id, row.depth])).toEqual([['src', 0], ['src/sub', 1], ['src/sub/deep.ts', 2], ['src/a.ts', 1], ['empty', 0], ['README.md', 0]])
    expect(rows.find(row => row.id === 'src/a.ts')).toMatchObject({ posInSet: 2, setSize: 2 })
  })

  it('does not descend into a directory that is expanded but whose ancestor is collapsed', () => {
    expect(entries(flattenTree(dirs, new Set(['src/sub']))).map(row => row.id)).toEqual(['src', 'empty', 'README.md'])
  })

  it('adds notes for loading, empty, truncated and failed directories', () => {
    const notes = (map: Map<string, DirListing>, expanded: string[]) => flattenTree(map, new Set(expanded)).flatMap(row => row.type === 'note' ? [[row.tone, row.text, row.depth]] : [])
    expect(notes(new Map(), [])).toEqual([['loading', '正在读取…', 0]])
    expect(notes(new Map([['', listing([], { loading: true })]]), [])).toEqual([['loading', '正在读取…', 0]])
    expect(notes(dirs, ['empty'])).toEqual([['muted', '空目录', 1]])
    expect(notes(new Map([['', listing([file('a')], { truncated: true })]]), [])).toEqual([['muted', '目录条目过多，仅显示前 2000 项', 0]])
    expect(notes(new Map([['', listing([dir('x')])], ['x', listing([], { reason: 'permission_denied' })]]), ['x'])).toEqual([['error', '无权限读取此目录', 1]])
    // A refresh in flight keeps the entries it already has instead of showing a skeleton.
    expect(notes(new Map([['', listing([file('a')], { loading: true })]]), [])).toEqual([])
  })

  it('keeps a symbolic link as a closed leaf and carries its target', () => {
    const rows = entries(flattenTree(new Map([['', listing([link('l', 'target')])]]), new Set(['l'])))
    expect(rows).toEqual([expect.objectContaining({ kind: 'symlink', linkTarget: 'target', expanded: false })])
  })

  it('lists a name that cannot form a valid path without a path', () => {
    const rows = entries(flattenTree(new Map([['', listing([file('a/b')])]]), new Set()))
    expect(rows[0]).toMatchObject({ path: null, name: 'a/b' })
  })
})

describe('navigate', () => {
  const rows = entries(flattenTree(new Map([
    ['', listing([dir('a'), dir('b'), file('c')])], ['a', listing([file('a1'), file('a2')])]
  ]), new Set(['a'])))
  // a, a/a1, a/a2, b, c
  it('moves between neighbours and clamps at both ends', () => {
    expect(navigate(rows, 'a', 'ArrowDown')).toEqual({ focus: 'a/a1' })
    expect(navigate(rows, 'a/a2', 'ArrowDown')).toEqual({ focus: 'b' })
    expect(navigate(rows, 'c', 'ArrowDown')).toBeNull()
    expect(navigate(rows, 'a', 'ArrowUp')).toBeNull()
    expect(navigate(rows, 'c', 'Home')).toEqual({ focus: 'a' })
    expect(navigate(rows, 'a', 'End')).toEqual({ focus: 'c' })
  })

  it('expands a closed directory, then steps into it; collapses an open one, else steps to the parent', () => {
    expect(navigate(rows, 'b', 'ArrowRight')).toEqual({ toggle: 'expand' })
    expect(navigate(rows, 'a', 'ArrowRight')).toEqual({ focus: 'a/a1' })
    expect(navigate(rows, 'c', 'ArrowRight')).toBeNull()
    expect(navigate(rows, 'a', 'ArrowLeft')).toEqual({ toggle: 'collapse' })
    expect(navigate(rows, 'a/a2', 'ArrowLeft')).toEqual({ focus: 'a' })
    expect(navigate(rows, 'b', 'ArrowLeft')).toBeNull()
    expect(navigate(rows, 'missing', 'ArrowDown')).toBeNull()
  })

  it('does not step into an open directory that has no visible child', () => {
    const open = entries(flattenTree(new Map([['', listing([dir('x'), file('y')])], ['x', listing([])]]), new Set(['x'])))
    expect(navigate(open, 'x', 'ArrowRight')).toBeNull()
  })
})
