import { appendFileSync, chmodSync, closeSync, ftruncateSync, openSync, renameSync, symlinkSync, truncateSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FILES_LIMITS } from '@shared/tools/files'
import { decodeText, readTextFile } from './read'
import { createFixture, runningAsRoot, type Fixture } from './test-support'

let fixture: Fixture
afterEach(() => fixture?.cleanup())
const setup = () => (fixture = createFixture())

const utf16le = (text: string, bom = true) => Buffer.concat([bom ? Buffer.from([0xff, 0xfe]) : Buffer.alloc(0), Buffer.from(text, 'utf16le')])
const utf16be = (text: string) => Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(text, 'utf16le').swap16()])

describe('readTextFile: text, encodings and line endings', () => {
  it('reads UTF-8 text with its size, version and line ending', async () => {
    const f = setup()
    f.write('a.txt', 'héllo\nworld\n')
    const result = await readTextFile(f.root, 'a.txt')
    expect(result).toMatchObject({ status: 'ok', size: Buffer.byteLength('héllo\nworld\n'), encoding: 'utf-8', bom: false, lineEnding: 'lf', text: 'héllo\nworld\n' })
    expect(result.status === 'ok' && result.version).toMatch(/^\d+:\d+:13:\d+$/)
  })

  it('reads an empty file', async () => {
    const f = setup()
    f.write('empty', '')
    expect(await readTextFile(f.root, 'empty')).toMatchObject({ status: 'ok', size: 0, text: '', lineEnding: 'none' })
  })

  it('strips a UTF-8 BOM and reports it', async () => {
    const f = setup()
    f.write('bom.txt', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('x = 1\n')]))
    expect(await readTextFile(f.root, 'bom.txt')).toMatchObject({ status: 'ok', encoding: 'utf-8', bom: true, text: 'x = 1\n', size: 9 })
  })

  it('decodes BOM-marked UTF-16 LE and BE, keeping NUL-looking bytes from being called binary', async () => {
    const f = setup()
    f.write('le.txt', utf16le('日本語 ok\r\n'))
    f.write('be.txt', utf16be('日本語 ok\r\n'))
    expect(await readTextFile(f.root, 'le.txt')).toMatchObject({ status: 'ok', encoding: 'utf-16le', bom: true, text: '日本語 ok\r\n', lineEnding: 'crlf' })
    expect(await readTextFile(f.root, 'be.txt')).toMatchObject({ status: 'ok', encoding: 'utf-16be', bom: true, text: '日本語 ok\r\n' })
  })

  it('does not guess: UTF-16 without a BOM is binary, a truncated UTF-16 or a UTF-32 BOM is an unsupported encoding', async () => {
    const f = setup()
    f.write('nobom.txt', utf16le('hello', false))
    f.write('odd.txt', Buffer.concat([utf16le('hello'), Buffer.from([0x41])]))
    f.write('lone-surrogate.txt', Buffer.from([0xff, 0xfe, 0x00, 0xd8, 0x41, 0x00]))
    f.write('utf32.txt', Buffer.from([0xff, 0xfe, 0x00, 0x00, 0x41, 0x00, 0x00, 0x00]))
    expect(await readTextFile(f.root, 'nobom.txt')).toMatchObject({ status: 'unavailable', reason: 'binary' })
    expect(await readTextFile(f.root, 'odd.txt')).toMatchObject({ status: 'unavailable', reason: 'unsupported_encoding' })
    expect(await readTextFile(f.root, 'lone-surrogate.txt')).toMatchObject({ status: 'unavailable', reason: 'unsupported_encoding' })
    expect(await readTextFile(f.root, 'utf32.txt')).toMatchObject({ status: 'unavailable', reason: 'unsupported_encoding' })
  })

  it('reports invalid UTF-8 (Latin-1, GBK) as unsupported instead of showing replacement characters', async () => {
    const f = setup()
    f.write('latin1.txt', Buffer.from([0x63, 0x61, 0x66, 0xe9]))
    f.write('gbk.txt', Buffer.from([0xc4, 0xe3, 0xba, 0xc3]))
    f.write('overlong.txt', Buffer.from([0xc0, 0xaf]))
    for (const name of ['latin1.txt', 'gbk.txt', 'overlong.txt']) {
      expect(await readTextFile(f.root, name), name).toMatchObject({ status: 'unavailable', reason: 'unsupported_encoding' })
    }
  })

  it('reports binary content, including a NUL byte far past the first 8000 bytes', async () => {
    const f = setup()
    f.write('image.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]))
    f.write('late-nul.dat', Buffer.concat([Buffer.alloc(FILES_LIMITS.binarySniffBytes + 100, 0x61), Buffer.from([0x00])]))
    expect(await readTextFile(f.root, 'image.png')).toMatchObject({ status: 'unavailable', reason: 'binary', size: 10 })
    expect(await readTextFile(f.root, 'late-nul.dat')).toMatchObject({ status: 'unavailable', reason: 'binary' })
  })

  it('detects LF, CRLF, mixed, lone CR and none', async () => {
    const f = setup()
    const cases: [string, string][] = [['lf', 'a\nb\n'], ['crlf', 'a\r\nb\r\n'], ['mixed', 'a\r\nb\nc\n'], ['mixed', 'a\rb\r'], ['none', 'single line']]
    for (const [index, [expected, text]] of cases.entries()) {
      f.write(`f${index}`, text)
      expect(await readTextFile(f.root, `f${index}`), JSON.stringify(text)).toMatchObject({ status: 'ok', lineEnding: expected, text })
    }
  })

  it('exposes decodeText for BOM-less data only as UTF-8', () => {
    expect(decodeText(Buffer.from('plain'))).toEqual({ ok: true, encoding: 'utf-8', bom: false, text: 'plain' })
    expect(decodeText(Buffer.from([0x00]))).toEqual({ ok: false, reason: 'binary' })
  })
})

