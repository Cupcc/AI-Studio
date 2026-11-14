import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioApi } from '@shared/ipc/contracts'
import type { CloseProjectResult, ProjectAttention, ShellBootstrap, UiState } from '@shared/project/types'
import { defaultUiState } from '@shared/project/ui-state'
import { App } from '../../app/App'
import { registerShellIntegration, type RendererSessionPort } from './integration'
import { useProjectShell } from './store'
import { useSettings } from '../settings/store'
import { PRESET_WORKBENCHES } from '@shared/workbench/presets'
import { WorkbenchNavigation } from '../workbench/WorkbenchNavigation'
import { useWorkbenches } from '../workbench/store'

const initial = useProjectShell.getState()
const projects = ['a', 'b', 'c'].map((id) => ({ id, name: id, canonicalPath: `/projects/${id}`, localPath: `/projects/${id}`, displayPath: `/projects/${id}`, createdAt: '', lastOpenedAt: '' }))
const bootstrap = (): ShellBootstrap => ({
  projects, recent: [],
  windowState: { tabs: projects.map((p) => ({ kind: 'project', id: `project:${p.id}`, projectId: p.id })), currentTabId: 'project:a', navCollapsed: false, navWidth: null },
  uiStates: Object.fromEntries(projects.map((p) => [p.id, defaultUiState()]))
})
let restoreIntegration: () => void
let attention: Record<string, ProjectAttention>, attentionListeners: Set<() => void>
let port: RendererSessionPort
let api: StudioApi['project']
let closeResult: CloseProjectResult
beforeEach(() => {
  useProjectShell.setState(initial, true)
  useWorkbenches.setState({ catalogs: {}, snapshots: {}, errors: {}, snapshotErrors: {}, loading: {}, hosts: {} })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  attention = {}; attentionListeners = new Set()
  port = {
    getProjectAttention: (id) => attention[id] ?? null,
    subscribeAttention: (cb) => { attentionListeners.add(cb); return () => { attentionListeners.delete(cb) } },
    onProjectOpened: vi.fn(), onProjectClosed: vi.fn(), sessionExists: () => true,
    setViewing: vi.fn(), setWindowForeground: vi.fn(), userOpenedSession: vi.fn(), startNewChat: vi.fn()
  }
  restoreIntegration = registerShellIntegration({ session: port, Workbenches: WorkbenchNavigation })
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
    project: api, workbench: { list: async () => PRESET_WORKBENCHES }, app: { getWindowFocus: async () => ({ focused: useProjectShell.getState().foreground }), onWindowFocusChanged: () => () => {} }
  } as unknown as StudioApi })
})
afterEach(async () => { cleanup(); await useProjectShell.getState().flush(); restoreIntegration(); vi.unstubAllGlobals() })
async function mount() { await act(async () => { render(<App />) }); await screen.findByRole('button', { name: '架构' }) }

