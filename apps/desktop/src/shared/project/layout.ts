// Column widths of a Project workspace (Shell Spec v02 §2.2–2.3; DEC-33): navigation | conversation | workbench | tool sidebar.
import {
  NAV_COLLAPSE_WIDTHS,
  NAV_WIDTH,
  SESSION_CONVERSATION_MIN_WIDTH,
  SIDEBAR_WIDTH,
  VIEW_CONVERSATION_WIDTH,
  WORKBENCH_MIN_WIDTH
} from './ui-state'

export type ColumnId = 'nav' | 'conversation' | 'workbench' | 'sidebar'
/** Columns that keep a dragged width. The flexible column (the workbench in a split, otherwise the conversation) takes the rest. */
export type SizedColumn = 'nav' | 'conversation' | 'sidebar'
/** Widths to save after a drag; null resets a column to its default. */
export type ColumnWidths = Partial<Record<SizedColumn, number | null>>

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
  navWidth: number | null
  conversationWidth: number | null
  sidebarWidth: number | null
}

export interface LayoutColumn { id: ColumnId; size: number; min: number; max: number }

export interface CanvasLayout {
  /** The open columns do not fit at their collapse widths beside a default-width navigation, so it collapses unless the user keeps it open. */
  spaceShort: boolean
  nav: boolean
  navWidth: number
  /** Canvas width after the navigation and gutters. */
  canvas: number
  /** Conversation width while the workbench is shown; otherwise the conversation takes the rest. */
  conversation: number
  sidebar: number
  /** The columns do not fit even without the navigation: the sidebar floats over the workbench. */
  overlay: boolean
  /** The columns side by side, left to right, that dragging a separator trades width between; a floating sidebar is not one of them. */
  row: LayoutColumn[]
}

/** Canvas width that holds the open columns side by side at their minimums, or at their navigation collapse widths. */
export function requiredCanvasWidth(workbench: boolean, sidebar: boolean, forNav = false): number {
  const side = sidebar ? (forNav ? NAV_COLLAPSE_WIDTHS.sidebar : SIDEBAR_WIDTH.min) : 0
  if (!workbench) return SESSION_CONVERSATION_MIN_WIDTH + side
  return (forNav ? NAV_COLLAPSE_WIDTHS.viewConversation + NAV_COLLAPSE_WIDTHS.workbench : VIEW_CONVERSATION_WIDTH.min + WORKBENCH_MIN_WIDTH) + side
}

const fit = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

/**
 * When the window narrows the workbench shrinks first, then the sidebar, then the conversation, then the navigation,
 * each to its minimum. The navigation collapses once the columns no longer fit beside it at their collapse widths;
 * if they do not fit even without it, the sidebar floats over the workbench.
 * Saved widths never change here: the window growing again restores them.
 */
export function canvasLayout(input: CanvasLayoutInput): CanvasLayout {
  const required = requiredCanvasWidth(input.workbench, input.sidebar)
  // The threshold uses the default navigation width, not the dragged one, so dragging the navigation never collapses it.
  const spaceShort = input.workspace - NAV_WIDTH.default - input.gutter < requiredCanvasWidth(input.workbench, input.sidebar, true)
  const nav = input.navExpanded && (!spaceShort || input.navKeptOpen)
  const navWidth = nav ? fit(input.navWidth ?? NAV_WIDTH.default, NAV_WIDTH.min, Math.min(NAV_WIDTH.max, input.workspace - input.gutter - required)) : 0
  const canvas = input.workspace - (nav ? navWidth : input.gutter) - input.gutter
  const sidebarPref = input.sidebarWidth ?? SIDEBAR_WIDTH.default
  const conversationPref = input.conversationWidth ?? VIEW_CONVERSATION_WIDTH.default
  const column = (id: ColumnId, size: number, min: number, max: number): LayoutColumn => ({ id, size, min: Math.min(min, size), max })
  const navColumn = nav ? [column('nav', navWidth, NAV_WIDTH.min, NAV_WIDTH.max)] : []
  const sidebarColumn = (size: number) => input.sidebar ? [column('sidebar', size, SIDEBAR_WIDTH.min, SIDEBAR_WIDTH.max)] : []
  const base = { spaceShort, nav, navWidth, canvas }
  if (!input.workbench) {
    const sidebar = fit(sidebarPref, SIDEBAR_WIDTH.min, Math.min(SIDEBAR_WIDTH.max, canvas - SESSION_CONVERSATION_MIN_WIDTH))
    const conversation = canvas - (input.sidebar ? sidebar : 0)
    const row = [...navColumn, column('conversation', conversation, SESSION_CONVERSATION_MIN_WIDTH, Infinity), ...sidebarColumn(sidebar)]
    return { ...base, conversation, sidebar, overlay: false, row }
  }
  const overlay = input.sidebar && canvas < required
  let sidebar: number, conversation: number
  if (!input.sidebar || overlay) {
    conversation = fit(conversationPref, VIEW_CONVERSATION_WIDTH.min, Math.min(VIEW_CONVERSATION_WIDTH.max, canvas - WORKBENCH_MIN_WIDTH))
    sidebar = fit(sidebarPref, SIDEBAR_WIDTH.min, Math.min(SIDEBAR_WIDTH.max, canvas - conversation))
  } else {
    sidebar = fit(sidebarPref, SIDEBAR_WIDTH.min, Math.min(SIDEBAR_WIDTH.max, canvas - WORKBENCH_MIN_WIDTH - conversationPref))
    conversation = fit(conversationPref, VIEW_CONVERSATION_WIDTH.min, Math.min(VIEW_CONVERSATION_WIDTH.max, canvas - WORKBENCH_MIN_WIDTH - sidebar))
  }
  const docked = input.sidebar && !overlay
  const row = [
    ...navColumn,
    column('conversation', conversation, VIEW_CONVERSATION_WIDTH.min, VIEW_CONVERSATION_WIDTH.max),
    column('workbench', canvas - conversation - (docked ? sidebar : 0), WORKBENCH_MIN_WIDTH, Infinity),
    ...(docked ? sidebarColumn(sidebar) : [])
  ]
  return { ...base, conversation, sidebar, overlay, row }
}

