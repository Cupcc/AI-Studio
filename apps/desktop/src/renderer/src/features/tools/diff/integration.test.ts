import { afterEach, expect, it, vi } from 'vitest'
import type { WindowState } from '@shared/project/types'
import { useProjectShell } from '../../project/store'
import { diffApi } from './api'
import { useDiff } from './diff-store'
import { fakeDiffApi } from './diff-fixtures'
import { installDiffIntegration } from './integration'

vi.mock('./api', () => ({ diffApi: vi.fn() }))
const previousWindow = useProjectShell.getState().windowState
afterEach(() => { useProjectShell.setState({ windowState: previousWindow }); useDiff.getState().forget('p') })

const opened: WindowState = { tabs: [{ id: 'project:p', kind: 'project', projectId: 'p' }], currentTabId: 'project:p', navCollapsed: false }
const closedTabs: WindowState = { tabs: [{ id: 'launcher', kind: 'launcher' }], currentTabId: 'launcher', navCollapsed: false }

it('routes service events to the active Project, forgets it when its tab closes and stops after uninstall', async () => {
  const fake = fakeDiffApi()
  vi.mocked(diffApi).mockReturnValue(fake.api)
  useProjectShell.setState({ windowState: opened })
  const uninstall = installDiffIntegration()
  useDiff.getState().activate('p')
  await vi.waitFor(() => expect(useDiff.getState().projects.p?.snapshot).toBeTruthy())
  fake.invalidated({ projectId: 'p', revision: 9 })
  await vi.waitFor(() => expect(fake.api.getSnapshot).toHaveBeenCalledTimes(2))
  fake.watchChanged({ projectId: 'p', revision: 10, watch: 'degraded' })
  expect(useDiff.getState().projects.p?.watch).toBe('degraded')

  useProjectShell.setState({ windowState: closedTabs })
  expect(useDiff.getState().projects.p).toBeUndefined()
  expect(fake.api.unsubscribe).toHaveBeenCalledWith({ projectId: 'p', subscriptionId: 's1' })
  // Cleanup events can still arrive after the tab is gone.
  fake.invalidated({ projectId: 'p', revision: 11 })
  expect(useDiff.getState().projects.p).toBeUndefined()
  expect(fake.api.getSnapshot).toHaveBeenCalledTimes(2)

  uninstall()
  fake.invalidated({ projectId: 'p', revision: 12 })
  expect(fake.api.onInvalidated).toHaveBeenCalledTimes(1)
  useProjectShell.setState({ windowState: opened })
  useDiff.getState().activate('p')
  await vi.waitFor(() => expect(useDiff.getState().projects.p?.snapshot).toBeTruthy())
  useProjectShell.setState({ windowState: closedTabs })
  // Uninstalled: closing the tab no longer forgets the Project.
  expect(useDiff.getState().projects.p).toBeDefined()
})
