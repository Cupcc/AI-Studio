import { describe, expect, it } from 'vitest'
import { findLinks, shellQuote, toProjectPath } from './terminal-links'

describe('Terminal links', () => {
  it('finds web addresses without trailing punctuation and marks local ones', () => {
    expect(findLinks('  ➜  Local:   http://localhost:5173/ (ready).').map(link => [link.text, link.target])).toEqual([
      ['http://localhost:5173/', { kind: 'url', url: 'http://localhost:5173/', local: true }]
    ])
    expect(findLinks('see https://example.com/docs, and http://192.168.1.4:3000')[0]!.target).toMatchObject({ local: false })
    expect(findLinks('see https://example.com/docs, and http://192.168.1.4:3000')[1]!.target).toMatchObject({ local: true })
  })

  it('finds file paths with line and column in common compiler formats', () => {
    const targets = (line: string) => findLinks(line).map(link => link.target)
    expect(targets('src/main/index.ts:12:5 - error TS2322')).toEqual([{ kind: 'file', candidate: 'src/main/index.ts', line: 12, column: 5 }])
    expect(targets('at ./lib/a.js(3,9)')).toEqual([{ kind: 'file', candidate: './lib/a.js', line: 3, column: 9 }])
    expect(targets('Makefile:20: recipe failed')).toEqual([{ kind: 'file', candidate: 'Makefile', line: 20 }])
    expect(targets('version 1.2.3 took 12.5s')).toEqual([{ kind: 'file', candidate: '12.5s' }])
    expect(targets('plain words only')).toEqual([])
  })

  it('maps printed paths into the Project and refuses paths outside it', () => {
    expect(toProjectPath('src/a.ts', '/p', '/p')).toBe('src/a.ts')
    expect(toProjectPath('../a.ts', '/p', '/p/src')).toBe('a.ts')
    expect(toProjectPath('/p/docs/x.md', '/p', '/p/src')).toBe('docs/x.md')
    expect(toProjectPath('../../etc/passwd', '/p', '/p/src')).toBeNull()
    expect(toProjectPath('/etc/passwd', '/p', '/p')).toBeNull()
    expect(shellQuote('/p/src/a.ts')).toBe('/p/src/a.ts')
    expect(shellQuote("/p/it's here.ts")).toBe("'/p/it'\\''s here.ts'")
  })

  it.each([
    ['错误 src/中文.ts:3:7', 'src/中文.ts', 3, 7],
    ['at /Users/Chris/Projects/AI Stduio/src/a.ts:3', '/Users/Chris/Projects/AI Stduio/src/a.ts', 3, undefined],
    ['at "src/my file.ts":4:2', 'src/my file.ts', 4, 2],
    ["at 'src/我的 文件.ts:5:6'", 'src/我的 文件.ts', 5, 6],
    ['at src/my\\ file.ts:8', 'src/my file.ts', 8, undefined],
    ['at src/my file.ts:8', 'src/my file.ts', 8, undefined],
    ['at ./src/名é.ts(9,2)', './src/名é.ts', 9, 2]
  ])('keeps the complete Unicode or space-containing path in %s', (text, candidate, line, column) => {
    const links = findLinks(text)
    expect(links).toHaveLength(1)
    expect(links[0]!.target).toEqual({ kind: 'file', candidate, line, ...(column ? { column } : {}) })
    expect(text.slice(links[0]!.start, links[0]!.end)).toBe(links[0]!.text)
  })
})
