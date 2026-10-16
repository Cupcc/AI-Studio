import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { DIFF_LIMITS } from '@shared/tools/diff'
import type { GitRunRequest } from './git-runner'
import { createFixture, createHarness, gate, hookRunner, subcommand, type Fixture } from './test-support'

const fixtures: Fixture[] = []
afterEach(() => { for (const fixture of fixtures.splice(0)) fixture.cleanup() })
const repo = (commit: Record<string, string> | false = { 'a.txt': 'one\ntwo\n' }) => {
  const fixture = createFixture({ commit })
  fixtures.push(fixture)
  return fixture
}
const request = (path: string, oldPath: string | null = null) => ({ projectId: 'p', path, oldPath })

describe('getFile', () => {
  it('answers unchanged for a file with no difference and for a path that does not exist', async () => {
    const fixture = repo()
    const { service } = createHarness({ p: fixture.root })
    expect(await service.getFile(request('a.txt'))).toMatchObject({ status: 'unchanged', path: 'a.txt' })
    expect(await service.getFile(request('missing/never.txt'))).toMatchObject({ status: 'unchanged' })
  })

  it('shows a deleted file with its original text and no modified side', async () => {
    const fixture = repo()
    fixture.remove('a.txt')
    const file = await createHarness({ p: fixture.root }).service.getFile(request('a.txt'))
    expect(file).toMatchObject({ status: 'ok', entry: { kind: 'deleted' }, original: { status: 'text', text: 'one\ntwo\n' }, modified: { status: 'absent' } })
    if (file.status === 'ok') expect(file.patch?.text).toContain('-one')
  })

  it('keeps line endings and strips a BOM from both sides alike; UTF-16 with BOM is decoded', async () => {
    const fixture = repo({ 'crlf.txt': 'a\r\nb\r\n', 'bom.txt': '﻿hello\n', 'wide.txt': 'x\n' })
    fixture.write('crlf.txt', 'a\r\nb\r\nc\r\n')
    fixture.write('bom.txt', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hello\nmore\n')]))
    fixture.write('wide.txt', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('wide\n', 'utf16le')]))
    const { service } = createHarness({ p: fixture.root })
    expect(await service.getFile(request('crlf.txt'))).toMatchObject({ original: { text: 'a\r\nb\r\n' }, modified: { text: 'a\r\nb\r\nc\r\n' } })
    expect(await service.getFile(request('bom.txt'))).toMatchObject({ original: { text: 'hello\n' }, modified: { text: 'hello\nmore\n' } })
    expect(await service.getFile(request('wide.txt'))).toMatchObject({ original: { text: 'x\n' }, modified: { status: 'text', text: 'wide\n' } })
  })

  it('does not guess at other encodings: invalid UTF-8 is reported, the other side stays readable', async () => {
    const fixture = repo({ 'latin.txt': 'plain\n' })
    fixture.write('latin.txt', Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]))
    const file = await createHarness({ p: fixture.root }).service.getFile(request('latin.txt'))
    expect(file).toMatchObject({ status: 'ok', original: { status: 'text', text: 'plain\n' }, modified: { status: 'omitted', reason: 'unsupported_encoding' } })
  })

  it('omits an original side above the editor limit and reports its size', async () => {
    const big = 'x'.repeat(DIFF_LIMITS.sideBytes + 10) + '\n'
    const fixture = repo({ 'big.txt': big })
    fixture.write('big.txt', 'small now\n')
    const file = await createHarness({ p: fixture.root }).service.getFile(request('big.txt'))
    expect(file).toMatchObject({ status: 'ok', original: { status: 'omitted', reason: 'too_large', size: big.length }, modified: { status: 'text', text: 'small now\n' } })
  })

  it('never hangs on a FIFO: not listed as untracked, answered unchanged; a tracked file replaced by one is bounded too', async () => {
    const fixture = repo()
    execFileSync('mkfifo', ['pipe'], { cwd: fixture.root })
    const { service } = createHarness({ p: fixture.root })
    expect((await service.getSnapshot('p')).files.map((entry) => entry.path)).not.toContain('pipe')
    expect(await service.getFile(request('pipe'))).toMatchObject({ status: 'unchanged' })
    fixture.remove('a.txt')
    execFileSync('mkfifo', ['a.txt'], { cwd: fixture.root })
    const file = await service.getFile(request('a.txt'))
    expect(['ok', 'unchanged', 'unavailable']).toContain(file.status)
    if (file.status === 'ok') expect(file.modified.status).not.toBe('text')
  }, 20_000)

  it('reports changed_while_reading and settled=false when the file keeps changing, and settles when it stops', async () => {
    const fixture = repo()
    fixture.write('a.txt', 'one\ntwo\nthree\n')
    let changes = 0
    const makeHarness = (limit: number) => {
      changes = 0
      return createHarness({ p: fixture.root }, {
        wrapRunner: (runner) => hookRunner(runner, {
          after: async (req: GitRunRequest) => {
            // Rewrite the file (new size) right after Git listed it, as an editor or an agent would.
            if (subcommand(req) === 'diff' && changes < limit) fixture.write('a.txt', `one\ntwo\nthree\n${'x'.repeat(++changes + 3)}\n`)
            return undefined
          }
        })
      }).service
    }
    const unstable = await makeHarness(99).getFile(request('a.txt'))
    expect(unstable).toMatchObject({ status: 'ok', settled: false, modified: { status: 'omitted', reason: 'changed_while_reading' } })
    expect(changes).toBeGreaterThanOrEqual(3) // every attempt saw the file move
    const transient = await makeHarness(1).getFile(request('a.txt'))
    expect(transient).toMatchObject({ status: 'ok', settled: true, modified: { status: 'text' } })
    if (transient.status === 'ok' && transient.modified.status === 'text') expect(transient.modified.text).toBe('one\ntwo\nthree\nxxxx\n')
  })

  it('a file deleted between the listing and the read is retried and then reported as deleted', async () => {
    const fixture = repo()
    fixture.write('a.txt', 'one\nchanged\n')
    let removed = false
    const { service } = createHarness({ p: fixture.root }, {
      wrapRunner: (runner) => hookRunner(runner, { after: async (req) => { if (subcommand(req) === 'diff' && !removed) { removed = true; fixture.remove('a.txt') } return undefined } })
    })
    expect(await service.getFile(request('a.txt'))).toMatchObject({ status: 'ok', settled: true, entry: { kind: 'deleted' }, modified: { status: 'absent' } })
  })

  it('an untracked file that vanishes while Git is asked for its patch is retried, not reported as a failure', async () => {
    const fixture = repo()
    fixture.write('temp.txt', 'short lived\n')
    let removed = false
    const { service } = createHarness({ p: fixture.root }, {
      wrapRunner: (runner) => hookRunner(runner, { before: async (req) => { if (req.args.includes('--no-index') && !removed) { removed = true; fixture.remove('temp.txt') } return undefined } })
    })
    expect(await service.getFile(request('temp.txt'))).toMatchObject({ status: 'unchanged' })
    expect(removed).toBe(true)
  })

  it('only ever uses blob ids that Git itself printed: anything else in its output is a failure and no object is read', async () => {
    const fixture = repo()
    fixture.write('a.txt', 'changed\n')
    for (const sha of ['g'.repeat(40), '--output=/tmp/pwn'.padEnd(40, 'a'), 'abc']) {
      const calls: GitRunRequest[] = []
      const { service } = createHarness({ p: fixture.root }, {
        wrapRunner: (runner) => hookRunner(runner, {
          before: async (req) => (req.args.includes('--raw')
            ? { kind: 'done' as const, code: 0, stderr: '', truncated: false, stdout: Buffer.from(`:100644 100644 ${sha} ${'0'.repeat(40)} M\0a.txt\0`) }
            : undefined)
        }, calls)
      })
      expect(await service.getFile(request('a.txt')), sha).toMatchObject({ status: 'unavailable', availability: 'failed' })
      expect(calls.some((call) => subcommand(call) === 'cat-file'), sha).toBe(false)
    }
  })

  it('limits concurrent file queries per Project instead of queueing without bound', async () => {
    const fixture = repo()
    fixture.write('a.txt', 'changed\n')
    const held = gate()
    const { service } = createHarness({ p: fixture.root }, {
      wrapRunner: (runner) => hookRunner(runner, { before: async (req) => ((await held.wait(req.signal)) ? undefined : { kind: 'aborted' as const }) })
    })
    const pending = Array.from({ length: 16 }, () => service.getFile(request('a.txt')))
    await expect(service.getFile(request('a.txt'))).rejects.toThrow('Too many')
    held.open()
    expect((await Promise.all(pending)).every((result) => result.status === 'ok')).toBe(true)
    expect(await service.getFile(request('a.txt'))).toMatchObject({ status: 'ok' })
  })

  it('handles an untracked file whose name has spaces, a newline and unicode', async () => {
    const fixture = repo()
    const name = 'dir with space/new\nline é日本.txt'
    fixture.write(name, 'body\n')
    const { service } = createHarness({ p: fixture.root })
    expect((await service.getSnapshot('p')).files.map((entry) => entry.path)).toEqual([name])
    expect(await service.getFile(request(name))).toMatchObject({ status: 'ok', modified: { text: 'body\n' }, patch: { text: expect.stringContaining('+body') } })
  })
})
