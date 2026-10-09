// Per-Project UI state: defaults, tolerant normalization of stored values and
// strict parsing of renderer patches (spec §2.3.4–2.3.5, §3.2).
import {
  DEFAULT_VIEW_IDS,
  TOOL_IDS,
  type MainCanvas,
  type RightArea,
  type ToolId,
  type UiState,
  type UiStatePatch,
  type ViewConversation,
  type ViewId
} from './types'

export const UI_STATE_VERSION = 1

/** Shell Spec v01 §1.2 (exploratory sizes). */
export const SIDEBAR_WIDTH = { min: 320, max: 560, default: 400 } as const
export const VIEW_CONVERSATION_WIDTH = { min: 360, max: 560, default: 440 } as const
export const SESSION_CONVERSATION_MIN_WIDTH = 400
export const VIEW_RIGHT_AREA_MIN_WIDTH = 400
export const NAV_WIDTH = 248

/** PROJ-Q14 recommendation: first expansion shows Files. */
export const DEFAULT_TOOL: ToolId = 'files'

export const SESSION_ID_MAX_LENGTH = 200

export function isViewId(value: unknown): value is ViewId {
  return typeof value === 'string' && (DEFAULT_VIEW_IDS as readonly string[]).includes(value)
}

export function isToolId(value: unknown): value is ToolId {
  return typeof value === 'string' && (TOOL_IDS as readonly string[]).includes(value)
}

export function isRightArea(value: unknown): value is RightArea {
  return value === 'preview' || isToolId(value)
}

function isSessionId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= SESSION_ID_MAX_LENGTH
}

/** First open of a Project: Overview with a new draft and Preview (spec §2.3.3). */
export function overviewCanvas(): MainCanvas {
  return { mode: 'view', viewId: 'overview', conversation: { kind: 'draft' } }
}

export function defaultUiState(): UiState {
  return {
    schemaVersion: UI_STATE_VERSION,
    mainCanvas: overviewCanvas(),
    sidebarOpen: false,
    viewRightArea: 'preview',
    lastTool: null,
    sidebarWidth: null,
    viewConversationWidth: null
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseConversation(value: unknown): ViewConversation | null {
  const r = asRecord(value)
  if (!r) return null
  if (r.kind === 'draft') return { kind: 'draft' }
  if (r.kind === 'session' && isSessionId(r.sessionId)) return { kind: 'session', sessionId: r.sessionId }
  return null
}

/** Returns null when the value is not a valid canvas. */
export function parseMainCanvas(value: unknown): MainCanvas | null {
  const r = asRecord(value)
  if (!r) return null
  switch (r.mode) {
    case 'session':
      return isSessionId(r.sessionId) ? { mode: 'session', sessionId: r.sessionId } : null
    case 'draft':
      return { mode: 'draft' }
    case 'view': {
      if (!isViewId(r.viewId)) return null
      const conversation = parseConversation(r.conversation)
      return conversation ? { mode: 'view', viewId: r.viewId, conversation } : null
    }
    default:
      return null
  }
}

function parseWidth(value: unknown, range: { min: number; max: number }): number | null | undefined {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.round(Math.min(range.max, Math.max(range.min, value)))
}

/**
 * Tolerant read of stored state: unknown versions or a corrupt blob fall back
 * to defaults (first-open behaviour); invalid fields fall back one by one.
 */
export function normalizeUiState(raw: unknown): UiState {
  const base = defaultUiState()
  const r = asRecord(raw)
  if (!r || r.schemaVersion !== UI_STATE_VERSION) return base
  const sidebarWidth = parseWidth(r.sidebarWidth, SIDEBAR_WIDTH)
  const viewConversationWidth = parseWidth(r.viewConversationWidth, VIEW_CONVERSATION_WIDTH)
  return {
    schemaVersion: UI_STATE_VERSION,
    mainCanvas: parseMainCanvas(r.mainCanvas) ?? base.mainCanvas,
    sidebarOpen: typeof r.sidebarOpen === 'boolean' ? r.sidebarOpen : base.sidebarOpen,
    viewRightArea: isRightArea(r.viewRightArea) ? r.viewRightArea : base.viewRightArea,
    lastTool: isToolId(r.lastTool) ? r.lastTool : null,
    sidebarWidth: sidebarWidth === undefined ? null : sidebarWidth,
    viewConversationWidth: viewConversationWidth === undefined ? null : viewConversationWidth
  }
}

const PATCH_KEYS = [
  'mainCanvas',
  'sidebarOpen',
  'viewRightArea',
  'lastTool',
  'sidebarWidth',
  'viewConversationWidth'
] as const

/** Strict parse of an untrusted patch; throws Error with a short reason. */
export function parseUiStatePatch(raw: unknown): UiStatePatch {
  const r = asRecord(raw)
  if (!r) throw new Error('patch must be an object')
  const patch: UiStatePatch = {}
  for (const key of Object.keys(r)) {
    if (!(PATCH_KEYS as readonly string[]).includes(key)) throw new Error(`Unexpected field: ${key}`)
  }
  if ('mainCanvas' in r) {
    const canvas = parseMainCanvas(r.mainCanvas)
    if (!canvas) throw new Error('mainCanvas is invalid')
    patch.mainCanvas = canvas
  }
  if ('sidebarOpen' in r) {
    if (typeof r.sidebarOpen !== 'boolean') throw new Error('sidebarOpen must be a boolean')
    patch.sidebarOpen = r.sidebarOpen
  }
  if ('viewRightArea' in r) {
    if (!isRightArea(r.viewRightArea)) throw new Error('viewRightArea is invalid')
    patch.viewRightArea = r.viewRightArea
  }
  if ('lastTool' in r) {
    if (r.lastTool !== null && !isToolId(r.lastTool)) throw new Error('lastTool is invalid')
    patch.lastTool = r.lastTool as ToolId | null
  }
  for (const [key, range] of [
    ['sidebarWidth', SIDEBAR_WIDTH],
    ['viewConversationWidth', VIEW_CONVERSATION_WIDTH]
  ] as const) {
    if (key in r) {
      const width = parseWidth(r[key], range)
      if (width === undefined) throw new Error(`${key} must be a number or null`)
      patch[key] = width
    }
  }
  return patch
}

export function applyUiStatePatch(state: UiState, patch: UiStatePatch): UiState {
  return normalizeUiState({ ...state, ...patch })
}

/** Session currently shown by a canvas (Conversation or the View's left column). */
export function displayedSessionId(canvas: MainCanvas): string | null {
  if (canvas.mode === 'session') return canvas.sessionId
  if (canvas.mode === 'view' && canvas.conversation.kind === 'session') return canvas.conversation.sessionId
  return null
}

export function currentTool(state: UiState): ToolId {
  return state.lastTool ?? DEFAULT_TOOL
}

export function isViewMode(state: UiState): boolean {
  return state.mainCanvas.mode === 'view'
}

/** Whether the top-bar right sidebar button shows as Selected. */
export function isRightSidebarActive(state: UiState): boolean {
  return isViewMode(state) ? state.viewRightArea !== 'preview' : state.sidebarOpen
}
