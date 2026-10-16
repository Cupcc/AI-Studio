import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileReadResult, FilesListResult } from '@shared/tools/files'
import { filesApi } from './api'
import { createFakeFiles, deferred, dir, file, idle, link, special } from './fake-files'
import { useFiles } from './files-store'

vi.mock('./api', () => ({ filesApi: vi.fn() }))

let n = 0
let id = 'p'
let fake: ReturnType<typeof createFakeFiles>
const store = () => useFiles.getState()
const project = () => useFiles.getState().projects[id]
const listed = () => fake.mocks.list.mock.calls.map(([request]) => request.path)
const viewer = () => project()?.viewer

beforeEach(() => {
  id = `p${++n}`
  fake = createFakeFiles(id)
  vi.mocked(filesApi).mockReturnValue(fake.api)
  // What installFilesIntegration() wires (covered in integration.test.ts).
  fake.api.onChanged(event => useFiles.getState().changed(event))
  fake.api.onWatchChanged(event => useFiles.getState().watchChanged(event))
  fake.setDir('', [dir('src'), dir('docs'), file('README.md')])
  fake.setDir('src', [dir('sub'), file('a.ts')])
  fake.setDir('src/sub', [file('deep.ts')])
  fake.setDir('docs', [file('guide.md')])
  fake.setFile('README.md', 'readme')
  fake.setFile('src/a.ts', 'const a = 1')
})
afterEach(() => { store().forget(id); vi.useRealTimers() })

describe('loading', () => {
  it('reads only the Project root when activated and a directory\'s direct children when it is expanded', async () => {
    await store().activate(id)
    await idle()
    expect(listed()).toEqual([''])
    expect(project()?.dirs.get('')?.entries.map(e => e.name)).toEqual(['src', 'docs', 'README.md'])
    await store().toggle(id, 'src')
    expect(listed()).toEqual(['', 'src'])
    expect(project()?.expanded.has('src')).toBe(true)
    // Collapsing and expanding again does not read again: the loaded set is kept.
    await store().toggle(id, 'src'); await store().toggle(id, 'src')
    expect(listed()).toEqual(['', 'src'])
  })

  it('issues no IPC while the panel was never active, and none after it is hidden', async () => {
    store().activate(id).catch(() => {})
    store().deactivate(id)
    await idle()
    fake.mocks.list.mockClear(); fake.mocks.read.mockClear(); fake.mocks.subscribe.mockClear()
    await store().toggle(id, 'src')
    await store().select(id, 'README.md')
    await store().refresh(id)
    store().changed({ projectId: id, revision: 99, dirs: [''], overflow: true })
    await idle()
    expect(fake.mocks.list).not.toHaveBeenCalled()
    expect(fake.mocks.read).not.toHaveBeenCalled()
    expect(fake.mocks.subscribe).not.toHaveBeenCalled()
  })

  it('unsubscribes when hidden and subscribes and revalidates again when shown', async () => {
    await store().activate(id)
    await idle()
    expect(fake.mocks.subscribe).toHaveBeenCalledTimes(1)
    store().deactivate(id)
    expect(fake.mocks.unsubscribe).toHaveBeenCalledWith({ projectId: id, subscriptionId: 's1' })
    expect(project()?.watch).toBeNull()
    fake.mocks.list.mockClear()
    await store().activate(id)
    await idle()
    expect(fake.mocks.subscribe).toHaveBeenCalledTimes(2)
    // What was loaded before the new subscription may be stale: it is read again.
    expect(listed()).toEqual([''])
    expect(project()?.watch).toBe('live')
  })
})

