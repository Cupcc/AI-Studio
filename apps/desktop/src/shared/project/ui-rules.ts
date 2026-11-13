// User-triggered transitions of a Project's UI state. Each returns the patch
// to apply, or null when the action changes nothing. Only user actions call
// these: agent or background events never change the layout (01 §8, 21–22).
import { currentTool } from './ui-state'
import type { SessionId, ToolId, UiState, UiStatePatch, ViewConversation, ViewId } from './types'

/** Entering a View from the left navigation shows its workbench column; the tool sidebar stays as it is (P-A; DEC-33). */
export function enterViewFromNav(state: UiState, viewId: ViewId): UiStatePatch | null {
  const canvas = state.mainCanvas
  // NAV-Q5 recommendation: clicking the current View again is ignored.
  if (canvas.mode === 'view' && canvas.viewId === viewId) return null
  return {
    mainCanvas: { mode: 'view', viewId, conversation: { kind: 'draft' } },
    workbenchOpen: true
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

/** Top-bar right sidebar button: toggles the tool sidebar in both modes (DEC-33). */
export function toggleRightSidebar(state: UiState): UiStatePatch {
  return { sidebarOpen: !state.sidebarOpen }
}

/** Icon switch in the sidebar header, or a user action that asks for a tool: shows that tool in the sidebar. */
export function selectTool(state: UiState, tool: ToolId): UiStatePatch | null {
  return state.sidebarOpen && currentTool(state) === tool ? null : { sidebarOpen: true, lastTool: tool }
}

/** Close button of the tool sidebar. */
export function closeRightSidebar(state: UiState): UiStatePatch | null {
  return state.sidebarOpen ? { sidebarOpen: false } : null
}

/** Workbench button in the View conversation header and the workbench column's close button (DEC-33). */
export function toggleWorkbench(state: UiState): UiStatePatch | null {
  return state.mainCanvas.mode === 'view' ? { workbenchOpen: !state.workbenchOpen } : null
}
