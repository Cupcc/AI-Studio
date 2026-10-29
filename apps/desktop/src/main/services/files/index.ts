import { app, shell as systemShell, webContents } from 'electron'
import { filesContract } from '@shared/ipc/files'
import type { CoreServices } from '../core'
import { projectShellFor } from '../project'
import { createFilesService, type FilesService } from './service'
import { ripgrepPath } from './file-index'

const services = new WeakMap<CoreServices, FilesService>()

/**
 * Subscriptions belong to the renderer that made them. A destroyed or crashed renderer cannot unsubscribe, so the
 * service listens for it (the window's own lifecycle handlers in main/index.ts only know Terminal).
 */
export function watchWebContents(senderId: number, onGone: () => void): () => void {
  const contents = webContents?.fromId?.(senderId)
  if (!contents || contents.isDestroyed()) {
    const timer = setImmediate(onGone)
    return () => clearImmediate(timer)
  }
  contents.once('destroyed', onGone)
  contents.once('render-process-gone', onGone)
  return () => {
    contents.removeListener('destroyed', onGone)
    contents.removeListener('render-process-gone', onGone)
  }
}

export function filesFor(core: CoreServices): FilesService {
  let service = services.get(core)
  if (!service) {
    const shell = projectShellFor(core)
    service = createFilesService({
      projectRoot: (id) => shell.projects.getProject(id)?.canonicalPath ?? null,
      canOperate: (id) => !shell.isProjectClosing(id) && !shell.isQuitting(),
      changed: (event) => core.broadcast(filesContract.events.changed, event),
      watchChanged: (event) => core.broadcast(filesContract.events.watchChanged, event),
      watchOwner: watchWebContents,
      system: {
        trash: (absolute) => systemShell.trashItem(absolute),
        reveal: (absolute) => systemShell.showItemInFolder(absolute),
        openPath: (absolute) => systemShell.openPath(absolute),
        openExternal: (url) => systemShell.openExternal(url, { activate: true }),
        editors: () => ({ vscode: !!app.getApplicationNameForProtocol('vscode://'), cursor: !!app.getApplicationNameForProtocol('cursor://') }),
        ripgrep: ripgrepPath
      }
    })
    services.set(core, service)
  }
  return service
}

export type { FilesService } from './service'
