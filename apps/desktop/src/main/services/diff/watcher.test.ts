import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyWatchPath, createDebouncer, createDiffWatcher, type WatchEventKind } from './watcher'
import { sleep, waitFor } from './test-support'

describe('classifyWatchPath', () => {
  it('passes ordinary project files and a missing file name (the platform did not say what changed)', () => {
    expect(classifyWatchPath('src/app.ts')).toBe('worktree')
    expect(classifyWatchPath('a b/c d.txt')).toBe('worktree')
    expect(classifyWatchPath('')).toBe('worktree')
    expect(classifyWatchPath(null)).toBe('worktree')
    expect(classifyWatchPath('node_modules')).toBe('worktree')
  })

  it('accepts the .git files that move HEAD, the index or a ref, and .git appearing or vanishing', () => {
    for (const name of ['.git/index', '.git/HEAD', '.git/packed-refs', '.git/MERGE_HEAD', '.git/ORIG_HEAD', '.git/refs', '.git/refs/heads/main', '.git/refs/remotes/origin/x/y', '.git']) {
      expect(classifyWatchPath(name), name).toBe('git')
    }
  })

  it('ignores .git noise (objects, logs, lfs, locks, hooks, config, FETCH_HEAD)', () => {
    for (const name of ['.git/objects/ab/cdef', '.git/objects', '.git/logs/HEAD', '.git/lfs/tmp/x', '.git/index.lock', '.git/HEAD.lock', '.git/hooks/pre-commit', '.git/config', '.git/FETCH_HEAD']) {
      expect(classifyWatchPath(name), name).toBeNull()
    }
  })

  it('ignores nested repository metadata and everything inside node_modules at any depth', () => {
    for (const name of ['sub/.git/index', 'a/b/.git/refs/heads/x', 'node_modules/pkg/index.js', 'packages/a/node_modules/x/y.js', 'node_modules/.bin/tool']) {
      expect(classifyWatchPath(name), name).toBeNull()
    }
  })
})

describe('createDebouncer', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('fires once, 400 ms after the last event of a burst', () => {
    const fire = vi.fn()
    const debouncer = createDebouncer(400, 2000, fire)
    debouncer.poke(); vi.advanceTimersByTime(300); debouncer.poke(); vi.advanceTimersByTime(300)
    expect(fire).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(fire).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    expect(fire).toHaveBeenCalledTimes(1)
  })

  it('fires after the maximum wait even if events never pause', () => {
    const fire = vi.fn()
    const debouncer = createDebouncer(400, 2000, fire)
    for (let elapsed = 0; elapsed < 1900; elapsed += 100) { debouncer.poke(); vi.advanceTimersByTime(100) }
    expect(fire).not.toHaveBeenCalled()
    debouncer.poke(); vi.advanceTimersByTime(100)
    expect(fire).toHaveBeenCalledTimes(1)
    // A new burst starts a new window.
    debouncer.poke(); vi.advanceTimersByTime(400)
    expect(fire).toHaveBeenCalledTimes(2)
  })

  it('cancel drops a pending flush', () => {
    const fire = vi.fn()
    const debouncer = createDebouncer(400, 2000, fire)
    debouncer.poke()
    expect(debouncer.pending()).toBe(true)
    debouncer.cancel()
    vi.advanceTimersByTime(10_000)
    expect(fire).not.toHaveBeenCalled()
    expect(debouncer.pending()).toBe(false)
  })
})

describe('createDiffWatcher with an injected platform watch', () => {
  it('forwards classified events, stops after close, and degrades once on error', () => {
    const events: WatchEventKind[] = []
    let listener!: (event: 'change', filename: string | null) => void
    const handlers: Record<string, () => void> = {}
    const close = vi.fn()
    const onDegraded = vi.fn()
    const watcher = createDiffWatcher({
      root: '/project',
      watch: ((_root: string, _options: unknown, callback: typeof listener) => { listener = callback; return { close, on: (name: string, handler: () => void) => { handlers[name] = handler } } }) as never,
      onEvent: (kind) => events.push(kind), onDegraded
    })
    listener('change', 'src/a.ts'); listener('change', '.git/objects/x'); listener('change', '.git/index'); listener('change', null)
    expect(events).toEqual(['worktree', 'git', 'worktree'])
    handlers.error!(); handlers.error!()
    expect(onDegraded).toHaveBeenCalledTimes(1)
    expect(watcher.state()).toBe('degraded')
    expect(close).toHaveBeenCalledTimes(1)
    listener('change', 'late.ts')
    expect(events).toHaveLength(3) // nothing is delivered after degrading
    watcher.close()
  })

  it('starts degraded when the platform cannot watch', () => {
    const watcher = createDiffWatcher({ root: '/project', watch: (() => { throw new Error('EMFILE') }) as never, onEvent: () => {}, onDegraded: () => {} })
    expect(watcher.state()).toBe('degraded')
    expect(() => watcher.close()).not.toThrow()
  })
})

describe('createDiffWatcher on the real file system (macOS recursive fs.watch)', () => {
  let root = ''
  afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }) })

  it('sees a change in a nested directory and a change under .git/refs, and ignores .git/objects and node_modules', async () => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'diff watch ')))
    mkdirSync(join(root, 'src/deep'), { recursive: true })
    mkdirSync(join(root, '.git/objects'), { recursive: true })
    mkdirSync(join(root, '.git/refs/heads'), { recursive: true })
    mkdirSync(join(root, 'node_modules/pkg'), { recursive: true })
    // FSEvents can still deliver the creation of directories made just before a stream starts; let that pass first.
    await sleep(1200)
    const events: WatchEventKind[] = []
    const watcher = createDiffWatcher({ root, onEvent: (kind) => events.push(kind), onDegraded: () => {} })
    expect(watcher.state()).toBe('live')
    await sleep(300) // let the stream start
    writeFileSync(join(root, '.git/objects/blob'), 'x')
    writeFileSync(join(root, 'node_modules/pkg/index.js'), 'x')
    await sleep(300)
    expect(events).toEqual([])
    writeFileSync(join(root, 'src/deep/file.ts'), 'x')
    await waitFor(() => events.includes('worktree'), 5000)
    writeFileSync(join(root, '.git/refs/heads/main'), 'x')
    await waitFor(() => events.includes('git'), 5000)
    watcher.close()
    const seen = events.length
    writeFileSync(join(root, 'src/after-close.ts'), 'x')
    await sleep(300)
    expect(events).toHaveLength(seen)
  }, 20_000)
})
