import { vi } from 'vitest'
import type { FileEntry, FilesChanged, FileUnavailableReason, FilesWatchChanged, FilesWatchState } from '@shared/tools/files'
import type { FilesApi } from './api'

// In-memory stand-in for the Files service used by the store and panel tests. The real bridge is never used.

export interface Deferred<T> { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void }
export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

export const dir = (name: string): FileEntry => ({ name, kind: 'directory' })
export const file = (name: string): FileEntry => ({ name, kind: 'file' })
export const link = (name: string, linkTarget = 'elsewhere'): FileEntry => ({ name, kind: 'symlink', linkTarget })
export const special = (name: string): FileEntry => ({ name, kind: 'other' })

/** Resolves after every pending microtask chain (the fake service answers immediately). */
export const idle = () => new Promise<void>(done => setTimeout(done, 0))

export function createFakeFiles(projectId = 'p') {
  let revision = 0
  const dirs = new Map<string, FileEntry[] | FileUnavailableReason>()
  const files = new Map<string, { text: string; version: number } | FileUnavailableReason>()
  const changedListeners = new Set<(event: FilesChanged) => void>()
  const watchListeners = new Set<(event: FilesWatchChanged) => void>()
  let subscriptions = 0
  let subscribeWatch: FilesWatchState = 'live'

  const api = {
    list: vi.fn(async ({ path }: { path: string }) => {
      const rev = ++revision, entry = dirs.get(path)
      if (Array.isArray(entry)) return { status: 'ok' as const, revision: rev, path, entries: entry, truncated: false }
      return { status: 'unavailable' as const, revision: rev, path, reason: entry ?? 'missing' }
    }),
    read: vi.fn(async ({ path, ifVersion }: { path: string; ifVersion?: string }) => {
      const rev = ++revision, entry = files.get(path)
      if (entry === undefined) return { status: 'unavailable' as const, revision: rev, path, reason: 'missing' as const }
      if (typeof entry === 'string') return { status: 'unavailable' as const, revision: rev, path, reason: entry }
      const version = `v${entry.version}`
      if (ifVersion === version) return { status: 'unchanged' as const, revision: rev, path, version }
      return { status: 'ok' as const, revision: rev, path, version, size: entry.text.length, encoding: 'utf-8' as const, bom: false, lineEnding: 'lf' as const, text: entry.text }
    }),
    resolveReference: vi.fn(async ({ paths }: { paths: string[] }) => ({ status: 'ok' as const, files: paths.map(path => ({ path, name: path.slice(path.lastIndexOf('/') + 1), size: 1, version: 'v1' })) })),
    subscribe: vi.fn(async () => ({ projectId, subscriptionId: `s${++subscriptions}`, revision: ++revision, watch: subscribeWatch })),
    unsubscribe: vi.fn(async () => undefined),
    onChanged: vi.fn((listener: (event: FilesChanged) => void) => { changedListeners.add(listener); return () => { changedListeners.delete(listener) } }),
    onWatchChanged: vi.fn((listener: (event: FilesWatchChanged) => void) => { watchListeners.add(listener); return () => { watchListeners.delete(listener) } })
  }

  return {
    api: api as unknown as FilesApi,
    mocks: api,
    /** Replaces a directory listing (or makes it unavailable). */
    setDir(path: string, value: FileEntry[] | FileUnavailableReason) { dirs.set(path, value) },
    removeDir(path: string) { dirs.delete(path) },
    /** Replaces a file's text (bumping its version); `failFile` makes it unreadable and `removeFile` deletes it. */
    setFile(path: string, text: string) {
      const current = files.get(path)
      files.set(path, { text, version: typeof current === 'object' ? current.version + 1 : 1 })
    },
    failFile(path: string, reason: FileUnavailableReason) { files.set(path, reason) },
    removeFile(path: string) { files.delete(path) },
    nextRevision: () => ++revision,
    setSubscribeWatch(watch: FilesWatchState) { subscribeWatch = watch },
    emitChanged(dirsChanged: string[], overflow = false) { const event = { projectId, revision: ++revision, dirs: dirsChanged, overflow }; changedListeners.forEach(listener => listener(event)) },
    emitWatch(watch: FilesWatchState) { const event = { projectId, revision: ++revision, watch }; watchListeners.forEach(listener => listener(event)) },
    listeners: { changed: changedListeners, watch: watchListeners }
  }
}
