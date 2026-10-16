import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GitLocator } from './git-locate'
import type { GitRunRequest, GitRunResult } from './git-runner'
import { createFixture, createHarness, hookRunner, subcommand, type Fixture } from './test-support'

const fixtures: Fixture[] = []
afterEach(() => { for (const fixture of fixtures.splice(0)) fixture.cleanup() })
const repo = () => { const fixture = createFixture(); fixtures.push(fixture); return fixture }
const locator = (location: Awaited<ReturnType<GitLocator>>) => Object.assign(async () => location, { invalidate: vi.fn() }) as unknown as GitLocator
const answer = (result: GitRunResult) => async (request: GitRunRequest) => (subcommand(request) === 'rev-parse' ? result : undefined)
const failing = (stderr: string, code = 128): GitRunResult => ({ kind: 'done', code, stdout: Buffer.alloc(0), stderr, truncated: false })

describe('availability states', () => {
  it('git_missing when no git can be located: nothing is spawned and nothing is installed', async () => {
    const fixture = repo()
    const spawn = vi.fn()
    const { service } = createHarness({ p: fixture.root }, { runner: { locate: locator({ status: 'missing' }), spawn: spawn as never } })
    expect(await service.getSnapshot('p')).toMatchObject({ status: 'git_missing', files: [], head: null, gitVersion: null })
    expect(await service.getFile({ projectId: 'p', path: 'README.md', oldPath: null })).toMatchObject({ status: 'unavailable', availability: 'git_missing' })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('git_missing when the located binary has vanished (ENOENT)', async () => {
    const fixture = repo()
    const missing = locator({ status: 'ok', path: join(realpathSync.native(tmpdir()), 'no-such-dir', 'git'), version: null })
    const { service } = createHarness({ p: fixture.root }, { runner: { locate: missing } })
    expect((await service.getSnapshot('p')).status).toBe('git_missing')
    expect(missing.invalidate).toHaveBeenCalled()
  })

  it('git_unsafe_directory for dubious ownership: explained without paths, and Git is never told to trust the directory', async () => {
    const fixture = repo()
    const calls: GitRunRequest[] = []
    const stderr = `fatal: detected dubious ownership in repository at '${fixture.root}'\nTo add an exception for this directory, call:\n\n\tgit config --global --add safe.directory ${fixture.root}\n`
    const { service, runner } = createHarness({ p: fixture.root }, { wrapRunner: (real) => hookRunner(real, { before: answer(failing(stderr)) }, calls) })
    void runner
    const snapshot = await service.getSnapshot('p')
    expect(snapshot).toMatchObject({ status: 'git_unsafe_directory', files: [], head: null })
    expect(snapshot.detail).not.toContain(fixture.root)
    expect(snapshot.detail).not.toContain('safe.directory')
    expect(await service.getFile({ projectId: 'p', path: 'a.txt', oldPath: null })).toMatchObject({ status: 'unavailable', availability: 'git_unsafe_directory' })
    const everything = calls.flatMap((call) => call.args).join(' ')
    expect(everything).not.toContain('safe.directory')
    expect(calls.some((call) => subcommand(call) === 'config')).toBe(false)
  })

  it('not_git comes from Git\'s own message; any other fatal error is "failed" with a path-free detail, not "not a repository"', async () => {
    const fixture = repo()
    const other = `fatal: unable to read config file '${fixture.root}/.git/config': Permission denied`
    const { service } = createHarness({ p: fixture.root }, { wrapRunner: (real) => hookRunner(real, { before: answer(failing(other)) }) })
    const snapshot = await service.getSnapshot('p')
    expect(snapshot.status).toBe('failed')
    expect(snapshot.detail).toContain('Permission denied')
    expect(snapshot.detail).not.toContain(fixture.root)
    expect(snapshot.detail!.length).toBeLessThanOrEqual(300)
    const notGit = createHarness({ p: fixture.root }, { wrapRunner: (real) => hookRunner(real, { before: answer(failing('fatal: not a git repository (or any of the parent directories): .git')) }) })
    expect((await notGit.service.getSnapshot('p')).status).toBe('not_git')
  })

  it('timeout when Git does not answer in time', async () => {
    const fixture = repo()
    const { service } = createHarness({ p: fixture.root }, { wrapRunner: (real) => hookRunner(real, { before: answer({ kind: 'timeout' }) }) })
    expect(await service.getSnapshot('p')).toMatchObject({ status: 'timeout', files: [] })
    expect(await service.getFile({ projectId: 'p', path: 'README.md', oldPath: null })).toMatchObject({ status: 'unavailable', availability: 'timeout' })
  })

  it('project_unavailable when the Project directory is gone', async () => {
    const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'diff gone ')))
    rmSync(dir, { recursive: true })
    const { service } = createHarness({ p: dir })
    expect(await service.getSnapshot('p')).toMatchObject({ status: 'project_unavailable', files: [] })
    expect(await service.getFile({ projectId: 'p', path: 'a.txt', oldPath: null })).toMatchObject({ status: 'unavailable', availability: 'project_unavailable' })
  })

  it('failed (with a sanitized message) when Git cannot be started', async () => {
    const fixture = repo()
    const { service } = createHarness({ p: fixture.root }, { wrapRunner: (real) => hookRunner(real, { before: async () => ({ kind: 'spawn_failed', message: `spawn EAGAIN in ${fixture.root}` }) }) })
    const snapshot = await service.getSnapshot('p')
    expect(snapshot.status).toBe('failed')
    expect(snapshot.detail).not.toContain(fixture.root)
  })
})
