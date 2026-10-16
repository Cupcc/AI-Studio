import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DIFF_LIMITS, type DiffFileEntry } from '@shared/tools/diff'
import { cleanEnv, createFixture, createHarness, hookRunner, type Fixture } from './test-support'

const fixtures: Fixture[] = []
const scratch: string[] = []
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})
const repo = (commit: Record<string, string> | false = { 'README.md': 'readme\n' }) => {
  const fixture = createFixture({ commit })
  fixtures.push(fixture)
  return fixture
}
const body = (label: string) => Array.from({ length: 14 }, (_, line) => `${label} line ${line}`).join('\n') + '\n'
const byPath = (files: DiffFileEntry[]) => new Map(files.map((entry) => [entry.path, entry]))

describe('project Diff snapshot (real Git repositories)', () => {
  it('reports a clean repository as clean, with branch, short commit and Git version', async () => {
    const fixture = repo()
    const { service } = createHarness({ p: fixture.root })
    const snapshot = await service.getSnapshot('p')
    expect(snapshot).toMatchObject({ projectId: 'p', status: 'clean', settled: true, files: [], truncated: false, repoPrefix: '', detail: null })
    expect(snapshot.head).toEqual({ branch: 'main', commit: fixture.git('rev-parse', '--short=9', 'HEAD').trim(), detached: false })
    expect(snapshot.gitVersion).toMatch(/^\d+\.\d+/)
  })

  it('reports a detached HEAD without a branch', async () => {
    const fixture = repo()
    fixture.git('checkout', '-q', '--detach')
    const snapshot = await createHarness({ p: fixture.root }).service.getSnapshot('p')
    expect(snapshot.head).toMatchObject({ branch: null, detached: true })
  })

  it('shows one entry per file for staged, unstaged and both-at-once changes, relative to HEAD', async () => {
    const fixture = repo({ 'staged.txt': body('s'), 'unstaged.txt': body('u'), 'both.txt': body('b'), 'reverted.txt': body('r') })
    fixture.write('staged.txt', body('s') + 'staged edit\n'); fixture.git('add', 'staged.txt')
    fixture.write('unstaged.txt', body('u') + 'unstaged edit\n')
    fixture.write('both.txt', body('b') + 'staged edit\n'); fixture.git('add', 'both.txt')
    fixture.write('both.txt', body('b') + 'staged edit\nunstaged edit\n')
    // Staged change undone in the work tree: HEAD and work tree agree, so the file is not a change.
    fixture.write('reverted.txt', body('r') + 'x\n'); fixture.git('add', 'reverted.txt'); fixture.write('reverted.txt', body('r'))
    const { service } = createHarness({ p: fixture.root })
    const snapshot = await service.getSnapshot('p')
    expect(snapshot.status).toBe('ready')
    expect(snapshot.files.map((entry) => entry.path)).toEqual(['both.txt', 'staged.txt', 'unstaged.txt'])
    const files = byPath(snapshot.files)
    expect(files.get('both.txt')).toMatchObject({ kind: 'modified', additions: 2, deletions: 0, untracked: false })
    expect(files.get('staged.txt')).toMatchObject({ kind: 'modified', additions: 1, deletions: 0 })
    const both = await service.getFile({ projectId: 'p', path: 'both.txt', oldPath: null })
    expect(both).toMatchObject({ status: 'ok', settled: true })
    if (both.status === 'ok') {
      expect(both.original).toEqual({ status: 'text', text: body('b'), size: body('b').length })
      expect(both.modified).toMatchObject({ status: 'text', text: body('b') + 'staged edit\nunstaged edit\n' })
    }
  })

  it('lists untracked files as added, honours .gitignore, and finds untracked files in new directories', async () => {
    const fixture = repo({ '.gitignore': 'ignored.log\nbuild/\n', 'tracked.txt': 'x\n' })
    fixture.write('new.txt'); fixture.write('deep/er/new.txt'); fixture.write('ignored.log'); fixture.write('build/out.js')
    const snapshot = await createHarness({ p: fixture.root }).service.getSnapshot('p')
    expect(snapshot.files.map((entry) => [entry.path, entry.kind, entry.untracked])).toEqual([
      ['deep/er/new.txt', 'added', true], ['new.txt', 'added', true]
    ])
  })

  it('detects a rename (git mv plus edits) against HEAD, with source, score and counts; getFile carries the old side', async () => {
    const fixture = repo({ 'old name.txt': body('rename'), 'keep.txt': 'k\n' })
    fixture.git('mv', 'old name.txt', 'new name.txt')
    fixture.write('new name.txt', body('rename') + 'extra\n')
    const { service } = createHarness({ p: fixture.root })
    const snapshot = await service.getSnapshot('p')
    const entry = snapshot.files.find((item) => item.kind === 'renamed')
    expect(entry).toMatchObject({ path: 'new name.txt', oldPath: 'old name.txt', additions: 1, deletions: 0, untracked: false })
    expect(entry?.renameScore).toBeGreaterThan(50)
    expect(snapshot.files).toHaveLength(1)
    const file = await service.getFile({ projectId: 'p', path: 'new name.txt', oldPath: 'old name.txt' })
    expect(file.status).toBe('ok')
    if (file.status === 'ok') {
      expect(file.original).toMatchObject({ status: 'text', text: body('rename') })
      expect(file.modified).toMatchObject({ status: 'text', text: body('rename') + 'extra\n' })
      expect(file.patch?.text).toContain('rename from old name.txt')
    }
  })

  it('shows deletions (staged or not), mode-only changes, typechange to a symlink and binary files', async () => {
    const fixture = repo({ 'gone.txt': body('gone'), 'gone-staged.txt': body('gs'), 'run.sh': body('sh'), 'swap.txt': body('swap') })
    fixture.remove('gone.txt')
    fixture.git('rm', '-q', 'gone-staged.txt')
    fixture.write('run.sh', body('sh'), 0o755)
    fixture.remove('swap.txt'); fixture.symlink('run.sh', 'swap.txt')
    fixture.write('image.bin', Buffer.from([0, 1, 2, 3, 0]))
    const snapshot = await createHarness({ p: fixture.root }).service.getSnapshot('p')
    const files = byPath(snapshot.files)
    expect(files.get('gone.txt')).toMatchObject({ kind: 'deleted', newMode: null, additions: 0, deletions: 14 })
    expect(files.get('gone-staged.txt')).toMatchObject({ kind: 'deleted' })
    expect(files.get('run.sh')).toMatchObject({ kind: 'modified', oldMode: '100644', newMode: '100755', additions: 0, deletions: 0 })
    expect(files.get('swap.txt')).toMatchObject({ kind: 'typechange', special: 'symlink' })
    expect(files.get('image.bin')).toMatchObject({ kind: 'added', untracked: true, binary: null })
  })

  it('marks binary tracked changes (numstat "-") and reports binary sides as omitted with the patch text kept', async () => {
    const fixture = repo({ 'blob.bin': 'start\n' })
    fixture.write('blob.bin', Buffer.from([0, 255, 0, 1]))
    const { service } = createHarness({ p: fixture.root })
    const snapshot = await service.getSnapshot('p')
    expect(snapshot.files[0]).toMatchObject({ path: 'blob.bin', binary: true, additions: null, deletions: null })
    const file = await service.getFile({ projectId: 'p', path: 'blob.bin', oldPath: null })
    expect(file).toMatchObject({ status: 'ok', modified: { status: 'omitted', reason: 'binary' } })
    if (file.status === 'ok') expect(file.patch?.text).toContain('Binary files')
  })

  it('treats a modified symlink and a submodule as patch-only entries', async () => {
    const inner = createFixture({ commit: { 'inner.txt': 'i\n' }, label: 'inner' })
    fixtures.push(inner)
    const fixture = repo({ 'target.txt': 'x\n' })
    fixture.symlink('target.txt', 'link')
    fixture.git('add', '-A'); fixture.git('commit', '-q', '-m', 'link')
    fixture.git('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', inner.root, 'sub')
    fixture.git('commit', '-q', '-m', 'submodule')
    fixture.remove('link'); fixture.symlink('other.txt', 'link')
    writeFileSync(join(fixture.root, 'sub', 'inner2.txt'), 'x\n'); execFileSync('git', ['add', '-A'], { cwd: join(fixture.root, 'sub'), env: cleanEnv() })
    execFileSync('git', ['-c', 'user.name=a', '-c', 'user.email=a@b.c', 'commit', '-q', '-m', 'move'], { cwd: join(fixture.root, 'sub'), env: cleanEnv({ HOME: tmpdir() }) })
    const { service } = createHarness({ p: fixture.root })
    const snapshot = await service.getSnapshot('p')
    const files = byPath(snapshot.files)
    expect(files.get('link')).toMatchObject({ special: 'symlink', kind: 'modified' })
    expect(files.get('sub')).toMatchObject({ special: 'submodule', kind: 'modified' })
    const link = await service.getFile({ projectId: 'p', path: 'link', oldPath: null })
    expect(link).toMatchObject({ status: 'ok', original: { status: 'omitted', reason: 'symlink' }, modified: { status: 'omitted', reason: 'symlink' } })
    if (link.status === 'ok') expect(link.patch?.text).toContain('other.txt')
    const sub = await service.getFile({ projectId: 'p', path: 'sub', oldPath: null })
    expect(sub).toMatchObject({ status: 'ok', original: { status: 'omitted', reason: 'submodule' }, modified: { status: 'omitted', reason: 'submodule' } })
    if (sub.status === 'ok') expect(sub.patch?.text).toContain('Subproject commit')
  })

  it('lists an untracked symlink as a symlink and an untracked nested repository as a submodule-like entry', async () => {
    const fixture = repo()
    fixture.symlink('README.md', 'ln')
    const nested = createFixture({ commit: { 'n.txt': 'n\n' }, label: 'nested' })
    fixtures.push(nested)
    execFileSync('cp', ['-R', nested.root, join(fixture.root, 'nestedrepo')])
    const { service } = createHarness({ p: fixture.root })
    const files = byPath((await service.getSnapshot('p')).files)
    expect(files.get('ln')).toMatchObject({ kind: 'added', untracked: true, special: 'symlink' })
    expect(files.get('nestedrepo')).toMatchObject({ kind: 'added', untracked: true, special: 'submodule' })
    expect(await service.getFile({ projectId: 'p', path: 'nestedrepo', oldPath: null })).toMatchObject({ status: 'ok', patch: null, modified: { status: 'omitted', reason: 'submodule' } })
  })

  it('reports merge conflicts, including a modify/delete conflict that leaves the file equal to HEAD', async () => {
    const fixture = repo({ 'both.txt': 'base\n', 'moddel.txt': 'base\n' })
    fixture.git('checkout', '-q', '-b', 'side')
    fixture.write('both.txt', 'side\n'); fixture.git('rm', '-q', 'moddel.txt'); fixture.commitAll('side')
    fixture.git('checkout', '-q', 'main')
    fixture.write('both.txt', 'main\n'); fixture.write('moddel.txt', 'base\nmain edit\n'); fixture.commitAll('main')
    try { fixture.git('merge', 'side') } catch { /* conflicts exit 1 */ }
    const { service } = createHarness({ p: fixture.root })
    const files = byPath((await service.getSnapshot('p')).files)
    expect(files.get('both.txt')?.kind).toBe('conflicted')
    expect(files.get('moddel.txt')?.kind).toBe('conflicted')
    const file = await service.getFile({ projectId: 'p', path: 'moddel.txt', oldPath: null })
    expect(file).toMatchObject({ status: 'ok', entry: { kind: 'conflicted' }, original: { status: 'text', text: 'base\nmain edit\n' } })
  })

  it('works for a Project that is a subdirectory of the repository: relative paths, the repository prefix, nothing from outside', async () => {
    const fixture = repo({ 'pkg/app/a.txt': body('a'), 'other/b.txt': body('b'), 'top.txt': 't\n' })
    fixture.write('pkg/app/a.txt', body('a') + 'x\n'); fixture.write('other/b.txt', body('b') + 'x\n'); fixture.write('top.txt', 'changed\n')
    fixture.write('pkg/new.txt'); fixture.write('other/new.txt')
    const { service } = createHarness({ p: join(fixture.root, 'pkg') })
    const snapshot = await service.getSnapshot('p')
    expect(snapshot.repoPrefix).toBe('pkg')
    expect(snapshot.files.map((entry) => entry.path)).toEqual(['app/a.txt', 'new.txt'])
    const file = await service.getFile({ projectId: 'p', path: 'app/a.txt', oldPath: null })
    expect(file).toMatchObject({ status: 'ok', original: { status: 'text', text: body('a') }, modified: { status: 'text', text: body('a') + 'x\n' } })
  })

  it('says "not a Git directory" for a plain directory and never creates a .git there', async () => {
    const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'diff plain ')))
    scratch.push(dir)
    writeFileSync(join(dir, 'a.txt'), 'x\n')
    const { service } = createHarness({ p: dir })
    expect(await service.getSnapshot('p')).toMatchObject({ status: 'not_git', files: [], head: null })
    expect(await service.getFile({ projectId: 'p', path: 'a.txt', oldPath: null })).toMatchObject({ status: 'unavailable', availability: 'not_git' })
    expect(existsSync(join(dir, '.git'))).toBe(false)
  })

  it('is not fooled by being inside .git: that directory is not a work tree', async () => {
    const fixture = repo()
    const { service } = createHarness({ p: join(fixture.root, '.git') })
    expect((await service.getSnapshot('p')).status).toBe('not_git')
  })

  it('never reports "no changes" for an unborn HEAD: it lists every file as new and says the baseline is missing', async () => {
    const fixture = repo(false)
    fixture.write('a.txt', 'a\n'); fixture.write('dir/b.txt', 'b\n'); fixture.write('staged.txt', 's\n'); fixture.git('add', 'staged.txt')
    fixture.write('staged-then-deleted.txt', 'x\n'); fixture.git('add', 'staged-then-deleted.txt'); fixture.remove('staged-then-deleted.txt')
    const { service } = createHarness({ p: fixture.root })
    const snapshot = await service.getSnapshot('p')
    expect(snapshot.status).toBe('no_head')
    expect(snapshot.head).toEqual({ branch: 'main', commit: null, detached: false })
    expect(snapshot.files.map((entry) => [entry.path, entry.kind, entry.untracked])).toEqual([
      ['a.txt', 'added', true], ['dir/b.txt', 'added', true], ['staged.txt', 'added', true]
    ])
    const file = await service.getFile({ projectId: 'p', path: 'staged.txt', oldPath: null })
    expect(file).toMatchObject({ status: 'ok', original: { status: 'absent' }, modified: { status: 'text', text: 's\n' } })
    if (file.status === 'ok') expect(file.patch?.text).toContain('+s')
    expect(await service.getFile({ projectId: 'p', path: 'staged-then-deleted.txt', oldPath: null })).toMatchObject({ status: 'unchanged' })
    // No commit and no repository were created.
    expect(() => fixture.git('rev-parse', '--verify', '-q', 'HEAD^{commit}')).toThrow()
  })

  it('does not say "clean" for an empty unborn repository either', async () => {
    const fixture = repo(false)
    const snapshot = await createHarness({ p: fixture.root }).service.getSnapshot('p')
    expect(snapshot).toMatchObject({ status: 'no_head', files: [] })
  })

  it('caps a huge untracked set at the file limit and says so', async () => {
    const fixture = repo()
    const dir = join(fixture.root, 'many')
    mkdirSync(dir)
    for (let index = 0; index < 5000; index++) writeFileSync(join(dir, `f${String(index).padStart(5, '0')}.txt`), '')
    const snapshot = await createHarness({ p: fixture.root }).service.getSnapshot('p')
    expect(snapshot.files).toHaveLength(DIFF_LIMITS.files)
    expect(snapshot).toMatchObject({ status: 'ready', truncated: true })
    expect(snapshot.files[0]?.path).toBe('many/f00000.txt')
  }, 30_000)

  it('truncates a 2 MiB patch at 1 MiB and omits a side above the editor limit', async () => {
    const fixture = repo({ 'big.txt': 'seed\n' })
    const text = Array.from({ length: 70_000 }, (_, line) => `line number ${line} with some padding text`).join('\n') + '\n'
    expect(text.length).toBeGreaterThan(2 * 1024 * 1024)
    fixture.write('big.txt', text)
    const { service } = createHarness({ p: fixture.root })
    const file = await service.getFile({ projectId: 'p', path: 'big.txt', oldPath: null })
    expect(file.status).toBe('ok')
    if (file.status === 'ok') {
      expect(file.patch?.truncated).toBe(true)
      expect(file.patch!.text.length).toBeLessThanOrEqual(DIFF_LIMITS.patchBytes)
      expect(file.patch!.text.length).toBeGreaterThan(DIFF_LIMITS.patchBytes / 2)
      expect(file.original).toMatchObject({ status: 'text', text: 'seed\n' })
      expect(file.modified).toMatchObject({ status: 'omitted', reason: 'too_large', size: Buffer.byteLength(text) })
    }
  })

  it('skips paths that cannot be addressed and then refuses to say "clean"', async () => {
    const fixture = repo()
    const hooked = hookRunner(createHarness({}).runner, {
      before: async (request) => {
        if (request.args[0] !== 'diff') return undefined
        const bad = Buffer.concat([Buffer.from(`:100644 100644 ${'a'.repeat(40)} ${'0'.repeat(40)} M\0`), Buffer.from([0x61, 0xff, 0]), Buffer.from('1\t0\t'), Buffer.from([0x61, 0xff, 0])])
        return { kind: 'done', code: 0, stdout: bad, stderr: '', truncated: false }
      }
    })
    const { service } = createHarness({ p: fixture.root }, { wrapRunner: () => hooked })
    const snapshot = await service.getSnapshot('p')
    expect(snapshot).toMatchObject({ status: 'ready', files: [], truncated: true })
    expect(snapshot.detail).toMatch(/1 path skipped/)
  })

  it('reports git output it cannot parse as a failure, never as an empty change list', async () => {
    const fixture = repo()
    const hooked = hookRunner(createHarness({}).runner, {
      before: async (request) => (request.args[0] === 'diff' ? { kind: 'done', code: 0, stdout: Buffer.from('garbage\0'), stderr: '', truncated: false } : undefined)
    })
    const snapshot = await createHarness({ p: fixture.root }, { wrapRunner: () => hooked }).service.getSnapshot('p')
    expect(snapshot.status).toBe('failed')
    expect(snapshot.files).toEqual([])
  })
})
