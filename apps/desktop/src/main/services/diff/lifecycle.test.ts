import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, realpathSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DiffSnapshot } from '@shared/tools/diff'
import type { GitRunRequest } from './git-runner'
import { alive, createFixture, createHarness, gate, hookRunner, sleep, subcommand, waitFor, type Fixture } from './test-support'
import type { WatchFn } from './watcher'

const fixtures: Fixture[] = []
const scratch: string[] = []
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})
const repo = (commit: Record<string, string> = { 'a.txt': 'one\n' }) => {
  const fixture = createFixture({ commit })
  fixtures.push(fixture)
  return fixture
}

function fakeWatch() {
  const watchers: { root: string; closed: boolean; events: EventEmitter; listener: (event: 'change', filename: string | null) => void }[] = []
  const watch = ((root: string, _options: unknown, listener: (event: 'change', filename: string | null) => void) => {
    const events = new EventEmitter()
    const record = { root, closed: false, events, listener }
    watchers.push(record)
    return { close: () => { record.closed = true }, on: events.on.bind(events) }
  }) as unknown as WatchFn
  const current = () => watchers.at(-1)!
  return { watch, watchers, emit: (filename: string | null) => current().listener('change', filename), fail: () => current().events.emit('error', new Error('boom')) }
}

const diffCalls = (calls: GitRunRequest[]) => calls.filter((call) => subcommand(call) === 'diff')

describe('settled semantics (a subscribed Project, a tree that changes under the query)', () => {
  it('re-queries after a change during the query, returns the newest content and reports settled', async () => {
    const fixture = repo()
    fixture.write('a.txt', 'one\ntwo\n')
    const watcher = fakeWatch()
    const calls: GitRunRequest[] = []
    const held = gate()
    let reached = false
    const { service } = createHarness({ p: fixture.root }, {
      service: { watch: watcher.watch },
      wrapRunner: (runner) => hookRunner(runner, {
        after: async (request) => {
          if (subcommand(request) !== 'diff' || reached) return undefined
          reached = true
          // The first query has its (soon stale) answer; the tree changes before it is returned.
          fixture.write('a.txt', 'one\ntwo\nthree\nfour\n')
          watcher.emit('a.txt')
          held.open()
          return undefined
        }
      }, calls)
    })
    service.subscribe('p', 1)
    const snapshot = await service.getSnapshot('p')
    expect(held).toBeDefined()
    expect(snapshot.settled).toBe(true)
    expect(snapshot.files[0]).toMatchObject({ path: 'a.txt', additions: 3 })
    expect(diffCalls(calls)).toHaveLength(2)
  })

  it('stops after settleRetries re-queries and says the tree is still changing, then asks the renderer to look again', async () => {
    const fixture = repo()
    fixture.write('a.txt', 'one\nx\n')
    const watcher = fakeWatch()
    const calls: GitRunRequest[] = []
    const { service, invalidated } = createHarness({ p: fixture.root }, {
      service: { watch: watcher.watch, debounceMs: 20, maxWaitMs: 60, settleRetries: 2 },
      wrapRunner: (runner) => hookRunner(runner, {
        after: async (request) => { if (subcommand(request) === 'diff') watcher.emit('a.txt'); return undefined }
      }, calls)
    })
    service.subscribe('p', 1)
    const snapshot = await service.getSnapshot('p')
    expect(snapshot.settled).toBe(false)
    expect(diffCalls(calls)).toHaveLength(3)
    expect(snapshot.files.map((entry) => entry.path)).toEqual(['a.txt'])
    await waitFor(() => invalidated.length > 0)
    expect(invalidated[0]!.revision).toBeGreaterThan(snapshot.revision)
  })

  it('cannot observe changes without a subscription (no watcher): the answer is a single query', async () => {
    const fixture = repo()
    fixture.write('a.txt', 'changed\n')
    const calls: GitRunRequest[] = []
    const { service } = createHarness({ p: fixture.root }, { wrapRunner: (runner) => hookRunner(runner, {}, calls) })
    expect((await service.getSnapshot('p')).settled).toBe(true)
    expect(diffCalls(calls)).toHaveLength(1)
  })

  it('does not count .git events that arrive during a query (no feedback loop) but announces them once afterwards', async () => {
    const fixture = repo()
    fixture.write('a.txt', 'changed\n')
    const watcher = fakeWatch()
    const calls: GitRunRequest[] = []
    let clock = 1_000_000
    const { service, invalidated } = createHarness({ p: fixture.root }, {
      service: { watch: watcher.watch, debounceMs: 20, maxWaitMs: 60, now: () => clock },
      wrapRunner: (runner) => hookRunner(runner, {
        after: async (request) => { if (subcommand(request) === 'diff') watcher.emit('.git/index'); return undefined }
      }, calls)
    })
    service.subscribe('p', 1)
    const first = await service.getSnapshot('p')
    expect(first.settled).toBe(true)
    expect(diffCalls(calls)).toHaveLength(1)
    await waitFor(() => invalidated.length === 1)
    // Another query whose own Git activity shows up in .git inside the guard interval must not start a loop.
    clock += 500
    await service.getSnapshot('p')
    await sleep(150)
    expect(invalidated).toHaveLength(1)
    // Outside a query a .git change (a commit in the terminal) is an ordinary invalidation.
    watcher.emit('.git/refs/heads/main')
    await waitFor(() => invalidated.length === 2)
  })

  it('a stale answer never replaces a newer one: the older caller receives the newer snapshot', async () => {
    const fixture = repo()
    fixture.write('a.txt', 'one\nold\n')
    const calls: GitRunRequest[] = []
    const held = gate()
    let first = true
    const { service } = createHarness({ p: fixture.root }, {
      wrapRunner: (runner) => hookRunner(runner, {
        after: async (request, _result, index) => {
          if (subcommand(request) !== 'diff' || !first) return undefined
          first = false
          void index
          // Hold the first query's (stale) answer until the second query has finished.
          await held.wait()
          return undefined
        }
      }, calls)
    })
    const older = service.getSnapshot('p')
    await waitFor(() => diffCalls(calls).length === 1)
    await sleep(50)
    fixture.write('a.txt', 'one\nold\nnew1\nnew2\n')
    const newer = await service.getSnapshot('p')
    expect(newer.files[0]).toMatchObject({ additions: 3 })
    held.open()
    const resolved = await older
    expect(resolved.revision).toBe(newer.revision)
    expect(resolved.files[0]).toMatchObject({ additions: 3 })
  })

  it('a superseded query is aborted: its Git work is killed and its caller still gets a normal snapshot', async () => {
    const fixture = repo()
    fixture.write('a.txt', 'one\nx\n')
    const calls: GitRunRequest[] = []
    const held = gate()
    let aborted = 0
    const { service } = createHarness({ p: fixture.root }, {
      wrapRunner: (runner) => hookRunner(runner, {
        before: async (request, index) => {
          if (index !== 0) return undefined
          if (!(await held.wait(request.signal))) { aborted++; return { kind: 'aborted' as const } }
          return undefined
        }
      }, calls)
    })
    const older = service.getSnapshot('p')
    await waitFor(() => calls.length === 1)
    const newer = await service.getSnapshot('p')
    const resolved = await older
    expect(aborted).toBe(1)
    expect(resolved).toBe(newer)
    expect(newer.status).toBe('ready')
  })
})

