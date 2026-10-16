// Contracts of the project Diff (FR-TOOL-002 items 2, 3, 6; specs/tools/spec.md §3, §4).
// Types only. The per-turn Diff (items 4, 5) is a later stage and extends the request with a scope.
import type { ProjectPath } from './files'

export const DIFF_LIMITS = {
  files: 2000,
  patchBytes: 1_048_576,
  /** Per side for the two-sided editor; its diff computation runs on the main thread (no web workers). */
  sideBytes: 524_288,
  rawOutputBytes: 8_388_608,
  untrackedOutputBytes: 4_194_304,
  listTimeoutMs: 15_000,
  fileTimeoutMs: 10_000,
  /** Re-queries while the working tree keeps changing before `settled: false` is returned. */
  settleRetries: 2,
  watcherDebounceMs: 400,
  watcherMaxWaitMs: 2000
} as const

export type DiffChangeKind = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'typechange' | 'conflicted'

export interface DiffFileEntry {
  /** Project-relative (git --relative), current name. */
  path: ProjectPath
  /** Rename / copy source. */
  oldPath: ProjectPath | null
  kind: DiffChangeKind
  /** No HEAD blob: compared with empty content (also every file when HEAD is unborn). */
  untracked: boolean
  binary: boolean | null
  /** null = binary or unknown. */
  additions: number | null
  deletions: number | null
  /** A mode-only change stays visible. */
  oldMode: string | null
  newMode: string | null
  renameScore: number | null
  /** Patch-only view, never two-sided. */
  special: 'symlink' | 'submodule' | null
}

export type DiffAvailability =
  | 'ready' | 'clean' | 'no_head' | 'not_git' | 'git_missing' | 'git_unsafe_directory'
  | 'project_unavailable' | 'project_closing' | 'timeout' | 'failed'

export interface DiffHead { branch: string | null; commit: string | null; detached: boolean }

export interface DiffSnapshot {
  projectId: string
  /** Issued when the query STARTS; the higher wins. Same counter as `DiffFileResult.revision`. */
  revision: number
  /** false = the working tree kept changing across `settleRetries`. */
  settled: boolean
  /** 'clean' = HEAD exists and nothing differs. 'no_head' never means "no changes". */
  status: DiffAvailability
  head: DiffHead | null
  /** '' when the Project is the repository top level; otherwise its path inside the repository. */
  repoPrefix: ProjectPath
  /** For 'no_head': every non-ignored file as untracked / added. */
  files: DiffFileEntry[]
  truncated: boolean
  /** Sanitized diagnostic, at most 300 characters, no absolute paths. */
  detail: string | null
  gitVersion: string | null
  computedAt: number
}

export interface DiffFileRequest { projectId: string; path: ProjectPath; oldPath: ProjectPath | null }

export type DiffSideOmitted =
  | 'binary' | 'too_large' | 'unsupported_encoding' | 'symlink' | 'submodule' | 'unreadable' | 'changed_while_reading'
export type DiffSide =
  | { status: 'text'; text: string; size: number }
  /** added: no original side; deleted: no modified side. */
  | { status: 'absent' }
  | { status: 'omitted'; reason: DiffSideOmitted; size?: number }

export type DiffFileResult =
  | {
      status: 'ok'; revision: number; settled: boolean; entry: DiffFileEntry
      original: DiffSide; modified: DiffSide; patch: { text: string; truncated: boolean } | null
    }
  | { status: 'unchanged'; revision: number; path: ProjectPath }
  | { status: 'unavailable'; revision: number; path: ProjectPath; availability: Exclude<DiffAvailability, 'ready' | 'clean'> }

export type DiffWatchState = 'live' | 'degraded' | 'stopped'
export interface DiffSubscription { projectId: string; subscriptionId: string; revision: number; watch: DiffWatchState }
/** A hint only: the renderer re-queries. */
export interface DiffInvalidated { projectId: string; revision: number }
export interface DiffWatchChanged { projectId: string; revision: number; watch: DiffWatchState }
