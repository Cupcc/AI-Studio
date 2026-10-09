import { describe, expect, it } from 'vitest'
import { addLauncherTab, closeTab, initialWindowState, placeOpenedProject } from './tabs'
import { applyUiStatePatch, defaultUiState, normalizeUiState, parseUiStatePatch } from './ui-state'
import { enterViewFromNav, openSessionCanvas, selectRightArea, toggleRightSidebar } from './ui-rules'
import { effectiveConversationWidth, effectiveSidebarWidth } from './layout'

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
  it('keeps Session and View right-area state separate and shares last tool', () => {
    let ui = defaultUiState()
    ui = applyUiStatePatch(ui, selectRightArea(ui, 'terminal')!)
    ui = applyUiStatePatch(ui, openSessionCanvas(ui, 's1')!)
    expect(ui.viewRightArea).toBe('terminal'); expect(ui.sidebarOpen).toBe(false)
    ui = applyUiStatePatch(ui, toggleRightSidebar(ui)); expect(ui.sidebarOpen).toBe(true)
    ui = applyUiStatePatch(ui, enterViewFromNav(ui, 'architecture')!)
    expect(ui.viewRightArea).toBe('preview'); expect(ui.lastTool).toBe('terminal'); expect(ui.sidebarOpen).toBe(true)
    expect(enterViewFromNav(ui, 'architecture')).toBeNull()
    ui = applyUiStatePatch(ui, toggleRightSidebar(ui)); expect(ui.viewRightArea).toBe('terminal')
  })
  it('compresses effective widths without changing saved widths', () => {
    const preferred = 560
    expect(effectiveConversationWidth(1024 - 248, preferred)).toBe(376)
    expect(effectiveConversationWidth(1280 - 248, preferred)).toBe(560)
    expect(effectiveSidebarWidth(1024 - 248, preferred)).toBe(376)
    expect(effectiveSidebarWidth(1440 - 248, preferred)).toBe(560)
    expect(preferred).toBe(560)
  })
  it('normalizes corrupt stored fields but strictly rejects malformed IPC patches', () => {
    expect(normalizeUiState({ schemaVersion: 99 })).toEqual(defaultUiState())
    const ui = normalizeUiState({ ...defaultUiState(), mainCanvas: { mode: 'view', viewId: 'missing' }, sidebarWidth: 900, lastTool: 'unknown' })
    expect(ui.mainCanvas).toEqual(defaultUiState().mainCanvas); expect(ui.sidebarWidth).toBe(560); expect(ui.lastTool).toBeNull()
    expect(() => parseUiStatePatch({ sidebarOpen: 'yes' })).toThrow()
    expect(() => parseUiStatePatch({ extra: 1 })).toThrow()
  })
})
