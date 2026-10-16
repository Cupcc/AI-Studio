import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DiffFileResult, DiffSnapshot } from '@shared/tools/diff'
import { diffApi } from './api'
import { LIST_RATIO, RESUBSCRIBE_DELAYS_MS, useDiff } from './diff-store'
import { deferred, entry, fakeDiffApi, okFile, snapshot, subscription, type FakeDiff } from './diff-fixtures'

vi.mock('./api', () => ({ diffApi: vi.fn() }))
let fake: FakeDiff
const state = () => useDiff.getState().projects.p
const store = () => useDiff.getState()
const calls = (mock: unknown) => vi.mocked(mock as (...args: unknown[]) => unknown).mock.calls
const idle = () => vi.waitFor(() => { expect(state()?.loading).toBe(false); expect(state()?.snapshot).not.toBeNull() })
/** Activates the panel and waits for the first snapshot. */
async function open() { const stop = store().activate('p'); await idle(); return stop }
beforeEach(() => {
  store().forget('p'); useDiff.setState({ projects: {} })
  fake = fakeDiffApi(); vi.mocked(diffApi).mockReturnValue(fake.api)
  // What installDiffIntegration does (covered in integration.test.ts), so the tests can emit service events.
  fake.api.onInvalidated(event => store().handleInvalidated(event)); fake.api.onWatchChanged(event => store().handleWatchChanged(event))
})
afterEach(() => { vi.useRealTimers(); store().forget('p') })

it('attaches the watcher before the first query so no later change is missed', async () => {
  const stop = await open()
  const [subscribed] = vi.mocked(fake.api.subscribe).mock.invocationCallOrder
  const [queried] = vi.mocked(fake.api.getSnapshot).mock.invocationCallOrder
  expect(subscribed).toBeLessThan(queried!)
  expect(state()?.watch).toBe('live')
  stop()
})

it('applies a result only when its revision is not older than the applied one', async () => {
  vi.mocked(fake.api.getSnapshot)
    .mockResolvedValueOnce(snapshot({ revision: 10, files: [entry('new.ts')] }))
    .mockResolvedValueOnce(snapshot({ revision: 7, files: [entry('old.ts')] }))
    .mockResolvedValueOnce(snapshot({ revision: 10, files: [entry('same.ts')] }))
  await open()
  store().refresh('p')
  await vi.waitFor(() => expect(fake.api.getSnapshot).toHaveBeenCalledTimes(2))
  await idle()
  expect(state()?.snapshot?.files.map(f => f.path)).toEqual(['new.ts'])
  expect(state()?.appliedRevision).toBe(10)
  store().refresh('p')
  await vi.waitFor(() => expect(state()?.snapshot?.files[0]?.path).toBe('same.ts'))
})

it('drops a slower single-file result that arrives after a newer one', async () => {
  const slow = deferred<DiffFileResult>()
  vi.mocked(fake.api.getSnapshot).mockResolvedValueOnce(snapshot({ revision: 1 })).mockResolvedValueOnce(snapshot({ revision: 2 }))
  vi.mocked(fake.api.getFile).mockReturnValueOnce(slow.promise).mockResolvedValueOnce(okFile('src/a.ts', 22, { modified: { status: 'text', text: 'fresh', size: 5 } }))
  await open()
  store().select('p', entry('src/a.ts'))
  await vi.waitFor(() => expect(fake.api.getFile).toHaveBeenCalledTimes(1))
  store().refresh('p')
  await vi.waitFor(() => expect(state()?.file.appliedRevision).toBe(22))
  slow.resolve(okFile('src/a.ts', 20, { modified: { status: 'text', text: 'stale', size: 5 } }))
  await new Promise(done => setTimeout(done, 0))
  const result = state()?.file.result
  expect(result?.status === 'ok' && result.modified).toEqual({ status: 'text', text: 'fresh', size: 5 })
  expect(state()?.file.appliedRevision).toBe(22)
})

it('never shows a file result for another path and ignores the failure of a superseded request', async () => {
  vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ files: [entry('a.ts'), entry('b.ts')] }))
  const first = deferred<DiffFileResult>()
  vi.mocked(fake.api.getFile).mockReturnValueOnce(first.promise).mockResolvedValueOnce(okFile('b.ts', 30))
  await open()
  store().select('p', entry('a.ts'))
  store().select('p', entry('b.ts'))
  await vi.waitFor(() => expect(state()?.file.result?.status).toBe('ok'))
  first.reject(new Error('late failure of a.ts'))
  await new Promise(done => setTimeout(done, 0))
  expect(state()?.file.path).toBe('b.ts')
  expect(state()?.file.error).toBeNull()
  expect(state()?.file.result).toMatchObject({ status: 'ok', entry: { path: 'b.ts' } })
})

