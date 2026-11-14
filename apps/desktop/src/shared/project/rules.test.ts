import { describe, expect, it } from 'vitest'
import { addLauncherTab, closeTab, initialWindowState, normalizeWindowState, placeOpenedProject } from './tabs'
import { applyUiStatePatch, defaultUiState, normalizeUiState, parseUiStatePatch } from './ui-state'
import { closeRightSidebar, enterViewFromNav, openSessionCanvas, selectTool, toggleRightSidebar, toggleWorkbench } from './ui-rules'
import { canvasLayout, dragSeparator, separatorRange, type CanvasLayoutInput } from './layout'

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
    const base: CanvasLayoutInput = { workspace: 1440, gutter: 8, navExpanded: true, navKeptOpen: false, workbench: true, sidebar: true, navWidth: null, conversationWidth: null, sidebarWidth: null }
    const at = (input: Partial<CanvasLayoutInput>) => canvasLayout({ ...base, ...input })
    // 1440: the 1184 wide canvas holds 440 + 400 and leaves the workbench 344.
    expect(at({})).toMatchObject({ nav: true, navWidth: 248, spaceShort: false, overlay: false, canvas: 1184, conversation: 440, sidebar: 400 })
    expect(at({}).row.map((c) => [c.id, c.size])).toEqual([['nav', 248], ['conversation', 440], ['workbench', 344], ['sidebar', 400]])
    // The workbench is at its minimum (320), so the sidebar gives way before the conversation.
    expect(at({ sidebarWidth: 560, conversationWidth: 560 })).toMatchObject({ conversation: 560, sidebar: 304 })
    // 1280: the collapse widths (360 + 400 + 320) do not fit beside the navigation, so it collapses.
    expect(at({ workspace: 1280 })).toMatchObject({ nav: false, navWidth: 0, spaceShort: true, overlay: false, canvas: 1264, conversation: 440, sidebar: 400 })
    // Kept open, the columns shrink to their drag minimums instead.
    expect(at({ workspace: 1280, navKeptOpen: true })).toMatchObject({ nav: true, overlay: false, canvas: 1024, conversation: 424, sidebar: 280 })
    expect(at({ workspace: 1024 })).toMatchObject({ nav: false, overlay: false, canvas: 1008, conversation: 408, sidebar: 280 })
    // 1024 with the navigation kept open: it shrinks to 200 and the sidebar still floats over the workbench.
    expect(at({ workspace: 1024, navKeptOpen: true })).toMatchObject({ nav: true, navWidth: 200, overlay: true, canvas: 816, conversation: 440, sidebar: 376 })
    expect(at({ workspace: 1024, navExpanded: false, sidebarWidth: 560 })).toMatchObject({ nav: false, overlay: false, sidebar: 280, conversation: 408 })
    // Without the sidebar, or with the workbench closed, 1024 fits beside the navigation.
    expect(at({ workspace: 1024, sidebar: false })).toMatchObject({ nav: true, spaceShort: false, canvas: 768, conversation: 440 })
    expect(at({ workspace: 1024, workbench: false, sidebarWidth: 560 })).toMatchObject({ nav: true, spaceShort: false, overlay: false, sidebar: 368 })
    expect(at({ workspace: 1440, workbench: false, sidebarWidth: 560 })).toMatchObject({ sidebar: 560, conversation: 624 })
    // A wide saved navigation gives way only after the canvas columns reach their minimums.
    expect(at({ navWidth: 480 })).toMatchObject({ navWidth: 480, canvas: 952, conversation: 352, sidebar: 280 })
  })
  it('drags a separator like a VS Code sash: neighbours give way in turn down to their minimums', () => {
    const base: CanvasLayoutInput = { workspace: 1440, gutter: 8, navExpanded: true, navKeptOpen: false, workbench: true, sidebar: true, navWidth: null, conversationWidth: null, sidebarWidth: null }
    const layout = canvasLayout(base)
    // Widening the conversation takes the workbench to 320, then the sidebar.
    const wider = dragSeparator(layout, 'conversation', 100)
    expect(wider).toEqual({ nav: 248, conversation: 540, sidebar: 324 })
    // The saved widths reproduce the drag.
    expect(canvasLayout({ ...base, navWidth: wider.nav!, conversationWidth: wider.conversation!, sidebarWidth: wider.sidebar! }).row.map((c) => c.size)).toEqual([248, 540, 320, 324])
    expect(separatorRange(layout, 'conversation')).toEqual({ min: 320, max: 584 })
    // Narrowing it past its minimum shrinks the navigation next.
    expect(dragSeparator(layout, 'conversation', -150)).toEqual({ nav: 218, conversation: 320, sidebar: 400 })
    // The navigation takes from the workbench first, then the conversation; the sidebar keeps its width.
    expect(dragSeparator(layout, 'nav', 100)).toEqual({ nav: 348, conversation: 364, sidebar: 400 })
    expect(separatorRange(layout, 'nav')).toEqual({ min: 200, max: 480 })
    // The sidebar widens from the workbench, then the conversation, then the navigation.
    expect(dragSeparator(layout, 'sidebar', -100)).toEqual({ nav: 248, conversation: 364, sidebar: 500 })
    expect(separatorRange(layout, 'sidebar')).toEqual({ min: 280, max: 592 })
    // Session Mode: the conversation is the flexible column and keeps no width.
    const session = canvasLayout({ ...base, workbench: false })
    expect(dragSeparator(session, 'sidebar', -200)).toEqual({ nav: 248, sidebar: 600 })
    expect(separatorRange(session, 'sidebar')).toEqual({ min: 280, max: 832 })
    // A floating sidebar only sets its own width, within the canvas beside the conversation.
    const overlay = canvasLayout({ ...base, workspace: 1024, navKeptOpen: true })
    expect(dragSeparator(overlay, 'sidebar', -1000)).toEqual({ sidebar: 376 })
    expect(dragSeparator(overlay, 'sidebar', 50)).toEqual({ sidebar: 326 })
  })
  it('keeps a dragged navigation width within its range at the window level', () => {
    expect(initialWindowState('launcher:a').navWidth).toBeNull()
    expect(normalizeWindowState({ navWidth: 100 }, () => true, () => 'launcher:a').navWidth).toBe(200)
    expect(normalizeWindowState({ navWidth: 320 }, () => true, () => 'launcher:a').navWidth).toBe(320)
    expect(normalizeWindowState({ navWidth: 'wide' }, () => true, () => 'launcher:a').navWidth).toBeNull()
  })
  it('normalizes corrupt stored fields but strictly rejects malformed IPC patches', () => {
    expect(normalizeUiState({ schemaVersion: 99 })).toEqual(defaultUiState())
    const ui = normalizeUiState({ ...defaultUiState(), mainCanvas: { mode: 'view', viewId: 'missing' }, sidebarWidth: 100, lastTool: 'unknown' })
    expect(ui.mainCanvas).toEqual(defaultUiState().mainCanvas); expect(ui.sidebarWidth).toBe(280); expect(ui.lastTool).toBeNull()
    expect(() => parseUiStatePatch({ sidebarOpen: 'yes' })).toThrow()
    expect(() => parseUiStatePatch({ workbenchOpen: 1 })).toThrow()
    expect(() => parseUiStatePatch({ viewRightArea: 'preview' })).toThrow()
    // A View Mode tool saved by an older version no longer applies; the workbench column stays open.
    expect(normalizeUiState({ ...defaultUiState(), workbenchOpen: undefined, viewRightArea: 'terminal' })).toEqual(defaultUiState())
    expect(() => parseUiStatePatch({ extra: 1 })).toThrow()
  })
})
