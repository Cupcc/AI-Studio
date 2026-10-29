import { describe, expect, it, afterEach } from 'vitest'
import { searchGlobs } from '@shared/tools/search'
import { ripgrepPath } from '../files/file-index'
import { createFixture, type Fixture } from '../files/test-support'
import { parseSearchRequest } from '../../ipc/search'
import { createSearchService } from './index'
import { previewLine, runSearch, searchArgs } from './ripgrep-search'
import { renameSync, symlinkSync } from 'node:fs'

const fixtures: Fixture[] = []
const fixture = () => { const created = createFixture(); fixtures.push(created); return created }
afterEach(() => { for (const item of fixtures.splice(0)) item.cleanup() })
const options = (query: string, extra: Partial<Parameters<typeof searchArgs>[0]> = {}) => ({ query, isRegex: false, caseSensitive: false, wholeWord: false, include: '', exclude: '', ...extra })
const search = async (root: string, query: string, extra: Partial<Parameters<typeof searchArgs>[0]> = {}, limits?: Parameters<typeof runSearch>[5]) =>
  runSearch(root, await ripgrepPath(), 's1', options(query, extra), new AbortController().signal, limits)

describe('Search (FR-TOOL-005)', () => {
  it('refuses to search a Project root replaced by a link to an outside directory', async () => {
    const { root, outside, write } = fixture()
    write('safe.txt', 'TOP SECRET')
    renameSync(root, `${root}-original`); symlinkSync(outside, root)
    expect(await search(root, 'TOP SECRET')).toMatchObject({ status: 'unavailable', reason: 'project_unavailable' })
  })
  it('maps VS Code include / exclude syntax to ripgrep globs and builds safe arguments', () => {
    expect(searchGlobs(' src, ./docs/ , **/*.md ,')).toEqual(['src', 'src/**', 'docs', 'docs/**', '**/*.md'])
    const args = searchArgs(options('-rf /', { include: 'src', exclude: 'dist' }))
    expect(args.slice(-2)).toEqual(['--regexp', '-rf /'])
    expect(args).toContain('--fixed-strings')
    expect(args).toEqual(expect.arrayContaining(['--glob', 'src/**', '--glob', '!dist/**', '--no-config']))
  })

  it('finds matches with line, column and highlighted ranges, honouring .gitignore and skipping .git', async () => {
    const { root, write } = fixture()
    write('.gitignore', 'dist/\n'); write('src/a.ts', 'const needle = 1\nlet x = "NEEDLE needle"\n'); write('dist/out.js', 'needle'); write('.git/config', 'needle')
    write('docs/中文.md', '前缀 needle 后缀\n')
    const result = await search(root, 'needle')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.files.map(file => file.path).sort()).toEqual(['docs/中文.md', 'src/a.ts'])
    const a = result.files.find(file => file.path === 'src/a.ts')!
    expect(a.matches).toBe(3)
    expect(a.lines[1]).toMatchObject({ line: 2, column: 10, preview: 'let x = "NEEDLE needle"', ranges: [{ start: 9, end: 15 }, { start: 16, end: 22 }] })
    const doc = result.files.find(file => file.path === 'docs/中文.md')!
    expect(doc.lines[0]!.ranges[0]).toEqual({ start: 3, end: 9 })
  })

  it('applies case, whole word, regex, include and exclude, and reports an invalid regex', async () => {
    const { root, write } = fixture()
    write('a.ts', 'Foo foo foobar\n'); write('lib/b.ts', 'foo\n')
    const count = async (query: string, extra: Partial<Parameters<typeof searchArgs>[0]>) => { const result = await search(root, query, extra); return result.status === 'ok' ? result.matches : -1 }
    expect(await count('foo', {})).toBe(4)
    expect(await count('Foo', { caseSensitive: true })).toBe(1)
    expect(await count('foo', { wholeWord: true })).toBe(3)
    expect(await count('fo+bar', { isRegex: true })).toBe(1)
    expect(await count('foo', { include: 'lib' })).toBe(1)
    expect(await count('foo', { exclude: 'lib, a.ts' })).toBe(0)
    expect(await search(root, '(unclosed', { isRegex: true })).toMatchObject({ status: 'invalid', message: expect.stringMatching(/regex/i) })
  })

  it('stops at the match limit and trims long lines around the first match', async () => {
    const { root, write } = fixture()
    write('many.txt', Array.from({ length: 50 }, () => 'hit').join('\n'))
    const result = await search(root, 'hit', {}, { matches: 10, files: 100, previewChars: 240, timeoutMs: 10_000, maxFileSize: '5M' })
    expect(result).toMatchObject({ status: 'ok', limitHit: true })
    expect(result.status === 'ok' && result.matches).toBe(10)
    const long = 'x'.repeat(500) + 'TARGET' + 'y'.repeat(500)
    const trimmed = previewLine(long, [{ start: 500, end: 506 }], 100)
    expect(trimmed.preview.slice(trimmed.ranges[0]!.start, trimmed.ranges[0]!.end)).toBe('TARGET')
    expect(trimmed.preview.startsWith('…') && trimmed.preview.endsWith('…')).toBe(true)
  })

  it('caps submatches before converting a long single line and bounds oversized JSON records', async () => {
    const { root, write } = fixture()
    write('minified.txt', 'a'.repeat(20_000))
    const result = await search(root, 'a')
    expect(result).toMatchObject({ status: 'ok', matches: 10_000, limitHit: true })
    expect(result.status === 'ok' && result.files[0]!.matches).toBe(10_000)
    write('minified.txt', 'a'.repeat(200_000))
    expect(await search(root, 'a')).toMatchObject({ status: 'ok', matches: 0, limitHit: true })
  })

  it('cancels the previous search of the same window and Project, and validates requests', async () => {
    const { root, write } = fixture()
    write('a.txt', 'x\n')
    const service = createSearchService({ projectRoot: () => root, canOperate: () => true, ripgrep: ripgrepPath })
    const first = service.run('p', 'one', options('x'), 1)
    const second = service.run('p', 'two', options('x'), 1)
    expect((await first).status).toBe('cancelled')
    expect(await second).toMatchObject({ status: 'ok', searchId: 'two', matches: 1 })
    expect(() => parseSearchRequest({ projectId: 'p', searchId: 's', ...options(''), extra: 1 })).toThrow()
    expect(() => parseSearchRequest({ projectId: 'p', searchId: 's', ...options('a\nb') })).toThrow()
    expect(parseSearchRequest({ projectId: 'p', searchId: 's', ...options('a') })).toMatchObject({ query: 'a' })
    await service.dispose()
  })
})
