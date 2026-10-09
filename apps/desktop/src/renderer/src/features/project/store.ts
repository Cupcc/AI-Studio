import { create } from 'zustand'
import { studio } from '../../lib/studio'
import { activateTab, addLauncherTab, closeTab, currentProjectId, cycleTab, initialWindowState, openProjectIds, placeOpenedProject } from '@shared/project/tabs'
import { displayedSessionId, applyUiStatePatch, overviewCanvas } from '@shared/project/ui-state'
import { enterViewFromNav, openDraftCanvas, openSessionCanvas, setViewConversation } from '@shared/project/ui-rules'
import type { BlockingSessionCounts, OpenProjectResult, ProjectRecord, QuitRequest, RecentProject, StopProjectResult, UiState, UiStatePatch, ViewConversation, ViewId, WindowState } from '@shared/project/types'
import { S } from '@shared/project/strings'
import { shellIntegration } from './integration'

export interface CloseDialog {
  tabId: string; projectId: string; counts: BlockingSessionCounts
  stopping: boolean; failed: StopProjectResult['failed']
}
export interface ProjectShellState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  windowState: WindowState
  projects: Record<string, ProjectRecord>
  uiStates: Record<string, UiState>
  recent: RecentProject[]
  opening: boolean
  foreground: boolean
  closeDialog: CloseDialog | null
  quitRequest: QuitRequest | null
  quitting: boolean
  bootstrap(): Promise<void>
  openDirectory(): Promise<void>
  openPath(path: string): Promise<void>
  removeRecent(projectId: string): Promise<void>
  activateTab(tabId: string): void
  newTab(): void
  cycleTab(delta: 1 | -1): void
  toggleNav(): void
  updateUiState(projectId: string, patch: UiStatePatch | null): void
  enterView(projectId: string, viewId: ViewId): void
  openSession(projectId: string, sessionId: string): void
  startDraft(projectId: string): void
  setViewConversation(projectId: string, conversation: ViewConversation): void
  requestClose(tabId: string, confirmed?: boolean): Promise<void>
  cancelClose(): void
  setForeground(foreground: boolean): void
  watchEvents(): () => void
  confirmQuit(): Promise<void>
  cancelQuit(): void
  flush(): Promise<void>
}

// Serialize writes in user-action order. Optimistic UI remains responsive;
// full states retry dirty writes on the next change. Widths are sent on release.
let writes: Promise<void> = Promise.resolve()
const dirty = new Map<string, number>()
let revision = 0
function enqueue(write: () => Promise<unknown>): void {
  writes = writes.then(write).then(() => {}, (error) => { console.error('[project] state save failed', error) })
}
function syncViewing(opened = false): void {
  const s = useProjectShell.getState()
  const id = currentProjectId(s.windowState)
  const session = shellIntegration().session
  for (const projectId of openProjectIds(s.windowState)) {
    const sessionId = projectId === id ? displayedSessionId(s.uiStates[projectId]!.mainCanvas) : null
    session.setViewing(projectId, s.foreground ? sessionId : null)
    if (opened && sessionId) session.userOpenedSession(projectId, sessionId)
  }
}
function saveWindow(): void {
  const windowState = useProjectShell.getState().windowState
  enqueue(() => studio().project.saveWindowState(windowState))
}
async function restoreProject(projectId: string): Promise<void> {
  const port = shellIntegration().session
  await port.onProjectOpened(projectId)
  const state = useProjectShell.getState().uiStates[projectId]!
  const canvas = state.mainCanvas
  const sessionId = displayedSessionId(canvas)
  if (sessionId && !await port.sessionExists(projectId, sessionId)) {
    // A delayed existence check cannot replace a newer user selection.
    const current = useProjectShell.getState()
    if (!openProjectIds(current.windowState).includes(projectId) || JSON.stringify(current.uiStates[projectId]?.mainCanvas) !== JSON.stringify(canvas)) return
    const mainCanvas = canvas.mode === 'view' ? { ...canvas, conversation: { kind: 'draft' as const } } : overviewCanvas()
    useProjectShell.getState().updateUiState(projectId, { mainCanvas })
  }
}
async function finishOpen(result: OpenProjectResult, origin: string): Promise<void> {
  const s = useProjectShell.getState()
  if (!result.ok) {
    if (result.reason !== 'cancelled') useProjectShell.setState({ error: S.openErrors[result.reason] + (result.privacyHint ? S.privacyHint : '') })
    return
  }
  const alreadyOpen = openProjectIds(s.windowState).includes(result.project.id)
  useProjectShell.setState({
    projects: { ...s.projects, [result.project.id]: result.project },
    uiStates: alreadyOpen ? s.uiStates : { ...s.uiStates, [result.project.id]: result.uiState },
    windowState: placeOpenedProject(s.windowState, result.project.id, origin), error: null
  })
  saveWindow()
  if (!alreadyOpen) await restoreProject(result.project.id)
  syncViewing(currentProjectId(useProjectShell.getState().windowState) === result.project.id)
  useProjectShell.setState({ recent: await studio().project.listRecent() })
}