describe('readTextFile: size limits', () => {
  it('accepts exactly the limit and refuses one byte more with the size', async () => {
    const f = setup()
    f.write('exact.txt', 'a'.repeat(100))
    f.write('over.txt', 'a'.repeat(101))
    expect(await readTextFile(f.root, 'exact.txt', undefined, { readBytes: 100 })).toMatchObject({ status: 'ok', size: 100 })
    expect(await readTextFile(f.root, 'over.txt', undefined, { readBytes: 100 })).toEqual({ status: 'unavailable', reason: 'too_large', size: 101 })
  })

  it('refuses a 3 MiB file at the default limit without returning content', async () => {
    const f = setup()
    f.write('big.txt', 'x'.repeat(3 * 1024 * 1024))
    expect(await readTextFile(f.root, 'big.txt')).toEqual({ status: 'unavailable', reason: 'too_large', size: 3 * 1024 * 1024 })
  })

  it('does not allocate for a sparse 10 GiB file: it is classified from the first 8000 bytes', async () => {
    const f = setup()
    const text = join(f.root, 'sparse-text')
    const fd = openSync(text, 'w')
    writeSync(fd, 'a'.repeat(FILES_LIMITS.binarySniffBytes))
    ftruncateSync(fd, 10 * 1024 ** 3)
    closeSync(fd)
    const zeros = join(f.root, 'sparse-zeros')
    writeFileSync(zeros, '')
    truncateSync(zeros, 10 * 1024 ** 3)
    const before = process.memoryUsage().arrayBuffers
    expect(await readTextFile(f.root, 'sparse-text')).toEqual({ status: 'unavailable', reason: 'too_large', size: 10 * 1024 ** 3 })
    expect(await readTextFile(f.root, 'sparse-zeros')).toEqual({ status: 'unavailable', reason: 'binary', size: 10 * 1024 ** 3 })
    expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(8 * 1024 * 1024)
  })

  it('calls a large UTF-16 text file too large, not binary', async () => {
    const f = setup()
    f.write('big16.txt', utf16le('a'.repeat(2000)))
    expect(await readTextFile(f.root, 'big16.txt', undefined, { readBytes: 1000 })).toMatchObject({ status: 'unavailable', reason: 'too_large' })
  })
})

describe('readTextFile: version tokens', () => {
  it('answers unchanged for the current version and a full read for a stale one', async () => {
    const f = setup()
    const path = f.write('v.txt', 'one')
    const first = await readTextFile(f.root, 'v.txt')
    if (first.status !== 'ok') throw new Error('expected ok')
    expect(await readTextFile(f.root, 'v.txt', first.version)).toEqual({ status: 'unchanged', version: first.version })
    appendFileSync(path, 'two')
    const second = await readTextFile(f.root, 'v.txt', first.version)
    expect(second).toMatchObject({ status: 'ok', text: 'onetwo' })
    expect(second.status === 'ok' && second.version).not.toBe(first.version)
  })

  it('changes the version when the file is replaced by another file with identical content', async () => {
    const f = setup()
    const path = f.write('v.txt', 'same')
    const first = await readTextFile(f.root, 'v.txt')
    writeFileSync(`${path}.new`, 'same')
    renameSync(`${path}.new`, path)
    const second = await readTextFile(f.root, 'v.txt')
    expect(second.status === 'ok' && first.status === 'ok' && second.version !== first.version).toBe(true)
  })

  it('never answers unchanged for a file that is no longer readable', async () => {
    const f = setup()
    const path = f.write('v.txt', 'one')
    const first = await readTextFile(f.root, 'v.txt')
    if (first.status !== 'ok') throw new Error('expected ok')
    renameSync(path, join(f.base, 'gone.txt'))
    expect(await readTextFile(f.root, 'v.txt', first.version)).toEqual({ status: 'unavailable', reason: 'missing' })
  })
})

