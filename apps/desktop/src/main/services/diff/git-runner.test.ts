import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { spawn as nodeSpawn } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { GIT_GLOBAL_ARGS, scrubbedGitEnv } from './git-env'
import type { GitLocator } from './git-locate'
import { createGitRunner, type GitRunRequest, type GitRunnerOptions } from './git-runner'
import { sleep, waitFor } from './test-support'

class FakeChild extends EventEmitter {
  static next = 910_000
  pid = FakeChild.next++
  stdout = new PassThrough()
  stderr = new PassThrough()
  exitCode: number | null = null
  signalCode: string | null = null
  finish(code: number): void {
    this.exitCode = code
    this.emit('exit', code, null)
    this.stdout.end(); this.stderr.end()
    this.emit('close', code, null)
  }
}

function setup(options: Partial<GitRunnerOptions> = {}, hostEnv: Record<string, string> = { PATH: '/usr/bin', HOME: '/home/x' }) {
  const spawned: { child: FakeChild; path: string; args: string[]; options: Record<string, unknown> }[] = []
  const signals: { pid: number; signal: string }[] = []
  const spawn = ((path: string, args: string[], spawnOptions: Record<string, unknown>) => {
    const child = new FakeChild()
    spawned.push({ child, path, args, options: spawnOptions })
    return child
  }) as unknown as typeof nodeSpawn
  const locate = Object.assign(async () => ({ status: 'ok' as const, path: '/fake/git', version: '2.0' }), { invalidate: vi.fn() }) as unknown as GitLocator
  const runner = createGitRunner({
    locate, environment: async () => hostEnv, spawn,
    killGroup: (pid, signal) => { signals.push({ pid, signal }) },
    groupAlive: () => false,
    termGraceMs: 30, confirmMs: 60, ...options
  })
  const request = (extra: Partial<GitRunRequest> = {}): GitRunRequest => ({ projectId: 'p', cwd: '/project', args: ['status'], maxBytes: 1024, timeoutMs: 5000, ...extra })
  return { runner, spawned, signals, request, locate }
}