export const useProjectShell = create<ProjectShellState>()((set, get) => ({
  status: 'idle', error: null, windowState: initialWindowState(), projects: {}, uiStates: {}, recent: [],
  opening: false, foreground: document.hasFocus(), closeDialog: null, quitRequest: null, quitting: false,
  async bootstrap() {
    if (get().status !== 'idle') return
    set({ status: 'loading' })
    try {
      const data = await studio().project.bootstrap()
      set({ ...data, projects: Object.fromEntries(data.projects.map((p) => [p.id, p])), status: 'ready', error: null })
      await Promise.all(openProjectIds(data.windowState).map(restoreProject))
      shellIntegration().session.setWindowForeground(get().foreground)
      syncViewing(true)
    } catch (error) { set({ status: 'error', error: String(error) }) }
  },
  async openDirectory() {
    if (get().opening) return
    const origin = get().windowState.currentTabId
    set({ opening: true, error: null })
    try { await finishOpen(await studio().project.openDirectory(), origin) }
    catch (error) { set({ error: String(error) }) }
    finally { set({ opening: false }) }
  },
  async openPath(path) {
    if (get().opening) return
    const origin = get().windowState.currentTabId
    set({ opening: true, error: null })
    try { await finishOpen(await studio().project.openPath({ path }), origin) }
    catch (error) { set({ error: String(error) }) }
    finally { set({ opening: false }) }
  },
  async removeRecent(projectId) { set({ recent: await studio().project.removeRecent({ projectId }) }) },
  activateTab(tabId) { set({ windowState: activateTab(get().windowState, tabId) }); saveWindow(); syncViewing(true) },
  newTab() { set({ windowState: addLauncherTab(get().windowState), error: null }); saveWindow(); syncViewing() },
  cycleTab(delta) { set({ windowState: cycleTab(get().windowState, delta) }); saveWindow(); syncViewing(true) },
  toggleNav() { set({ windowState: { ...get().windowState, navCollapsed: !get().windowState.navCollapsed } }); saveWindow() },
  updateUiState(projectId, patch) {
    if (!patch || !get().uiStates[projectId]) return
    const next = applyUiStatePatch(get().uiStates[projectId]!, patch)
    set({ uiStates: { ...get().uiStates, [projectId]: next } })
    dirty.set(projectId, ++revision)
    enqueue(async () => {
      for (const [id, version] of [...dirty]) {
        const { schemaVersion: _, ...fullPatch } = get().uiStates[id]!
        await studio().project.updateUiState({ projectId: id, patch: fullPatch })
        if (dirty.get(id) === version) dirty.delete(id)
      }
    })
    syncViewing()
  },
  enterView(projectId, viewId) { get().updateUiState(projectId, enterViewFromNav(get().uiStates[projectId]!, viewId)) },
  openSession(projectId, sessionId) {
    get().updateUiState(projectId, openSessionCanvas(get().uiStates[projectId]!, sessionId))
    syncViewing(true)
  },
  startDraft(projectId) {
    shellIntegration().session.startNewChat(projectId)
    get().updateUiState(projectId, openDraftCanvas(get().uiStates[projectId]!))
  },
  setViewConversation(projectId, conversation) {
    get().updateUiState(projectId, setViewConversation(get().uiStates[projectId]!, conversation))
    syncViewing(true)
  },
  async requestClose(tabId, confirmed = false) {
    if (get().closeDialog?.stopping) return
    const tab = get().windowState.tabs.find((t) => t.id === tabId)
    if (!tab) return
    if (tab.kind === 'project') {
      if (confirmed && get().closeDialog) set({ closeDialog: { ...get().closeDialog!, stopping: true, failed: [] } })
      try {
        await get().flush()
        const result = await studio().project.closeProject({ projectId: tab.projectId, confirmed })
        if (result.status === 'confirmation_required') {
          set({ closeDialog: { tabId, projectId: tab.projectId, counts: result.counts, stopping: false, failed: [] } }); return
        }
        if (result.status === 'failed') {
          set({ closeDialog: { tabId, projectId: tab.projectId, counts: get().closeDialog?.counts ?? { running: 0, needsInput: 0 }, stopping: false, failed: result.failed } }); return
        }
      } catch (error) {
        set({ closeDialog: { tabId, projectId: tab.projectId, counts: get().closeDialog?.counts ?? { running: 0, needsInput: 0 }, stopping: false, failed: [{ sessionId: '', reason: String(error) }] } }); return
      }
      shellIntegration().session.setViewing(tab.projectId, null)
      shellIntegration().session.onProjectClosed(tab.projectId)
    }
    set({ windowState: closeTab(get().windowState, tabId), closeDialog: null })
    saveWindow(); syncViewing(true)
  },
  cancelClose() { if (!get().closeDialog?.stopping) set({ closeDialog: null }) },
  setForeground(foreground) {
    set({ foreground }); shellIntegration().session.setWindowForeground(foreground); syncViewing()
  },
  watchEvents() {
    const unsub = [
      studio().app.onWindowFocusChanged(({ focused }) => get().setForeground(focused)),
      studio().project.onQuitRequested((request) => set({ quitRequest: request })),
      studio().project.onFlushRequested(() => {
        void get().flush().then(() => studio().project.stateFlushed())
      }),
      studio().project.onMenuCommand(({ command }) => {
        switch (command) {
          case 'newTab': get().newTab(); break
          case 'closeTab': void get().requestClose(get().windowState.currentTabId); break
          case 'openDirectory': void get().openDirectory(); break
          case 'nextTab': get().cycleTab(1); break
          case 'previousTab': get().cycleTab(-1); break
        }
      })
    ]
    return () => unsub.forEach((off) => off())
  },
  async confirmQuit() { set({ quitting: true }); await get().flush(); await studio().project.confirmQuit() },
  cancelQuit() { if (!get().quitting) { set({ quitRequest: null }); void studio().project.cancelQuit() } },
  async flush() { await shellIntegration().session.flush?.(); await writes }
}))
