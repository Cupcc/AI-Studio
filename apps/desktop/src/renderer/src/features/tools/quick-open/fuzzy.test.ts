import { describe, expect, it } from 'vitest'
import { parseQuickOpenQuery, rankPaths, scorePath } from './fuzzy'

const paths = ['src/main/index.ts', 'src/renderer/src/features/tools/files/FilesPanel.tsx', 'src/renderer/src/features/tools/files/files-store.ts',
  'docs/README.md', 'README.md', 'src/main/services/files/index.ts', 'package.json']

describe('Quick Open matching', () => {
  it('parses pieces and a :line suffix like VS Code', () => {
    expect(parseQuickOpenQuery(' files panel ')).toEqual({ pieces: ['files', 'panel'] })
    expect(parseQuickOpenQuery('index.ts:42')).toEqual({ pieces: ['index.ts'], line: 42 })
    expect(parseQuickOpenQuery('./README.md:3:7')).toEqual({ pieces: ['README.md'], line: 3 })
  })

  it('requires the characters in order and returns their positions', () => {
    expect(scorePath('src/main/index.ts', ['xyz'])).toBeNull()
    expect(scorePath('src/main/index.ts', ['idx'])!.positions).toEqual([9, 11, 13])
  })

  it('ranks file-name, word-start and exact matches first', () => {
    expect(rankPaths(paths, parseQuickOpenQuery('readme'), 5).map(item => item.path).slice(0, 2)).toEqual(['README.md', 'docs/README.md'])
    expect(rankPaths(paths, parseQuickOpenQuery('fp'), 1)[0]!.path).toBe('src/renderer/src/features/tools/files/FilesPanel.tsx')
    expect(rankPaths(paths, parseQuickOpenQuery('files store'), 3)[0]!.path).toBe('src/renderer/src/features/tools/files/files-store.ts')
    expect(rankPaths(paths, parseQuickOpenQuery('main index'), 2).map(item => item.path)).toEqual(['src/main/index.ts', 'src/main/services/files/index.ts'])
  })

  it('lists recently opened files first for an empty query and boosts them in results', () => {
    expect(rankPaths(paths, parseQuickOpenQuery(''), 3, ['package.json']).map(item => item.path)).toEqual(['package.json', 'src/main/index.ts', 'src/renderer/src/features/tools/files/FilesPanel.tsx'])
    expect(rankPaths(paths, parseQuickOpenQuery('index'), 1, ['src/main/services/files/index.ts'])[0]!.path).toBe('src/main/services/files/index.ts')
  })
})