describe('scrubbedGitEnv', () => {
  it('removes every GIT_* variable and pins the non-interactive, locale-independent, literal-pathspec ones', () => {
    const env = scrubbedGitEnv({
      PATH: '/usr/bin', HOME: '/h', GIT_DIR: '/x', GIT_WORK_TREE: '/y', GIT_INDEX_FILE: '/z', GIT_EXTERNAL_DIFF: 'evil', GIT_PAGER: 'less',
      GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.fsmonitor', GIT_OPTIONAL_LOCKS: '1', PAGER: 'less', LC_ALL: 'de_DE.UTF-8'
    })
    expect(Object.keys(env).filter((key) => key.startsWith('GIT_')).sort()).toEqual(['GIT_LITERAL_PATHSPECS', 'GIT_OPTIONAL_LOCKS', 'GIT_PAGER', 'GIT_TERMINAL_PROMPT'])
    expect(env).toMatchObject({ PATH: '/usr/bin', HOME: '/h', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', PAGER: 'cat', LC_ALL: 'C', GIT_LITERAL_PATHSPECS: '1' })
  })
})

describe('git runner process handling', () => {
  it('spawns with an argument array, the fixed global args, a scrubbed environment, a detached group and no stdin', async () => {
    const { runner, spawned, request } = setup({}, { PATH: '/usr/bin', GIT_DIR: '/host/.git', GIT_WORK_TREE: '/host' })
    const run = runner.run(request({ args: ['diff', 'HEAD', '--', '--output=x', ':(top)a'] }))
    await waitFor(() => spawned.length === 1)
    const { child, path, args, options } = spawned[0]!
    child.stdout.write('out'); child.finish(0)
    expect(await run).toEqual({ kind: 'done', code: 0, stdout: Buffer.from('out'), stderr: '', truncated: false })
    expect(path).toBe('/fake/git')
    expect(args).toEqual([...GIT_GLOBAL_ARGS, 'diff', 'HEAD', '--', '--output=x', ':(top)a'])
    expect(GIT_GLOBAL_ARGS).toEqual(expect.arrayContaining(['--no-optional-locks', '--literal-pathspecs', 'core.hooksPath=/dev/null', 'core.fsmonitor=false', 'core.quotepath=false', 'color.ui=false', 'diff.external=', 'core.pager=cat']))
    expect(options).toMatchObject({ cwd: '/project', detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const env = options.env as Record<string, string>
    expect(env.GIT_DIR).toBeUndefined()
    expect(env.GIT_WORK_TREE).toBeUndefined()
    expect(env).toMatchObject({ GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', PAGER: 'cat', LC_ALL: 'C', GIT_LITERAL_PATHSPECS: '1' })
  })

  it('returns stderr and the exit code of a failing command', async () => {
    const { runner, spawned, request } = setup()
    const run = runner.run(request())
    await waitFor(() => spawned.length === 1)
    spawned[0]!.child.stderr.write('fatal: nope'); spawned[0]!.child.finish(128)
    expect(await run).toMatchObject({ kind: 'done', code: 128, stderr: 'fatal: nope' })
  })

  it('stops reading at the output cap, marks truncated and terminates the process group', async () => {
    const { runner, spawned, signals, request } = setup()
    const run = runner.run(request({ maxBytes: 10 }))
    await waitFor(() => spawned.length === 1)
    const { child } = spawned[0]!
    child.stdout.write('0123456'); child.stdout.write('789abcdef'); child.stdout.write('more')
    await waitFor(() => signals.length > 0)
    expect(signals[0]).toEqual({ pid: child.pid, signal: 'SIGTERM' })
    child.finish(143)
    const result = await run
    expect(result).toMatchObject({ kind: 'done', truncated: true })
    expect(result.kind === 'done' && result.stdout.toString()).toBe('0123456789')
  })

  it('times out: SIGTERM, then SIGKILL after the grace period when the process does not leave', async () => {
    const { runner, spawned, signals, request } = setup()
    const run = runner.run(request({ timeoutMs: 20 }))
    await waitFor(() => spawned.length === 1)
    await waitFor(() => signals.some((item) => item.signal === 'SIGKILL'))
    expect(signals.map((item) => item.signal)).toEqual(['SIGTERM', 'SIGKILL'])
    spawned[0]!.child.finish(137)
    expect(await run).toEqual({ kind: 'timeout' })
  })

  it('aborts a running command through its signal and answers aborted', async () => {
    const { runner, spawned, signals, request } = setup()
    const controller = new AbortController()
    const run = runner.run(request({ signal: controller.signal }))
    await waitFor(() => spawned.length === 1)
    controller.abort()
    await waitFor(() => signals.length > 0)
    spawned[0]!.child.finish(143)
    expect(await run).toEqual({ kind: 'aborted' })
  })

  it('answers aborted for an already aborted signal without spawning', async () => {
    const { runner, spawned, request } = setup()
    const controller = new AbortController()
    controller.abort()
    expect(await runner.run(request({ signal: controller.signal }))).toEqual({ kind: 'aborted' })
    expect(spawned).toHaveLength(0)
  })

  it('reports a missing git binary without spawning, and forgets a location whose binary vanished', async () => {
    const missing = Object.assign(async () => ({ status: 'missing' as const }), { invalidate: vi.fn() }) as unknown as GitLocator
    const spawned = vi.fn()
    const runner = createGitRunner({ locate: missing, environment: async () => ({}), spawn: spawned as unknown as typeof nodeSpawn })
    expect(await runner.run({ projectId: 'p', cwd: '/x', args: ['status'], maxBytes: 10, timeoutMs: 100 })).toEqual({ kind: 'missing' })
    expect(spawned).not.toHaveBeenCalled()
    // ENOENT of a real spawn: the located path does not exist.
    const gone = Object.assign(async () => ({ status: 'ok' as const, path: '/nonexistent/dir/git', version: null }), { invalidate: vi.fn() }) as unknown as GitLocator
    const real = createGitRunner({ locate: gone, environment: async () => ({ PATH: '' }) })
    expect(await real.run({ projectId: 'p', cwd: '/', args: ['status'], maxBytes: 10, timeoutMs: 1000 })).toEqual({ kind: 'missing' })
    expect(gone.invalidate).toHaveBeenCalled()
  })

  it('tells a missing working directory from a missing binary', async () => {
    const present = Object.assign(async () => ({ status: 'ok' as const, path: '/bin/echo', version: null }), { invalidate: vi.fn() }) as unknown as GitLocator
    const runner = createGitRunner({ locate: present, environment: async () => ({ PATH: '/bin' }) })
    expect(await runner.run({ projectId: 'p', cwd: '/nonexistent/project/dir', args: ['x'], maxBytes: 10, timeoutMs: 1000 })).toEqual({ kind: 'cwd_missing' })
    expect(present.invalidate).not.toHaveBeenCalled()
  })
})

describe('git runner concurrency', () => {
  it('runs at most 2 per Project and 4 overall, and starts queued work as slots free up', async () => {
    const { runner, spawned, request } = setup({ perProject: 2, overall: 4 })
    const projects = ['a', 'a', 'a', 'a', 'b', 'b', 'c', 'c']
    const runs = projects.map((projectId) => runner.run(request({ projectId, args: ['status', projectId] })))
    const live = () => spawned.filter((item) => item.child.exitCode === null)
    const liveOf = (projectId: string) => live().filter((item) => item.args.at(-1) === projectId).length
    let peakOverall = 0
    const peakOf: Record<string, number> = { a: 0, b: 0, c: 0 }
    await waitFor(() => spawned.length >= 4)
    // Nothing beyond the limits may start while the first four are still running.
    await sleep(30)
    expect(spawned).toHaveLength(4)
    expect(liveOf('a')).toBe(2)
    while (spawned.length < projects.length || live().length) {
      peakOverall = Math.max(peakOverall, live().length)
      for (const id of Object.keys(peakOf)) peakOf[id] = Math.max(peakOf[id]!, liveOf(id))
      live()[0]?.child.finish(0)
      await sleep(5)
    }
    await Promise.all(runs)
    expect(peakOverall).toBe(4)
    expect(peakOf).toEqual({ a: 2, b: 2, c: 2 })
    expect(spawned).toHaveLength(8)
  })

  it('an aborted queued command never spawns', async () => {
    const { runner, spawned, request } = setup({ perProject: 1, overall: 4 })
    const first = runner.run(request())
    await waitFor(() => spawned.length === 1)
    const controller = new AbortController()
    const queued = runner.run(request({ signal: controller.signal }))
    await sleep(20)
    controller.abort()
    expect(await queued).toEqual({ kind: 'aborted' })
    spawned[0]!.child.finish(0)
    await first
    expect(spawned).toHaveLength(1)
    expect(runner.pending()).toBe(0)
  })
})

describe('terminateProject', () => {
  it('SIGKILLs the process group of every running child, drops queued work and waits for the exits', async () => {
    const { runner, spawned, signals, request } = setup({ perProject: 1 })
    const running = runner.run(request())
    await waitFor(() => spawned.length === 1)
    const queued = runner.run(request())
    await sleep(20)
    const termination = runner.terminateProject('p')
    await waitFor(() => signals.some((item) => item.signal === 'SIGKILL'))
    expect(signals).toContainEqual({ pid: spawned[0]!.child.pid, signal: 'SIGKILL' })
    spawned[0]!.child.finish(137)
    await termination
    expect(await queued).toEqual({ kind: 'aborted' })
    expect(spawned).toHaveLength(1)
    await running
    expect(runner.pending('p')).toBe(0)
  })

  it('throws when the exit cannot be confirmed in time, so the caller can fail the close and retry', async () => {
    const { runner, spawned, request } = setup({ confirmMs: 40 })
    void runner.run(request())
    await waitFor(() => spawned.length === 1)
    await expect(runner.terminateProject('p')).rejects.toThrow(/could not be confirmed/)
    // The child is still tracked, so a retry tries again and succeeds once it is gone.
    const retry = runner.terminateProject('p')
    spawned[0]!.child.finish(137)
    await expect(retry).resolves.toBeUndefined()
  })

  it('does not count the leader\'s exit as confirmation while members of its group are still alive', async () => {
    let groupLive = true
    const { runner, spawned, request } = setup({ confirmMs: 60, groupAlive: () => groupLive })
    const run = runner.run(request())
    await waitFor(() => spawned.length === 1)
    const termination = runner.terminateProject('p').then(() => 'ok', (error: Error) => error.message)
    spawned[0]!.child.finish(137)
    expect(await termination).toMatch(/could not be confirmed/)
    groupLive = false
    await run
  })

  it('keeps polling after the leader exits until the whole group is gone', async () => {
    let groupLive = true
    const { runner, spawned, request } = setup({ confirmMs: 1000, groupAlive: () => groupLive })
    const run = runner.run(request())
    await waitFor(() => spawned.length === 1)
    const termination = runner.terminateProject('p')
    spawned[0]!.child.finish(137)
    setTimeout(() => { groupLive = false }, 120) // a descendant needs a moment to die after SIGKILL
    await expect(termination).resolves.toBeUndefined()
    await run
  })

  it('a command that is still in its prelude (locating, environment) when terminate is called never spawns', async () => {
    let release!: () => void
    const slowEnv = new Promise<Record<string, string>>((resolve) => { release = () => resolve({ PATH: '/usr/bin' }) })
    const { runner, spawned, request } = setup({ environment: () => slowEnv })
    const run = runner.run(request())
    await runner.terminateProject('p')
    release()
    expect(await run).toEqual({ kind: 'aborted' })
    expect(spawned).toHaveLength(0)
  })
})
