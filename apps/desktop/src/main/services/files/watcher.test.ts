import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FILES_LIMITS, type FilesChanged, type FilesWatchChanged } from '@shared/tools/files'
import { createFilesWatcher, isIgnoredWatchPath, MAX_LIVE_WATCHERS, OVERFLOW_INTERVAL_MS, type FilesWatcherOptions, type WatchListener } from './watcher'

class FakeHandle {
  closed = false
  private errorListener: ((error: Error) => void) | undefined
  constructor(readonly path: string, readonly options: unknown, readonly listener: WatchListener) {}
  close() { this.closed = true }
  on(_event: 'error', listener: (error: Error) => void) { this.errorListener = listener; return this }
  emit(filename: string | null, event = 'rename') { if (!this.closed) this.listener(event, filename) }
  fail() { this.errorListener?.(new Error('watch failed')) }
}

function harness(overrides: Partial<FilesWatcherOptions> = {}, projects = ['a', 'b', 'c', 'd', 'e']) {
  const roots = new Map(projects.map((id) => [id, `/projects/${id}`]))
  const handles: FakeHandle[] = []
  const changed: FilesChanged[] = []
  const watchChanged: FilesWatchChanged[] = []
  let revision = 0
  let ids = 0
  const state = { failWatch: false }
  const watcher = createFilesWatcher({
    projectRoot: (id) => roots.get(id) ?? null,
    nextRevision: () => ++revision,
    changed: (event) => changed.push(event),
    watchChanged: (event) => watchChanged.push(event),
    newId: () => `sub-${++ids}`,
    watch: (path, options, listener) => {
      if (state.failWatch) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      const handle = new FakeHandle(path, options, listener)
      handles.push(handle)
      return handle
    },
    ...overrides
  })
  return { watcher, handles, changed, watchChanged, state, roots }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('isIgnoredWatchPath', () => {
  it('ignores .git anywhere (any case) and anything below the first level of node_modules', () => {
    for (const path of ['.git', '.git/index', 'sub/.git/HEAD', '.GIT/config', 'a/.Git', 'node_modules/pkg/lib/i.js', 'node_modules/pkg/x', 'sub/node_modules/q/i.js']) {
      expect(isIgnoredWatchPath(path), path).toBe(true)
    }
  })
  it('keeps ordinary paths, .gitignore, node_modules itself and its direct children', () => {
    for (const path of ['src/a.ts', 'top.txt', '.gitignore', '.github/workflows/ci.yml', 'node_modules', 'node_modules/pkg', 'sub/node_modules', 'sub/node_modules/q', 'my.git/x', 'node_modules_old/a/b']) {
      expect(isIgnoredWatchPath(path), path).toBe(false)
    }
  })
})

describe('subscribe and event coalescing', () => {
  it('starts one recursive, non-persistent watcher on the canonical root and shares it between subscribers', () => {
    const h = harness()
    const first = h.watcher.subscribe('a', 1)
    const second = h.watcher.subscribe('a', 2)
    expect(h.handles).toHaveLength(1)
    expect(h.handles[0]).toMatchObject({ path: '/projects/a', options: { recursive: true, persistent: false } })
    expect(first).toMatchObject({ projectId: 'a', watch: 'live', subscriptionId: 'sub-1' })
    expect(second.subscriptionId).toBe('sub-2')
    expect(second.revision).toBeGreaterThan(first.revision)
  })

  it('coalesces a burst into one event with the sorted parent directories of every change', () => {
    const h = harness()
    h.watcher.subscribe('a', 1)
    const handle = h.handles[0]!
    handle.emit('src/b.ts')
    handle.emit('src/a.ts')
    handle.emit('top.txt')
    handle.emit('newdir')
    handle.emit('deep/er/x.ts')
    vi.advanceTimersByTime(FILES_LIMITS.watcherDebounceMs - 1)
    expect(h.changed).toEqual([])
    vi.advanceTimersByTime(1)
    expect(h.changed).toEqual([{ projectId: 'a', revision: expect.any(Number), dirs: ['', 'deep/er', 'src'], overflow: false }])
    // Nothing is emitted twice and the next burst is a separate event with a newer revision.
    vi.advanceTimersByTime(5000)
    handle.emit('src/c.ts')
    vi.advanceTimersByTime(FILES_LIMITS.watcherDebounceMs)
    expect(h.changed).toHaveLength(2)
    expect(h.changed[1]!.revision).toBeGreaterThan(h.changed[0]!.revision)
    expect(h.changed[1]!.dirs).toEqual(['src'])
  })

  it('restarts the debounce on every event but never waits longer than the maximum wait', () => {
    const h = harness()
    h.watcher.subscribe('a', 1)
    const handle = h.handles[0]!
    // One event every 100 ms keeps resetting the 150 ms debounce: only the maximum wait can flush.
    for (let elapsed = 0; elapsed < FILES_LIMITS.watcherMaxWaitMs; elapsed += 100) {
      handle.emit(`f${elapsed}.txt`)
      vi.advanceTimersByTime(100)
      if (elapsed + 100 < FILES_LIMITS.watcherMaxWaitMs) expect(h.changed, `at ${elapsed + 100} ms`).toEqual([])
    }
    expect(h.changed).toHaveLength(1)
    expect(h.changed[0]!.dirs).toEqual([''])
  })

  it('treats a missing filename as a change of everything (overflow)', () => {
    const h = harness()
    h.watcher.subscribe('a', 1)
    h.handles[0]!.emit(null)
    h.handles[0]!.emit('src/a.ts')
    vi.advanceTimersByTime(FILES_LIMITS.watcherDebounceMs)
    expect(h.changed).toEqual([{ projectId: 'a', revision: expect.any(Number), dirs: [], overflow: true }])
  })

  it('reports overflow above 256 distinct directories but not at exactly 256', () => {
    const h = harness()
    h.watcher.subscribe('a', 1)
    const handle = h.handles[0]!
    for (let index = 0; index < FILES_LIMITS.eventDirectories; index++) handle.emit(`dir${index}/f.txt`)
    vi.advanceTimersByTime(FILES_LIMITS.watcherDebounceMs)
    expect(h.changed.at(-1)).toMatchObject({ overflow: false })
    expect(h.changed.at(-1)!.dirs).toHaveLength(FILES_LIMITS.eventDirectories)
    vi.advanceTimersByTime(OVERFLOW_INTERVAL_MS)
    for (let index = 0; index <= FILES_LIMITS.eventDirectories; index++) handle.emit(`dir${index}/f.txt`)
    vi.advanceTimersByTime(FILES_LIMITS.watcherDebounceMs)
    expect(h.changed.at(-1)).toMatchObject({ overflow: true, dirs: [] })
  })

  it('spaces two overflow signals at least one second apart and folds the events in between into one', () => {
    const h = harness()
    h.watcher.subscribe('a', 1)
    const handle = h.handles[0]!
    handle.emit(null)
    vi.advanceTimersByTime(FILES_LIMITS.watcherDebounceMs)
    expect(h.changed).toHaveLength(1)
    const firstAt = Date.now()
    for (let index = 0; index < 4; index++) { handle.emit(null); vi.advanceTimersByTime(200) }
    expect(h.changed).toHaveLength(1)
    vi.advanceTimersByTime(OVERFLOW_INTERVAL_MS - 800)
    expect(h.changed).toHaveLength(2)
    expect(h.changed[1]).toMatchObject({ overflow: true })
    expect(Date.now() - firstAt).toBe(OVERFLOW_INTERVAL_MS)
    vi.advanceTimersByTime(10_000)
    expect(h.changed).toHaveLength(2)
  })

  it('drops ignored events without scheduling any work', () => {
    const h = harness()
    h.watcher.subscribe('a', 1)
    const handle = h.handles[0]!
    for (const path of ['.git/index', '.git/objects/ab/cdef', 'node_modules/pkg/lib/i.js', 'sub/.git/HEAD']) handle.emit(path)
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(10_000)
    expect(h.changed).toEqual([])
    handle.emit('node_modules/pkg')
    vi.advanceTimersByTime(FILES_LIMITS.watcherDebounceMs)
    expect(h.changed[0]!.dirs).toEqual(['node_modules'])
  })

  it('survives a pnpm-install-sized burst: thousands of ignored events cost nothing and a real change still arrives', () => {
    const h = harness()
    h.watcher.subscribe('a', 1)
    const handle = h.handles[0]!
    for (let index = 0; index < 50_000; index++) handle.emit(`node_modules/pkg-${index % 2000}/lib/nested/f${index}.js`)
    handle.emit('src/app.ts')
    vi.advanceTimersByTime(FILES_LIMITS.watcherDebounceMs)
    expect(h.changed).toEqual([{ projectId: 'a', revision: expect.any(Number), dirs: ['src'], overflow: false }])
  })

  it('accepts Buffer filenames', () => {
    const h = harness()
    h.watcher.subscribe('a', 1)
    h.handles[0]!.listener('rename', Buffer.from('src/ü.ts'))
    vi.advanceTimersByTime(FILES_LIMITS.watcherDebounceMs)
    expect(h.changed[0]!.dirs).toEqual(['src'])
  })
})

describe('degraded state', () => {
  it('turns an fs.watch error into degraded, tells the tree to re-list once, and stops watching', () => {
    const h = harness()
    h.watcher.subscribe('a', 1)
    const handle = h.handles[0]!
    handle.emit('src/a.ts')
    handle.fail()
    expect(handle.closed).toBe(true)
    expect(h.watchChanged).toEqual([{ projectId: 'a', revision: expect.any(Number), watch: 'degraded' }])
    expect(h.changed).toEqual([{ projectId: 'a', revision: expect.any(Number), dirs: [], overflow: true }])
    vi.advanceTimersByTime(10_000)
    expect(h.changed).toHaveLength(1)
    // A second failure notification does nothing.
    handle.fail()
    expect(h.watchChanged).toHaveLength(1)
  })

  it('returns degraded when the watcher cannot be created, and retries on the next subscription', () => {
    const h = harness()
    h.state.failWatch = true
    expect(h.watcher.subscribe('a', 1)).toMatchObject({ watch: 'degraded' })
    expect(h.handles).toHaveLength(0)
    h.state.failWatch = false
    expect(h.watcher.subscribe('a', 1)).toMatchObject({ watch: 'live' })
    expect(h.handles).toHaveLength(1)
    // The first subscriber learns that automatic refresh is back.
    expect(h.watchChanged).toEqual([{ projectId: 'a', revision: expect.any(Number), watch: 'live' }])
  })

  it('does not retry a failed watcher on its own when a slot frees, only on the next subscribe', () => {
    const h = harness()
    h.watcher.subscribe('a', 1)
    h.handles[0]!.fail()
    h.watcher.closeProject('b')
    expect(h.handles).toHaveLength(1)
    expect(h.watcher.subscribe('a', 1)).toMatchObject({ watch: 'live' })
    expect(h.handles).toHaveLength(2)
  })
})

describe('unsubscribe, grace period and owners', () => {
  it('keeps the watcher through a 30 s grace period after the last unsubscribe, then closes it silently', () => {
    const h = harness()
    const { subscriptionId } = h.watcher.subscribe('a', 1)
    h.watcher.unsubscribe('a', subscriptionId, 1)
    vi.advanceTimersByTime(FILES_LIMITS.unsubscribeGraceMs - 1)
    expect(h.handles[0]!.closed).toBe(false)
    vi.advanceTimersByTime(1)
    expect(h.handles[0]!.closed).toBe(true)
    expect(h.watchChanged).toEqual([])
    expect(h.watcher.liveCount()).toBe(0)
  })

  it('reuses the watcher when someone subscribes again within the grace period', () => {
    const h = harness()
    const first = h.watcher.subscribe('a', 1)
    h.watcher.unsubscribe('a', first.subscriptionId, 1)
    vi.advanceTimersByTime(10_000)
    expect(h.watcher.subscribe('a', 1)).toMatchObject({ watch: 'live' })
    vi.advanceTimersByTime(FILES_LIMITS.unsubscribeGraceMs * 2)
    expect(h.handles).toHaveLength(1)
    expect(h.handles[0]!.closed).toBe(false)
  })

  it('counts subscriptions: the watcher survives until the last one leaves', () => {
    const h = harness()
    const first = h.watcher.subscribe('a', 1)
    const second = h.watcher.subscribe('a', 2)
    h.watcher.unsubscribe('a', first.subscriptionId, 1)
    vi.advanceTimersByTime(FILES_LIMITS.unsubscribeGraceMs * 2)
    expect(h.handles[0]!.closed).toBe(false)
    h.watcher.unsubscribe('a', second.subscriptionId, 2)
    vi.advanceTimersByTime(FILES_LIMITS.unsubscribeGraceMs)
    expect(h.handles[0]!.closed).toBe(true)
  })

  it('ignores unsubscribes for unknown ids, other owners or other projects', () => {
    const h = harness()
    const { subscriptionId } = h.watcher.subscribe('a', 1)
    h.watcher.unsubscribe('a', 'nope', 1)
    h.watcher.unsubscribe('a', subscriptionId, 2)
    h.watcher.unsubscribe('b', subscriptionId, 1)
    vi.advanceTimersByTime(FILES_LIMITS.unsubscribeGraceMs * 2)
    expect(h.handles[0]!.closed).toBe(false)
  })

  it('stops emitting for a Project nobody is subscribed to', () => {
    const h = harness()
    const { subscriptionId } = h.watcher.subscribe('a', 1)
    h.handles[0]!.emit('a.txt')
    h.watcher.unsubscribe('a', subscriptionId, 1)
    vi.advanceTimersByTime(FILES_LIMITS.watcherDebounceMs)
    h.handles[0]!.emit('b.txt')
    vi.advanceTimersByTime(FILES_LIMITS.watcherDebounceMs)
    expect(h.changed).toEqual([])
  })

  it('detachOwner removes only that owner across Projects and starts the grace period for emptied ones', () => {
    const h = harness()
    h.watcher.subscribe('a', 1)
    h.watcher.subscribe('a', 2)
    h.watcher.subscribe('b', 1)
    h.watcher.detachOwner(1)
    vi.advanceTimersByTime(FILES_LIMITS.unsubscribeGraceMs)
    expect(h.handles.map((handle) => handle.closed)).toEqual([false, true])
    h.handles[0]!.emit('x.txt')
    vi.advanceTimersByTime(FILES_LIMITS.watcherDebounceMs)
    expect(h.changed).toHaveLength(1)
    h.watcher.detachOwner(1)
    h.watcher.detachOwner(99)
    h.watcher.detachOwner(2)
    vi.advanceTimersByTime(FILES_LIMITS.unsubscribeGraceMs)
    expect(h.handles[0]!.closed).toBe(true)
  })

  it('registers each owner once with the owner watcher and releases it after the last subscription', () => {
    const release = vi.fn()
    const onGoneByOwner = new Map<number, () => void>()
    const watchOwner = vi.fn((owner: number, onGone: () => void) => { onGoneByOwner.set(owner, onGone); return release })
    const h = harness({ watchOwner })
    const first = h.watcher.subscribe('a', 7)
    const second = h.watcher.subscribe('b', 7)
    expect(watchOwner).toHaveBeenCalledTimes(1)
    h.watcher.unsubscribe('a', first.subscriptionId, 7)
    expect(release).not.toHaveBeenCalled()
    h.watcher.unsubscribe('b', second.subscriptionId, 7)
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('cleans up after a destroyed or crashed renderer through the owner callback', () => {
    const onGoneByOwner = new Map<number, () => void>()
    const h = harness({ watchOwner: (owner, onGone) => { onGoneByOwner.set(owner, onGone); return () => {} } })
    h.watcher.subscribe('a', 7)
    h.watcher.subscribe('b', 8)
    onGoneByOwner.get(7)!()
    vi.advanceTimersByTime(FILES_LIMITS.unsubscribeGraceMs)
    expect(h.handles.map((handle) => handle.closed)).toEqual([true, false])
  })
})

describe('closeProject, closeAll and dispose', () => {
  it('closeProject stops the watcher, drops subscriptions, broadcasts stopped once and is idempotent', () => {
    const h = harness()
    h.watcher.subscribe('a', 1)
    h.watcher.subscribe('a', 2)
    h.handles[0]!.emit('pending.txt')
    h.watcher.closeProject('a')
    expect(h.handles[0]!.closed).toBe(true)
    expect(h.watchChanged).toEqual([{ projectId: 'a', revision: expect.any(Number), watch: 'stopped' }])
    h.watcher.closeProject('a')
    h.watcher.closeProject('never-subscribed')
    expect(h.watchChanged).toHaveLength(1)
    // The debounced event that was pending never fires after the close.
    vi.advanceTimersByTime(10_000)
    expect(h.changed).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
    expect(h.watcher.liveCount()).toBe(0)
  })

  it('allows a fresh subscription after closeProject (a cancelled Project close)', () => {
    const h = harness()
    h.watcher.subscribe('a', 1)
    h.watcher.closeProject('a')
    expect(h.watcher.subscribe('a', 1)).toMatchObject({ watch: 'live' })
    expect(h.handles).toHaveLength(2)
    h.handles[1]!.emit('x.txt')
    vi.advanceTimersByTime(FILES_LIMITS.watcherDebounceMs)
    expect(h.changed).toHaveLength(1)
  })

  it('closeProject does not touch other Projects', () => {
    const h = harness()
    h.watcher.subscribe('a', 1)
    h.watcher.subscribe('b', 1)
    h.watcher.closeProject('a')
    expect(h.handles.map((handle) => handle.closed)).toEqual([true, false])
  })

  it('closeAll closes and announces every Project; dispose also refuses later subscriptions', () => {
    const h = harness()
    h.watcher.subscribe('a', 1)
    h.watcher.subscribe('b', 1)
    h.watcher.closeAll()
    expect(h.handles.every((handle) => handle.closed)).toBe(true)
    expect(h.watchChanged.map((event) => [event.projectId, event.watch]).sort()).toEqual([['a', 'stopped'], ['b', 'stopped']])
    h.watcher.closeAll()
    expect(h.watchChanged).toHaveLength(2)
    expect(h.watcher.subscribe('a', 1)).toMatchObject({ watch: 'live' })
    h.watcher.dispose()
    expect(h.watcher.subscribe('a', 1)).toMatchObject({ watch: 'stopped' })
    expect(h.handles.at(-1)!.closed).toBe(true)
  })

  it('does not register a subscription for an unknown or closing Project', () => {
    let closing = false
    const h = harness({ canOperate: () => !closing })
    expect(h.watcher.subscribe('unknown', 1)).toMatchObject({ watch: 'stopped' })
    closing = true
    expect(h.watcher.subscribe('a', 1)).toMatchObject({ watch: 'stopped' })
    expect(h.handles).toHaveLength(0)
    h.watcher.closeProject('a')
    expect(h.watchChanged).toEqual([])
  })
})

describe('at most four live watchers', () => {
  it(`gives the fifth Project a degraded state and upgrades it when a slot frees (limit ${MAX_LIVE_WATCHERS})`, () => {
    const h = harness()
    for (const id of ['a', 'b', 'c', 'd']) expect(h.watcher.subscribe(id, 1)).toMatchObject({ watch: 'live' })
    expect(h.watcher.subscribe('e', 1)).toMatchObject({ watch: 'degraded' })
    expect(h.watcher.liveCount()).toBe(4)
    h.watcher.closeProject('b')
    expect(h.watcher.liveCount()).toBe(4)
    expect(h.handles.filter((handle) => handle.path === '/projects/e')).toHaveLength(1)
    expect(h.watchChanged.filter((event) => event.projectId === 'e')).toEqual([{ projectId: 'e', revision: expect.any(Number), watch: 'live' }])
    h.handles.at(-1)!.emit('x.txt')
    vi.advanceTimersByTime(FILES_LIMITS.watcherDebounceMs)
    expect(h.changed.at(-1)).toMatchObject({ projectId: 'e', dirs: [''] })
  })

  it('evicts a watcher that is only waiting out its grace period to make room', () => {
    const h = harness()
    const a = h.watcher.subscribe('a', 1)
    for (const id of ['b', 'c', 'd']) h.watcher.subscribe(id, 1)
    h.watcher.unsubscribe('a', a.subscriptionId, 1)
    expect(h.watcher.subscribe('e', 1)).toMatchObject({ watch: 'live' })
    expect(h.handles[0]!.closed).toBe(true)
    expect(h.watcher.liveCount()).toBe(4)
  })
})

describe('real filesystem smoke test', () => {
  it('delivers a coalesced change for a real file write and ignores .git and node_modules churn', async () => {
    vi.useRealTimers()
    const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'studio-files-watch-')))
    const changed: FilesChanged[] = []
    const watcher = createFilesWatcher({
      projectRoot: () => base, nextRevision: (() => { let n = 0; return () => ++n })(), changed: (event) => changed.push(event), watchChanged: () => {}
    })
    try {
      expect(watcher.subscribe('p', 1)).toMatchObject({ watch: 'live' })
      // FSEvents replays the creation of a just-made directory; let that settle first.
      await new Promise((resolve) => setTimeout(resolve, 600))
      changed.length = 0
      mkdirSync(join(base, '.git/objects'), { recursive: true })
      writeFileSync(join(base, '.git/objects/o1'), 'x')
      mkdirSync(join(base, 'node_modules/pkg/lib'), { recursive: true })
      writeFileSync(join(base, 'node_modules/pkg/lib/i.js'), 'x')
      await new Promise((resolve) => setTimeout(resolve, 700))
      expect(changed.flatMap((event) => event.dirs)).not.toContain('.git/objects')
      expect(changed.flatMap((event) => event.dirs)).not.toContain('node_modules/pkg/lib')
      mkdirSync(join(base, 'src'))
      writeFileSync(join(base, 'src/a.ts'), '1')
      writeFileSync(join(base, 'src/b.ts'), '2')
      await vi.waitFor(() => { expect(changed.flatMap((event) => event.dirs)).toContain('src') }, { timeout: 5000, interval: 50 })
      expect(changed.every((event) => !event.overflow)).toBe(true)
    } finally {
      watcher.dispose()
      rmSync(base, { recursive: true, force: true })
    }
  })
})
