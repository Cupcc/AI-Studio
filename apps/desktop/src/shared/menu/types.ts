// Native context / popup menus (FR-TOOL-001 / 003 / 004, DEC-25). The renderer describes items; main shows a native
// macOS menu and answers the chosen item ID. Nothing in a menu executes in main: the renderer acts on the answer.

export const MENU_LIMITS = { items: 60, depth: 2, label: 120, id: 200, accelerator: 40 } as const

export interface MenuItemSpec {
  /** Answered when chosen. Separators have none. */
  id?: string
  label?: string
  type?: 'normal' | 'separator' | 'checkbox'
  enabled?: boolean
  checked?: boolean
  /** Shown only (e.g. 'CmdOrCtrl+C'); the shortcut itself is handled where it is bound. */
  accelerator?: string
  /** Standard edit actions performed by the focused page itself (e.g. the Terminal's copy / paste). */
  role?: MenuItemRole
  submenu?: MenuItemSpec[]
}
export const MENU_ROLES = ['copy', 'paste', 'cut', 'selectAll'] as const
export type MenuItemRole = (typeof MENU_ROLES)[number]

export interface PopupMenuRequest {
  items: MenuItemSpec[]
  /** Window content coordinates (CSS px). Omitted: at the mouse pointer. */
  x?: number
  y?: number
}

export interface PopupMenuResult { id: string | null }