describe('revisions, epochs and forgetting', () => {
  it('discards a list result older than the one already applied for the same directory', async () => {
    await store().activate(id)
    await idle()
    const older = deferred<FilesListResult>(), newer = deferred<FilesListResult>()
    fake.mocks.list.mockImplementationOnce(() => older.promise as never).mockImplementationOnce(() => newer.promise as never)
    const first = store().refresh(id), second = store().refresh(id)
    newer.resolve({ status: 'ok', revision: 1001, path: '', entries: [file('new.txt')], truncated: false })
    await idle()
    older.resolve({ status: 'ok', revision: 1000, path: '', entries: [file('old.txt')], truncated: false })
    await Promise.all([first, second])
    expect(project()?.dirs.get('')?.entries.map(e => e.name)).toEqual(['new.txt'])
    expect(project()?.dirs.get('')?.loading).toBe(false)
  })

  it('applies an equal revision and an older read result only when it is not older than the applied one', async () => {
    await store().activate(id)
    await store().select(id, 'README.md')
    const slow = deferred<FileReadResult>(), fast = deferred<FileReadResult>()
    fake.mocks.read.mockImplementationOnce(() => slow.promise as never).mockImplementationOnce(() => fast.promise as never)
    const a = store().select(id, 'README.md'), b = store().refresh(id)
    fast.resolve({ status: 'ok', revision: 2001, path: 'README.md', version: 'v9', size: 5, encoding: 'utf-8', bom: false, lineEnding: 'lf', text: 'newer' })
    await idle()
    slow.resolve({ status: 'ok', revision: 2000, path: 'README.md', version: 'v8', size: 5, encoding: 'utf-8', bom: false, lineEnding: 'lf', text: 'older' })
    await Promise.all([a, b])
    const current = viewer()
    expect(current?.phase === 'ready' && current.text).toBe('newer')
  })

  it('drops results that arrive after the Project was forgotten and does not bring it back', async () => {
    const pending = deferred<FilesListResult>()
    fake.mocks.list.mockImplementationOnce(() => pending.promise as never)
    const opening = store().activate(id)
    await idle()
    store().forget(id)
    pending.resolve({ status: 'ok', revision: 500, path: '', entries: [file('late.txt')], truncated: false })
    await opening.catch(() => {})
    await idle()
    expect(project()).toBeUndefined()
    store().changed({ projectId: id, revision: 501, dirs: [''], overflow: true })
    store().watchChanged({ projectId: id, revision: 502, watch: 'live' })
    expect(project()).toBeUndefined()
    // Opening again starts from scratch.
    await store().activate(id)
    await idle()
    expect(project()?.dirs.get('')?.entries.map(e => e.name)).toEqual(['src', 'docs', 'README.md'])
  })

  it('does not apply a response from before a forget to the Project opened again afterwards', async () => {
    const stale = deferred<FilesListResult>()
    fake.mocks.list.mockImplementationOnce(() => stale.promise as never)
    const first = store().activate(id)
    await idle()
    store().forget(id)
    await store().activate(id)
    await idle()
    expect(project()?.dirs.get('')?.entries.map(e => e.name)).toEqual(['src', 'docs', 'README.md'])
    // Higher revision than anything applied since: only the epoch can reject it.
    stale.resolve({ status: 'ok', revision: 90_000, path: '', entries: [file('from-before.txt')], truncated: false })
    await first.catch(() => {})
    await idle()
    expect(project()?.dirs.get('')?.entries.map(e => e.name)).toEqual(['src', 'docs', 'README.md'])
  })

  it('releases a subscription whose answer arrives after the panel was hidden', async () => {
    const pending = deferred<Awaited<ReturnType<typeof fake.mocks.subscribe>>>()
    fake.mocks.subscribe.mockImplementationOnce(() => pending.promise)
    void store().activate(id)
    await idle()
    store().deactivate(id)
    pending.resolve({ projectId: id, subscriptionId: 'late', revision: 700, watch: 'live' })
    await idle()
    expect(fake.mocks.unsubscribe).toHaveBeenCalledWith({ projectId: id, subscriptionId: 'late' })
    expect(project()?.watch).toBeNull()
  })
})

