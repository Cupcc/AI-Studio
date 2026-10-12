import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { projectContract } from '@shared/ipc/project'
import { S } from '@shared/project/strings'
import { settingsContract } from '@shared/ipc/settings'
import { SETTINGS_STRINGS } from '@shared/settings/strings'
import type { MenuCommand } from '@shared/project/types'
import { emit } from '../ipc/registry'

export function installProjectMenu(): void {
  const command = (label: string, accelerator: string, command: MenuCommand): MenuItemConstructorOptions => ({
    label, accelerator, click: () => {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      if (!win) return
      win.show(); emit(win.webContents, projectContract.events.menuCommand, { command })
    }
  })
  // FR-SET-001: settings live in the application menu, as in other macOS apps.
  const settings: MenuItemConstructorOptions = {
    label: SETTINGS_STRINGS.menuItem, accelerator: 'CommandOrControl+,', click: () => {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      if (!win) return
      win.show(); emit(win.webContents, settingsContract.events.openRequested, undefined)
    }
  }
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, settings, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] } as MenuItemConstructorOptions] : []),
    { label: S.menu.file, submenu: [command(S.menu.newTab, 'CommandOrControl+T', 'newTab'), command(S.menu.openDirectory, 'CommandOrControl+O', 'openDirectory'), { type: 'separator' }, command(S.menu.closeTab, 'CommandOrControl+W', 'closeTab'), { role: 'close', accelerator: 'CommandOrControl+Shift+W' }] },
    { label: S.menu.edit, submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: S.menu.view, submenu: [command(S.menu.nextTab, 'Control+Tab', 'nextTab'), command(S.menu.previousTab, 'Control+Shift+Tab', 'previousTab'), { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: S.menu.window, submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(process.platform === 'darwin' ? [{ role: 'front' } as MenuItemConstructorOptions] : [])] }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
