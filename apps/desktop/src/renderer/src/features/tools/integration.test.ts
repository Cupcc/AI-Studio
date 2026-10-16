import { afterEach, expect, it, vi } from 'vitest'
import type { WindowState } from '@shared/project/types'
import { terminalApi, type TerminalApi } from './api'
import { filesApi } from './files/api'
import { diffApi } from './diff/api'
import { useProjectShell } from '../project/store'
import { installToolsIntegration } from './integration'
import { useTerminals } from './terminal-store'

vi.mock('./api', () => ({ terminalApi: vi.fn(), browserApi: vi.fn() }))
vi.mock('./files/api', () => ({ filesApi: vi.fn() }))
vi.mock('./diff/api', () => ({ diffApi: vi.fn() }))
const previousWindow = useProjectShell.getState().windowState
afterEach(() => { useProjectShell.setState({ windowState: previousWindow }); useTerminals.getState().forget('lifecycle') })

it('drops cached terminals when the Project tab closes and creates a new first shell after reopening', async () => {
  const api = {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockImplementation(async () => ({ projectId: 'lifecycle', terminalId: `t${api.create.mock.calls.length}`, generation: 1, state: 'running', title: 'Terminal', shell: '/bin/zsh', cwd: '/project', createdAt: 'now', cols: 80, rows: 24 })),
    onChanged: vi.fn(() => () => {})
  }
  vi.mocked(terminalApi).mockReturnValue(api as unknown as TerminalApi)
  vi.mocked(diffApi).mockReturnValue({ onInvalidated: vi.fn(() => () => {}), onWatchChanged: vi.fn(() => () => {}) } as unknown as ReturnType<typeof diffApi>)
  vi.mocked(filesApi).mockReturnValue({ onChanged: vi.fn(() => () => {}), onWatchChanged: vi.fn(() => () => {}) } as unknown as ReturnType<typeof filesApi>)
  const opened: WindowState = { tabs: [{ id: 'project:lifecycle', kind: 'project', projectId: 'lifecycle' }], currentTabId: 'project:lifecycle', navCollapsed: false }
  useProjectShell.setState({ windowState: opened })
  const dispose = installToolsIntegration()
  try {
    await useTerminals.getState().open('lifecycle')
    expect(useTerminals.getState().projects.lifecycle?.activeId).toBe('t1')
    useProjectShell.setState({ windowState: { tabs: [{ id: 'launcher', kind: 'launcher' }], currentTabId: 'launcher', navCollapsed: false } })
    expect(useTerminals.getState().projects.lifecycle).toBeUndefined()
    // Resource-cleanup events can arrive after the tab closes.
    useTerminals.getState().accept('lifecycle', [])
    expect(useTerminals.getState().projects.lifecycle).toBeUndefined()
    useProjectShell.setState({ windowState: opened })
    await useTerminals.getState().open('lifecycle')
    expect(api.list).toHaveBeenCalledTimes(2)
    expect(api.create).toHaveBeenCalledTimes(2)
    expect(useTerminals.getState().projects.lifecycle?.activeId).toBe('t2')
  } finally { dispose() }
})
