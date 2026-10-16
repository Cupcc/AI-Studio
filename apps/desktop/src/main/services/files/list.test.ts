import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FILES_LIMITS, parseProjectPath } from '@shared/tools/files'
import { listDirectory } from './list'
import { createFixture, runningAsRoot, type Fixture } from './test-support'

let fixture: Fixture
afterEach(() => fixture?.cleanup())
const setup = () => (fixture = createFixture())
const names = (outcome: Awaited<ReturnType<typeof listDirectory>>) => (outcome.ok ? outcome.entries.map((entry) => entry.name) : outcome.reason)

describe('listDirectory', () => {
  it('lists directories first, then names in numeric order', async () => {
    const f = setup()
    for (const name of ['file10.txt', 'file2.txt', 'file1.txt', 'b.md', 'Alpha.md']) f.write(name)
    for (const name of ['zeta', 'beta']) mkdirSync(join(f.root, name))
    const outcome = await listDirectory(f.root, '', { locale: 'en' })
    expect(outcome).toMatchObject({ ok: true, truncated: false })
    expect(names(outcome)).toEqual(['beta', 'zeta', 'Alpha.md', 'b.md', 'file1.txt', 'file2.txt', 'file10.txt'])
    if (outcome.ok) expect(outcome.entries.map((entry) => entry.kind)).toEqual(['directory', 'directory', 'file', 'file', 'file', 'file', 'file'])
  })

  it('lists an empty directory and nested directories', async () => {
    const f = setup()
    mkdirSync(join(f.root, 'empty'))
    f.write('src/a.ts')
    expect(await listDirectory(f.root, 'empty')).toEqual({ ok: true, entries: [], truncated: false })
    expect(names(await listDirectory(f.root, 'src'))).toEqual(['a.ts'])
  })

  it('never lists .git (at the root or nested, any case) but lists .gitignore', async () => {
    const f = setup()
    f.write('.git/HEAD')
    f.write('.gitignore')
    f.write('sub/.git')
    f.write('sub/keep.txt')
    expect(names(await listDirectory(f.root, ''))).toEqual(['sub', '.gitignore'])
    expect(names(await listDirectory(f.root, 'sub'))).toEqual(['keep.txt'])
    expect(await listDirectory(f.root, '.git')).toEqual({ ok: false, reason: 'excluded' })
    expect(await listDirectory(f.root, '.GIT')).toEqual({ ok: false, reason: 'excluded' })
  })

  it('shows symlinks as symlinks with their raw target, and never follows them', async () => {
    const f = setup()
    f.write('real.txt')
    mkdirSync(join(f.root, 'dir'))
    symlinkSync(f.outside, join(f.root, 'to-outside'))
    symlinkSync(join(f.outside, 'secret.txt'), join(f.root, 'to-secret'))
    symlinkSync('missing-target', join(f.root, 'dangling'))
    symlinkSync('loop-b', join(f.root, 'loop-a'))
    symlinkSync('loop-a', join(f.root, 'loop-b'))
    const outcome = await listDirectory(f.root, '', { locale: 'en' })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const byName = new Map(outcome.entries.map((entry) => [entry.name, entry]))
    expect(byName.get('to-outside')).toEqual({ name: 'to-outside', kind: 'symlink', linkTarget: f.outside })
    expect(byName.get('dangling')).toEqual({ name: 'dangling', kind: 'symlink', linkTarget: 'missing-target' })
    expect(byName.get('loop-a')?.kind).toBe('symlink')
    expect(byName.get('real.txt')).toEqual({ name: 'real.txt', kind: 'file' })
    expect(byName.get('dir')).toEqual({ name: 'dir', kind: 'directory' })
    // The link to the outside directory is not listable.
    expect(await listDirectory(f.root, 'to-outside')).toEqual({ ok: false, reason: 'symlink_refused' })
    expect(await listDirectory(f.root, 'to-outside/secret.txt')).toEqual({ ok: false, reason: 'symlink_refused' })
  })

  it('truncates a link target at 256 characters', async () => {
    const f = setup()
    symlinkSync('t'.repeat(300), join(f.root, 'long'))
    const outcome = await listDirectory(f.root, '')
    expect(outcome.ok && outcome.entries[0]?.linkTarget).toHaveLength(256)
  })

  it('reports other entries (FIFO) as other', async () => {
    const f = setup()
    f.mkfifo('pipe')
    const outcome = await listDirectory(f.root, '')
    expect(outcome).toMatchObject({ ok: true, entries: [{ name: 'pipe', kind: 'other' }] })
  })

  it('keeps special names verbatim: spaces, dashes, glob characters, unicode, emoji, a newline', async () => {
    const f = setup()
    const special = ['a b', '-dash', '*', '[x]', 'ünï-日本', '😀', 'line\nbreak']
    for (const name of special) f.write(name)
    const outcome = await listDirectory(f.root, '')
    expect(outcome.ok && [...outcome.entries.map((entry) => entry.name)].sort()).toEqual([...special].sort())
  })

  it('keeps an NFD name as the filesystem reports it', async () => {
    const f = setup()
    f.write('café.txt')
    expect(names(await listDirectory(f.root, ''))).toEqual(['café.txt'])
  })

  it('lists a legal APFS name of 255 characters as an ordinary file the renderer can request', async () => {
    const f = setup()
    // 255 CJK characters = 765 UTF-8 bytes: legal on APFS and within FILES_LIMITS.nameBytes.
    const long = '日'.repeat(255)
    f.write(long)
    f.write('short.txt')
    const outcome = await listDirectory(f.root, '', { locale: 'en' })
    expect(outcome.ok && outcome.entries).toEqual([{ name: long, kind: 'file' }, { name: 'short.txt', kind: 'file' }].sort((a, b) => a.name.localeCompare(b.name, 'en')))
    expect(() => parseProjectPath(long)).not.toThrow()
  })

  it(`truncates at ${FILES_LIMITS.listEntries} entries and says so; exactly the limit is not truncated`, async () => {
    const f = setup()
    for (let index = 0; index < FILES_LIMITS.listEntries; index++) writeFileSync(join(f.root, `f${String(index).padStart(5, '0')}`), '')
    const exact = await listDirectory(f.root, '')
    expect(exact).toMatchObject({ ok: true, truncated: false })
    expect(exact.ok && exact.entries).toHaveLength(FILES_LIMITS.listEntries)
    writeFileSync(join(f.root, 'one-more'), '')
    const over = await listDirectory(f.root, '')
    expect(over).toMatchObject({ ok: true, truncated: true })
    expect(over.ok && over.entries).toHaveLength(FILES_LIMITS.listEntries)
  })

  it('truncates after sorting, preserving the first directories and numeric file names', async () => {
    const f = setup()
    for (const name of ['file20', 'file1', 'file10', 'file3', 'file2', 'file11']) f.write(name)
    for (const name of ['z-dir', 'a-dir']) mkdirSync(join(f.root, name))
    expect(await listDirectory(f.root, '', { limit: 5, locale: 'en' })).toEqual({
      ok: true, truncated: true, entries: [
        { name: 'a-dir', kind: 'directory' }, { name: 'z-dir', kind: 'directory' },
        { name: 'file1', kind: 'file' }, { name: 'file2', kind: 'file' }, { name: 'file3', kind: 'file' }
      ]
    })
  })

  it('keeps readable siblings and reports omitted paths beyond the path limit', async () => {
    const f = setup()
    const parent = `${'p'.repeat(150)}/${'q'.repeat(150)}`
    f.write(`${parent}/keep.txt`)
    // Creating via cwd avoids the OS absolute-path limit; the relative Project path is beyond our 1024-byte limit.
    execFileSync(process.execPath, ['-e', "require('node:fs').writeFileSync(process.argv[1], '')", '漢'.repeat(255)], { cwd: join(f.root, parent) })
    expect(await listDirectory(f.root, parent)).toEqual({
      ok: true, entries: [{ name: 'keep.txt', kind: 'file' }], truncated: false, omittedPaths: true
    })
  })

  it('does not count the hidden .git entry against the limit', async () => {
    const f = setup()
    mkdirSync(join(f.root, '.git'))
    for (let index = 0; index < 3; index++) f.write(`f${index}`)
    expect(await listDirectory(f.root, '', { limit: 3 })).toMatchObject({ ok: true, truncated: false })
    expect(await listDirectory(f.root, '', { limit: 2 })).toMatchObject({ ok: true, truncated: true })
  })

  it('reports the failure for a missing path, a file, and an unavailable Project', async () => {
    const f = setup()
    f.write('a.txt')
    expect(await listDirectory(f.root, 'nope')).toEqual({ ok: false, reason: 'missing' })
    expect(await listDirectory(f.root, 'a.txt')).toEqual({ ok: false, reason: 'not_directory' })
    rmSync(f.root, { recursive: true })
    expect(await listDirectory(f.root, '')).toEqual({ ok: false, reason: 'project_unavailable' })
  })

  it('refuses to list when the Project root was replaced by a link to another directory', async () => {
    const f = setup()
    renameSync(f.root, join(f.base, 'moved'))
    symlinkSync(f.outside, f.root)
    expect(await listDirectory(f.root, '')).toEqual({ ok: false, reason: 'project_unavailable' })
  })

  it.skipIf(runningAsRoot())('reports permission_denied for an unreadable directory', async () => {
    const f = setup()
    f.write('locked/inner')
    chmodSync(join(f.root, 'locked'), 0o000)
    try { expect(await listDirectory(f.root, 'locked')).toEqual({ ok: false, reason: 'permission_denied' }) }
    finally { chmodSync(join(f.root, 'locked'), 0o755) }
  })

  it('discards a listing when the directory was swapped while it was being read, then gives up', async () => {
    const f = setup()
    f.write('d/a')
    let swaps = 0
    const outcome = await listDirectory(f.root, 'd', {
      afterOpen: async () => {
        // Replace the directory by a new one with the same name (different inode) during every read.
        const stash = join(f.base, `stash-${swaps++}`)
        renameSync(join(f.root, 'd'), stash)
        mkdirSync(join(f.root, 'd'))
        writeFileSync(join(f.root, 'd', 'b'), '')
      }
    })
    expect(outcome).toEqual({ ok: false, reason: 'unreadable' })
    expect(swaps).toBe(2)
  })

  it('stops early when asked to (timeout)', async () => {
    const f = setup()
    f.write('a')
    expect(await listDirectory(f.root, '', { shouldStop: () => true })).toEqual({ ok: false, reason: 'timeout' })
  })
})
