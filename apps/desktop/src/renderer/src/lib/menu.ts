// Native popup menus (DEC-25). Items carry IDs only; the caller performs the chosen action.
import type { MenuItemSpec } from '@shared/menu/types'
import { studio } from './studio'

export type { MenuItemSpec } from '@shared/menu/types'
export const separator: MenuItemSpec = { type: 'separator' }

/** Shows the menu and resolves the chosen ID, or null when dismissed (or when no menu could be shown). */
export async function popupMenu(items: MenuItemSpec[], at?: { x: number; y: number }): Promise<string | null> {
  try {
    const result = await studio().menu.popup(at ? { items, x: Math.max(0, at.x), y: Math.max(0, at.y) } : { items })
    return result.id
  } catch { return null }
}

/** Anchors a menu below a button, like a dropdown. */
export function below(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect()
  return { x: rect.left, y: rect.bottom + 4 }
}
