import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioApi } from '@shared/ipc/contracts'
import type { CloseProjectResult, ProjectAttention, ShellBootstrap, UiState } from '@shared/project/types'
import { defaultUiState } from '@shared/project/ui-state'
import { App } from '../../app/App'
import { registerShellIntegration, type RendererSessionPort } from './integration'
import { useProjectShell } from './store'

const initial = useProjectShell.getState()
const projects = ['a', 'b', 'c'].map((id) => ({ id, name: id, canonicalPath: `/projects/${id}`, localPath: `/projects/${id}`, createdAt: '', lastOpenedAt: '' }))
const bootstrap = (): ShellBootstrap => ({
  projects, recent: [],
  windowState: { tabs: projects.map((p) => ({ kind: 'project', id: `project:${p.id}`, projectId: p.id })), currentTabId: 'project:a', navCollapsed: false },
  uiStates: Object.fromEntries(projects.map((p) => [p.id, defaultUiState()]))
})
let restoreIntegration: () => void
let attention: Record<string, ProjectAttention>, attentionListeners: Set<() => void>
let port: RendererSessionPort
let api: StudioApi['project']
let closeResult: CloseProjectResult
beforeEach(() => {
  useProjectShell.setState(initial, true)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  attention = {}; attentionListeners = new Set()
  port = {
    getProjectAttention: (id) => attention[id] ?? null,
    subscribeAttention: (cb) => { attentionListeners.add(cb); return () => { attentionListeners.delete(cb) } },
    onProjectOpened: vi.fn(), onProjectClosed: vi.fn(), sessionExists: () => true,
    setViewing: vi.fn(), setWindowForeground: vi.fn(), userOpenedSession: vi.fn(), startNewChat: vi.fn()
  }
  restoreIntegration = registerShellIntegration({ session: port })
  closeResult = { status: 'closed' }
  api = {
    bootstrap: async () => bootstrap(),
    openDirectory: async () => ({ ok: false, reason: 'cancelled' }),
    openPath: async () => ({ ok: false, reason: 'not_found', path: '', privacyHint: false }),
    listRecent: async () => [], removeRecent: async () => [], getUiState: async () => defaultUiState(),
    updateUiState: vi.fn(async ({ patch }) => ({ ...defaultUiState(), ...patch } as UiState)),
    saveWindowState: vi.fn(async () => {}), closeProject: vi.fn(async () => closeResult),
    confirmQuit: async () => {}, cancelQuit: async () => {}, onMenuCommand: () => () => {}, onQuitRequested: () => () => {}, stateFlushed: async () => {}, onFlushRequested: () => () => {}
  }
  Object.defineProperty(window, 'studio', { configurable: true, value: {
    project: api, app: { onWindowFocusChanged: () => () => {} }
  } as unknown as StudioApi })
})
afterEach(async () => { cleanup(); await useProjectShell.getState().flush(); restoreIntegration(); vi.unstubAllGlobals() })
async function mount() { await act(async () => { render(<App />) }); await screen.findByRole('button', { name: 'Architecture' }) }