describe('events', () => {
  async function opened() {
    await store().activate(id)
    await store().toggle(id, 'src')
    await store().toggle(id, 'docs')
    await idle()
    fake.mocks.list.mockClear()
  }

  it('re-lists only the loaded directories a change event names', async () => {
    await opened()
    fake.setDir('src', [dir('sub'), file('a.ts'), file('b.ts')])
    fake.emitChanged(['src', 'never-opened'])
    await idle()
    expect(listed()).toEqual(['src'])
    expect(project()?.dirs.get('src')?.entries.map(e => e.name)).toEqual(['sub', 'a.ts', 'b.ts'])
  })

  it('on overflow revalidates every loaded directory', async () => {
    await opened()
    fake.emitChanged([], true)
    await idle()
    expect(listed().sort()).toEqual(['', 'docs', 'src'])
  })

  it('keeps a collapsed directory dirty and lists it when it is expanded again', async () => {
    await opened()
    await store().toggle(id, 'docs')
    fake.setDir('docs', [file('guide.md'), file('new.md')])
    fake.emitChanged(['docs'])
    await idle()
    expect(listed()).toEqual([])
    await store().toggle(id, 'docs')
    expect(listed()).toEqual(['docs'])
    expect(project()?.dirs.get('docs')?.entries).toHaveLength(2)
  })

  it('lists again after a change that happened while the first request was in flight', async () => {
    await opened()
    const pending = deferred<FilesListResult>()
    fake.mocks.list.mockImplementationOnce(() => pending.promise as never)
    const startedAt = fake.nextRevision()
    const refreshing = store().refresh(id)
    fake.emitChanged([''])
    await idle()
    expect(listed()).toEqual(['', 'src', 'docs'])
    pending.resolve({ status: 'ok', revision: startedAt, path: '', entries: [file('stale.txt')], truncated: false })
    await refreshing
    await idle()
    expect(listed().filter(path => path === '')).toHaveLength(2)
    expect(project()?.dirs.get('')?.entries.map(e => e.name)).toEqual(['src', 'docs', 'README.md'])
  })

  it('treats a result that predates the subscription as stale and reads it again', async () => {
    const early = deferred<FilesListResult>()
    fake.mocks.list.mockImplementationOnce(() => early.promise as never)
    // The root listing was issued before the subscription answered, so it may have missed a change.
    const opening = store().activate(id)
    await idle()
    expect(project()?.watch).toBe('live')
    early.resolve({ status: 'ok', revision: 1, path: '', entries: [file('old.txt')], truncated: false })
    await opening
    await idle()
    expect(listed()).toEqual(['', ''])
    expect(project()?.dirs.get('')?.entries.map(e => e.name)).toEqual(['src', 'docs', 'README.md'])
  })

  it('re-reads a result that predates the subscription once, never in a loop, even when revisions do not order', async () => {
    let calls = 0
    // Revision 1 never exceeds the subscription's. After 20 calls the fake ends a runaway loop with a result that does.
    fake.mocks.list.mockImplementation(async ({ path }) => ++calls > 20
      ? { status: 'unavailable' as const, revision: 99_999, path, reason: 'timeout' as const }
      : { status: 'ok' as const, revision: 1, path, entries: [file('x')], truncated: false })
    await store().activate(id)
    await idle()
    expect(calls).toBeLessThan(5)
  })

  it('re-subscribes after the service reports stopped (with backoff) and revalidates what is loaded', async () => {
    vi.useFakeTimers()
    await store().activate(id)
    await store().toggle(id, 'src')
    await store().select(id, 'src/a.ts')
    await vi.advanceTimersByTimeAsync(0)
    fake.mocks.list.mockClear(); fake.mocks.read.mockClear()
    fake.emitWatch('stopped')
    expect(project()?.watch).toBe('stopped')
    await vi.advanceTimersByTimeAsync(499)
    expect(fake.mocks.subscribe).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fake.mocks.subscribe).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(0)
    expect(project()?.watch).toBe('live')
    expect(listed().sort()).toEqual(['', 'src'])
    expect(fake.mocks.read).toHaveBeenCalledWith({ projectId: id, path: 'src/a.ts', ifVersion: 'v1' })
    expect(viewer()).toMatchObject({ phase: 'ready', text: 'const a = 1' })
  })

  it('backs off while the service keeps refusing, and stops retrying once the Project is forgotten', async () => {
    vi.useFakeTimers()
    fake.mocks.subscribe.mockRejectedValue(new Error('project closing'))
    await store().activate(id)
    await vi.advanceTimersByTimeAsync(0)
    expect(project()?.watch).toBe('degraded')
    await vi.advanceTimersByTimeAsync(500)
    expect(fake.mocks.subscribe).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fake.mocks.subscribe).toHaveBeenCalledTimes(3)
    store().forget(id)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fake.mocks.subscribe).toHaveBeenCalledTimes(3)
  })

  it('revalidates everything when the watcher recovers from degraded', async () => {
    fake.setSubscribeWatch('degraded')
    await store().activate(id)
    await idle()
    expect(project()?.watch).toBe('degraded')
    fake.mocks.list.mockClear()
    fake.emitWatch('live')
    await idle()
    expect(project()?.watch).toBe('live')
    expect(listed()).toEqual([''])
  })

  it('ignores a watch notification older than the one applied', async () => {
    await store().activate(id)
    await idle()
    store().watchChanged({ projectId: id, revision: 5000, watch: 'degraded' })
    store().watchChanged({ projectId: id, revision: 4999, watch: 'live' })
    expect(project()?.watch).toBe('degraded')
  })
})

