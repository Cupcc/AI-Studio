import { execFileSync } from 'node:child_process'
import { afterAll, describe, expect, it } from 'vitest'
import { GIT_DIFF_ARGS } from './git-env'
import { GitParseError, parseDiffListing, parseNameList, parseStageList, splitNul, toProjectPath } from './parse'
import { cleanEnv, createFixture } from './test-support'

const ZERO = '0'.repeat(40)
const sha = (seed: number) => seed.toString(16).padStart(40, 'a')

interface Spec { letter: string; score?: number; oldMode: string; newMode: string; path: string; oldPath?: string; added: number | null; deleted: number | null }

/** Serializes records the way `diff --raw --numstat -z --no-abbrev` does: every raw record, then every numstat record. */
function serialize(specs: Spec[]): Buffer {
  const parts: Buffer[] = []
  const text = (value: string) => Buffer.from(`${value}\0`, 'utf8')
  specs.forEach((spec, index) => {
    parts.push(text(`:${spec.oldMode} ${spec.newMode} ${sha(index + 1)} ${ZERO} ${spec.letter}${spec.score ?? ''}`))
    if (spec.oldPath !== undefined) parts.push(text(spec.oldPath))
    parts.push(text(spec.path))
  })
  for (const spec of specs) {
    const counts = `${spec.added ?? '-'}\t${spec.deleted ?? '-'}\t`
    if (spec.oldPath !== undefined) parts.push(text(counts), text(spec.oldPath), text(spec.path))
    else parts.push(text(`${counts}${spec.path}`))
  }
  return Buffer.concat(parts)
}

// Seeded generator: the same sequence on every run.
function random(seed: number) {
  let state = seed
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32 }
}
const PIECES = ['a', 'b', 'src', ' ', '  ', '\n', '\t', 'é', '日本', '😀', '-', '--x', '*', '?', '[x]', '{a,b}', ':(top)', ':(glob)', ':', '\\', '"', "'", '$HOME', '`x`', '..a', '.hidden', ';', '|', '&', '%']

function name(next: () => number): string {
  let value = ''
  for (let count = 1 + Math.floor(next() * 4); count > 0; count--) value += PIECES[Math.floor(next() * PIECES.length)]
  return value || 'x'
}
function path(next: () => number): string {
  const depth = 1 + Math.floor(next() * 3)
  return Array.from({ length: depth }, () => name(next)).join('/')
}

function specsFor(seed: number, count: number): Spec[] {
  const next = random(seed)
  const letters = ['A', 'M', 'D', 'T', 'U', 'R', 'C']
  return Array.from({ length: count }, (_, index) => {
    const letter = letters[Math.floor(next() * letters.length)]!
    const both = letter === 'R' || letter === 'C'
    const binary = next() < 0.15
    return {
      letter, ...(both ? { score: 50 + Math.floor(next() * 50), oldPath: `${path(next)}-old${index}` } : {}),
      oldMode: letter === 'A' ? '000000' : next() < 0.1 ? '120000' : '100644', newMode: letter === 'D' ? '000000' : next() < 0.1 ? '160000' : '100755',
      path: `${path(next)}-${index}`, added: binary ? null : Math.floor(next() * 100), deleted: binary ? null : Math.floor(next() * 100)
    }
  })
}