describe('closing and cancelling leave no running Git processes', () => {
  /** A repository whose clean filter hangs: it makes `git diff` start a long-lived grandchild we can look for. */
  function slowRepo() {
    const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'diff slow ')))
    scratch.push(dir)
    const pids = join(dir, 'pids')
    const fixture = repo({ 'slow.dat': 'x\n', '.gitattributes': '*.dat filter=slow\n' })
    fixture.git('config', 'filter.slow.clean', `sh -c 'echo $$ >> "${pids}"; exec sleep 60'`)
    fixture.write('slow.dat', 'a longer content\n')
    const read = () => (existsSync(pids) ? readFileSync(pids, 'utf8').split('\n').filter(Boolean).map(Number) : [])
    return { fixture, read }
  }

  it('closeProject aborts an in-flight query, kills the whole process group (including the filter child) and awaits it', async () => {
    const { fixture, read } = slowRepo()
    const { service, runner } = createHarness({ p: fixture.root })
    const pending = service.getSnapshot('p')
    await waitFor(() => read().length === 1)
    const [pid] = read()
    expect(alive(pid!)).toBe(true)
    expect(runner.pending('p')).toBeGreaterThan(0)
    await service.closeProject('p')
    expect(alive(pid!)).toBe(false)
    expect(runner.pending('p')).toBe(0)
    // The caller is not left hanging and never sees an error.
    expect(await pending).toMatchObject({ status: 'project_closing', files: [] })
  })

  it('a superseding request kills the older query\'s process group', async () => {
    const { fixture, read } = slowRepo()
    const { service } = createHarness({ p: fixture.root }, { runner: { termGraceMs: 300 } })
    const older = service.getSnapshot('p')
    await waitFor(() => read().length === 1)
    const [first] = read()
    const newer = service.getSnapshot('p')
    await waitFor(() => read().length === 2)
    await waitFor(() => !alive(first!), 3000)
    await service.closeProject('p')
    expect(read().every((pid) => !alive(pid))).toBe(true)
    await Promise.all([older, newer])
  })

  it('closeAll and dispose clean every Project and refuse new work afterwards', async () => {
    const { fixture, read } = slowRepo()
    const other = repo()
    const { service } = createHarness({ p: fixture.root, q: other.root })
    const pending = service.getSnapshot('p')
    await waitFor(() => read().length === 1)
    await service.dispose()
    expect(read().every((pid) => !alive(pid))).toBe(true)
    expect(await pending).toMatchObject({ status: 'project_closing' })
    expect(await service.getSnapshot('q')).toMatchObject({ status: 'project_closing' })
    expect(() => service.subscribe('q')).toThrow(/closing/)
  })

  it('a file query in flight is cancelled by closeProject and answers project_closing', async () => {
    const { fixture, read } = slowRepo()
    const { service } = createHarness({ p: fixture.root })
    const pending = service.getFile({ projectId: 'p', path: 'slow.dat', oldPath: null })
    await waitFor(() => read().length === 1)
    await service.closeProject('p')
    expect(read().every((pid) => !alive(pid))).toBe(true)
    expect(await pending).toMatchObject({ status: 'unavailable', availability: 'project_closing' })
  })

  it('when exit cannot be confirmed closeProject throws, the Project stays usable and a retry can succeed', async () => {
    const fixture = repo()
    fixture.write('a.txt', 'x\n')
    let failures = 1
    const { service } = createHarness({ p: fixture.root }, {
      wrapRunner: (runner) => ({
        ...runner,
        run: runner.run,
        terminateProject: async (id) => {
          if (failures-- > 0) throw new Error('Git process exit could not be confirmed (pid 1)')
          await runner.terminateProject(id)
        }
      })
    })
    await expect(service.closeProject('p')).rejects.toThrow()
    // 'p' has no state yet (nothing ran): create it, then fail a close that has state.
    await service.getSnapshot('p')
    failures = 1
    await expect(service.closeProject('p')).rejects.toThrow('could not be confirmed')
    expect(await service.getSnapshot('p')).toMatchObject({ status: 'ready' })
    await expect(service.closeProject('p')).resolves.toBeUndefined()
  })

  it('refuses queries while the shell says the Project is closing, and for an unknown Project it throws', async () => {
    const fixture = repo()
    let closing = true
    const { service } = createHarness({ p: fixture.root }, { service: { canOperate: () => !closing } })
    expect(await service.getSnapshot('p')).toMatchObject({ status: 'project_closing' })
    expect(await service.getFile({ projectId: 'p', path: 'a.txt', oldPath: null })).toMatchObject({ status: 'unavailable', availability: 'project_closing' })
    closing = false
    expect((await service.getSnapshot('p')).status).toBe('clean')
    await expect(service.getSnapshot('nope')).rejects.toThrow('Unknown project')
  })
})

