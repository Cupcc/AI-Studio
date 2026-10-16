import { execFileSync } from 'node:child_process'
import { chmodSync, closeSync, mkdirSync, mkdtempSync, openSync, realpathSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fingerprintProjectFile, readProjectFileBounded } from './safe-read'
import { sleep } from './test-support'

let root = ''
let outside = ''
beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'diff read ')))
  outside = realpathSync.native(mkdtempSync(join(tmpdir(), 'diff outside ')))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

describe('readProjectFileBounded', () => {
  it('reads a regular file and returns a fingerprint that changes with the file', async () => {
    mkdirSync(join(root, 'a b'))
    writeFileSync(join(root, 'a b', 'file.txt'), 'hello')
    const first = await readProjectFileBounded(root, 'a b/file.txt', 100)
    expect(first).toMatchObject({ status: 'ok', size: 5 })
    expect(first.status === 'ok' && first.bytes.toString()).toBe('hello')
    expect(await fingerprintProjectFile(root, 'a b/file.txt')).toMatchObject({ status: 'ok', fingerprint: first.status === 'ok' ? first.fingerprint : '' })
    await sleep(15)
    writeFileSync(join(root, 'a b', 'file.txt'), 'HELLO') // same size, new mtime
    const second = await readProjectFileBounded(root, 'a b/file.txt', 100)
    expect(second.status === 'ok' && first.status === 'ok' && second.fingerprint !== first.fingerprint).toBe(true)
  })

  it('reads exactly cap bytes and refuses cap + 1 without allocating or reading it', async () => {
    writeFileSync(join(root, 'exact'), Buffer.alloc(64, 1))
    writeFileSync(join(root, 'over'), Buffer.alloc(65, 1))
    expect(await readProjectFileBounded(root, 'exact', 64)).toMatchObject({ status: 'ok', size: 64 })
    expect(await readProjectFileBounded(root, 'over', 64)).toMatchObject({ status: 'too_large', size: 65 })
    // A sparse 10 GiB file: only its size is looked at.
    const fd = openSync(join(root, 'sparse'), 'w'); closeSync(fd)
    truncateSync(join(root, 'sparse'), 10 * 1024 ** 3)
    expect(await readProjectFileBounded(root, 'sparse', 1024)).toMatchObject({ status: 'too_large', size: 10 * 1024 ** 3 })
  })

  it('does not follow a symlink as the file, nor through a symlinked directory, whether it points outside or inside', async () => {
    writeFileSync(join(outside, 'secret.txt'), 'secret')
    writeFileSync(join(root, 'real.txt'), 'real')
    symlinkSync(join(outside, 'secret.txt'), join(root, 'leak.txt'))
    symlinkSync('real.txt', join(root, 'inside-link.txt'))
    symlinkSync(outside, join(root, 'linkdir'))
    symlinkSync('missing-target', join(root, 'dangling'))
    for (const path of ['leak.txt', 'inside-link.txt', 'linkdir/secret.txt', 'dangling']) {
      expect(await readProjectFileBounded(root, path, 1000), path).toEqual({ status: 'symlink' })
      expect(await fingerprintProjectFile(root, path), path).toEqual({ status: 'symlink' })
    }
  })

  it('classifies missing paths, directories, a file used as a directory, and a FIFO (never opened)', async () => {
    mkdirSync(join(root, 'dir'))
    writeFileSync(join(root, 'file'), 'x')
    execFileSync('mkfifo', [join(root, 'pipe')])
    expect(await readProjectFileBounded(root, 'nope/file', 10)).toEqual({ status: 'missing' })
    expect(await readProjectFileBounded(root, 'nope', 10)).toEqual({ status: 'missing' })
    expect(await readProjectFileBounded(root, 'dir', 10)).toEqual({ status: 'not_file' })
    expect(await readProjectFileBounded(root, 'file/child', 10)).toEqual({ status: 'not_file' })
    expect(await readProjectFileBounded(root, 'pipe', 10)).toEqual({ status: 'not_file' })
  })

  it('refuses a root that is itself a symlink or not a directory', async () => {
    const link = join(outside, 'rootlink')
    symlinkSync(root, link)
    writeFileSync(join(root, 'f'), 'x')
    expect(await readProjectFileBounded(link, 'f', 10)).toEqual({ status: 'unreadable' })
    expect(await readProjectFileBounded(join(root, 'f'), 'g', 10)).toEqual({ status: 'unreadable' })
  })

  it.skipIf(process.getuid?.() === 0)('reports an unreadable file instead of throwing', async () => {
    writeFileSync(join(root, 'locked'), 'x')
    chmodSync(join(root, 'locked'), 0)
    expect(await readProjectFileBounded(root, 'locked', 10)).toEqual({ status: 'unreadable' })
  })
})