function range(from: number, to: number): number[] {
  const result: number[] = []
  if (from <= to) for (let i = from; i < to; i++) result.push(i)
  else for (let i = from; i > to; i--) result.push(i)
  return result
}

function pushToStart<T>(array: T[], value: T): void {
  const index = array.indexOf(value)
  if (index > -1) { array.splice(index, 1); array.unshift(value) }
}

/**
 * Moves the separator after `row[index]` by `delta` (positive = right) and returns the new sizes. Width comes from the
 * columns on the far side nearest first, so a column at its minimum passes the drag on to the next one; the drag stops
 * when every column on that side is at its minimum. `first` gives or takes width before the others on its side.
 *
 * Adapted from SplitView.resize in VS Code (src/vs/base/browser/ui/splitview/splitview.ts),
 * Copyright (c) Microsoft Corporation, MIT License; `first` is its high-priority index. Snapping is not ported.
 */
export function resizeRow(row: readonly LayoutColumn[], index: number, delta: number, first: number): number[] {
  const sizes = row.map((c) => c.size)
  const upIndexes = range(index, -1), downIndexes = range(index + 1, row.length)
  pushToStart(upIndexes, first); pushToStart(downIndexes, first)
  const minDeltaUp = upIndexes.reduce((r, i) => r + (row[i]!.min - sizes[i]!), 0)
  const maxDeltaUp = upIndexes.reduce((r, i) => r + (row[i]!.max - sizes[i]!), 0)
  const maxDeltaDown = downIndexes.length === 0 ? Infinity : downIndexes.reduce((r, i) => r + (sizes[i]! - row[i]!.min), 0)
  const minDeltaDown = downIndexes.length === 0 ? -Infinity : downIndexes.reduce((r, i) => r + (sizes[i]! - row[i]!.max), 0)
  delta = fit(delta, Math.max(minDeltaUp, minDeltaDown), Math.min(maxDeltaUp, maxDeltaDown))
  for (let i = 0, deltaUp = delta; i < upIndexes.length; i++) {
    const at = upIndexes[i]!, size = fit(row[at]!.size + deltaUp, row[at]!.min, row[at]!.max)
    deltaUp -= size - row[at]!.size; sizes[at] = size
  }
  for (let i = 0, deltaDown = delta; i < downIndexes.length; i++) {
    const at = downIndexes[i]!, size = fit(row[at]!.size - deltaDown, row[at]!.min, row[at]!.max)
    deltaDown += size - row[at]!.size; sizes[at] = size
  }
  return sizes
}

/** Current width of a sized column. */
export function columnWidth(layout: CanvasLayout, column: SizedColumn): number {
  return column === 'nav' ? layout.navWidth : column === 'conversation' ? layout.conversation : layout.sidebar
}

/**
 * Widths after dragging a column's separator by `delta` from `layout`: the navigation's and the conversation's
 * separators are on their right edge, the sidebar's on its left. Every sized column in the row is returned, so the
 * layout reproduces the drag exactly even where the window had compressed a column below its saved width.
 */
export function dragSeparator(layout: CanvasLayout, column: SizedColumn, delta: number): ColumnWidths {
  if (column === 'sidebar' && layout.overlay) {
    // The floating sidebar covers part of the workbench and only sets its own width.
    return { sidebar: Math.round(fit(layout.sidebar - delta, SIDEBAR_WIDTH.min, Math.min(SIDEBAR_WIDTH.max, layout.canvas - layout.conversation))) }
  }
  const row = layout.row, at = row.findIndex((c) => c.id === column)
  if (at < 0) return {}
  const flexible = row.findIndex((c) => c.id === (row.some((c) => c.id === 'workbench') ? 'workbench' : 'conversation'))
  const sizes = resizeRow(row, column === 'sidebar' ? at - 1 : at, delta, flexible)
  const widths: ColumnWidths = {}
  row.forEach((c, i) => { if (i !== flexible && c.id !== 'workbench') widths[c.id] = Math.round(sizes[i]!) })
  return widths
}

/** How narrow and how wide dragging can make a column from `layout`. */
export function separatorRange(layout: CanvasLayout, column: SizedColumn): { min: number; max: number } {
  const reach = (delta: number) => dragSeparator(layout, column, delta)[column] ?? columnWidth(layout, column)
  const [a, b] = [reach(-1e6), reach(1e6)]
  return { min: Math.min(a, b), max: Math.max(a, b) }
}