describe('subscriptions and the watcher', () => {
  it('attaches one watcher for the first subscriber and closes it with the last', () => {
    const fixture = repo()
    const watcher = fakeWatch()
    const { service, watchChanged } = createHarness({ p: fixture.root }, { service: { watch: watcher.watch, newId: (() => { let n = 0; return () => `s${++n}` })() } })
    const first = service.subscribe('p', 1)
    const second = service.subscribe('p', 2)
    expect(watcher.watchers).toHaveLength(1)
    expect(first).toMatchObject({ projectId: 'p', subscriptionId: 's1', watch: 'live' })
    expect(second.subscriptionId).toBe('s2')
    expect(second.revision).toBeGreaterThan(first.revision)
    expect(() => service.unsubscribe('p', 's1', 2)).toThrow('sender mismatch')
    service.unsubscribe('p', 's1', 1)
    expect(watcher.watchers[0]!.closed).toBe(false)
    service.unsubscribe('p', 's1', 1) // late duplicate cleanup is not an error
    service.unsubscribe('gone', 'x', 1)
    service.unsubscribe('p', 's2', 2)
    expect(watcher.watchers[0]!.closed).toBe(true)
    expect(watchChanged).toEqual([])
  })

  it('detachOwner drops only that renderer\'s subscriptions (renderer crash)', () => {
    const fixture = repo()
    const watcher = fakeWatch()
    const { service } = createHarness({ p: fixture.root }, { service: { watch: watcher.watch } })
    service.subscribe('p', 1); service.subscribe('p', 1); service.subscribe('p', 2)
    service.detachOwner(1)
    expect(watcher.watchers[0]!.closed).toBe(false)
    service.detachOwner(2)
    expect(watcher.watchers[0]!.closed).toBe(true)
  })

  it('reports a failed platform watcher as degraded instead of throwing, and a watch that cannot start as degraded from the start', () => {
    const fixture = repo()
    const watcher = fakeWatch()
    const { service, watchChanged } = createHarness({ p: fixture.root }, { service: { watch: watcher.watch } })
    service.subscribe('p', 1)
    watcher.fail()
    expect(watchChanged).toEqual([expect.objectContaining({ projectId: 'p', watch: 'degraded' })])
    const throwing = createHarness({ p: fixture.root }, { service: { watch: (() => { throw new Error('EMFILE') }) as unknown as WatchFn } })
    expect(throwing.service.subscribe('p', 1).watch).toBe('degraded')
  })

  it('closeProject stops the watcher, tells subscribers the watch stopped, and they may subscribe again', async () => {
    const fixture = repo()
    const watcher = fakeWatch()
    const { service, watchChanged } = createHarness({ p: fixture.root }, { service: { watch: watcher.watch } })
    service.subscribe('p', 1)
    await service.closeProject('p')
    expect(watcher.watchers[0]!.closed).toBe(true)
    expect(watchChanged).toEqual([expect.objectContaining({ projectId: 'p', watch: 'stopped' })])
    expect(service.subscribe('p', 1).watch).toBe('live')
    expect(watcher.watchers).toHaveLength(2)
  })

  it('turns bursts of events into one invalidation after the debounce, with a revision newer than earlier snapshots', async () => {
    const fixture = repo()
    const watcher = fakeWatch()
    const { service, invalidated } = createHarness({ p: fixture.root }, { service: { watch: watcher.watch, debounceMs: 40, maxWaitMs: 120 } })
    service.subscribe('p', 1)
    const before = await service.getSnapshot('p')
    for (let index = 0; index < 5; index++) { watcher.emit(`src/f${index}.ts`); await sleep(10) }
    watcher.emit('node_modules/pkg/index.js') // ignored: no invalidation of its own
    await waitFor(() => invalidated.length === 1)
    await sleep(120)
    expect(invalidated).toHaveLength(1)
    expect(invalidated[0]!.revision).toBeGreaterThan(before.revision)
  })

  it('does not read a file system watcher at all while nobody is subscribed', async () => {
    const fixture = repo()
    const watcher = fakeWatch()
    const { service } = createHarness({ p: fixture.root }, { service: { watch: watcher.watch } })
    await service.getSnapshot('p')
    await service.getFile({ projectId: 'p', path: 'a.txt', oldPath: null })
    expect(watcher.watchers).toHaveLength(0)
  })
})

