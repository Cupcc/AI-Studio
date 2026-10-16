import { chmodSync, linkSync, mkdirSync, realpathSync, renameSync, symlinkSync, truncateSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FILES_LIMITS } from '@shared/tools/files'
import { rejectAll, resolveFileReferences } from './references'
import { createFixture, runningAsRoot, type Fixture } from './test-support'
import * as safePath from './safe-path'

let fixture: Fixture
afterEach(() => { vi.restoreAllMocks(); fixture?.cleanup() })
const setup = () => (fixture = createFixture())

describe('resolveFileReferences', () => {
  it('resolves regular files in input order with name, size, version and the real absolute path', async () => {
    const f = setup()
    f.write('src/a.ts', 'abc')
    f.write('docs/my file.md', 'hello')
    const result = await resolveFileReferences(f.root, ['docs/my file.md', 'src/a.ts'])
    expect(result).toMatchObject({
      status: 'ok',
      files: [
        { path: 'docs/my file.md', name: 'my file.md', size: 5, absolutePath: join(f.root, 'docs/my file.md') },
        { path: 'src/a.ts', name: 'a.ts', size: 3, absolutePath: join(f.root, 'src/a.ts') }
      ]
    })
    if (result.status === 'ok') expect(result.files[0]!.version).toMatch(/^\d+:\d+:5:\d+$/)
  })

  it('accepts binary and large files: a reference is not a content snapshot', async () => {
    const f = setup()
    f.write('logo.png', Buffer.from([0x89, 0x50, 0x00, 0x00]))
    f.write('big.log', 'x'.repeat(3 * 1024 * 1024))
    const result = await resolveFileReferences(f.root, ['logo.png', 'big.log'])
    expect(result).toMatchObject({ status: 'ok', files: [{ path: 'logo.png' }, { path: 'big.log', size: 3 * 1024 * 1024 }] })
  })

  it('collapses exact duplicates and keeps hard links with different real paths separate', async () => {
    const f = setup()
    f.write('a.ts')
    const result = await resolveFileReferences(f.root, ['a.ts', 'a.ts'])
    expect(result.status === 'ok' && result.files.map((file) => file.path)).toEqual(['a.ts'])
    // Hard links are different names and stay separate.
    linkSync(join(f.root, 'a.ts'), join(f.root, 'b.ts'))
    const linked = await resolveFileReferences(f.root, ['a.ts', 'b.ts'])
    expect(linked.status === 'ok' && linked.files).toHaveLength(2)
  })

  it('keeps distinct case and Unicode spellings when the filesystem resolves them to different files', async () => {
    const f = setup()
    const paths = ['A.ts', 'a.ts', 'café.txt', 'café.txt']
    const backing = new Map(paths.map((path, index) => [path, `backing-${index}.txt`]))
    for (const path of backing.values()) f.write(path)
    // Model a case/normalization-sensitive volume even on a default macOS APFS test host.
    const open = safePath.openRegularFile
    const inspect = vi.spyOn(safePath, 'openRegularFile').mockImplementation((root, path) => open(root, backing.get(path) ?? path))
    const result = await resolveFileReferences(f.root, paths)
    expect(inspect.mock.calls.map((call) => call[1])).toEqual(paths)
    expect(result.status === 'ok' && result.files.map((file) => file.path)).toEqual(paths)
    expect(result.status === 'ok' && result.files.every((file) => file.aliases === undefined)).toBe(true)
  })

  it('records every filesystem-verified alias while retaining each distinct real path on the actual volume', async () => {
    const f = setup()
    const paths = ['Alias.ts', 'alias.ts', 'café.txt', 'café.txt']
    for (const path of paths) f.write(path)
    const expected = new Map<string, { path: string; aliases: string[] }>()
    for (const path of paths) {
      const real = realpathSync.native(join(f.root, path))
      const first = expected.get(real)
      if (first) first.aliases.push(path)
      else expected.set(real, { path, aliases: [] })
    }
    const result = await resolveFileReferences(f.root, paths)
    expect(result.status === 'ok' && result.files.map((file) => ({ path: file.path, aliases: file.aliases ?? [] }))).toEqual([...expected.values()])
  })

  it('checks a differently normalized spelling instead of hiding its filesystem failure', async () => {
    const f = setup()
    f.write('café.txt')
    const open = safePath.openRegularFile
    vi.spyOn(safePath, 'openRegularFile').mockImplementation((root, path) => path === 'café.txt' ? Promise.resolve({ ok: false, reason: 'missing' }) : open(root, path))
    expect(await resolveFileReferences(f.root, ['café.txt', 'café.txt'])).toEqual({ status: 'rejected', failures: [{ path: 'café.txt', reason: 'missing' }] })
  })

  it('rejects the 21st distinct path with too_many while still checking the others', async () => {
    const f = setup()
    const paths = Array.from({ length: FILES_LIMITS.referencesPerMessage + 1 }, (_, index) => `f${index}.txt`)
    for (const path of paths) f.write(path)
    expect(await resolveFileReferences(f.root, paths)).toEqual({ status: 'rejected', failures: [{ path: 'f20.txt', reason: 'too_many' }] })
    expect(await resolveFileReferences(f.root, paths.slice(0, 20))).toMatchObject({ status: 'ok' })
    // Duplicates do not count against the limit.
    expect(await resolveFileReferences(f.root, [...paths.slice(0, 20), 'f0.txt'])).toMatchObject({ status: 'ok' })
  })

  it('accepts an empty list', async () => {
    const f = setup()
    expect(await resolveFileReferences(f.root, [])).toEqual({ status: 'ok', files: [] })
  })

  it('rejects directories, the root, links, .git, missing files, pipes, invalid paths and unsupported names, naming each path', async () => {
    const f = setup()
    f.write('dir/inner.txt')
    f.write('.git/config')
    f.write('good.txt')
    f.write('line\nbreak.txt')
    f.write('tab\tname.txt')
    f.mkfifo('pipe')
    symlinkSync(join(f.outside, 'secret.txt'), join(f.root, 'leak.txt'))
    symlinkSync(f.root, join(f.root, 'self'))
    const result = await resolveFileReferences(f.root, [
      'good.txt', 'dir', '', 'leak.txt', 'self/good.txt', '.git/config', '.GIT/config', 'missing.txt', 'pipe', '../escape.txt', '/etc/passwd', 'line\nbreak.txt', 'tab\tname.txt'
    ])
    expect(result).toEqual({
      status: 'rejected',
      failures: [
        { path: 'dir', reason: 'not_file' },
        { path: '', reason: 'not_file' },
        { path: 'leak.txt', reason: 'symlink_refused' },
        { path: 'self/good.txt', reason: 'symlink_refused' },
        { path: '.git/config', reason: 'excluded' },
        { path: '.GIT/config', reason: 'excluded' },
        { path: 'missing.txt', reason: 'missing' },
        { path: 'pipe', reason: 'not_file' },
        { path: '../escape.txt', reason: 'invalid_path' },
        { path: '/etc/passwd', reason: 'invalid_path' },
        { path: 'line\nbreak.txt', reason: 'name_unsupported' },
        { path: 'tab\tname.txt', reason: 'name_unsupported' }
      ]
    })
  })

  it('references names with spaces, dashes, globs, brackets, unicode and emoji', async () => {
    const f = setup()
    const names = ['my file.md', '-rf', '*', '[abc]', 'ünï-日本.txt', '😀.md', 'back\\slash']
    for (const name of names) f.write(name)
    const result = await resolveFileReferences(f.root, names)
    expect(result.status === 'ok' && result.files.map((file) => file.path)).toEqual(names)
  })

  it.skipIf(runningAsRoot())('rejects a file that cannot be opened for reading', async () => {
    const f = setup()
    chmodSync(f.write('locked.txt'), 0o000)
    expect(await resolveFileReferences(f.root, ['locked.txt'])).toEqual({ status: 'rejected', failures: [{ path: 'locked.txt', reason: 'permission_denied' }] })
  })

  it('re-validates at call time: a file deleted, replaced by a link or turned into a directory after being added is rejected', async () => {
    const f = setup()
    f.write('a.txt')
    f.write('b.txt')
    f.write('c.txt')
    expect(await resolveFileReferences(f.root, ['a.txt', 'b.txt', 'c.txt'])).toMatchObject({ status: 'ok' })
    renameSync(join(f.root, 'a.txt'), join(f.base, 'a.moved'))
    renameSync(join(f.root, 'b.txt'), join(f.base, 'b.moved'))
    symlinkSync(join(f.outside, 'secret.txt'), join(f.root, 'b.txt'))
    renameSync(join(f.root, 'c.txt'), join(f.base, 'c.moved'))
    mkdirSync(join(f.root, 'c.txt'))
    expect(await resolveFileReferences(f.root, ['a.txt', 'b.txt', 'c.txt'])).toEqual({
      status: 'rejected',
      failures: [{ path: 'a.txt', reason: 'missing' }, { path: 'b.txt', reason: 'symlink_refused' }, { path: 'c.txt', reason: 'not_file' }]
    })
  })

  it('reports a Project root that was replaced by a link as project_unavailable for every path', async () => {
    const f = setup()
    f.write('a.txt')
    renameSync(f.root, join(f.base, 'moved'))
    symlinkSync(f.outside, f.root)
    expect(await resolveFileReferences(f.root, ['a.txt', 'secret.txt'])).toEqual({
      status: 'rejected', failures: [{ path: 'a.txt', reason: 'project_unavailable' }, { path: 'secret.txt', reason: 'project_unavailable' }]
    })
  })

  it('stops and reports timeout for the remaining paths', async () => {
    const f = setup()
    f.write('a.txt')
    f.write('b.txt')
    let checks = 0
    const result = await resolveFileReferences(f.root, ['a.txt', 'b.txt'], () => checks++ > 0)
    expect(result).toEqual({ status: 'rejected', failures: [{ path: 'b.txt', reason: 'timeout' }] })
  })

  it('keeps the size of a sparse file without reading it', async () => {
    const f = setup()
    const path = f.write('sparse.bin', '')
    truncateSync(path, 5 * 1024 ** 3)
    expect(await resolveFileReferences(f.root, ['sparse.bin'])).toMatchObject({ status: 'ok', files: [{ size: 5 * 1024 ** 3 }] })
  })
})

describe('rejectAll', () => {
  it('names each distinct path once with the project-level reason', () => {
    expect(rejectAll(['a', 'b', 'a'], 'project_closing')).toEqual({
      status: 'rejected', failures: [{ path: 'a', reason: 'project_closing' }, { path: 'b', reason: 'project_closing' }]
    })
  })
})