describe('Project shell · FR-PROJ/NAV · AC-01', () => {
  it('isolates three canvases, the tool sidebar and the workbench column, persisting every user action', async () => {
    await mount()
    fireEvent.click(screen.getByRole('button', { name: '架构' }))
    fireEvent.click(screen.getByRole('button', { name: '右侧边栏' }))
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }))
    // Four columns: the workbench stays beside the tool sidebar (DEC-33).
    expect(screen.getByRole('region', { name: '工作台页面' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '关闭工作台' }))
    expect(screen.queryByRole('region', { name: '工作台页面' })).toBeNull()
    expect(document.querySelector('.canvas-mode--single')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '工作台', pressed: false }))
    expect(screen.getByRole('region', { name: '工作台页面' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'b' }))
    expect(screen.getByRole('button', { name: '概览', current: 'page' })).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: '新对话' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: '右侧边栏' }))
    fireEvent.click(screen.getByRole('button', { name: 'Diff' }))
    fireEvent.click(screen.getByRole('tab', { name: 'c' }))
    fireEvent.click(screen.getByRole('button', { name: '进度' }))
    fireEvent.click(screen.getByRole('tab', { name: 'a' }))
    expect(screen.getByRole('button', { name: '架构', current: 'page' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Terminal', pressed: true })).toBeTruthy()
    await useProjectShell.getState().flush()
    const s = useProjectShell.getState()
    expect(s.uiStates.a).toMatchObject({ mainCanvas: { mode: 'view', viewId: 'architecture' }, workbenchOpen: true, sidebarOpen: true, lastTool: 'terminal' })
    expect(s.uiStates.b).toMatchObject({ mainCanvas: { mode: 'draft' }, sidebarOpen: true, lastTool: 'diff' })
    expect(s.uiStates.c).toMatchObject({ mainCanvas: { mode: 'view', viewId: 'progress' }, workbenchOpen: true, sidebarOpen: false })
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
  it('collapses the navigation for space without changing the saved preference, and lets the user reopen it (DEC-33)', async () => {
    await mount()
    act(() => useProjectShell.getState().setNavSpaceShort(true))
    expect(screen.getByRole('button', { name: '展开导航' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: '新对话' }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '展开导航' }))
    expect(screen.getByRole('button', { name: '折叠导航' })).toBeTruthy()
    expect(useProjectShell.getState()).toMatchObject({ navKeptOpen: true, windowState: { navCollapsed: false } })
    act(() => useProjectShell.getState().setNavSpaceShort(false))
    act(() => useProjectShell.getState().setNavSpaceShort(true))
    expect(screen.getByRole('button', { name: '展开导航' })).toBeTruthy()
    // Collapsing by hand saves the preference; expanding it while space is short keeps it open.
    fireEvent.click(screen.getByRole('button', { name: '展开导航' }))
    fireEvent.click(screen.getByRole('button', { name: '折叠导航' }))
    expect(useProjectShell.getState()).toMatchObject({ navKeptOpen: false, windowState: { navCollapsed: true } })
    fireEvent.click(screen.getByRole('button', { name: '展开导航' }))
    expect(useProjectShell.getState()).toMatchObject({ navKeptOpen: true, windowState: { navCollapsed: false } })
    expect(screen.getByRole('button', { name: '折叠导航' })).toBeTruthy()
  })
  it('drags column separators like VS Code sashes, saving the navigation width for the window', async () => {
    // jsdom has no pointer capture.
    Object.defineProperty(Element.prototype, 'setPointerCapture', { configurable: true, value: () => {} })
    await mount()
    // jsdom: a 1024 wide workspace without gutters holds navigation 248 | conversation 440 | workbench 336.
    const nav = screen.getByRole('separator', { name: '调整导航宽度' })
    expect(nav.getAttribute('aria-valuenow')).toBe('248')
    fireEvent.keyDown(nav, { key: 'ArrowRight' })
    expect(useProjectShell.getState().windowState.navWidth).toBe(258)
    expect(screen.getByRole('separator', { name: '调整导航宽度' }).getAttribute('aria-valuenow')).toBe('258')
    // Dragging the conversation edge: the window keeps the resize cursor and iframes stop taking the pointer until release.
    const conversation = screen.getByRole('separator', { name: '调整对话列宽度' })
    fireEvent.pointerDown(conversation, { button: 0, clientX: 700, pointerId: 1 })
    expect(document.documentElement.classList.contains('is-resizing-columns')).toBe(true)
    fireEvent.pointerMove(window, { clientX: 660, pointerId: 1 })
    expect(screen.getByRole('separator', { name: '调整对话列宽度' }).getAttribute('aria-valuenow')).toBe('400')
    fireEvent.pointerUp(window, { clientX: 660, pointerId: 1 })
    expect(document.documentElement.classList.contains('is-resizing-columns')).toBe(false)
    expect(useProjectShell.getState().uiStates.a!.viewConversationWidth).toBe(400)
    // Double-click resets a column to its default.
    fireEvent.doubleClick(screen.getByRole('separator', { name: '调整导航宽度' }))
    expect(useProjectShell.getState().windowState.navWidth).toBeNull()
    await useProjectShell.getState().flush()
    expect(api.saveWindowState).toHaveBeenLastCalledWith(expect.objectContaining({ navWidth: null }))
  })
  it('gives every icon-only shell button a prototype v01 tooltip (data-tip) except Tab close buttons', async () => {
    await mount()
    const missing = () => [...document.querySelectorAll('button')].filter((b) => !b.textContent?.trim() && !b.classList.contains('project-tab__close') && !b.dataset.tip).map((b) => b.getAttribute('aria-label'))
    expect(missing()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: '右侧边栏' }))
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }))
    expect(screen.getByRole('button', { name: '关闭右侧工具' }).dataset.tip).toBeTruthy()
    expect(missing()).toEqual([])
    expect(document.querySelector('[data-tooltip]')).toBeNull()
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
  it('synchronizes missed initial native focus, ignores stale snapshots and never treats focus as opening', async () => {
    let resolve!: (value: { focused: boolean }) => void
    let focusEvent!: (value: { focused: boolean }) => void
    const app = window.studio.app
    Object.assign(app, {
      getWindowFocus: () => new Promise<{ focused: boolean }>(done => { resolve = done }),
      onWindowFocusChanged: (listener: (value: { focused: boolean }) => void) => { focusEvent = listener; return () => {} }
    })
    useProjectShell.setState({ foreground: false })
    const unwatch = useProjectShell.getState().watchEvents()
    resolve({ focused: true }); await Promise.resolve()
    expect(useProjectShell.getState().foreground).toBe(true)
    expect(port.userOpenedSession).not.toHaveBeenCalled()
    unwatch()
    const unwatch2 = useProjectShell.getState().watchEvents()
    focusEvent({ focused: false })
    resolve({ focused: true }); await Promise.resolve()
    expect(useProjectShell.getState().foreground).toBe(false)
    expect(port.userOpenedSession).not.toHaveBeenCalled()
    unwatch2()
  })
  it('waits for pending Session drafts before closing a Project', async () => {
    await mount()
    let release!: () => void
    port.flush = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    let closing!: Promise<void>
    act(() => { closing = useProjectShell.getState().requestClose('project:b') })
    expect(port.flush).toHaveBeenCalledTimes(1)
    expect(api.closeProject).not.toHaveBeenCalled()
    expect(port.onProjectClosed).not.toHaveBeenCalled()
    release()
    await act(async () => { await closing })
    expect(api.closeProject).toHaveBeenCalledWith({ projectId: 'b', confirmed: false })
    expect(port.onProjectClosed).toHaveBeenCalledWith('b')
    port.flush = undefined
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

  it('FR-SET-001: the settings dialog makes the shell inert, and a quit confirmation takes precedence', async () => {
    await mount()
    act(() => useSettings.getState().openDialog())
    expect(screen.getByRole('dialog', { name: '设置' })).toBeTruthy()
    expect(document.querySelector('.shell')!.hasAttribute('inert')).toBe(true)
    act(() => useProjectShell.setState({ quitRequest: { sessions: 1, projects: 1 } }))
    expect(screen.queryByRole('dialog', { name: '设置' })).toBeNull()
    expect(screen.getByRole('dialog', { name: '退出 AI Developer Studio？' })).toBeTruthy()
    act(() => useProjectShell.setState({ quitRequest: null }))
    expect(screen.getByRole('dialog', { name: '设置' })).toBeTruthy()
    act(() => useSettings.getState().closeDialog())
    expect(document.querySelector('.shell')!.hasAttribute('inert')).toBe(false)
  })
})
