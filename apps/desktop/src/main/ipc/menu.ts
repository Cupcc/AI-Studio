// Native popup menus for the trusted app renderer (DEC-25). Only labels and IDs cross the boundary; the chosen ID is
// returned and the renderer performs the action through its own typed contracts.
import { BrowserWindow, Menu, webContents, type MenuItemConstructorOptions } from 'electron'
import { menuContract } from '@shared/ipc/menu'
import { MENU_LIMITS, MENU_ROLES, type MenuItemRole, type MenuItemSpec, type PopupMenuRequest, type PopupMenuResult } from '@shared/menu/types'
import { defineHandlers, IpcValidationError } from './registry'
import { expectOnlyKeys, expectRecord, expectString } from './validate'

const ACCELERATOR = /^[A-Za-z0-9+\-=[\]\;',./`]{1,40}$/

export function parseMenuItems(raw: unknown, depth = 1, counter = { count: 0 }): MenuItemSpec[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new IpcValidationError('items must be a non-empty array')
  return Array.from(raw as unknown[], (item, index): MenuItemSpec => {
    if (++counter.count > MENU_LIMITS.items) throw new IpcValidationError(`At most ${MENU_LIMITS.items} menu items`)
    const value = expectRecord(item, `items[${index}]`)
    expectOnlyKeys(value, ['id', 'label', 'type', 'enabled', 'checked', 'accelerator', 'role', 'submenu'])
    const type = value.type ?? 'normal'
    if (type !== 'normal' && type !== 'separator' && type !== 'checkbox') throw new IpcValidationError('Invalid menu item type')
    if (type === 'separator') return { type }
    const spec: MenuItemSpec = { type, label: expectString(value.label, 'label', { minLength: 1, maxLength: MENU_LIMITS.label }) }
    if (value.submenu !== undefined) {
      if (depth >= MENU_LIMITS.depth) throw new IpcValidationError('Menu nesting is too deep')
      spec.submenu = parseMenuItems(value.submenu, depth + 1, counter)
    } else spec.id = expectString(value.id, 'id', { minLength: 1, maxLength: MENU_LIMITS.id })
    for (const key of ['enabled', 'checked'] as const) {
      if (value[key] === undefined) continue
      if (typeof value[key] !== 'boolean') throw new IpcValidationError(`${key} must be a boolean`)
      spec[key] = value[key] as boolean
    }
    if (value.role !== undefined) {
      if (!MENU_ROLES.includes(value.role as MenuItemRole) || spec.submenu) throw new IpcValidationError('Invalid menu role')
      spec.role = value.role as MenuItemRole
    }
    if (value.accelerator !== undefined) {
      const accelerator = expectString(value.accelerator, 'accelerator', { maxLength: MENU_LIMITS.accelerator })
      if (!ACCELERATOR.test(accelerator)) throw new IpcValidationError('Invalid accelerator')
      spec.accelerator = accelerator
    }
    return spec
  })
}

export function parsePopupRequest(raw: unknown): PopupMenuRequest {
  const value = expectRecord(raw)
  expectOnlyKeys(value, ['items', 'x', 'y'])
  const request: PopupMenuRequest = { items: parseMenuItems(value.items) }
  for (const key of ['x', 'y'] as const) {
    if (value[key] === undefined) continue
    const number = value[key]
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > 32768) throw new IpcValidationError(`Invalid ${key}`)
    request[key] = Math.round(number)
  }
  return request
}

/** Converts the specs; every click resolves the chosen ID. */
export function menuTemplate(items: readonly MenuItemSpec[], choose: (id: string) => void): MenuItemConstructorOptions[] {
  return items.map(item => item.type === 'separator' ? { type: 'separator' } : {
    label: item.label!,
    type: item.type === 'checkbox' ? 'checkbox' : 'normal',
    enabled: item.enabled ?? true,
    ...(item.checked === undefined ? {} : { checked: item.checked }),
    ...(item.accelerator ? { accelerator: item.accelerator, registerAccelerator: false } : {}),
    // A role is performed by Electron on the focused page; the menu then answers its ID once it closes.
    ...(item.submenu ? { submenu: menuTemplate(item.submenu, choose) } : item.role ? { role: item.role } : { click: () => choose(item.id!) })
  })
}

export function createMenuFeature() {
  return defineHandlers(menuContract, {
    popup: {
      parse: parsePopupRequest,
      handle: (request, context) => new Promise<PopupMenuResult>((resolve) => {
        const sender = webContents.fromId(context.senderId)
        const window = sender ? BrowserWindow.fromWebContents(sender) : null
        if (!window || window.isDestroyed()) { resolve({ id: null }); return }
        let settled = false
        const finish = (id: string | null) => { if (!settled) { settled = true; resolve({ id }) } }
        const menu = Menu.buildFromTemplate(menuTemplate(request.items, finish))
        // The click handler may run just after the close callback; give it a turn before answering "nothing chosen".
        menu.popup({ window, ...(request.x === undefined ? {} : { x: request.x }), ...(request.y === undefined ? {} : { y: request.y }), callback: () => setTimeout(() => finish(null), 50) })
      })
    }
  })
}
