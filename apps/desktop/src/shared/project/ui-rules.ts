// User-triggered transitions of a Project's UI state. Each returns the patch
// to apply, or null when the action changes nothing. Only user actions call
// these: agent or background events never change the layout (01 §8, 21–22).
import { currentTool } from './ui-state'
import type { RightArea, SessionId, ToolId, UiState, UiStatePatch, ViewConversation, ViewId } from './types'

/** Entering a View from the left navigation (navigation spec §2.2.2; P-A; PROJ-Q3). */
export function enterViewFromNav(state: UiState, viewId: ViewId): UiStatePatch | null {
  const canvas = state.mainCanvas
  // NAV-Q5 recommendation: clicking the current View again is ignored.
  if (canvas.mode === 'view' && canvas.viewId === viewId) return null
  return {
    mainCanvas: { mode: 'view', viewId, conversation: { kind: 'draft' } },
    viewRightArea: 'preview'
  }
}

/** Opening a Session in Conversation Mode (navigation spec §2.3.9). */
export function openSessionCanvas(state: UiState, sessionId: SessionId): UiStatePatch | null {
  const canvas = state.mainCanvas
  if (canvas.mode === 'session' && canvas.sessionId === sessionId) return null
  return { mainCanvas: { mode: 'session', sessionId } }
}

export function openDraftCanvas(state: UiState): UiStatePatch | null {
  return state.mainCanvas.mode === 'draft' ? null : { mainCanvas: { mode: 'draft' } }
}

/** Changes what the View's left conversation column shows (project-view task). */
export function setViewConversation(state: UiState, conversation: ViewConversation): UiStatePatch | null {
  const canvas = state.mainCanvas
  if (canvas.mode !== 'view') return null
  const same =
    canvas.conversation.kind === conversation.kind &&
    (conversation.kind === 'draft' ||
      (canvas.conversation.kind === 'session' && canvas.conversation.sessionId === conversation.sessionId))
  if (same) return null
  return { mainCanvas: { ...canvas, conversation } }
}

/**
 * Top-bar right sidebar button. Session Mode toggles the sidebar; View Mode
 * switches the right area between Preview and the last tool (P-B).
 */
export function toggleRightSidebar(state: UiState): UiStatePatch {
  if (state.mainCanvas.mode === 'view') {
    return { viewRightArea: state.viewRightArea === 'preview' ? currentTool(state) : 'preview' }
  }
  return { sidebarOpen: !state.sidebarOpen }
}

/** Icon switch in the sidebar header (Session Mode) or right area header (View Mode). */
export function selectRightArea(state: UiState, area: RightArea): UiStatePatch | null {
  if (state.mainCanvas.mode === 'view') {
    if (area === 'preview') return state.viewRightArea === 'preview' ? null : { viewRightArea: 'preview' }
    return { viewRightArea: area, lastTool: area }
  }
  if (area === 'preview') return null
  return { sidebarOpen: true, lastTool: area as ToolId }
}

/** Close button of the sidebar / tool area. */
export function closeRightSidebar(state: UiState): UiStatePatch | null {
  if (state.mainCanvas.mode === 'view') {
    return state.viewRightArea === 'preview' ? null : { viewRightArea: 'preview' }
  }
  return state.sidebarOpen ? { sidebarOpen: false } : null
}
