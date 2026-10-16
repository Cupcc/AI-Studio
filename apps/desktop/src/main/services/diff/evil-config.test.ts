// Hostile repository configuration and hostile inputs. Each protection has a positive control: the same trap is
// proven to fire when Git is run without the service's flags, so "marker never appears" cannot be a vacuous pass.
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanEnv, createFixture, createHarness, serviceEnv, type Fixture } from './test-support'

const fixtures: Fixture[] = []
const scratch: string[] = []
const restore: (() => void)[] = []
afterEach(() => {
  for (const undo of restore.splice(0).reverse()) undo()
  for (const fixture of fixtures.splice(0)) fixture.cleanup()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function setEnv(key: string, value: string): void {
  const previous = process.env[key]
  process.env[key] = value
  restore.push(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous })
}

/** A repository whose config tries to run programs when Git diffs, textconv-converts or refreshes the index. */
function evilRepo(extraFiles: Record<string, string> = {}) {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'diff evil ')))
  scratch.push(dir)
  const marker = join(dir, 'MARKER')
  const program = (kind: string) => {
    const path = join(dir, `${kind}.sh`)
    // Prints the file for textconv / external diff so a vulnerable Git would carry on normally.
    writeFileSync(path, `#!/bin/sh\necho ${kind} >> '${marker}'\n[ -n "$1" ] && cat "$1"\nexit 0\n`)
    chmodSync(path, 0o755)
    // Git runs these through a shell: the temporary path contains a space.
    return `'${path}'`
  }
  const fixture = createFixture({ commit: { 'a.txt': 'one\n', '.gitattributes': '*.txt diff=evil\n', ...extraFiles } })
  fixtures.push(fixture)
  fixture.git('config', 'diff.evil.textconv', program('textconv'))
  fixture.git('config', 'diff.evil.command', program('ext'))
  fixture.git('config', 'diff.external', program('ext'))
  fixture.git('config', 'core.fsmonitor', program('fsmonitor'))
  fixture.write('a.txt', 'one\ntwo\n')
  fixture.write('b.txt', 'untracked\n')
  return { fixture, marker, dir }
}

const kinds = (marker: string) => (existsSync(marker) ? new Set(readFileSync(marker, 'utf8').split('\n').filter(Boolean)) : new Set<string>())
const plain = (fixture: Fixture, ...args: string[]) => {
  try {
    execFileSync('git', args, { cwd: fixture.root, env: cleanEnv({ HOME: fixture.root, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }), stdio: ['ignore', 'ignore', 'pipe'] })
  } catch (error) {
    throw new Error(`git ${args.join(' ')} failed: ${String((error as { stderr?: Buffer }).stderr)}`)
  }
}

describe('repository config that would run programs', () => {
  it('positive control: the traps fire for plain git diff (so the marker proves something)', () => {
    const { fixture, marker } = evilRepo()
    plain(fixture, 'diff', 'HEAD', '--no-ext-diff')
    expect(kinds(marker)).toContain('textconv')
    expect(kinds(marker)).toContain('fsmonitor')
    plain(fixture, 'diff', 'HEAD')
    expect(kinds(marker)).toContain('ext')
  })

  it('never runs textconv, external diff or fsmonitor for a snapshot, a tracked file or an untracked file', async () => {
    const { fixture, marker } = evilRepo()
    const { service } = createHarness({ p: fixture.root })
    const snapshot = await service.getSnapshot('p')
    expect(snapshot.files.map((entry) => entry.path)).toEqual(['a.txt', 'b.txt'])
    expect(await service.getFile({ projectId: 'p', path: 'a.txt', oldPath: null })).toMatchObject({ status: 'ok', patch: { text: expect.stringContaining('+two') } })
    expect(await service.getFile({ projectId: 'p', path: 'b.txt', oldPath: null })).toMatchObject({ status: 'ok', patch: { text: expect.stringContaining('+untracked') } })
    expect(existsSync(marker)).toBe(false)
  })

  it('also stays quiet for an unborn repository with the same config', async () => {
    const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'diff evil unborn ')))
    scratch.push(dir)
    const marker = join(dir, 'MARKER')
    const fixture = createFixture({ commit: false })
    fixtures.push(fixture)
    const script = join(dir, 'x.sh')
    writeFileSync(script, `#!/bin/sh\necho x >> '${marker}'\n[ -n "$1" ] && cat "$1"\nexit 0\n`)
    chmodSync(script, 0o755)
    fixture.write('.gitattributes', '*.txt diff=evil\n'); fixture.write('a.txt', 'a\n')
    const quoted = `'${script}'`
    fixture.git('config', 'diff.evil.textconv', quoted); fixture.git('config', 'core.fsmonitor', quoted); fixture.git('config', 'diff.external', quoted)
    const { service } = createHarness({ p: fixture.root })
    expect((await service.getSnapshot('p')).status).toBe('no_head')
    await service.getFile({ projectId: 'p', path: 'a.txt', oldPath: null })
    expect(existsSync(marker)).toBe(false)
  })
})