it('keeps the selection by path across refreshes, re-reads the file and clears it with a notice when it no longer differs', async () => {
  vi.mocked(fake.api.getSnapshot)
    .mockResolvedValueOnce(snapshot({ revision: 1, files: [entry('a.ts'), entry('b.ts')] }))
    .mockResolvedValueOnce(snapshot({ revision: 2, files: [entry('b.ts', { additions: 9 }), entry('c.ts')] }))
    .mockResolvedValueOnce(snapshot({ revision: 3, files: [entry('c.ts')] }))
  await open()
  store().select('p', entry('b.ts'))
  await vi.waitFor(() => expect(state()?.file.result?.status).toBe('ok'))
  expect(fake.api.getFile).toHaveBeenCalledTimes(1)
  store().refresh('p')
  await vi.waitFor(() => expect(state()?.appliedRevision).toBe(2))
  expect(state()?.selected?.path).toBe('b.ts')
  // The same counts do not prove the same text: the file is read again after every applied list.
  await vi.waitFor(() => expect(fake.api.getFile).toHaveBeenCalledTimes(2))
  store().refresh('p')
  await vi.waitFor(() => expect(state()?.appliedRevision).toBe(3))
  expect(state()?.selected).toBeNull()
  expect(state()?.file.result).toBeNull()
  expect(state()?.clearedPath).toBe('b.ts')
  expect(fake.api.getFile).toHaveBeenCalledTimes(2)
})

it('keeps a selection through a failed or truncated list, and drops the content that could be stale', async () => {
  vi.mocked(fake.api.getSnapshot)
    .mockResolvedValueOnce(snapshot({ revision: 1, files: [entry('a.ts')] }))
    .mockResolvedValueOnce(snapshot({ revision: 2, status: 'timeout', files: [], detail: null }))
    .mockResolvedValueOnce(snapshot({ revision: 3, files: [entry('other.ts')], truncated: true }))
  await open()
  store().select('p', entry('a.ts'))
  await vi.waitFor(() => expect(state()?.file.result?.status).toBe('ok'))
  store().refresh('p')
  await vi.waitFor(() => expect(state()?.snapshot?.status).toBe('timeout'))
  expect(state()?.selected?.path).toBe('a.ts')
  expect(state()?.file.result).toBeNull()
  expect(state()?.clearedPath).toBeNull()
  store().refresh('p')
  await vi.waitFor(() => expect(state()?.appliedRevision).toBe(3))
  // The list was cut off, so absence proves nothing: the single-file query answers.
  expect(state()?.selected?.path).toBe('a.ts')
  expect(state()?.clearedPath).toBeNull()
  await vi.waitFor(() => expect(state()?.file.result?.status).toBe('ok'))
})

it('removes the notice once the file differs again', async () => {
  vi.mocked(fake.api.getSnapshot)
    .mockResolvedValueOnce(snapshot({ revision: 1, files: [entry('a.ts')] }))
    .mockResolvedValueOnce(snapshot({ revision: 2, files: [] , status: 'clean' }))
    .mockResolvedValueOnce(snapshot({ revision: 3, files: [entry('a.ts')] }))
  await open()
  store().select('p', entry('a.ts'))
  store().refresh('p')
  await vi.waitFor(() => expect(state()?.clearedPath).toBe('a.ts'))
  store().refresh('p')
  await vi.waitFor(() => expect(state()?.appliedRevision).toBe(3))
  expect(state()?.clearedPath).toBeNull()
})

it('answers any number of invalidations during a query with exactly one more query', async () => {
  const first = deferred<DiffSnapshot>()
  vi.mocked(fake.api.getSnapshot).mockReturnValueOnce(first.promise)
  const stop = store().activate('p')
  await vi.waitFor(() => expect(fake.api.getSnapshot).toHaveBeenCalledTimes(1))
  for (let i = 0; i < 5; i++) fake.invalidated({ projectId: 'p', revision: i })
  store().refresh('p')
  expect(fake.api.getSnapshot).toHaveBeenCalledTimes(1)
  first.resolve(snapshot({ revision: 1 }))
  await vi.waitFor(() => expect(fake.api.getSnapshot).toHaveBeenCalledTimes(2))
  await idle()
  await new Promise(done => setTimeout(done, 20))
  expect(fake.api.getSnapshot).toHaveBeenCalledTimes(2)
  stop()
})