describe('parseDiffListing', () => {
  it('round-trips random records with spaces, newlines, tabs, unicode, a leading dash, globs and :(top) in every position', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const specs = specsFor(seed, 25)
      const listing = parseDiffListing(serialize(specs))
      expect(listing.incomplete).toBe(false)
      expect(listing.raw.map((record) => [record.letter, record.path, record.oldPath, record.oldMode, record.newMode, record.score, record.valid])).toEqual(
        specs.map((spec) => [spec.letter, spec.path, spec.oldPath ?? null, spec.oldMode, spec.newMode, spec.score ?? null, true]))
      expect(listing.numstat.map((record) => [record.path, record.oldPath, record.additions, record.deletions])).toEqual(
        specs.map((spec) => [spec.path, spec.oldPath ?? null, spec.added, spec.deleted]))
    }
  })

  it('never throws on a stream cut anywhere (output cap) and only yields complete records that are a prefix of the full parse', () => {
    const specs = specsFor(7, 12)
    const full = serialize(specs)
    const whole = parseDiffListing(full)
    for (let cut = 0; cut < full.length; cut++) {
      const part = parseDiffListing(full.subarray(0, cut))
      expect(part.incomplete || cut === 0 || full[cut - 1] === 0).toBe(true)
      expect(whole.raw.slice(0, part.raw.length)).toEqual(part.raw)
      expect(whole.numstat.slice(0, part.numstat.length)).toEqual(part.numstat)
    }
  })

  it('rejects shapes Git does not produce instead of guessing', () => {
    expect(() => parseDiffListing(Buffer.from(':100644 100644 abc def M\0a\0'))).toThrow(GitParseError)
    expect(() => parseDiffListing(Buffer.from('not a record\0'))).toThrow(GitParseError)
    expect(() => parseDiffListing(Buffer.from(`:100644 100644 ${sha(1)} ${sha(2)} M\0a\0x\ty\tz\0`))).toThrow(GitParseError)
  })

  it('flags paths that are not UTF-8 so the caller can refuse to address them', () => {
    const buffer = Buffer.concat([Buffer.from(`:100644 100644 ${sha(1)} ${ZERO} M\0`), Buffer.from([0x61, 0xff, 0x62, 0]), Buffer.from('1\t0\t'), Buffer.from([0x61, 0xff, 0x62, 0])])
    const listing = parseDiffListing(buffer)
    expect(listing.raw[0]?.valid).toBe(false)
    // numstat and raw decode the same bytes the same way, so they still match by path.
    expect(listing.numstat[0]?.path).toBe(listing.raw[0]?.path)
  })

  it('parses an empty stream and a numstat-only stream', () => {
    expect(parseDiffListing(Buffer.alloc(0))).toEqual({ raw: [], numstat: [], incomplete: false })
    const listing = parseDiffListing(Buffer.from('2\t1\ta b\0'))
    expect(listing.raw).toEqual([])
    expect(listing.numstat).toEqual([{ additions: 2, deletions: 1, path: 'a b', oldPath: null }])
  })
})

describe('name and stage lists', () => {
  it('parses NUL separated names and keeps the nested repository marker', () => {
    expect(parseNameList(Buffer.from('a b\0dir/\0new\nline\0')).names.map((item) => item.path)).toEqual(['a b', 'dir/', 'new\nline'])
    expect(parseNameList(Buffer.from('a\0trunc')).incomplete).toBe(true)
  })
  it('parses ls-files -s / -u records whose path may contain tabs', () => {
    const buffer = Buffer.from(`100644 ${sha(3)} 2\tdir/tab\there.txt\x00120000 ${sha(4)} 0\tlink\0`)
    expect(parseStageList(buffer).records).toEqual([
      { mode: '100644', sha: sha(3), stage: 2, path: 'dir/tab\there.txt', valid: true },
      { mode: '120000', sha: sha(4), stage: 0, path: 'link', valid: true }
    ])
    expect(() => parseStageList(Buffer.from('garbage\0'))).toThrow(GitParseError)
  })
  it('splitNul reports a trailing partial token', () => {
    expect(splitNul(Buffer.from('a\0b\0c'))).toEqual({ tokens: [Buffer.from('a'), Buffer.from('b')], incomplete: true })
  })
  it('toProjectPath applies the shared path rules', () => {
    expect(toProjectPath('a/b c')).toBe('a/b c')
    expect(toProjectPath('a/../b')).toBeNull()
    expect(toProjectPath('/abs')).toBeNull()
    expect(toProjectPath('a//b')).toBeNull()
  })
})

