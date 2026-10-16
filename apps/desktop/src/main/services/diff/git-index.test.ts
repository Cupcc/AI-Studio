import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFixture, createHarness, serviceEnv, type Fixture } from './test-support'

const fixtures: Fixture[] = []
const linkedRoots: string[] = []
const parents: string[] = []
afterEach(() => {
  for (const root of linkedRoots.splice(0)) rmSync(root, { recursive: true, force: true })
  for (const parent of parents.splice(0)) rmSync(parent, { recursive: true, force: true })
  for (const fixture of fixtures.splice(0)) fixture.cleanup()
})
function cleanGitEnv() {
  const env = serviceEnv()
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key]
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', LC_ALL: 'C' }
}

describe('read-only Git index isolation', () => {
  it('retains racy-index detection for a same-size edit with the same file timestamp', async () => {
    const fixture = createFixture({ commit: false })
    fixtures.push(fixture)
    fixture.git('config', 'core.trustctime', 'false')
    const instant = new Date('2001-09-09T01:46:40.000Z')
    const file = join(fixture.root, 'a.txt')
    fixture.write('a.txt', 'one\n')
    utimesSync(file, instant, instant)
    fixture.commitAll()
    const index = join(fixture.root, '.git', 'index')
    utimesSync(index, instant, instant)
    fixture.write('a.txt', 'two\n')
    utimesSync(file, instant, instant)
    const before = readFileSync(index)
    const beforeMtime = statSync(index, { bigint: true }).mtimeNs
    const { service } = createHarness({ p: fixture.root })
    expect((await service.getSnapshot('p')).files).toEqual([expect.objectContaining({ path: 'a.txt', kind: 'modified' })])
    expect(await service.getFile({ projectId: 'p', path: 'a.txt', oldPath: null })).toMatchObject({
      status: 'ok', original: { text: 'one\n' }, modified: { text: 'two\n' }
    })
    await service.dispose()
    expect(readFileSync(index)).toEqual(before)
    expect(statSync(index, { bigint: true }).mtimeNs).toBe(beforeMtime)
  })

  it('keeps the real index and repository hooks untouched when stat data is stale', async () => {
    const fixture = createFixture({ commit: { 'a.txt': 'one\n' } })
    fixtures.push(fixture)
    const hook = join(fixture.root, '.git', 'hooks', 'post-index-change')
    mkdirSync(dirname(hook), { recursive: true })
    const marker = join(fixture.root, 'hook-marker')
    writeFileSync(hook, `#!/bin/sh\necho ran >> '${marker}'\n`, { mode: 0o755 })
    fixture.write('a.txt', 'one\ntwo\n')
    const index = join(fixture.root, '.git', 'index')
    const before = statSync(index, { bigint: true }).mtimeNs
    const { service } = createHarness({ p: fixture.root })
    expect((await service.getSnapshot('p')).files.map((file) => file.path)).toEqual(['a.txt'])
    await service.dispose()
    expect(statSync(index, { bigint: true }).mtimeNs).toBe(before)
    expect(existsSync(join(fixture.root, '.git', 'index.lock'))).toBe(false)
    expect(existsSync(marker)).toBe(false)
  })

  it('copies the linked worktree index, so staged changes remain visible without touching its real index', async () => {
    const origin = createFixture({ commit: { 'a.txt': 'origin\n' } })
    fixtures.push(origin)
    const parent = realpathSync.native(mkdtempSync(join(tmpdir(), 'diff linked parent ')))
    parents.push(parent)
    const linked = join(parent, 'linked')
    execFileSync('git', ['worktree', 'add', '-q', linked, '-b', 'linked'], { cwd: origin.root, env: cleanGitEnv() })
    linkedRoots.push(linked)
    const linkedGitFile = readFileSync(join(linked, '.git'), 'utf8').trim()
    const pointer = linkedGitFile.replace(/^gitdir:\s*/i, '')
    const linkedGitDir = realpathSync.native(pointer)
    const linkedIndex = join(linkedGitDir, 'index')
    writeFileSync(join(linked, 'a.txt'), 'linked\n')
    execFileSync('git', ['add', 'a.txt'], { cwd: linked, env: cleanGitEnv() })
    const before = statSync(linkedIndex, { bigint: true }).mtimeNs
    const { service } = createHarness({ p: linked })
    expect((await service.getSnapshot('p')).files).toEqual([expect.objectContaining({ path: 'a.txt', kind: 'modified' })])
    await service.dispose()
    expect(statSync(linkedIndex, { bigint: true }).mtimeNs).toBe(before)
  })

  it('does not create a real index for an unborn repository', async () => {
    const fixture = createFixture({ commit: false })
    fixtures.push(fixture)
    fixture.write('a.txt', 'unborn\n')
    const { service } = createHarness({ p: fixture.root })
    const snapshot = await service.getSnapshot('p')
    expect(snapshot.status).toBe('no_head')
    expect(snapshot.files).toEqual([expect.objectContaining({ path: 'a.txt', kind: 'added' })])
    await service.dispose()
    expect(existsSync(join(fixture.root, '.git', 'index'))).toBe(false)
  })
})
