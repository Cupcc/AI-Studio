import { chmodSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FILES_LIMITS } from '@shared/tools/files'
import { readTextFile } from './read'
import { createFixture, runningAsRoot, type Fixture } from './test-support'
import { encodeText, writeTextFile } from './write'

let fixture: Fixture
afterEach(() => fixture?.cleanup())
const setup = () => (fixture = createFixture())

async function versionOf(f: Fixture, path: string): Promise<string> {
  const read = await readTextFile(f.root, path)
  if (read.status !== 'ok') throw new Error(`unreadable: ${read.status}`)
  return read.version
}

describe('encodeText', () => {
  it('writes the encoding and BOM the file was read with', () => {
    expect(encodeText('é', 'utf-8', false)).toEqual(Buffer.from([0xc3, 0xa9]))
    expect(encodeText('é', 'utf-8', true)).toEqual(Buffer.from([0xef, 0xbb, 0xbf, 0xc3, 0xa9]))
    expect(encodeText('é', 'utf-16le', true)).toEqual(Buffer.from([0xff, 0xfe, 0xe9, 0x00]))
    expect(encodeText('é', 'utf-16be', true)).toEqual(Buffer.from([0xfe, 0xff, 0x00, 0xe9]))
  })
})

describe('writeTextFile', () => {
  it('writes in place when the file still has the expected version, and returns the new version', async () => {
    const f = setup()
    const absolute = f.write('src/a.ts', 'const a = 1\n')
    chmodSync(absolute, 0o640)
    const before = statSync(absolute)
    const result = await writeTextFile(f.root, 'src/a.ts', 'const a = 22\n', await versionOf(f, 'src/a.ts'), 'utf-8', false)
    expect(result).toMatchObject({ status: 'ok', path: 'src/a.ts', size: 13 })
    expect(readFileSync(absolute, 'utf8')).toBe('const a = 22\n')
    // Same file: inode and permissions are kept.
    const after = statSync(absolute)
    expect(after.ino).toBe(before.ino)
    expect(after.mode & 0o777).toBe(0o640)
    expect(result.status === 'ok' && result.version).toBe(await versionOf(f, 'src/a.ts'))
  })

  it('truncates the tail of a shorter text and keeps hard links pointing at the same content', async () => {
    const f = setup()
    const absolute = f.write('long.txt', 'a much longer original text')
    linkSync(absolute, join(f.root, 'alias.txt'))
    expect(await writeTextFile(f.root, 'long.txt', 'short', await versionOf(f, 'long.txt'), 'utf-8', false)).toMatchObject({ status: 'ok', size: 5 })
    expect(readFileSync(absolute, 'utf8')).toBe('short')
    expect(readFileSync(join(f.root, 'alias.txt'), 'utf8')).toBe('short')
  })

  it('round-trips BOM-marked UTF-16 and a UTF-8 BOM through the reader', async () => {
    const f = setup()
    f.write('le.txt', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('old\r\n', 'utf16le')]))
    f.write('bom.txt', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('old')]))
    expect(await writeTextFile(f.root, 'le.txt', '日本語\r\n', await versionOf(f, 'le.txt'), 'utf-16le', true)).toMatchObject({ status: 'ok' })
    expect(await writeTextFile(f.root, 'bom.txt', 'new', await versionOf(f, 'bom.txt'), 'utf-8', true)).toMatchObject({ status: 'ok' })
    expect(await readTextFile(f.root, 'le.txt')).toMatchObject({ status: 'ok', encoding: 'utf-16le', bom: true, text: '日本語\r\n', lineEnding: 'crlf' })
    expect(await readTextFile(f.root, 'bom.txt')).toMatchObject({ status: 'ok', encoding: 'utf-8', bom: true, text: 'new' })
  })

  it('reports a conflict and writes nothing when the file changed since the edit started', async () => {
    const f = setup()
    const absolute = f.write('a.txt', 'v1')
    const seen = await versionOf(f, 'a.txt')
    writeFileSync(absolute, 'changed by the agent')
    const result = await writeTextFile(f.root, 'a.txt', 'mine', seen, 'utf-8', false)
    expect(result).toEqual({ status: 'conflict', path: 'a.txt', version: await versionOf(f, 'a.txt') })
    expect(readFileSync(absolute, 'utf8')).toBe('changed by the agent')
  })

  it('treats a file replaced under the same name (another inode) as a conflict', async () => {
    const f = setup()
    f.write('a.txt', 'v1')
    const seen = await versionOf(f, 'a.txt')
    f.write('replacement.txt', 'v1')
    renameSync(join(f.root, 'replacement.txt'), join(f.root, 'a.txt'))
    expect(await writeTextFile(f.root, 'a.txt', 'mine', seen, 'utf-8', false)).toMatchObject({ status: 'conflict' })
    expect(readFileSync(join(f.root, 'a.txt'), 'utf8')).toBe('v1')
  })

  it('reports a deleted file as a conflict without a version, and creates it again when asked to', async () => {
    const f = setup()
    const absolute = f.write('dir/a.txt', 'v1')
    const seen = await versionOf(f, 'dir/a.txt')
    rmSync(absolute)
    expect(await writeTextFile(f.root, 'dir/a.txt', 'mine', seen, 'utf-8', false)).toEqual({ status: 'conflict', path: 'dir/a.txt', version: null })
    expect(await writeTextFile(f.root, 'dir/a.txt', 'mine', null, 'utf-8', false)).toMatchObject({ status: 'ok', size: 4 })
    expect(readFileSync(absolute, 'utf8')).toBe('mine')
  })

  it('never replaces something that appeared where a deleted file is created again', async () => {
    const f = setup()
    const absolute = f.write('a.txt', 'appeared meanwhile')
    expect(await writeTextFile(f.root, 'a.txt', 'mine', null, 'utf-8', false)).toEqual({ status: 'conflict', path: 'a.txt', version: await versionOf(f, 'a.txt') })
    expect(readFileSync(absolute, 'utf8')).toBe('appeared meanwhile')
    mkdirSync(join(f.root, 'folder'))
    expect(await writeTextFile(f.root, 'folder', 'mine', null, 'utf-8', false)).toMatchObject({ status: 'failed', reason: 'not_file' })
    symlinkSync(join(f.outside, 'secret.txt'), join(f.root, 'link.txt'))
    expect(await writeTextFile(f.root, 'link.txt', 'mine', null, 'utf-8', false)).toMatchObject({ status: 'failed', reason: 'symlink_refused' })
    expect(readFileSync(join(f.outside, 'secret.txt'), 'utf8')).toBe('TOP SECRET')
  })

  it('refuses symbolic links on the way or at the end, `.git`, and the root, and never writes outside the Project', async () => {
    const f = setup()
    symlinkSync(join(f.outside, 'secret.txt'), join(f.root, 'secret-link'))
    symlinkSync(f.outside, join(f.root, 'out'))
    f.write('.git/config', '[core]')
    const version = 'any'
    expect(await writeTextFile(f.root, 'secret-link', 'x', version, 'utf-8', false)).toMatchObject({ status: 'failed', reason: 'symlink_refused' })
    expect(await writeTextFile(f.root, 'out/secret.txt', 'x', version, 'utf-8', false)).toMatchObject({ status: 'failed', reason: 'symlink_refused' })
    expect(await writeTextFile(f.root, 'out/new.txt', 'x', null, 'utf-8', false)).toMatchObject({ status: 'failed', reason: 'symlink_refused' })
    expect(await writeTextFile(f.root, '.git/config', 'x', version, 'utf-8', false)).toMatchObject({ status: 'failed', reason: 'excluded' })
    expect(await writeTextFile(f.root, '.GIT/hooks', 'x', null, 'utf-8', false)).toMatchObject({ status: 'failed', reason: 'excluded' })
    expect(await writeTextFile(f.root, '', 'x', version, 'utf-8', false)).toMatchObject({ status: 'failed', reason: 'invalid_path' })
    expect(readFileSync(join(f.outside, 'secret.txt'), 'utf8')).toBe('TOP SECRET')
    expect(readFileSync(join(f.root, '.git/config'), 'utf8')).toBe('[core]')
  })

  it('refuses a link swapped in after the version check (the open itself does not follow it)', async () => {
    const f = setup()
    const absolute = f.write('a.txt', 'v1')
    const seen = await versionOf(f, 'a.txt')
    const result = await writeTextFile(f.root, 'a.txt', 'mine', seen, 'utf-8', false, {
      beforeWrite: async () => { rmSync(absolute); symlinkSync(join(f.outside, 'secret.txt'), absolute) }
    })
    // The descriptor still names the original inode (now unlinked): the outside file is untouched, and the save is not
    // reported as done because the name no longer leads to what was written.
    expect(result).toEqual({ status: 'conflict', path: 'a.txt', version: null })
    expect(readFileSync(join(f.outside, 'secret.txt'), 'utf8')).toBe('TOP SECRET')
  })

  it('does not block on a FIFO and reports it as not a file', async () => {
    const f = setup()
    f.mkfifo('pipe')
    expect(await writeTextFile(f.root, 'pipe', 'x', 'any', 'utf-8', false)).toMatchObject({ status: 'failed', reason: 'not_file' })
  })

  it('refuses text beyond the viewer limit and reports missing write permission', async () => {
    const f = setup()
    const absolute = f.write('a.txt', 'v1')
    const seen = await versionOf(f, 'a.txt')
    expect(await writeTextFile(f.root, 'a.txt', 'x'.repeat(FILES_LIMITS.readBytes + 1), seen, 'utf-8', false)).toMatchObject({ status: 'failed', reason: 'too_large' })
    if (runningAsRoot()) return
    chmodSync(absolute, 0o444)
    expect(await writeTextFile(f.root, 'a.txt', 'mine', seen, 'utf-8', false)).toMatchObject({ status: 'failed', reason: 'permission_denied' })
    expect(readFileSync(absolute, 'utf8')).toBe('v1')
  })

  it('reports a missing folder when a deleted file cannot be created again', async () => {
    const f = setup()
    expect(await writeTextFile(f.root, 'gone/a.txt', 'x', null, 'utf-8', false)).toMatchObject({ status: 'failed', reason: 'missing' })
  })
})