it('does not query for an inactive or forgotten Project and ignores events after the panel hides', async () => {
  fake.invalidated({ projectId: 'p', revision: 1 })
  store().refresh('p')
  expect(fake.api.getSnapshot).not.toHaveBeenCalled()
  const stop = await open()
  stop()
  expect(fake.api.unsubscribe).toHaveBeenCalledWith({ projectId: 'p', subscriptionId: 's1' })
  fake.invalidated({ projectId: 'p', revision: 2 })
  fake.watchChanged({ projectId: 'p', revision: 2, watch: 'stopped' })
  store().refresh('p')
  await new Promise(done => setTimeout(done, 0))
  expect(fake.api.getSnapshot).toHaveBeenCalledTimes(1)
  expect(fake.api.subscribe).toHaveBeenCalledTimes(1)
  expect(state()?.watch).toBeNull()
})

it('queries again every time the panel becomes active', async () => {
  const stop = await open()
  stop()
  await open()
  expect(fake.api.getSnapshot).toHaveBeenCalledTimes(2)
  expect(fake.api.subscribe).toHaveBeenCalledTimes(2)
})

it('re-subscribes after the service stops watching and re-queries what it missed', async () => {
  vi.mocked(fake.api.subscribe).mockResolvedValueOnce(subscription({ subscriptionId: 's1' })).mockResolvedValueOnce(subscription({ subscriptionId: 's2' }))
  const stop = await open()
  fake.watchChanged({ projectId: 'p', revision: 5, watch: 'stopped' })
  expect(state()?.watch).toBe('stopped')
  await vi.waitFor(() => expect(fake.api.subscribe).toHaveBeenCalledTimes(2))
  await vi.waitFor(() => expect(state()?.watch).toBe('live'))
  await vi.waitFor(() => expect(fake.api.getSnapshot).toHaveBeenCalledTimes(2))
  // The stopped subscription is gone on the service side: only the new one is released when the panel hides.
  stop()
  expect(fake.api.unsubscribe).toHaveBeenCalledTimes(1)
  expect(fake.api.unsubscribe).toHaveBeenCalledWith({ projectId: 'p', subscriptionId: 's2' })
})

it('keeps retrying a refused re-subscribe a bounded number of times and shows the degraded badge', async () => {
  const stop = await open()
  vi.useFakeTimers()
  vi.mocked(fake.api.subscribe).mockRejectedValue(new Error('project is closing'))
  fake.watchChanged({ projectId: 'p', revision: 5, watch: 'stopped' })
  await vi.advanceTimersByTimeAsync(0)
  expect(state()?.watch).toBe('degraded')
  for (const delay of RESUBSCRIBE_DELAYS_MS) await vi.advanceTimersByTimeAsync(delay)
  // The first attempt of `open()` plus the stopped attempt plus one per delay.
  expect(fake.api.subscribe).toHaveBeenCalledTimes(2 + RESUBSCRIBE_DELAYS_MS.length)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(fake.api.subscribe).toHaveBeenCalledTimes(2 + RESUBSCRIBE_DELAYS_MS.length)
  vi.mocked(fake.api.subscribe).mockResolvedValue(subscription({ subscriptionId: 's9' }))
  // The refresh button tries again by hand.
  store().reload('p')
  await vi.advanceTimersByTimeAsync(0)
  expect(state()?.watch).toBe('live')
  stop()
})

it('gives back a subscription whose reply arrives after the panel hid', async () => {
  const reply = deferred<ReturnType<typeof subscription>>()
  vi.mocked(fake.api.subscribe).mockReturnValueOnce(reply.promise)
  const stop = store().activate('p')
  stop()
  reply.resolve(subscription({ subscriptionId: 'late' }))
  await vi.waitFor(() => expect(fake.api.unsubscribe).toHaveBeenCalledWith({ projectId: 'p', subscriptionId: 'late' }))
  expect(fake.api.getSnapshot).not.toHaveBeenCalled()
})

it('re-queries when the watcher recovers from degraded', async () => {
  const stop = await open()
  fake.watchChanged({ projectId: 'p', revision: 3, watch: 'degraded' })
  expect(state()?.watch).toBe('degraded')
  expect(fake.api.getSnapshot).toHaveBeenCalledTimes(1)
  fake.watchChanged({ projectId: 'p', revision: 4, watch: 'live' })
  await vi.waitFor(() => expect(fake.api.getSnapshot).toHaveBeenCalledTimes(2))
  stop()
})

