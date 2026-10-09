// `project` feature contract: opening Projects, recent list, per-Project UI
// state, window-level state, and the app menu / quit flow events.
// Shapes: src/shared/project/types.ts; rules: specs/project/spec.md.
import type {
  CloseProjectResult,
  MenuCommand,
  OpenProjectResult,
  ProjectId,
  QuitRequest,
  RecentProject,
  ShellBootstrap,
  UiState,
  UiStatePatch,
  WindowState
} from '../project/types'
import { defineContract, event, invoke } from './contract'

export const PATH_MAX_LENGTH = 4096
export const RECENT_LIMIT = 10

export interface OpenPathRequest {
  /** Absolute path; validated in main (spec §2.1.2). */
  path: string
}

export interface ProjectRef {
  projectId: ProjectId
}

export interface UpdateUiStateRequest {
  projectId: ProjectId
  patch: UiStatePatch
}

export interface MenuCommandPayload {
  command: MenuCommand
}

export const projectContract = defineContract('project', {
  invoke: {
    /** Window state, the records and UI state of its Project tabs, and the recent list. */
    bootstrap: invoke<void, ShellBootstrap>('project:bootstrap'),
    /** Native directory picker, then the same flow as openPath. */
    openDirectory: invoke<void, OpenProjectResult>('project:open-directory'),
    openPath: invoke<OpenPathRequest, OpenProjectResult>('project:open-path'),
    listRecent: invoke<void, RecentProject[]>('project:list-recent'),
    removeRecent: invoke<ProjectRef, RecentProject[]>('project:remove-recent'),
    getUiState: invoke<ProjectRef, UiState>('project:get-ui-state'),
    updateUiState: invoke<UpdateUiStateRequest, UiState>('project:update-ui-state'),
    saveWindowState: invoke<WindowState, void>('project:save-window-state'),
    closeProject: invoke<ProjectRef & { confirmed: boolean }, CloseProjectResult>('project:close-project'),
    /** Answer to a `quitRequested` event. */
    confirmQuit: invoke<void, void>('project:confirm-quit'),
    cancelQuit: invoke<void, void>('project:cancel-quit')
  },
  events: {
    menuCommand: event<MenuCommandPayload>('project:menu-command'),
    /** ⌘Q while sessions are active: the renderer shows the confirmation. */
    quitRequested: event<QuitRequest>('project:quit-requested')
  }
})
