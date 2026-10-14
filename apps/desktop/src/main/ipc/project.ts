// Handlers for the `project` feature (specs/project/spec.md).
import { isAbsolute } from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import { S } from '@shared/project/strings'
import type { WindowState } from '@shared/project/types'
import { PATH_MAX_LENGTH, projectContract } from '@shared/ipc/project'
import { parseUiStatePatch } from '@shared/project/ui-state'
import type { CoreServices } from '../services/core'
import { projectShellFor } from '../services/project'
import { defineHandlers, IpcValidationError, type HandlerContext } from './registry'
import { expectOnlyKeys, expectRecord, expectString, noInput } from './validate'

const ID_MAX_LENGTH = 100

export interface ProjectFeatureDeps {
  /** Shows the native directory picker attached to the sender's window. */
  pickDirectory(ctx: HandlerContext): Promise<string | null>
}

function parsePath(raw: unknown): { path: string } {
  const input = expectRecord(raw)
  expectOnlyKeys(input, ['path'])
  const path = expectString(input.path, 'path', { minLength: 1, maxLength: PATH_MAX_LENGTH })
  if (path.includes('\0')) throw new IpcValidationError('path must not contain NUL')
  if (!isAbsolute(path)) throw new IpcValidationError('path must be absolute')
  return { path }
}

function parseProjectRef(raw: unknown): { projectId: string } {
  const input = expectRecord(raw)
  expectOnlyKeys(input, ['projectId'])
  return { projectId: expectString(input.projectId, 'projectId', { minLength: 1, maxLength: ID_MAX_LENGTH }) }
}

function parseWindowState(raw: unknown): WindowState {
  const input = expectRecord(raw)
  expectOnlyKeys(input, ['tabs', 'currentTabId', 'navCollapsed'])
  if (!Array.isArray(input.tabs) || input.tabs.length > 500) throw new IpcValidationError('tabs must be an array')
  for (const tab of input.tabs) {
    const t = expectRecord(tab, 'tab')
    expectOnlyKeys(t, ['id', 'kind', 'projectId'])
    expectString(t.id, 'tab.id', { minLength: 1, maxLength: ID_MAX_LENGTH + 20 })
    if (t.kind !== 'launcher' && t.kind !== 'project') throw new IpcValidationError('tab.kind is invalid')
    if (t.kind === 'project') expectString(t.projectId, 'tab.projectId', { minLength: 1, maxLength: ID_MAX_LENGTH })
  }
  expectString(input.currentTabId, 'currentTabId', { minLength: 1, maxLength: ID_MAX_LENGTH + 20 })
  if (typeof input.navCollapsed !== 'boolean') throw new IpcValidationError('navCollapsed must be a boolean')
  return input as unknown as WindowState
}

export function createProjectFeature(core: Pick<CoreServices, 'database'>, deps: ProjectFeatureDeps = {
  pickDirectory: async (ctx) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.id === ctx.senderId)
    const options = { title: S.pickerTitle, buttonLabel: S.pickerButton, properties: ['openDirectory'] as const }
    const result = win ? await dialog.showOpenDialog(win, { ...options, properties: [...options.properties] })
      : await dialog.showOpenDialog({ ...options, properties: [...options.properties] })
    return result.canceled ? null : result.filePaths[0] ?? null
  }
}) {
  const shell = projectShellFor(core)
  const projects = shell.projects
  const openPath = async (path: string) => {
    const result = projects.openPath(path)
    if (result.ok && result.created) await shell.sessionPort().initializeProject?.(result.project.id)
    if (result.ok) shell.views?.open(result.project.id)
    return result
  }
  return defineHandlers(projectContract, {
    bootstrap: { parse: noInput, handle: () => {
      const result = projects.bootstrap()
      for (const project of result.projects) shell.views?.open(project.id)
      return result
    } },
    openDirectory: {
      parse: noInput,
      handle: async (_req, ctx) => {
        const path = await deps.pickDirectory(ctx)
        if (!path) return { ok: false, reason: 'cancelled' } as const
        return openPath(path)
      }
    },
    openPath: { parse: parsePath, handle: ({ path }) => openPath(path) },
    listRecent: { parse: noInput, handle: () => projects.listRecent() },
    removeRecent: {
      parse: parseProjectRef,
      handle: ({ projectId }) => {
        projects.removeRecent(projectId)
        return projects.listRecent()
      }
    },
    getUiState: { parse: parseProjectRef, handle: ({ projectId }) => projects.getUiState(projectId) },
    updateUiState: {
      parse: (raw) => {
        const input = expectRecord(raw)
        expectOnlyKeys(input, ['projectId', 'patch'])
        const { projectId } = parseProjectRef({ projectId: input.projectId })
        try {
          return { projectId, patch: parseUiStatePatch(input.patch) }
        } catch (error) {
          throw new IpcValidationError(error instanceof Error ? error.message : 'patch is invalid')
        }
      },
      handle: ({ projectId, patch }) => {
        const state = projects.updateUiState(projectId, patch)
        shell.toolsChanged?.()
        return state
      }
    },
    saveWindowState: {
      parse: parseWindowState,
      handle: (state) => {
        projects.saveWindowState(state)
        shell.toolsChanged?.()
      }
    },
    closeProject: {
      parse: (raw) => {
        const input = expectRecord(raw)
        expectOnlyKeys(input, ['projectId', 'confirmed'])
        const { projectId } = parseProjectRef({ projectId: input.projectId })
        if (typeof input.confirmed !== 'boolean') throw new IpcValidationError('confirmed must be boolean')
        return { projectId, confirmed: input.confirmed }
      },
      handle: ({ projectId, confirmed }) => shell.closeProject(projectId, confirmed)
    },
    confirmQuit: { parse: noInput, handle: () => shell.quitFlow?.confirm() },
    stateFlushed: { parse: noInput, handle: () => shell.onStateFlushed?.() },
    cancelQuit: { parse: noInput, handle: () => shell.quitFlow?.cancel() }
  })
}