it('forgets a closed Project: late answers and events cannot bring it back, the watcher is released', async () => {
  const late = deferred<DiffSnapshot>()
  vi.mocked(fake.api.getSnapshot).mockReturnValueOnce(late.promise)
  store().activate('p')
  await vi.waitFor(() => expect(fake.api.getSnapshot).toHaveBeenCalledTimes(1))
  store().forget('p')
  expect(state()).toBeUndefined()
  expect(fake.api.unsubscribe).toHaveBeenCalledWith({ projectId: 'p', subscriptionId: 's1' })
  late.resolve(snapshot({ revision: 5 }))
  fake.invalidated({ projectId: 'p', revision: 6 })
  fake.watchChanged({ projectId: 'p', revision: 7, watch: 'live' })
  await new Promise(done => setTimeout(done, 0))
  expect(state()).toBeUndefined()
  expect(fake.api.getSnapshot).toHaveBeenCalledTimes(1)
  // Reopening the same Project starts from nothing, with a higher epoch.
  await open()
  expect(state()?.snapshot?.revision).toBe(1)
})

it('ignores the late answer of a previous life of the Project after it was reopened', async () => {
  const old = deferred<DiffSnapshot>()
  vi.mocked(fake.api.getSnapshot).mockReturnValueOnce(old.promise).mockResolvedValueOnce(snapshot({ revision: 1, files: [entry('fresh.ts')] }))
  store().activate('p')
  await vi.waitFor(() => expect(fake.api.getSnapshot).toHaveBeenCalledTimes(1))
  store().forget('p')
  await open()
  // Higher revision, but from before the Project was closed: it must neither show nor block the new answers.
  old.resolve(snapshot({ revision: 50, files: [entry('stale.ts')] }))
  await new Promise(done => setTimeout(done, 0))
  expect(state()?.snapshot?.files.map(f => f.path)).toEqual(['fresh.ts'])
  expect(state()?.appliedRevision).toBe(1)
})

it('keeps the previous list and reports a failed refresh, and clears the failure by the next success', async () => {
  vi.mocked(fake.api.getSnapshot).mockResolvedValueOnce(snapshot({ revision: 1 })).mockRejectedValueOnce(new Error("Error invoking remote method 'diff:get-snapshot': Error: boom"))
  await open()
  store().refresh('p')
  await vi.waitFor(() => expect(state()?.error).toBe('boom'))
  expect(state()?.snapshot?.revision).toBe(1)
  store().refresh('p')
  await vi.waitFor(() => expect(state()?.error).toBeNull())
})

it('shows no content of a file whose read failed', async () => {
  vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ files: [entry('a.ts')] }))
  await open()
  store().select('p', entry('a.ts'))
  await vi.waitFor(() => expect(state()?.file.result?.status).toBe('ok'))
  vi.mocked(fake.api.getFile).mockRejectedValueOnce(new Error('git timed out'))
  store().refresh('p')
  await vi.waitFor(() => expect(state()?.file.error).toBe('git timed out'))
  expect(state()?.file.result).toBeNull()
  vi.mocked(fake.api.getFile).mockResolvedValueOnce(okFile('a.ts', 300))
  store().retryFile('p')
  await vi.waitFor(() => expect(state()?.file.result?.status).toBe('ok'))
  expect(state()?.file.error).toBeNull()
})

it('selects and deselects without querying twice for the same row, and bounds the list ratio', async () => {
  await open()
  store().select('p', entry('src/a.ts'))
  store().select('p', entry('src/a.ts'))
  await vi.waitFor(() => expect(state()?.file.result?.status).toBe('ok'))
  expect(fake.api.getFile).toHaveBeenCalledTimes(1)
  expect(calls(fake.api.getFile)[0]).toEqual([{ projectId: 'p', path: 'src/a.ts', oldPath: null }])
  store().select('p', null)
  expect(state()?.selected).toBeNull()
  store().setListRatio('p', 5)
  expect(state()?.listRatio).toBe(LIST_RATIO.max)
  store().setListRatio('p', -1)
  expect(state()?.listRatio).toBe(LIST_RATIO.min)
})

it('passes the rename source with the single-file query', async () => {
  vi.mocked(fake.api.getSnapshot).mockResolvedValue(snapshot({ files: [entry('new.ts', { kind: 'renamed', oldPath: 'old.ts' })] }))
  await open()
  store().select('p', entry('new.ts', { kind: 'renamed', oldPath: 'old.ts' }))
  await vi.waitFor(() => expect(fake.api.getFile).toHaveBeenCalledWith({ projectId: 'p', path: 'new.ts', oldPath: 'old.ts' }))
})
