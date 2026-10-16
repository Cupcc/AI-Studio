// Test fixtures of the Diff panel: contract-shaped data and a scriptable fake of the `diff` bridge.
import { vi } from 'vitest'
import type {
  DiffFileEntry, DiffFileResult, DiffInvalidated, DiffSnapshot, DiffSubscription, DiffWatchChanged
} from '@shared/tools/diff'
import type { DiffApi } from './api'

export const entry = (path: string, patch: Partial<DiffFileEntry> = {}): DiffFileEntry => ({
  path, oldPath: null, kind: 'modified', untracked: false, binary: false, additions: 2, deletions: 1,
  oldMode: '100644', newMode: '100644', renameScore: null, special: null, ...patch
})

export const snapshot = (patch: Partial<DiffSnapshot> = {}): DiffSnapshot => ({
  projectId: 'p', revision: 1, settled: true, status: 'ready', head: { branch: 'main', commit: 'abc1234def', detached: false },
  repoPrefix: '', files: [entry('src/a.ts')], truncated: false, detail: null, gitVersion: '2.39.2', computedAt: 0, ...patch
})

type Ok = Extract<DiffFileResult, { status: 'ok' }>
export const okFile = (path: string, revision: number, patch: Partial<Ok> = {}): Ok => ({
  status: 'ok', revision, settled: true, entry: entry(path),
  original: { status: 'text', text: 'old', size: 3 }, modified: { status: 'text', text: 'new', size: 3 },
  patch: { text: '@@ -1 +1 @@\n-old\n+new\n', truncated: false }, ...patch
})

export interface Deferred<T> { promise: Promise<T>; resolve(value: T): void; reject(reason: unknown): void }
export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

export const subscription = (patch: Partial<DiffSubscription> = {}): DiffSubscription =>
  ({ projectId: 'p', subscriptionId: 's1', revision: 1, watch: 'live', ...patch })

export interface FakeDiff {
  api: DiffApi
  invalidated(event: DiffInvalidated): void
  watchChanged(event: DiffWatchChanged): void
}
/** Every call resolves with a sensible default; tests override single mocks. Listeners are captured, not wired to a bridge. */
export function fakeDiffApi(): FakeDiff {
  const invalidated = new Set<(event: DiffInvalidated) => void>(), watch = new Set<(event: DiffWatchChanged) => void>()
  const api: DiffApi = {
    getSnapshot: vi.fn().mockResolvedValue(snapshot()),
    getFile: vi.fn().mockImplementation(async (request: { path: string }) => okFile(request.path, 100)),
    subscribe: vi.fn().mockResolvedValue(subscription()),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    onInvalidated: vi.fn(listener => { invalidated.add(listener); return () => { invalidated.delete(listener) } }),
    onWatchChanged: vi.fn(listener => { watch.add(listener); return () => { watch.delete(listener) } })
  }
  return { api, invalidated: event => invalidated.forEach(listener => listener(event)), watchChanged: event => watch.forEach(listener => listener(event)) }
}
