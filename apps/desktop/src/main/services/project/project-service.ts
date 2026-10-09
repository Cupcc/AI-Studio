// Project records, recent list, per-Project UI state and window state in
// SQLite (specs/project/spec.md §2.1.4–2.1.5, §2.3, §3). Writes are single
// small statements and are applied immediately, so there is nothing to flush
// on tab close or quit (spec §2.3.4 allows this).
import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { normalizeWindowState, openProjectIds } from '@shared/project/tabs'
import type {
  OpenProjectResult,
  ProjectId,
  ProjectRecord,
  RecentProject,
  ShellBootstrap,
  UiState,
  UiStatePatch,
  WindowState
} from '@shared/project/types'
import { applyUiStatePatch, defaultUiState, normalizeUiState } from '@shared/project/ui-state'
import { RECENT_LIMIT } from '@shared/ipc/project'
import { hasIdentity, inspectDirectory, type DirectoryIdentity } from './identity'

const WINDOW_STATE_ID = 'main'

interface ProjectRow {
  id: string
  name: string
  local_path: string
  canonical_path: string
  dev: string
  ino: string
  default_cli: string | null
  ui_state: string
  last_opened_at: string | null
  hidden_from_recent: number
  created_at: string
}

function toRecord(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    localPath: row.local_path,
    canonicalPath: row.canonical_path,
    createdAt: row.created_at,
    lastOpenedAt: row.last_opened_at
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export interface ProjectServiceOptions {
  now?: () => Date
  newId?: () => string
}

export interface ProjectService {
  /** Validates, identifies and records a directory (spec §2.1.4 steps 1–4). */
  openPath(path: string): OpenProjectResult
  getProject(id: ProjectId): ProjectRecord | null
  getUiState(id: ProjectId): UiState
  updateUiState(id: ProjectId, patch: UiStatePatch): UiState
  listRecent(limit?: number): RecentProject[]
  removeRecent(id: ProjectId): void
  loadWindowState(): WindowState
  saveWindowState(state: unknown): WindowState
  bootstrap(): ShellBootstrap
  /** For the chat module (specs/chat/spec.md §3); null until set. */
  getDefaultCli(id: ProjectId): string | null
  setDefaultCli(id: ProjectId, cli: string | null): void
}

export class ProjectNotFoundError extends Error {
  constructor(id: string) {
    super(`Unknown project: ${id}`)
    this.name = 'ProjectNotFoundError'
  }
}

export function createProjectService(
  database: () => DatabaseSync,
  options: ProjectServiceOptions = {}
): ProjectService {
  const now = () => (options.now?.() ?? new Date()).toISOString()
  const newId = options.newId ?? randomUUID

  const row = (id: ProjectId): ProjectRow | undefined =>
    database().prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined

  const requireRow = (id: ProjectId): ProjectRow => {
    const r = row(id)
    if (!r) throw new ProjectNotFoundError(id)
    return r
  }

  function findByIdentity(identity: DirectoryIdentity): ProjectRow | undefined {
    const db = database()
    const exact = db.prepare('SELECT * FROM projects WHERE canonical_path = ?').get(identity.canonicalPath) as
      | ProjectRow
      | undefined
    if (exact) return exact
    // Same directory under another path string: the stored path must still
    // resolve to this device/inode, so a reused inode cannot match.
    const candidates = db
      .prepare('SELECT * FROM projects WHERE dev = ? AND ino = ?')
      .all(identity.dev, identity.ino) as unknown as ProjectRow[]
    return candidates.find((c) => hasIdentity(c.canonical_path, identity.dev, identity.ino))
  }

  function getUiState(id: ProjectId): UiState {
    return normalizeUiState(parseJson(requireRow(id).ui_state))
  }

  function loadWindowState(): WindowState {
    const stored = database().prepare('SELECT state FROM shell_window_state WHERE id = ?').get(WINDOW_STATE_ID) as
      | { state: string }
      | undefined
    return normalizeWindowState(stored ? parseJson(stored.state) : null, (id) => row(id) !== undefined)
  }

  function listRecent(limit = RECENT_LIMIT): RecentProject[] {
    const rows = database()
      .prepare(
        `SELECT * FROM projects WHERE last_opened_at IS NOT NULL AND hidden_from_recent = 0
         ORDER BY last_opened_at DESC, created_at DESC LIMIT ?`
      )
      .all(limit) as unknown as ProjectRow[]
    return rows.map((r) => {
      const check = inspectDirectory(r.canonical_path)
      return { project: toRecord(r), status: check.ok ? 'ok' : check.reason }
    })
  }

  return {
    openPath(path) {
      const inspected = inspectDirectory(path)
      if (!inspected.ok) return { ok: false, reason: inspected.reason, path, privacyHint: inspected.privacyHint }
      const db = database()
      const at = now()
      const existing = findByIdentity(inspected.identity)
      if (existing) {
        db.prepare(
          `UPDATE projects SET last_opened_at = ?, hidden_from_recent = 0, dev = ?, ino = ? WHERE id = ?`
        ).run(at, inspected.identity.dev, inspected.identity.ino, existing.id)
        const updated = requireRow(existing.id)
        return { ok: true, project: toRecord(updated), uiState: getUiState(existing.id), created: false }
      }
      const id = newId()
      const uiState = defaultUiState()
      db.prepare(
        `INSERT INTO projects (id, name, local_path, canonical_path, dev, ino, ui_state, last_opened_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        inspected.displayName,
        inspected.selectedPath,
        inspected.identity.canonicalPath,
        inspected.identity.dev,
        inspected.identity.ino,
        JSON.stringify(uiState),
        at,
        at
      )
      return { ok: true, project: toRecord(requireRow(id)), uiState, created: true }
    },

    getProject(id) {
      const r = row(id)
      return r ? toRecord(r) : null
    },

    getUiState,

    updateUiState(id, patch) {
      const next = applyUiStatePatch(getUiState(id), patch)
      database().prepare('UPDATE projects SET ui_state = ? WHERE id = ?').run(JSON.stringify(next), id)
      return next
    },

    listRecent,

    removeRecent(id) {
      requireRow(id)
      database().prepare('UPDATE projects SET hidden_from_recent = 1 WHERE id = ?').run(id)
    },

    loadWindowState,

    saveWindowState(state) {
      const normalized = normalizeWindowState(state, (id) => row(id) !== undefined)
      database()
        .prepare(
          `INSERT INTO shell_window_state (id, state, updated_at) VALUES (?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`
        )
        .run(WINDOW_STATE_ID, JSON.stringify(normalized), now())
      return normalized
    },

    bootstrap() {
      const windowState = loadWindowState()
      const ids = openProjectIds(windowState)
      const projects = ids.map((id) => toRecord(requireRow(id)))
      const uiStates = Object.fromEntries(ids.map((id) => [id, getUiState(id)]))
      return { windowState, projects, uiStates, recent: listRecent() }
    },

    getDefaultCli(id) {
      return requireRow(id).default_cli
    },

    setDefaultCli(id, cli) {
      requireRow(id)
      database().prepare('UPDATE projects SET default_cli = ? WHERE id = ?').run(cli, id)
    }
  }
}