describe('selection and the open file', () => {
  async function viewing() {
    await store().activate(id)
    await store().toggle(id, 'src')
    await store().select(id, 'src/a.ts')
    await idle()
    fake.mocks.list.mockClear(); fake.mocks.read.mockClear()
  }

  it('opens a file without touching anything but the read', async () => {
    await viewing()
    expect(project()?.selected).toBe('src/a.ts')
    expect(viewer()).toMatchObject({ path: 'src/a.ts', phase: 'ready', text: 'const a = 1', encoding: 'utf-8' })
  })

  it('keeps expansion and selection across a refresh while the entries still exist, and answers `unchanged` without text', async () => {
    await viewing()
    await store().toggle(id, 'src/sub')
    fake.mocks.list.mockClear()
    fake.setDir('src', [dir('sub'), file('a.ts'), file('b.ts')])
    fake.emitChanged(['src'])
    await idle()
    expect(project()?.selected).toBe('src/a.ts')
    expect(project()?.expanded.has('src/sub')).toBe(true)
    expect(project()?.expanded.has('src')).toBe(true)
    expect(fake.mocks.read).toHaveBeenCalledWith({ projectId: id, path: 'src/a.ts', ifVersion: 'v1' })
    expect(viewer()).toMatchObject({ phase: 'ready', text: 'const a = 1' })
  })

  it('shows new text when the open file changed', async () => {
    await viewing()
    fake.setFile('src/a.ts', 'const a = 2')
    fake.emitChanged(['src'])
    await idle()
    expect(viewer()).toMatchObject({ phase: 'ready', text: 'const a = 2' })
  })

  it('does not read the open file when only an unrelated directory changed', async () => {
    await viewing()
    fake.emitChanged([''])
    await idle()
    expect(fake.mocks.read).not.toHaveBeenCalled()
  })

  it('forgets the expansion of a directory that disappeared', async () => {
    await viewing()
    await store().toggle(id, 'src/sub')
    await store().toggle(id, 'docs')
    expect(project()?.dirs.has('src/sub')).toBe(true)
    fake.setDir('src', [file('a.ts')])
    fake.removeDir('src/sub')
    fake.emitChanged(['src'])
    await idle()
    expect(project()?.expanded.has('src/sub')).toBe(false)
    expect(project()?.dirs.has('src/sub')).toBe(false)
    // Everything that still exists keeps its expansion and its loaded listing.
    expect([...project()!.expanded].sort()).toEqual(['docs', 'src'])
    expect(project()?.dirs.has('docs')).toBe(true)
    expect(project()?.selected).toBe('src/a.ts')
  })

  it('clears the selection and keeps a notice when the selected file is deleted, until another file is selected', async () => {
    await viewing()
    fake.setDir('src', [dir('sub')])
    fake.removeFile('src/a.ts')
    fake.emitChanged(['src'])
    await idle()
    expect(project()?.selected).toBeNull()
    expect(viewer()).toEqual({ path: 'src/a.ts', phase: 'unavailable', reason: 'missing' })
    // Later events neither revive nor remove the notice.
    fake.emitChanged(['src']); fake.emitChanged([], true)
    await idle()
    expect(viewer()).toEqual({ path: 'src/a.ts', phase: 'unavailable', reason: 'missing' })
    await store().select(id, 'README.md')
    expect(project()?.selected).toBe('README.md')
    expect(viewer()).toMatchObject({ path: 'README.md', phase: 'ready' })
  })

  it('notices a deletion reported by the read itself, and when a whole ancestor directory is gone', async () => {
    await viewing()
    fake.removeFile('src/a.ts')
    fake.emitChanged(['src'])
    await idle()
    expect(project()?.selected).toBeNull()
    await store().toggle(id, 'docs')
    await store().select(id, 'docs/guide.md')
    fake.setDir('', [dir('src'), file('README.md')])
    fake.emitChanged([''])
    await idle()
    expect(project()?.selected).toBeNull()
    expect(viewer()).toMatchObject({ path: 'docs/guide.md', phase: 'unavailable', reason: 'missing' })
  })

  it.each(['permission_denied', 'binary', 'too_large', 'unsupported_encoding', 'timeout', 'changed_while_reading'] as const)('never shows the old text after the file became unavailable (%s)', async reason => {
    await viewing()
    fake.failFile('src/a.ts', reason)
    fake.emitChanged(['src'])
    await idle()
    const current = viewer()
    expect(current).toMatchObject({ path: 'src/a.ts', phase: 'unavailable', reason })
    expect(current && 'text' in current).toBe(false)
    expect(project()?.selected).toBe('src/a.ts')
  })

  it('shows an unreadable file after a failed call and recovers on the next read', async () => {
    await viewing()
    fake.mocks.read.mockRejectedValueOnce(new Error('ipc failed'))
    await store().refresh(id)
    await idle()
    expect(viewer()).toEqual({ path: 'src/a.ts', phase: 'unavailable', reason: 'unreadable' })
    await store().refresh(id)
    await idle()
    expect(viewer()).toMatchObject({ phase: 'ready', text: 'const a = 1' })
  })

  it('drops the result of a read for a file that is no longer open', async () => {
    await store().activate(id)
    await idle()
    const slow = deferred<FileReadResult>()
    fake.mocks.read.mockImplementationOnce(() => slow.promise as never)
    const first = store().select(id, 'README.md')
    await store().toggle(id, 'src')
    await store().select(id, 'src/a.ts')
    slow.resolve({ status: 'ok', revision: 3000, path: 'README.md', version: 'v1', size: 6, encoding: 'utf-8', bom: false, lineEnding: 'lf', text: 'readme' })
    await first
    expect(viewer()).toMatchObject({ path: 'src/a.ts', phase: 'ready' })
    expect(project()?.selected).toBe('src/a.ts')
  })

  it('does not read a symbolic link or a special file: they are not openable', async () => {
    fake.setDir('', [link('shortcut'), special('pipe'), file('README.md')])
    await store().activate(id)
    await idle()
    await store().select(id, 'shortcut')
    expect(viewer()).toEqual({ path: 'shortcut', phase: 'unavailable', reason: 'symlink_refused' })
    await store().select(id, 'pipe')
    expect(viewer()).toEqual({ path: 'pipe', phase: 'unavailable', reason: 'not_file' })
    expect(fake.mocks.read).not.toHaveBeenCalled()
    fake.emitChanged([''])
    await idle()
    expect(fake.mocks.read).not.toHaveBeenCalled()
  })

  it('closing the viewer clears the selection', async () => {
    await viewing()
    store().closeViewer(id)
    expect(project()?.selected).toBeNull()
    expect(viewer()).toBeNull()
  })
})