describe('against the real Git CLI (Git 2.39 record shapes verified in SP3)', () => {
  const body = (label: string) => Array.from({ length: 12 }, (_, line) => `${label} line ${line}`).join('\n') + '\n'
  const fixture = createFixture({ label: 'parse' })
  afterAll(() => fixture.cleanup())

  it('parses rename, mode change, typechange, deletion, binary, symlink and every awkward name from real output', () => {
    const awkward = ['sp ace.txt', '-dash.txt', 'uni-é-日本.txt', 'new\nline.txt', 'tab\there.txt', 'glob*?[x].txt', ':(top)x.txt', 'sub dir/in.txt', ':(glob)**.txt']
    const initial: Record<string, string> = {
      'rename-src.txt': body('rename'), 'modeonly.sh': body('mode'), 'typech.txt': body('typ'), 'gone.txt': body('gone')
    }
    for (const file of awkward) initial[file] = body(file)
    for (const [file, content] of Object.entries(initial)) fixture.write(file, content)
    fixture.symlink('rename-src.txt', 'link')
    fixture.commitAll('base')
    fixture.git('mv', 'rename-src.txt', 'renamed.txt')
    fixture.write('renamed.txt', body('rename') + 'extra\n')
    fixture.git('add', '-A')
    fixture.write('modeonly.sh', body('mode'), 0o755)
    fixture.remove('typech.txt'); fixture.symlink('rename-src.txt', 'typech.txt')
    fixture.remove('gone.txt')
    for (const file of awkward) fixture.write(file, body(file) + 'changed\n')
    fixture.write('bin.dat', Buffer.from([1, 2, 0, 3]))
    fixture.git('add', 'bin.dat')
    fixture.remove('link'); fixture.symlink('elsewhere', 'link')

    const output = execFileSync('git', ['-c', 'core.quotepath=false', 'diff', 'HEAD', ...GIT_DIFF_ARGS, '--raw', '--numstat', '-z', '--no-abbrev'], { cwd: fixture.root, env: cleanEnv({ HOME: fixture.root, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }), maxBuffer: 1 << 24 })
    const listing = parseDiffListing(output)
    expect(listing.incomplete).toBe(false)
    const byPath = new Map(listing.raw.map((record) => [record.path, record]))
    for (const file of awkward) {
      expect(byPath.get(file)?.letter, file).toBe('M')
      expect(listing.numstat.find((record) => record.path === file), file).toMatchObject({ additions: 1, deletions: 0 })
    }
    expect(byPath.get('renamed.txt')).toMatchObject({ letter: 'R', oldPath: 'rename-src.txt' })
    expect(byPath.get('renamed.txt')?.score).toBeGreaterThanOrEqual(50)
    expect(listing.numstat.find((record) => record.path === 'renamed.txt')).toMatchObject({ oldPath: 'rename-src.txt', additions: 1, deletions: 0 })
    expect(byPath.get('modeonly.sh')).toMatchObject({ letter: 'M', oldMode: '100644', newMode: '100755' })
    expect(listing.numstat.find((record) => record.path === 'modeonly.sh')).toMatchObject({ additions: 0, deletions: 0 })
    expect(byPath.get('typech.txt')).toMatchObject({ letter: 'T', oldMode: '100644', newMode: '120000' })
    expect(byPath.get('gone.txt')).toMatchObject({ letter: 'D', newMode: '000000' })
    expect(byPath.get('bin.dat')).toMatchObject({ letter: 'A', oldMode: '000000' })
    expect(listing.numstat.find((record) => record.path === 'bin.dat')).toMatchObject({ additions: null, deletions: null })
    expect(byPath.get('link')).toMatchObject({ letter: 'M', oldMode: '120000', newMode: '120000' })
    // Full, unabbreviated ids: the service validates them before using them on a command line.
    for (const record of listing.raw) expect(record.oldSha).toMatch(/^[0-9a-f]{40}$/)
  })
})
