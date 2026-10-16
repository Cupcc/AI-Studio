import { readdirSync, renameSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FilesChanged, FilesWatchChanged } from '@shared/tools/files'
import { createFilesService, type FilesService, type FilesServiceOptions } from './service'
import { createFixture, type Fixture } from './test-support'
import type { WatchListener } from './watcher'

let fixture: Fixture
afterEach(() => { fixture?.cleanup() })

function gate() {
  let open!: () => void
  const promise = new Promise<void>((resolve) => { open = resolve })
  return { promise, open }
}

function harness(overrides: Partial<FilesServiceOptions> = {}) {
  fixture = createFixture()
  const state = { closing: false }
  const changed: FilesChanged[] = []
  const watchChanged: FilesWatchChanged[] = []
  const listeners: WatchListener[] = []
  const service: FilesService = createFilesService({
    projectRoot: (id) => (id === 'p' ? fixture.root : null),
    canOperate: () => !state.closing,
    changed: (event) => changed.push(event),
    watchChanged: (event) => watchChanged.push(event),
    locale: 'en',
    watch: (_path, _options, listener) => { listeners.push(listener); return { close() {}, on() { return undefined } } },
    ...overrides
  })
  return { service, fixture, state, changed, watchChanged, listeners }
}

describe('list and read', () => {
  it('lists and reads through the Project root with a fresh revision per request', async () => {
    const h = harness()
    h.fixture.write('src/a.ts', 'const a = 1\n')
    const listed = await h.service.list('p', 'src')
    expect(listed).toMatchObject({ status: 'ok', path: 'src', entries: [{ name: 'a.ts', kind: 'file' }], truncated: false })
    const read = await h.service.read({ projectId: 'p', path: 'src/a.ts' })
    expect(read).toMatchObject({ status: 'ok', path: 'src/a.ts', text: 'const a = 1\n' })
    expect(read.revision).toBeGreaterThan(listed.revision)
    if (read.status !== 'ok') return
    expect(await h.service.read({ projectId: 'p', path: 'src/a.ts', ifVersion: read.version })).toMatchObject({ status: 'unchanged', version: read.version })
  })

  it('issues the revision when a request STARTS, so a slow early read cannot outrank a later one', async () => {
    const block = gate()
    let first = true
    const h = harness({ hooks: { afterListOpen: async () => { if (first) { first = false; await block.promise } } } })
    h.fixture.write('slow/a')
    h.fixture.write('fast/a')
    const slow = h.service.list('p', 'slow')
    await new Promise((resolve) => setTimeout(resolve, 20))
    const fast = await h.service.list('p', 'fast')
    block.open()
    const late = await slow
    expect(late.revision).toBeLessThan(fast.revision)
    expect(late.status).toBe('ok')
  })

  it('answers invalid_path, project_unavailable and project_closing without touching the filesystem', async () => {
    const h = harness()
    expect(await h.service.list('p', '../outside')).toMatchObject({ status: 'unavailable', reason: 'invalid_path' })
    expect(await h.service.read({ projectId: 'p', path: '/etc/passwd' })).toMatchObject({ status: 'unavailable', reason: 'invalid_path' })
    expect(await h.service.list('nope', '')).toMatchObject({ status: 'unavailable', reason: 'project_unavailable' })
    h.state.closing = true
    expect(await h.service.list('p', '')).toMatchObject({ status: 'unavailable', reason: 'project_closing' })
    expect(await h.service.read({ projectId: 'p', path: 'a' })).toMatchObject({ status: 'unavailable', reason: 'project_closing' })
  })

  it('maps filesystem failures to reasons and never leaks absolute paths into results', async () => {
    const h = harness()
    symlinkSync(h.fixture.outside, join(h.fixture.root, 'link'))
    const result = await h.service.list('p', 'link')
    expect(result).toMatchObject({ status: 'unavailable', reason: 'symlink_refused' })
    expect(JSON.stringify(result)).not.toContain(h.fixture.base)
  })

  it('times out a stalled request, and the stalled work stops and closes its descriptor once released', async () => {
    const block = gate()
    const h = harness({ timeoutMs: 50, hooks: { afterOpen: () => block.promise } })
    h.fixture.write('a.txt', 'abc')
    const openDescriptors = () => readdirSync('/dev/fd').length
    const baseline = openDescriptors()
    const started = Date.now()
    const result = await h.service.read({ projectId: 'p', path: 'a.txt' })
    expect(result).toMatchObject({ status: 'unavailable', reason: 'timeout' })
    expect(Date.now() - started).toBeLessThan(1000)
    // The abandoned work still holds its descriptor until it notices the deadline.
    expect(openDescriptors()).toBeGreaterThan(baseline)
    block.open()
    await vi.waitFor(() => { expect(openDescriptors()).toBeLessThanOrEqual(baseline) })
  })

  it('limits concurrent filesystem work so stalled volumes cannot take every worker thread', async () => {
    const block = gate()
    let running = 0, peak = 0
    const h = harness({ concurrency: 2, hooks: { afterListOpen: async () => { running++; peak = Math.max(peak, running); await block.promise; running-- } } })
    h.fixture.write('d/a')
    const requests = Array.from({ length: 6 }, () => h.service.list('p', 'd'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(running).toBe(2)
    block.open()
    const results = await Promise.all(requests)
    expect(peak).toBe(2)
    expect(results.every((result) => result.status === 'ok')).toBe(true)
  })
})

describe('Project close while work is in flight', () => {
  it('never delivers a read that finished after closeProject', async () => {
    let service: FilesService
    let closeOnce = true
    const h = harness({ hooks: { afterRead: async () => { if (closeOnce) { closeOnce = false; await service.closeProject('p') } } } })
    service = h.service
    h.fixture.write('secret.txt', 'content')
    const result = await h.service.read({ projectId: 'p', path: 'secret.txt' })
    expect(result).toMatchObject({ status: 'unavailable', reason: 'project_closing' })
    expect(JSON.stringify(result)).not.toContain('content')
    // After the close finished, a new request works again (a cancelled Project close).
    expect(await h.service.read({ projectId: 'p', path: 'secret.txt' })).toMatchObject({ status: 'ok', text: 'content' })
  })

  it('closeProject only affects its own Project and closeAll affects every in-flight request', async () => {
    let service: FilesService
    let action: () => Promise<void> = async () => {}
    const h = harness({ hooks: { afterListOpen: async () => { await action() } } })
    service = h.service
    h.fixture.write('d/a')
    action = () => service.closeProject('other')
    expect(await h.service.list('p', 'd')).toMatchObject({ status: 'ok' })
    action = () => service.closeAll()
    expect(await h.service.list('p', 'd')).toMatchObject({ status: 'unavailable', reason: 'project_closing' })
    action = async () => {}
    expect(await h.service.list('p', 'd')).toMatchObject({ status: 'ok' })
  })

  it('refuses everything after dispose', async () => {
    const h = harness()
    h.fixture.write('a.txt')
    await h.service.dispose()
    expect(await h.service.list('p', '')).toMatchObject({ status: 'unavailable', reason: 'project_closing' })
    expect(await h.service.resolve('p', ['a.txt'])).toEqual({ status: 'rejected', failures: [{ path: 'a.txt', reason: 'project_closing' }] })
    expect(h.service.subscribe('p', 1)).toMatchObject({ watch: 'stopped' })
  })

  it('closeProject stops the watcher and broadcasts stopped; closing twice broadcasts once', async () => {
    const h = harness()
    h.service.subscribe('p', 1)
    await h.service.closeProject('p')
    await h.service.closeProject('p')
    expect(h.watchChanged).toEqual([{ projectId: 'p', revision: expect.any(Number), watch: 'stopped' }])
  })
})

describe('file references', () => {
  it('resolves with absolute paths for the main process and strips them for the renderer', async () => {
    const h = harness()
    h.fixture.write('src/a.ts', 'abc')
    const resolved = await h.service.resolve('p', ['src/a.ts'])
    expect(resolved).toMatchObject({ status: 'ok', files: [{ path: 'src/a.ts', name: 'a.ts', size: 3, absolutePath: join(h.fixture.root, 'src/a.ts') }] })
    const forRenderer = await h.service.resolveReference('p', ['src/a.ts'])
    expect(forRenderer.status === 'ok' && Object.keys(forRenderer.files[0]!).sort()).toEqual(['name', 'path', 'size', 'version'])
    expect(JSON.stringify(forRenderer)).not.toContain(h.fixture.base)
  })

  it('rejects every path with the Project-level reason when the Project is unknown or closing', async () => {
    const h = harness()
    expect(await h.service.resolve('nope', ['a', 'b'])).toEqual({ status: 'rejected', failures: [{ path: 'a', reason: 'project_unavailable' }, { path: 'b', reason: 'project_unavailable' }] })
    h.state.closing = true
    expect(await h.service.resolveReference('p', ['a'])).toEqual({ status: 'rejected', failures: [{ path: 'a', reason: 'project_closing' }] })
  })

  it('answers ok for an empty list and reports a Project replaced by a link', async () => {
    const h = harness()
    h.fixture.write('a.txt')
    expect(await h.service.resolve('nope', [])).toEqual({ status: 'ok', files: [] })
    renameSync(h.fixture.root, join(h.fixture.base, 'moved'))
    symlinkSync(h.fixture.outside, h.fixture.root)
    expect(await h.service.resolve('p', ['a.txt'])).toEqual({ status: 'rejected', failures: [{ path: 'a.txt', reason: 'project_unavailable' }] })
  })

  it('times out the whole request with a timeout reason for every path', async () => {
    const block = gate()
    // One slot, held by a stalled listing: the reference request cannot even start before its deadline.
    const h = harness({ timeoutMs: 50, concurrency: 1, hooks: { afterListOpen: () => block.promise } })
    h.fixture.write('a.txt')
    h.fixture.write('d/x')
    const hog = h.service.list('p', 'd')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(await h.service.resolve('p', ['a.txt'])).toEqual({ status: 'rejected', failures: [{ path: 'a.txt', reason: 'timeout' }] })
    block.open()
    expect((await hog).status).toBe('unavailable')
  })
})

describe('subscriptions through the service', () => {
  it('routes subscribe, change events and unsubscribe through the watcher with the revision counter shared with reads', async () => {
    vi.useFakeTimers()
    try {
      const h = harness()
      const subscription = h.service.subscribe('p', 5)
      expect(subscription).toMatchObject({ projectId: 'p', watch: 'live' })
      h.listeners[0]!('rename', 'src/a.ts')
      vi.advanceTimersByTime(200)
      expect(h.changed).toHaveLength(1)
      expect(h.changed[0]!.revision).toBeGreaterThan(subscription.revision)
      h.service.unsubscribe('p', subscription.subscriptionId, 5)
      h.service.detachOwner(5)
    } finally { vi.useRealTimers() }
  })
})
