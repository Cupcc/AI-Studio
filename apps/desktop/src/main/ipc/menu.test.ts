import { describe, expect, it, vi } from 'vitest'
import { menuTemplate, parsePopupRequest } from './menu'

vi.mock('electron', () => ({ BrowserWindow: {}, Menu: {}, webContents: {} }))

describe('Native popup menu boundary', () => {
  it('accepts labels, IDs, separators, checkboxes, display accelerators and one submenu level', () => {
    const request = parsePopupRequest({ x: 10.4, y: 20, items: [
      { id: 'copy', label: '复制', accelerator: 'CmdOrCtrl+C' },
      { type: 'separator' },
      { id: 'wrap', label: '自动换行', type: 'checkbox', checked: true },
      { label: '打开方式', submenu: [{ id: 'vscode', label: 'VS Code', enabled: false }] },
      { id: 'paste', label: '粘贴', role: 'paste' }
    ] })
    expect(request.x).toBe(10)
    expect(request.items[1]).toEqual({ type: 'separator' })
    const choose = vi.fn()
    const template = menuTemplate(request.items, choose)
    ;(template[0]!.click as () => void)()
    expect(choose).toHaveBeenCalledWith('copy')
    expect(template[0]).toMatchObject({ accelerator: 'CmdOrCtrl+C', registerAccelerator: false })
    expect(template[3]!.submenu).toEqual([expect.objectContaining({ label: 'VS Code', enabled: false })])
    expect(template[4]).toMatchObject({ role: 'paste' })
    expect(template[4]).not.toHaveProperty('click')
  })

  it.each([
    { items: [] },
    { items: [{ label: 'x' }] },
    { items: [{ id: 'x', label: '' }] },
    { items: [{ id: 'x', label: 'x', role: 'quit' }] },
    { items: [{ id: 'x', label: 'x', click: 'code' }] },
    { items: [{ id: 'x', label: 'x', role: 'quit' }] },
    { items: [{ id: 'x', label: 'x', role: 'toggleDevTools' }] },
    { items: [{ id: 'x', label: 'x', accelerator: 'Cmd+Q\n' }] },
    { items: [{ label: 'a', submenu: [{ label: 'b', submenu: [{ id: 'c', label: 'c' }] }] }] },
    { items: Array.from({ length: 61 }, (_, i) => ({ id: `${i}`, label: `${i}` })) },
    { items: [{ id: 'x', label: 'x' }], x: -1 },
    { items: [{ id: 'x', label: 'x' }], extra: true }
  ])('rejects malformed or privileged menu input %#', raw => {
    expect(() => parsePopupRequest(raw)).toThrow()
  })
})
