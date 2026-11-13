import { describe, expect, it } from 'vitest'
import { addLauncherTab, closeTab, initialWindowState, placeOpenedProject } from './tabs'
import { applyUiStatePatch, defaultUiState, normalizeUiState, parseUiStatePatch } from './ui-state'
import { closeRightSidebar, enterViewFromNav, openSessionCanvas, selectTool, toggleRightSidebar, toggleWorkbench } from './ui-rules'
import { canvasLayout, type CanvasLayoutInput } from './layout'

describe('shell state rules · FR-PROJ/NAV · AC-01', () => {
  it('uses one launcher, converts it in place, deduplicates open tabs and keeps the last launcher', () => {
    let state = initialWindowState('launcher:one')
    expect(addLauncherTab(state)).toBe(state)
    expect(closeTab(state, state.currentTabId)).toBe(state)
    state = placeOpenedProject(state, 'a', state.currentTabId)
    state = placeOpenedProject(state, 'b', null)
    state = addLauncherTab(state, () => 'launcher:two')
    state = placeOpenedProject(state, 'a', state.currentTabId)
    expect(state.tabs.map((t) => t.kind)).toEqual(['project', 'project'])
    expect(state.currentTabId).toBe('project:a')
    state = closeTab(state, 'project:a'); expect(state.currentTabId).toBe('project:b')
    state = closeTab(state, 'project:b', () => 'launcher:last'); expect(state.currentTabId).toBe('launcher:last')
  })
  it('shares one tool sidebar across modes and reopens the workbench when entering a View (DEC-33)', () => {
    let ui = defaultUiState()
    ui = applyUiStatePatch(ui, selectTool(ui, 'terminal')!)
    expect(ui).toMatchObject({ sidebarOpen: true, lastTool: 'terminal', workbenchOpen: true })
    expect(selectTool(ui, 'terminal')).toBeNull()
    ui = applyUiStatePatch(ui, toggleWorkbench(ui)!); expect(ui.workbenchOpen).toBe(false)
    ui = applyUiStatePatch(ui, openSessionCanvas(ui, 's1')!)
    expect(ui.sidebarOpen).toBe(true); expect(toggleWorkbench(ui)).toBeNull()
    ui = applyUiStatePatch(ui, closeRightSidebar(ui)!); expect(ui.sidebarOpen).toBe(false)
    expect(closeRightSidebar(ui)).toBeNull()
    ui = applyUiStatePatch(ui, toggleRightSidebar(ui)); expect(ui.sidebarOpen).toBe(true)
    ui = applyUiStatePatch(ui, enterViewFromNav(ui, 'architecture')!)
    expect(ui).toMatchObject({ workbenchOpen: true, sidebarOpen: true, lastTool: 'terminal' })
    expect(enterViewFromNav(ui, 'architecture')).toBeNull()
  })
  it('restores workbench instance and editor routes without changing builtin navigation', () => {
    for (const viewId of ['workbench:instance-123', 'workbench-draft:draft-456'] as const) {
      const ui = applyUiStatePatch(defaultUiState(), enterViewFromNav(defaultUiState(), viewId)!)
      expect(normalizeUiState(JSON.parse(JSON.stringify(ui))).mainCanvas).toEqual({ mode: 'view', viewId, conversation: { kind: 'draft' } })
      expect(parseUiStatePatch({ mainCanvas: ui.mainCanvas })).toEqual({ mainCanvas: ui.mainCanvas })
    }
    expect(() => parseUiStatePatch({ mainCanvas: { mode: 'view', viewId: 'workbench:../other', conversation: { kind: 'draft' } } })).toThrow()
  })
  it('compresses columns in order, then collapses the navigation, then floats the sidebar (DEC-33)', () => {
    const base: CanvasLayoutInput = { workspace: 1440, gutter: 8, navExpanded: true, navKeptOpen: false, workbench: true, sidebar: true, conversationWidth: null, sidebarWidth: null }
    const at = (input: Partial<CanvasLayoutInput>) => canvasLayout({ ...base, ...input })
    // 1440: 1184 wide canvas holds 440 + 400 + 340; the sidebar gives way before the conversation.
    expect(at({})).toMatchObject({ nav: true, spaceShort: false, overlay: false, canvas: 1184, conversation: 440, sidebar: 344 })
    expect(at({ sidebarWidth: 560, conversationWidth: 560 })).toMatchObject({ conversation: 464, sidebar: 320, sidebarMax: 320, conversationMax: 464 })
    // 1280: the minimums (1080) do not fit beside the navigation, so it collapses.
    expect(at({ workspace: 1280 })).toMatchObject({ nav: false, spaceShort: true, overlay: false, canvas: 1264, conversation: 440, sidebar: 400 })
    expect(at({ workspace: 1280, navKeptOpen: true })).toMatchObject({ nav: true, overlay: true, canvas: 1024, conversation: 440, sidebar: 400 })
    // 1024: still short without it, so the sidebar floats over the workbench.
    expect(at({ workspace: 1024 })).toMatchObject({ nav: false, overlay: true, canvas: 1008, conversation: 440, sidebar: 400 })
    expect(at({ workspace: 1024, navExpanded: false, sidebarWidth: 560 })).toMatchObject({ nav: false, overlay: true, sidebar: 560 })
    // Without the sidebar, or with the workbench closed, 1024 fits beside the navigation.
    expect(at({ workspace: 1024, sidebar: false })).toMatchObject({ nav: true, spaceShort: false, canvas: 768, conversation: 368 })
    expect(at({ workspace: 1024, workbench: false, sidebarWidth: 560 })).toMatchObject({ nav: true, spaceShort: false, overlay: false, sidebar: 368, sidebarMax: 368 })
    expect(at({ workspace: 1440, workbench: false, sidebarWidth: 560 })).toMatchObject({ sidebar: 560, conversation: 624 })
  })
  it('normalizes corrupt stored fields but strictly rejects malformed IPC patches', () => {
    expect(normalizeUiState({ schemaVersion: 99 })).toEqual(defaultUiState())
    const ui = normalizeUiState({ ...defaultUiState(), mainCanvas: { mode: 'view', viewId: 'missing' }, sidebarWidth: 900, lastTool: 'unknown' })
    expect(ui.mainCanvas).toEqual(defaultUiState().mainCanvas); expect(ui.sidebarWidth).toBe(560); expect(ui.lastTool).toBeNull()
    expect(() => parseUiStatePatch({ sidebarOpen: 'yes' })).toThrow()
    expect(() => parseUiStatePatch({ workbenchOpen: 1 })).toThrow()
    expect(() => parseUiStatePatch({ viewRightArea: 'preview' })).toThrow()
    // A View Mode tool saved by an older version no longer applies; the workbench column stays open.
    expect(normalizeUiState({ ...defaultUiState(), workbenchOpen: undefined, viewRightArea: 'terminal' })).toEqual(defaultUiState())
    expect(() => parseUiStatePatch({ extra: 1 })).toThrow()
  })
})