describe('directories that fail', () => {
  it('shows the reason instead of the previous entries and recovers on the next listing', async () => {
    await store().activate(id)
    await store().toggle(id, 'src')
    await idle()
    fake.setDir('src', 'permission_denied')
    fake.emitChanged(['src'])
    await idle()
    expect(project()?.dirs.get('src')).toMatchObject({ reason: 'permission_denied', entries: [] })
    // Its expansion survives a transient failure; only a vanished directory loses it.
    expect(project()?.expanded.has('src')).toBe(true)
    fake.setDir('src', [file('a.ts')])
    fake.emitChanged(['src'])
    await idle()
    expect(project()?.dirs.get('src')).toMatchObject({ reason: null, entries: [{ name: 'a.ts', kind: 'file' }] })
  })

  it('records the truncation flag of a listing', async () => {
    fake.mocks.list.mockResolvedValueOnce({ status: 'ok', revision: 9, path: '', entries: [file('a')], truncated: true })
    await store().activate(id)
    await idle()
    expect(project()?.dirs.get('')?.truncated).toBe(true)
  })

  it('treats a failed listing call as an unreadable directory', async () => {
    fake.mocks.list.mockRejectedValueOnce(new Error('ipc failed'))
    await store().activate(id)
    await idle()
    expect(project()?.dirs.get('')).toMatchObject({ reason: 'unreadable', entries: [] })
  })
})
