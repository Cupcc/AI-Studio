import { chmodSync, constants, existsSync, mkdirSync, openSync, closeSync, renameSync, symlinkSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { O_NOFOLLOW_ANY, hasExcludedSegment, isExcludedName, openNoFollow, openRegularFile, resolveEntry, rootIsCanonical } from './safe-path'
import { createFixture, runningAsRoot, type Fixture } from './test-support'

let fixture: Fixture
afterEach(() => fixture?.cleanup())
const setup = () => (fixture = createFixture())

describe('resolveEntry', () => {
  it('resolves nested files and directories to the canonical root without following anything', async () => {
    const f = setup()
    f.write('src/deep/a.ts')
    const file = await resolveEntry(f.root, 'src/deep/a.ts', 'file')
    expect(file).toMatchObject({ ok: true, value: { absolute: join(f.root, 'src/deep/a.ts'), real: join(f.root, 'src/deep/a.ts') } })
    expect(await resolveEntry(f.root, 'src/deep', 'directory')).toMatchObject({ ok: true })
    expect(await resolveEntry(f.root, '', 'directory')).toMatchObject({ ok: true, value: { real: f.root } })
  })

  it('refuses a symlink to a file outside the Project, and never reads through it', async () => {
    const f = setup()
    symlinkSync(join(f.outside, 'secret.txt'), join(f.root, 'leak.txt'))
    expect(await resolveEntry(f.root, 'leak.txt', 'file')).toEqual({ ok: false, reason: 'symlink_refused' })
    expect(await openRegularFile(f.root, 'leak.txt')).toEqual({ ok: false, reason: 'symlink_refused' })
  })

  it('refuses a symlink to a directory outside, both as the target and in the middle of the path', async () => {
    const f = setup()
    symlinkSync(f.outside, join(f.root, 'linkdir'))
    expect(await resolveEntry(f.root, 'linkdir', 'directory')).toEqual({ ok: false, reason: 'symlink_refused' })
    expect(await resolveEntry(f.root, 'linkdir/secret.txt', 'file')).toEqual({ ok: false, reason: 'symlink_refused' })
    // A link to a directory INSIDE the Project is refused too: links are never followed (decision H5).
    f.write('real/inner.txt')
    symlinkSync(join(f.root, 'real'), join(f.root, 'alias'))
    expect(await resolveEntry(f.root, 'alias/inner.txt', 'file')).toEqual({ ok: false, reason: 'symlink_refused' })
  })

  it('treats dangling links and link loops as links, not as missing files or errors', async () => {
    const f = setup()
    symlinkSync(join(f.base, 'does-not-exist'), join(f.root, 'dangling'))
    symlinkSync('b', join(f.root, 'a'))
    symlinkSync('a', join(f.root, 'b'))
    for (const name of ['dangling', 'a', 'b']) {
      expect(await resolveEntry(f.root, name, 'file')).toEqual({ ok: false, reason: 'symlink_refused' })
    }
  })

  it('reports missing paths, a file used as a directory, and the wrong kind of leaf', async () => {
    const f = setup()
    f.write('a.txt')
    f.write('dir/b.txt')
    expect(await resolveEntry(f.root, 'nope.txt', 'file')).toEqual({ ok: false, reason: 'missing' })
    expect(await resolveEntry(f.root, 'a.txt/child', 'file')).toEqual({ ok: false, reason: 'missing' })
    expect(await resolveEntry(f.root, 'dir', 'file')).toEqual({ ok: false, reason: 'not_file' })
    expect(await resolveEntry(f.root, 'a.txt', 'directory')).toEqual({ ok: false, reason: 'not_directory' })
  })

  it('answers not_file for a FIFO without opening it (a pipe without a writer would block)', async () => {
    const f = setup()
    f.mkfifo('pipe')
    const started = Date.now()
    expect(await resolveEntry(f.root, 'pipe', 'file')).toEqual({ ok: false, reason: 'not_file' })
    expect(await openRegularFile(f.root, 'pipe')).toEqual({ ok: false, reason: 'not_file' })
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('hides .git at any depth and in any letter case, including a directory that exists', async () => {
    const f = setup()
    f.write('.git/config', 'secret-ish')
    f.write('sub/.git/HEAD')
    f.write('.gitignore')
    for (const path of ['.git', '.git/config', 'sub/.git', 'sub/.git/HEAD', '.GIT/config', '.Git']) {
      expect(await resolveEntry(f.root, path, path.includes('/') ? 'file' : 'directory'), path).toEqual({ ok: false, reason: 'excluded' })
    }
    expect(await resolveEntry(f.root, '.gitignore', 'file')).toMatchObject({ ok: true })
    expect(isExcludedName('.git')).toBe(true)
    expect(isExcludedName('.GIT')).toBe(true)
    expect(isExcludedName('.gitignore')).toBe(false)
    expect(hasExcludedSegment(['a', '.Git', 'b'])).toBe(true)
  })

  it('treats a Project root replaced by a symlink (or moved away) as unavailable', async () => {
    const f = setup()
    f.write('a.txt')
    expect(await rootIsCanonical(f.root)).toBe(true)
    renameSync(f.root, join(f.base, 'moved'))
    symlinkSync(f.outside, f.root)
    expect(await rootIsCanonical(f.root)).toBe(false)
    expect(await resolveEntry(f.root, 'secret.txt', 'file')).toEqual({ ok: false, reason: 'project_unavailable' })
    expect(await resolveEntry(f.root, '', 'directory')).toEqual({ ok: false, reason: 'project_unavailable' })
  })

  it('resolves names that are hostile to shells and globs literally', async () => {
    const f = setup()
    const names = ['with space.txt', '-leading-dash', '*', '[x]', 'üñí-日本語.txt', '😀 emoji.md', 'line\nbreak.txt', 'back\\slash', '--help']
    for (const name of names) f.write(name, name)
    for (const name of names) expect(await resolveEntry(f.root, name, 'file'), JSON.stringify(name)).toMatchObject({ ok: true, value: { absolute: join(f.root, name) } })
    // A glob never matches: only the exact name exists.
    expect(await resolveEntry(f.root, '*.txt', 'file')).toEqual({ ok: false, reason: 'missing' })
  })

  it('finds a file by either Unicode spelling on a normalization-insensitive volume, and by its own spelling anywhere', async () => {
    const f = setup()
    const nfd = 'café.txt', nfc = 'café.txt'
    f.write(nfd)
    expect(await resolveEntry(f.root, nfd, 'file')).toMatchObject({ ok: true })
    const insensitive = existsSync(join(f.root, nfc))
    const byNfc = await resolveEntry(f.root, nfc, 'file')
    // APFS resolves both spellings to the same file; a sensitive volume only knows the created one.
    expect(byNfc.ok).toBe(insensitive)
    if (byNfc.ok) expect(byNfc.value.real).toBe(join(f.root, nfd))
  })

  it.skipIf(runningAsRoot())('reports permission_denied for an unreadable directory in the path', async () => {
    const f = setup()
    f.write('locked/inner.txt')
    chmodSync(join(f.root, 'locked'), 0o000)
    try { expect(await resolveEntry(f.root, 'locked/inner.txt', 'file')).toEqual({ ok: false, reason: 'permission_denied' }) }
    finally { chmodSync(join(f.root, 'locked'), 0o755) }
  })
})

describe('openNoFollow (kernel-level link refusal)', () => {
  it('refuses a final symlink', async () => {
    const f = setup()
    symlinkSync(join(f.outside, 'secret.txt'), join(f.root, 'leak.txt'))
    await expect(openNoFollow(join(f.root, 'leak.txt'))).rejects.toMatchObject({ code: 'ELOOP' })
  })

  it.runIf(process.platform === 'darwin')('refuses a symlink in an intermediate component with O_NOFOLLOW_ANY, which plain O_NOFOLLOW does not', async () => {
    const f = setup()
    symlinkSync(f.outside, join(f.root, 'linkdir'))
    const through = join(f.root, 'linkdir', 'secret.txt')
    await expect(openNoFollow(through)).rejects.toMatchObject({ code: 'ELOOP' })
    // Negative control: the flag the design started from follows the intermediate link (spike SP2).
    const fd = openSync(through, constants.O_RDONLY | constants.O_NOFOLLOW)
    closeSync(fd)
    // And it must not be combined with O_NOFOLLOW: the kernel answers EINVAL.
    await expect(open(join(f.outside, 'secret.txt'), constants.O_RDONLY | constants.O_NOFOLLOW | O_NOFOLLOW_ANY)).rejects.toMatchObject({ code: 'EINVAL' })
    expect(O_NOFOLLOW_ANY).toBe(0x20000000)
  })

  it('opens a regular file and a FIFO without blocking', async () => {
    const f = setup()
    f.write('ok.txt', 'data')
    f.mkfifo('pipe')
    const handle = await openNoFollow(join(f.root, 'ok.txt'))
    await handle.close()
    const pipe = await openNoFollow(join(f.root, 'pipe'))
    expect((await pipe.stat()).isFIFO()).toBe(true)
    await pipe.close()
  })
})

describe('openRegularFile', () => {
  it('returns a handle whose identity matches the lstat of the path', async () => {
    const f = setup()
    f.write('a.txt', 'abc')
    const opened = await openRegularFile(f.root, 'a.txt')
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    expect(opened.file.stats.size).toBe(3n)
    expect(opened.file.stats.ino).toBe(opened.file.entry.stats.ino)
    await opened.file.handle.close()
  })

  it.skipIf(runningAsRoot())('maps an unreadable file to permission_denied', async () => {
    const f = setup()
    const path = f.write('secret.txt')
    chmodSync(path, 0o000)
    expect(await openRegularFile(f.root, 'secret.txt')).toEqual({ ok: false, reason: 'permission_denied' })
  })

  it('does not create or touch anything when the target is missing', async () => {
    const f = setup()
    mkdirSync(join(f.root, 'd'))
    expect(await openRegularFile(f.root, 'd/new.txt')).toEqual({ ok: false, reason: 'missing' })
    expect(existsSync(join(f.root, 'd/new.txt'))).toBe(false)
  })
})
