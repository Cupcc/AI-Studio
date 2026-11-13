// Column widths of a Project workspace (Shell Spec v02 §2.2–2.3; DEC-33): navigation | conversation | workbench | tool sidebar.
import {
  NAV_WIDTH,
  SESSION_CONVERSATION_MIN_WIDTH,
  SIDEBAR_WIDTH,
  VIEW_CONVERSATION_WIDTH,
  WORKBENCH_MIN_WIDTH
} from './ui-state'

export interface CanvasLayoutInput {
  /** Width of the Project workspace: navigation plus canvas. */
  workspace: number
  /** Canvas margin on its right, and on its left when the navigation is hidden (glass gutter). */
  gutter: number
  /** The user's navigation preference is expanded. */
  navExpanded: boolean
  /** The user reopened the navigation while space was short. */
  navKeptOpen: boolean
  workbench: boolean
  sidebar: boolean
  /** Saved widths; null = default. */
  conversationWidth: number | null
  sidebarWidth: number | null
}

export interface CanvasLayout {
  /** The columns' minimums do not fit beside the navigation, so it collapses unless the user keeps it open. */
  spaceShort: boolean
  nav: boolean
  /** Canvas width after the navigation and gutters. */
  canvas: number
  /** Conversation width while the workbench is shown; otherwise the conversation takes the rest. */
  conversation: number
  sidebar: number
  /** The columns do not fit even without the navigation: the sidebar floats over the workbench. */
  overlay: boolean
  /** Upper bounds for dragging the conversation and sidebar separators. */
  conversationMax: number
  sidebarMax: number
}

/** Minimum canvas width that holds the open columns side by side. */
export function requiredCanvasWidth(workbench: boolean, sidebar: boolean): number {
  const side = sidebar ? SIDEBAR_WIDTH.min : 0
  return workbench ? VIEW_CONVERSATION_WIDTH.min + WORKBENCH_MIN_WIDTH + side : SESSION_CONVERSATION_MIN_WIDTH + side
}

/**
 * When space runs short the workbench shrinks first, then the sidebar, then the conversation, each to its minimum;
 * then the navigation collapses; if the columns still do not fit, the sidebar floats over the workbench.
 * Saved widths never change here: the window growing again restores them.
 */
export function canvasLayout(input: CanvasLayoutInput): CanvasLayout {
  const required = requiredCanvasWidth(input.workbench, input.sidebar)
  const spaceShort = input.workspace - NAV_WIDTH - input.gutter < required
  const nav = input.navExpanded && (!spaceShort || input.navKeptOpen)
  const canvas = input.workspace - (nav ? NAV_WIDTH : input.gutter) - input.gutter
  const sidebarPref = input.sidebarWidth ?? SIDEBAR_WIDTH.default
  const conversationPref = input.conversationWidth ?? VIEW_CONVERSATION_WIDTH.default
  const fit = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))
  if (!input.workbench) {
    const sidebarMax = Math.min(SIDEBAR_WIDTH.max, canvas - SESSION_CONVERSATION_MIN_WIDTH)
    const sidebar = fit(sidebarPref, SIDEBAR_WIDTH.min, sidebarMax)
    return { spaceShort, nav, canvas, conversation: canvas - (input.sidebar ? sidebar : 0), sidebar, overlay: false, conversationMax: VIEW_CONVERSATION_WIDTH.max, sidebarMax }
  }
  const overlay = input.sidebar && canvas < required
  if (!input.sidebar || overlay) {
    const conversationMax = Math.min(VIEW_CONVERSATION_WIDTH.max, canvas - WORKBENCH_MIN_WIDTH)
    const conversation = fit(conversationPref, VIEW_CONVERSATION_WIDTH.min, conversationMax)
    const sidebarMax = Math.min(SIDEBAR_WIDTH.max, canvas - conversation)
    return { spaceShort, nav, canvas, conversation, sidebar: fit(sidebarPref, SIDEBAR_WIDTH.min, sidebarMax), overlay, conversationMax, sidebarMax }
  }
  const sidebar = fit(sidebarPref, SIDEBAR_WIDTH.min, canvas - WORKBENCH_MIN_WIDTH - conversationPref)
  const conversation = fit(conversationPref, VIEW_CONVERSATION_WIDTH.min, canvas - WORKBENCH_MIN_WIDTH - sidebar)
  return {
    spaceShort, nav, canvas, conversation, sidebar, overlay,
    conversationMax: Math.min(VIEW_CONVERSATION_WIDTH.max, canvas - WORKBENCH_MIN_WIDTH - sidebar),
    sidebarMax: Math.min(SIDEBAR_WIDTH.max, canvas - WORKBENCH_MIN_WIDTH - conversation)
  }
}