describe('revisions', () => {
  it('are strictly increasing across snapshots and file results of the service', async () => {
    const fixture = repo()
    fixture.write('a.txt', 'one\nx\n')
    const { service } = createHarness({ p: fixture.root })
    const revisions: number[] = []
    const first: DiffSnapshot = await service.getSnapshot('p')
    revisions.push(first.revision)
    const file = await service.getFile({ projectId: 'p', path: 'a.txt', oldPath: null })
    revisions.push(file.revision)
    revisions.push((await service.getSnapshot('p')).revision)
    expect([...revisions].sort((a, b) => a - b)).toEqual(revisions)
    expect(new Set(revisions).size).toBe(3)
  })
})

describe('with the real recursive file system watcher', () => {
  it('Git queries do not feed back into the watcher; a real edit and a real commit each produce an invalidation', async () => {
    const fixture = repo({ 'a.txt': 'one\n', 'dir/b.txt': 'b\n' })
    await sleep(1200) // FSEvents may still report the fixture's own creation to a new stream
    const { service, invalidated } = createHarness({ p: fixture.root }, { service: { debounceMs: 60, maxWaitMs: 200 } })
    expect(service.subscribe('p', 1).watch).toBe('live')
    await sleep(300)
    for (let index = 0; index < 3; index++) {
      expect((await service.getSnapshot('p')).settled).toBe(true)
      await service.getFile({ projectId: 'p', path: 'a.txt', oldPath: null })
    }
    await sleep(600)
    // Our own git processes (index reads, ls-files, cat-file) must not make the Diff invalidate itself.
    expect(invalidated).toEqual([])
    fixture.write('dir/b.txt', 'b\nedited\n')
    await waitFor(() => invalidated.length === 1, 8000)
    const edited = await service.getSnapshot('p')
    expect(edited.files.map((entry) => entry.path)).toEqual(['dir/b.txt'])
    expect(invalidated[0]!.revision).toBeLessThan(edited.revision)
    await sleep(600)
    const before = invalidated.length
    fixture.commitAll('commit from the terminal')
    await waitFor(() => invalidated.length > before, 8000)
    expect((await service.getSnapshot('p')).status).toBe('clean')
    service.detachOwner(1)
  }, 30_000)
})