describe('host environment', () => {
  it('ignores a host GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE: the Project repository is read, not the one the host points at', async () => {
    const mine = createFixture({ commit: { 'mine.txt': 'm\n' }, label: 'mine' })
    const other = createFixture({ commit: { 'other.txt': 'o\n' }, label: 'other' })
    fixtures.push(mine, other)
    mine.write('mine.txt', 'm\nchanged\n')
    other.write('other.txt', 'o\nchanged\n'); other.write('other-new.txt')
    setEnv('GIT_DIR', join(other.root, '.git'))
    setEnv('GIT_WORK_TREE', other.root)
    setEnv('GIT_INDEX_FILE', join(other.root, '.git', 'index'))
    expect(serviceEnv().GIT_DIR).toBeDefined() // the host environment really carries them
    const { service } = createHarness({ p: mine.root })
    expect((await service.getSnapshot('p')).files.map((entry) => entry.path)).toEqual(['mine.txt'])
    expect(await service.getFile({ projectId: 'p', path: 'mine.txt', oldPath: null })).toMatchObject({ status: 'ok', original: { status: 'text', text: 'm\n' } })
  })

  it('drops host GIT_EXTERNAL_DIFF and GIT_CONFIG_COUNT injected config', async () => {
    const { fixture, marker } = evilRepo()
    const script = join(realpathSync.native(tmpdir()), `diff-host-${process.pid}.sh`)
    writeFileSync(script, `#!/bin/sh\necho host >> '${marker}'\nexit 0\n`)
    chmodSync(script, 0o755)
    restore.push(() => rmSync(script, { force: true }))
    setEnv('GIT_EXTERNAL_DIFF', script)
    setEnv('GIT_CONFIG_COUNT', '1'); setEnv('GIT_CONFIG_KEY_0', 'core.fsmonitor'); setEnv('GIT_CONFIG_VALUE_0', script)
    const { service } = createHarness({ p: fixture.root })
    await service.getSnapshot('p')
    await service.getFile({ projectId: 'p', path: 'a.txt', oldPath: null })
    expect(existsSync(marker)).toBe(false)
  })
})

describe('arguments that look like options', () => {
  it('treats a file literally named like an option as a file (never as git --output=...)', async () => {
    const fixture = createFixture({ commit: { '--output=pwn.txt': 'start\n', 'normal.txt': 'n\n' } })
    fixtures.push(fixture)
    fixture.write('--output=pwn.txt', 'start\nedited\n')
    fixture.write('--ext-diff', 'untracked\n')
    const { service } = createHarness({ p: fixture.root })
    const snapshot = await service.getSnapshot('p')
    expect(snapshot.files.map((entry) => entry.path)).toEqual(['--ext-diff', '--output=pwn.txt'])
    const tracked = await service.getFile({ projectId: 'p', path: '--output=pwn.txt', oldPath: null })
    expect(tracked).toMatchObject({ status: 'ok', modified: { status: 'text', text: 'start\nedited\n' }, patch: { text: expect.stringContaining('+edited') } })
    const untracked = await service.getFile({ projectId: 'p', path: '--ext-diff', oldPath: null })
    expect(untracked).toMatchObject({ status: 'ok', patch: { text: expect.stringContaining('+untracked') } })
    expect(existsSync(join(fixture.root, 'pwn.txt'))).toBe(false)
  })

  it('does not let a requested path or oldPath act as an option or a pathspec magic', async () => {
    const fixture = createFixture({ commit: { 'a.txt': 'a\n', 'x.txt': 'x\n', ':(top)x.txt': 'literal\n' } })
    fixtures.push(fixture)
    fixture.write('x.txt', 'x\nchanged\n')
    const outside = realpathSync.native(mkdtempSync(join(tmpdir(), 'diff out ')))
    scratch.push(outside)
    const target = join(outside, 'pwned')
    const { service } = createHarness({ p: fixture.root })
    for (const path of [`--output=${target}`, '--no-index', ':(exclude)a.txt', ':!x.txt', ':(glob)*.txt', '*', '-h']) {
      const result = await service.getFile({ projectId: 'p', path, oldPath: `--output=${target}` })
      expect(result.status === 'unchanged' || result.status === 'unavailable', path).toBe(true)
    }
    expect(existsSync(target)).toBe(false)
    // The magic-looking name is a plain file name: it is unchanged, and x.txt's change is not attributed to it.
    expect(await service.getFile({ projectId: 'p', path: ':(top)x.txt', oldPath: null })).toMatchObject({ status: 'unchanged' })
    expect(await service.getFile({ projectId: 'p', path: 'x.txt', oldPath: null })).toMatchObject({ status: 'ok' })
  })
})
