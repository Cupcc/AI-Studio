// Project shell data shapes shared by main and renderer
// (specs/project/spec.md §3; specs/navigation/spec.md §3).

export type ProjectId = string
export type SessionId = string

/** Built-in Project Views (FR-NAV-002); custom views (FR-VIEW-002, P1) will extend this. */
export const DEFAULT_VIEW_IDS = ['overview', 'progress', 'architecture', 'agent-team', 'business-flow'] as const
export type ViewId = (typeof DEFAULT_VIEW_IDS)[number]

export const TOOL_IDS = ['files', 'diff', 'browser', 'terminal'] as const
export type ToolId = (typeof TOOL_IDS)[number]

/** What the right area shows in Project View Mode (UX P-B). */
export type RightArea = 'preview' | ToolId

export type ViewConversation = { kind: 'draft' } | { kind: 'session'; sessionId: SessionId }

/** Main Canvas content of one Project (spec §3.2 `main_canvas`). */
export type MainCanvas =
  | { mode: 'session'; sessionId: SessionId }
  | { mode: 'draft' }
  | { mode: 'view'; viewId: ViewId; conversation: ViewConversation }

/** Per-Project UI state (spec §3.2; PROJ-Q3 confirmed 2026-10-09). */
export interface UiState {
  schemaVersion: 1
  mainCanvas: MainCanvas
  /** Session Mode: right sidebar expanded. */
  sidebarOpen: boolean
  /** Project View Mode: what the right area shows. */
  viewRightArea: RightArea
  /** Shared by both modes; null = default tool (PROJ-Q14). */
  lastTool: ToolId | null
  /** Session Mode sidebar width; null = default. */
  sidebarWidth: number | null
  /** Project View Mode conversation column width; null = default. */
  viewConversationWidth: number | null
}

export type UiStatePatch = Partial<Omit<UiState, 'schemaVersion'>>

export interface ProjectRecord {
  id: ProjectId
  /** Display name: last segment of the first selected path. */
  name: string
  /** Path as first selected by the user (display only). */
  localPath: string
  /** `localPath` with the home directory shortened to `~` (display only). */
  displayPath: string
  /** Symlink-resolved absolute path; CLI working directory. */
  canonicalPath: string
  createdAt: string
  lastOpenedAt: string | null
}

export type DirectoryStatus = 'ok' | 'not_found' | 'not_directory' | 'unreadable'

export interface RecentProject {
  project: ProjectRecord
  /** Checked when the list is read (spec §2.1.6). */
  status: DirectoryStatus
}

export type WindowTab = { id: string; kind: 'launcher' } | { id: string; kind: 'project'; projectId: ProjectId }

/** Window-level state, persisted across relaunch (PROJ-Q1, NAV-Q10). */
export interface WindowState {
  tabs: WindowTab[]
  currentTabId: string
  navCollapsed: boolean
}

export type OpenFailureReason = 'not_found' | 'not_directory' | 'unreadable'

export type OpenProjectResult =
  | { ok: true; project: ProjectRecord; uiState: UiState; created: boolean }
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: OpenFailureReason; path: string; privacyHint: boolean }

export interface ShellBootstrap {
  windowState: WindowState
  /** Records of every Project that has a tab in `windowState`. */
  projects: ProjectRecord[]
  uiStates: Record<ProjectId, UiState>
  recent: RecentProject[]
}

/** Commands sent by the application menu (PROJ-Q17). */
export type MenuCommand = 'newTab' | 'closeTab' | 'openDirectory' | 'nextTab' | 'previousTab'

export interface QuitRequest {
  /** Running + Needs Input sessions across all Projects. */
  sessions: number
  projects: number
}

/** Highest-priority attention of a Project (Needs Input > Error > Completed Unread). */
export type ProjectAttention = 'needs_input' | 'error' | 'completed_unread' | null

export interface BlockingSessionCounts { running: number; needsInput: number }
export interface StopProjectResult {
  stopped: SessionId[]
  failed: { sessionId: SessionId; reason: string }[]
}
export type CloseProjectResult =
  | { status: 'confirmation_required'; counts: BlockingSessionCounts }
  | { status: 'closed' }
  | { status: 'failed'; failed: StopProjectResult['failed'] }
