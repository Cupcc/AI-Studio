import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { WindowState } from '@shared/project/types'
import { useProjectShell } from '../../project/store'
import { filesApi } from './api'
import { createFakeFiles, dir, file, idle } from './fake-files'
import { useFiles } from './files-store'
import { installFilesIntegration } from './integration'

vi.mock('./api', () => ({ filesApi: vi.fn() }))
const previousWindow = useProjectShell.getState().windowState
const opened: WindowState = { tabs: [{ id: 'project:fi', kind: 'project', projectId: 'fi' }], currentTabId: 'project:fi', navCollapsed: false }
let fake: ReturnType<typeof createFakeFiles>
beforeEach(() => {
  fake = createFakeFiles('fi')
  vi.mocked(filesApi).mockReturnValue(fake.api)
  fake.setDir('', [dir('src'), file('a.md')])
  fake.setDir('src', [file('x.ts')])
  useProjectShell.setState({ windowState: opened })
})
afterEach(() => { useProjectShell.setState({ windowState: previousWindow }); useFiles.getState().forget('fi'); vi.useRealTimers() })

it('routes change and watch events to the store and removes both listeners when uninstalled', async () => {
  const uninstall = installFilesIntegration()
  expect(fake.listeners.changed.size).toBe(1)
  expect(fake.listeners.watch.size).toBe(1)
  await useFiles.getState().activate('fi')
  await useFiles.getState().toggle('fi', 'src')
  await idle()
  fake.mocks.list.mockClear()
  fake.setDir('src', [file('x.ts'), file('y.ts')])
  fake.emitChanged(['src'])
  await idle()
  expect(fake.mocks.list).toHaveBeenCalledTimes(1)
  expect(useFiles.getState().projects.fi?.dirs.get('src')?.entries).toHaveLength(2)
  fake.emitWatch('degraded')
  expect(useFiles.getState().projects.fi?.watch).toBe('degraded')
  uninstall()
  expect(fake.listeners.changed.size).toBe(0)
  expect(fake.listeners.watch.size).toBe(0)
})

it('subscribes again after the service stops the watcher', async () => {
  vi.useFakeTimers()
  const uninstall = installFilesIntegration()
  try {
    await useFiles.getState().activate('fi')
    await vi.advanceTimersByTimeAsync(0)
    fake.emitWatch('stopped')
    await vi.advanceTimersByTimeAsync(600)
    expect(fake.mocks.subscribe).toHaveBeenCalledTimes(2)
    expect(useFiles.getState().projects.fi?.watch).toBe('live')
  } finally { uninstall() }
})

it('forgets the state of a Project when its tab closes, and ignores events that still arrive', async () => {
  const uninstall = installFilesIntegration()
  try {
    await useFiles.getState().activate('fi')
    await idle()
    expect(useFiles.getState().projects.fi).toBeDefined()
    useProjectShell.setState({ windowState: { tabs: [{ id: 'launcher', kind: 'launcher' }], currentTabId: 'launcher', navCollapsed: false } })
    expect(useFiles.getState().projects.fi).toBeUndefined()
    expect(fake.mocks.unsubscribe).toHaveBeenCalledWith({ projectId: 'fi', subscriptionId: 's1' })
    fake.emitChanged([''], true)
    fake.emitWatch('live')
    await idle()
    expect(useFiles.getState().projects.fi).toBeUndefined()
    // Reopening starts from a fresh root read.
    useProjectShell.setState({ windowState: opened })
    fake.mocks.list.mockClear()
    await useFiles.getState().activate('fi')
    await idle()
    expect(fake.mocks.list).toHaveBeenCalledTimes(1)
    expect(useFiles.getState().projects.fi?.dirs.get('')?.entries.map(e => e.name)).toEqual(['src', 'a.md'])
  } finally { uninstall() }
})