describe('Project shell · FR-PROJ/NAV · AC-01', () => {
  it('isolates three canvases and both right-area modes, persisting every user action', async () => {
    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Architecture' }))
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }))
    fireEvent.click(screen.getByRole('tab', { name: 'b' }))
    expect(screen.getByRole('button', { name: 'Overview', current: 'page' })).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'New Chat' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: '右侧边栏' }))
    fireEvent.click(screen.getByRole('button', { name: 'Diff' }))
    fireEvent.click(screen.getByRole('tab', { name: 'c' }))
    fireEvent.click(screen.getByRole('button', { name: 'Progress' }))
    fireEvent.click(screen.getByRole('tab', { name: 'a' }))
    expect(screen.getByRole('button', { name: 'Architecture', current: 'page' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Terminal', pressed: true })).toBeTruthy()
    await useProjectShell.getState().flush()
    const s = useProjectShell.getState()
    expect(s.uiStates.a).toMatchObject({ mainCanvas: { mode: 'view', viewId: 'architecture' }, viewRightArea: 'terminal', sidebarOpen: false })
    expect(s.uiStates.b).toMatchObject({ mainCanvas: { mode: 'draft' }, sidebarOpen: true, lastTool: 'diff' })
    expect(s.uiStates.c).toMatchObject({ mainCanvas: { mode: 'view', viewId: 'progress' }, viewRightArea: 'preview' })
    expect(api.updateUiState).toHaveBeenCalled()
  })
  it('renders attention only on background tabs, updates without moving layout, and on the collapsed navigation button', async () => {
    await mount()
    const before = useProjectShell.getState().windowState
    act(() => { attention = { a: 'error', b: 'needs_input', c: 'completed_unread' }; attentionListeners.forEach((cb) => cb()) })
    expect(screen.getAllByRole('img', { name: /有/ })).toHaveLength(2)
    expect(useProjectShell.getState().windowState).toBe(before)
    fireEvent.click(screen.getByRole('button', { name: '折叠导航' }))
    expect(screen.getAllByRole('img', { name: /有/ })).toHaveLength(3)
    expect(screen.queryByRole('complementary')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /b，/ }))
    expect(useProjectShell.getState().windowState.navCollapsed).toBe(true)
  })
  it('keeps a non-current Project open on cancel or stop failure, traps focus, and closes only after Stop succeeds', async () => {
    await mount()
    closeResult = { status: 'confirmation_required', counts: { running: 1, needsInput: 1 } }
    fireEvent.click(screen.getByRole('button', { name: '关闭 b' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('2 个对话')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '取消' }))
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭并停止' }))
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '取消' }))
    expect(useProjectShell.getState().windowState.currentTabId).toBe('project:a')
    fireEvent.keyDown(dialog, { key: 'Escape' }); expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '关闭 b' }))
    await screen.findByRole('dialog')
    closeResult = { status: 'failed', failed: [{ sessionId: 's-b', reason: 'cleanup failed' }] }
    fireEvent.click(screen.getByRole('button', { name: '关闭并停止' }))
    await screen.findByRole('button', { name: '重试' })
    expect(useProjectShell.getState().windowState.tabs).toHaveLength(3)
    closeResult = { status: 'closed' }
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useProjectShell.getState().windowState.tabs).toHaveLength(2)
    expect(port.onProjectClosed).toHaveBeenCalledWith('b')
  })
  it('sends repeated user-open signals separately from foreground changes', async () => {
    await mount()
    const shell = useProjectShell.getState()
    act(() => shell.openSession('a', 's-a'))
    expect(port.userOpenedSession).toHaveBeenCalledExactlyOnceWith('a', 's-a')
    act(() => { shell.setForeground(false); shell.setForeground(true) })
    expect(port.userOpenedSession).toHaveBeenCalledTimes(1)
    act(() => shell.openSession('a', 's-a'))
    expect(port.userOpenedSession).toHaveBeenCalledTimes(2)
    expect(port.setWindowForeground).toHaveBeenCalledWith(false)
  })
  it('persists a later edit made while the previous IPC write is in flight', async () => {
    await mount()
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    const save = vi.mocked(api.updateUiState)
    save.mockImplementationOnce(async ({ patch }) => { await pending; return { ...defaultUiState(), ...patch } as UiState })
    act(() => useProjectShell.getState().updateUiState('a', { lastTool: 'files' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    act(() => useProjectShell.getState().updateUiState('a', { lastTool: 'diff' }))
    release(); await useProjectShell.getState().flush()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1]![0].patch.lastTool).toBe('diff')
  })
  it('restores missing Session IDs to Overview and missing View conversations to drafts', async () => {
    const data = bootstrap()
    data.uiStates.a!.mainCanvas = { mode: 'session', sessionId: 'missing' }
    data.uiStates.a!.lastTool = 'diff'
    data.uiStates.b!.mainCanvas = { mode: 'view', viewId: 'architecture', conversation: { kind: 'session', sessionId: 'missing' } }
    port.sessionExists = () => false
    vi.spyOn(api, 'bootstrap').mockResolvedValue(data)
    await mount()
    expect(useProjectShell.getState().uiStates.a).toMatchObject({ mainCanvas: { mode: 'view', viewId: 'overview' }, lastTool: 'diff' })
    expect(useProjectShell.getState().uiStates.b).toMatchObject({ mainCanvas: { mode: 'view', viewId: 'architecture', conversation: { kind: 'draft' } } })
  })
})
