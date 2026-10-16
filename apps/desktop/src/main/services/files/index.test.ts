import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { filesContract } from '@shared/ipc/files'
import type { CoreServices } from '../core'
import { filesFor, watchWebContents } from './index'
import { createFixture, type Fixture } from './test-support'

const electron = vi.hoisted(() => ({ contents: new Map<number, unknown>() }))
vi.mock('electron', () => ({ webContents: { fromId: (id: number) => electron.contents.get(id) } }))

const shellState = vi.hoisted(() => ({ root: '' as string | null, closing: false, quitting: false }))
vi.mock('../project', () => ({
  projectShellFor: () => ({
    projects: { getProject: (id: string) => (id === 'p' && shellState.root ? { id, canonicalPath: shellState.root } : null) },
    isProjectClosing: () => shellState.closing,
    isQuitting: () => shellState.quitting
  })
}))

let fixture: Fixture | undefined
afterEach(() => { fixture?.cleanup(); fixture = undefined; electron.contents.clear(); shellState.closing = false; shellState.quitting = false })

const makeCore = () => ({ broadcast: vi.fn() }) as unknown as CoreServices & { broadcast: ReturnType<typeof vi.fn> }

describe('filesFor', () => {
  it('creates one service per core and reads the Project root from the shell', async () => {
    fixture = createFixture()
    shellState.root = fixture.root
    fixture.write('a.txt', 'hi')
    const core = makeCore()
    const service = filesFor(core)
    expect(filesFor(core)).toBe(service)
    expect(filesFor(makeCore())).not.toBe(service)
    expect(await service.read({ projectId: 'p', path: 'a.txt' })).toMatchObject({ status: 'ok', text: 'hi' })
    expect(await service.read({ projectId: 'unknown', path: 'a.txt' })).toMatchObject({ status: 'unavailable', reason: 'project_unavailable' })
  })

  it('answers project_closing while the Project or the app is closing', async () => {
    fixture = createFixture()
    shellState.root = fixture.root
    const service = filesFor(makeCore())
    shellState.closing = true
    expect(await service.list('p', '')).toMatchObject({ status: 'unavailable', reason: 'project_closing' })
    shellState.closing = false
    shellState.quitting = true
    expect(await service.list('p', '')).toMatchObject({ status: 'unavailable', reason: 'project_closing' })
    expect(await service.resolve('p', ['a.txt'])).toMatchObject({ status: 'rejected' })
  })

  it('broadcasts watch state through the typed event channels', async () => {
    fixture = createFixture()
    shellState.root = fixture.root
    const core = makeCore()
    const service = filesFor(core)
    expect(service.subscribe('p', 1)).toMatchObject({ watch: 'live' })
    await service.closeProject('p')
    expect(core.broadcast).toHaveBeenCalledWith(filesContract.events.watchChanged, { projectId: 'p', revision: expect.any(Number), watch: 'stopped' })
    await service.dispose()
  })
})

describe('watchWebContents', () => {
  it('detaches the owner when its renderer is destroyed or crashes, and stops listening on release', () => {
    const contents = Object.assign(new EventEmitter(), { isDestroyed: () => false })
    electron.contents.set(7, contents)
    const gone = vi.fn()
    const release = watchWebContents(7, gone)
    contents.emit('render-process-gone')
    expect(gone).toHaveBeenCalledTimes(1)
    release()
    expect(contents.listenerCount('destroyed')).toBe(0)
    expect(contents.listenerCount('render-process-gone')).toBe(0)
    const second = vi.fn()
    watchWebContents(7, second)
    contents.emit('destroyed')
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('treats an owner that no longer exists as already gone', async () => {
    const gone = vi.fn()
    watchWebContents(99, gone)
    await new Promise((resolve) => setImmediate(resolve))
    expect(gone).toHaveBeenCalledTimes(1)
    const cancelled = vi.fn()
    watchWebContents(98, cancelled)()
    await new Promise((resolve) => setImmediate(resolve))
    expect(cancelled).not.toHaveBeenCalled()
  })
})