describe('readTextFile: Project confinement', () => {
  it('refuses links, directories, FIFOs, .git and missing files with distinct reasons', async () => {
    const f = setup()
    f.write('dir/inner')
    f.write('.git/config')
    f.mkfifo('pipe')
    symlinkSync(join(f.outside, 'secret.txt'), join(f.root, 'leak'))
    symlinkSync(f.outside, join(f.root, 'linkdir'))
    expect(await readTextFile(f.root, 'leak')).toEqual({ status: 'unavailable', reason: 'symlink_refused' })
    expect(await readTextFile(f.root, 'linkdir/secret.txt')).toEqual({ status: 'unavailable', reason: 'symlink_refused' })
    expect(await readTextFile(f.root, 'dir')).toEqual({ status: 'unavailable', reason: 'not_file' })
    expect(await readTextFile(f.root, 'pipe')).toEqual({ status: 'unavailable', reason: 'not_file' })
    expect(await readTextFile(f.root, '.git/config')).toEqual({ status: 'unavailable', reason: 'excluded' })
    expect(await readTextFile(f.root, 'nope')).toEqual({ status: 'unavailable', reason: 'missing' })
  })

  it.skipIf(runningAsRoot())('reports permission_denied for a file without read permission', async () => {
    const f = setup()
    chmodSync(f.write('locked.txt', 'x'), 0o000)
    expect(await readTextFile(f.root, 'locked.txt')).toEqual({ status: 'unavailable', reason: 'permission_denied' })
  })

  it('does not deliver content when the path became a symlink to an outside file while it was being read', async () => {
    const f = setup()
    const path = f.write('doc.txt', 'inside')
    const result = await readTextFile(f.root, 'doc.txt', undefined, {
      afterRead: async () => {
        renameSync(path, join(f.base, 'doc.txt.orig'))
        symlinkSync(join(f.outside, 'secret.txt'), path)
      }
    })
    expect(result).toEqual({ status: 'unavailable', reason: 'symlink_refused' })
    expect(JSON.stringify(result)).not.toContain('inside')
  })

  it('does not deliver content when the Project root was swapped for a link while it was being read', async () => {
    const f = setup()
    f.write('doc.txt', 'inside')
    const result = await readTextFile(f.root, 'doc.txt', undefined, {
      afterRead: async () => {
        renameSync(f.root, join(f.base, 'project.moved'))
        symlinkSync(f.outside, f.root)
      }
    })
    expect(result).toEqual({ status: 'unavailable', reason: 'project_unavailable' })
  })

  it('retries when another file was renamed over the path during the read and returns the new content', async () => {
    const f = setup()
    const path = f.write('doc.txt', 'old')
    let swaps = 0
    const result = await readTextFile(f.root, 'doc.txt', undefined, {
      afterRead: async () => {
        if (swaps++) return
        writeFileSync(`${path}.tmp`, 'new')
        renameSync(`${path}.tmp`, path)
      }
    })
    expect(result).toMatchObject({ status: 'ok', text: 'new' })
    expect(swaps).toBe(2)
  })
})

describe('readTextFile: files that change while being read', () => {
  it('retries a file that grew during the read and returns the final content', async () => {
    const f = setup()
    const path = f.write('log.txt', 'line 1\n')
    let calls = 0
    const result = await readTextFile(f.root, 'log.txt', undefined, {
      afterRead: async () => { if (calls++ === 0) appendFileSync(path, 'line 2\n') }
    })
    expect(result).toMatchObject({ status: 'ok', text: 'line 1\nline 2\n', size: 14 })
    expect(calls).toBe(2)
  })

  it('gives up with changed_while_reading after two retries of a file that never settles', async () => {
    const f = setup()
    const path = f.write('hot.txt', 'x')
    let calls = 0
    const result = await readTextFile(f.root, 'hot.txt', undefined, { afterRead: async () => { calls++; appendFileSync(path, 'x') } })
    expect(result).toEqual({ status: 'unavailable', reason: 'changed_while_reading' })
    expect(calls).toBe(3)
  })

  it('treats a file truncated during the read as changed', async () => {
    const f = setup()
    const path = f.write('t.txt', 'abcdef')
    let calls = 0
    const result = await readTextFile(f.root, 't.txt', undefined, { afterRead: async () => { if (calls++ === 0) truncateSync(path, 2) } })
    expect(result).toMatchObject({ status: 'ok', text: 'ab' })
  })

  it('stops with a timeout when asked, leaving no descriptor to wait on', async () => {
    const f = setup()
    f.write('a.txt', 'abc')
    expect(await readTextFile(f.root, 'a.txt', undefined, { shouldStop: () => true })).toEqual({ status: 'unavailable', reason: 'timeout' })
  })
})
