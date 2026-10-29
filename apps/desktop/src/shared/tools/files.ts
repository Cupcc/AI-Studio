// Contracts of the Files tool (FR-TOOL-001; specs/tools/spec.md §3, §4, §4.1).
// Types and pure path helpers only: this module is shared by main, preload-facing IPC and the renderer, so it
// must not touch Node APIs. Strings shown to the user live in renderer string tables; contracts carry reason codes.

/**
 * Project-relative POSIX path. '' is the Project root. No leading or trailing '/', no '.', '..' or empty segment,
 * no NUL, no lone surrogate; at most 1024 UTF-8 bytes and 1020 bytes per segment. Backslashes and control characters
 * are legal file names (see `isReferenceablePath` for what may be referenced in a message).
 */
export type ProjectPath = string

export const FILES_LIMITS = {
  pathBytes: 1024,
  /** APFS allows 255 characters per name, up to four UTF-8 bytes each. */
  nameBytes: 1020,
  /** One directory listing; the tree is not virtualized. A node_modules root can exceed this. */
  listEntries: 2000,
  /** Largest text file read into the viewer (bounded IPC clone, main-thread Monaco). */
  readBytes: 1_048_576,
  /** Same NUL-byte window as Git's binary heuristic. */
  binarySniffBytes: 8000,
  referencesPerMessage: 20,
  /** Above this many directories a change event degrades to `overflow: true`. */
  eventDirectories: 256,
  watcherDebounceMs: 150,
  watcherMaxWaitMs: 1000,
  unsubscribeGraceMs: 30_000
} as const

const encoder = new TextEncoder()
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
// C0 controls, DEL, NEL and the Unicode line / paragraph separators: any of them can end a line in a text block, so a
// name containing one could forge an extra entry in the reference list handed to the CLI.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F\u0085\u2028\u2029]/

/** Throws `Error('invalid path: <why>')`; returns the value unchanged when it is a valid ProjectPath. */
export function parseProjectPath(value: unknown): ProjectPath {
  if (typeof value !== 'string') throw new Error('invalid path: not a string')
  if (value === '') return ''
  if (value.includes('\0')) throw new Error('invalid path: NUL')
  if (LONE_SURROGATE.test(value)) throw new Error('invalid path: not well-formed text')
  if (encoder.encode(value).length > FILES_LIMITS.pathBytes) throw new Error('invalid path: too long')
  if (value.startsWith('/')) throw new Error('invalid path: absolute')
  if (value.endsWith('/')) throw new Error('invalid path: trailing slash')
  for (const segment of value.split('/')) {
    if (segment === '') throw new Error('invalid path: empty segment')
    if (segment === '.' || segment === '..') throw new Error('invalid path: relative segment')
    if (encoder.encode(segment).length > FILES_LIMITS.nameBytes) throw new Error('invalid path: name too long')
  }
  return value
}

export function joinProjectPath(parent: ProjectPath, name: string): ProjectPath {
  if (name === '' || name.includes('/')) throw new Error('invalid path: name')
  return parseProjectPath(parent === '' ? name : `${parent}/${name}`)
}

export function projectPathParent(path: ProjectPath): ProjectPath {
  const index = path.lastIndexOf('/')
  return index < 0 ? '' : path.slice(0, index)
}

export function projectPathName(path: ProjectPath): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/**
 * Referenceable = valid, non-empty and free of line-ending / control characters (C0, U+007F, U+0085, U+2028, U+2029):
 * such a character in a name would break the textual reference handed to the CLI. Such files can still be viewed.
 */
export function isReferenceablePath(path: ProjectPath): boolean {
  try { parseProjectPath(path) } catch { return false }
  return path !== '' && !CONTROL.test(path)
}

export interface FilesProjectRef { projectId: string }
export interface FilesPathRef extends FilesProjectRef { path: ProjectPath }

export type FileEntryKind = 'file' | 'directory' | 'symlink' | 'other'
/** A listing carries no stat: names and kinds only. A symlink is never followed. */
export interface FileEntry {
  name: string
  kind: FileEntryKind
  /** Raw readlink text for a symlink, at most 256 characters. */
  linkTarget?: string
}

export type FileUnavailableReason =
  | 'invalid_path' | 'project_unavailable' | 'project_closing'
  | 'missing' | 'not_directory' | 'not_file' | 'symlink_refused' | 'excluded'
  | 'permission_denied' | 'unreadable' | 'timeout'
  | 'binary' | 'too_large' | 'unsupported_encoding' | 'changed_while_reading'

/**
 * `revision` is a service-wide monotonic number issued when the read STARTS. The renderer drops any result older
 * than what it already applied for the same key, so a slow earlier request cannot overwrite a newer one.
 */
export type FilesListResult =
  | { status: 'ok'; revision: number; path: ProjectPath; entries: FileEntry[]; truncated: boolean; omittedPaths?: boolean }
  | { status: 'unavailable'; revision: number; path: ProjectPath; reason: FileUnavailableReason }

export interface FileReadRequest extends FilesPathRef {
  /** The `version` of the copy the renderer already shows; a match answers `unchanged` without text. */
  ifVersion?: string
}
export type FileEncoding = 'utf-8' | 'utf-16le' | 'utf-16be'
export type FileReadResult =
  | {
      status: 'ok'; revision: number; path: ProjectPath; version: string; size: number
      encoding: FileEncoding; bom: boolean; lineEnding: 'lf' | 'crlf' | 'mixed' | 'none'; text: string
    }
  | { status: 'unchanged'; revision: number; path: ProjectPath; version: string }
  | { status: 'unavailable'; revision: number; path: ProjectPath; reason: FileUnavailableReason; size?: number }

export interface FileReferenceRequest extends FilesProjectRef { paths: ProjectPath[] }
export interface FileReferenceSummary { path: ProjectPath; name: string; size: number; version: string }
export type FileReferenceFailureReason =
  | 'invalid_path' | 'project_unavailable' | 'project_closing' | 'missing' | 'not_file' | 'symlink_refused'
  | 'excluded' | 'permission_denied' | 'unreadable' | 'timeout' | 'name_unsupported' | 'too_many'
export type FileReferenceRejection = { status: 'rejected'; failures: { path: ProjectPath; reason: FileReferenceFailureReason }[] }
export type FileReferenceResult = { status: 'ok'; files: FileReferenceSummary[] } | FileReferenceRejection

/** MAIN-ONLY, never crosses IPC. `absolutePath` is the realpath inside the Project. */
export interface ResolvedFileReference extends FileReferenceSummary {
  absolutePath: string
  /** Other requested spellings inspected and resolved to this same real path. MAIN-ONLY; never crosses IPC. */
  aliases?: ProjectPath[]
}
export interface FileReferenceResolver {
  /** Re-validates every path at send time (Project, relative path, real target, accessibility). */
  resolve(projectId: string, paths: readonly ProjectPath[]): Promise<{ status: 'ok'; files: ResolvedFileReference[] } | FileReferenceRejection>
}

export type FilesWatchState = 'live' | 'degraded' | 'stopped'
export interface FilesSubscription { projectId: string; subscriptionId: string; revision: number; watch: FilesWatchState }
export interface FilesSubscriptionRef extends FilesProjectRef { subscriptionId: string }
/** `dirs`: parent directories whose entries may have changed, already filtered by the ignore rules. */
export interface FilesChanged { projectId: string; revision: number; dirs: ProjectPath[]; overflow: boolean }
export interface FilesWatchChanged { projectId: string; revision: number; watch: FilesWatchState }

/** Shared by the Files and the Diff watcher so both ignore the same trees. */
export const FILES_WATCH_IGNORED = { anywhere: ['.git'], belowFirstLevel: ['node_modules'] } as const

// ---- File management, quick open and external opening (FR-TOOL-001 2026-10-26, DEC-25, TOOLS-Q11) ----------------

export const FILES_OPERATION_LIMITS = {
  /** Paths in one move / copy / trash request (a multi-selection). */
  pathsPerOperation: 500,
  /** Quick Open index: files listed by ripgrep (respects .gitignore). */
  indexEntries: 200_000,
  indexOutputBytes: 64 * 1024 * 1024,
  indexTimeoutMs: 15_000,
  /** Largest image shown in the viewer. */
  imageBytes: 10 * 1024 * 1024
} as const

export type FileOperationFailure =
  | 'invalid_path' | 'invalid_name' | 'project_unavailable' | 'project_closing' | 'root'
  | 'missing' | 'not_directory' | 'exists' | 'excluded' | 'symlink_refused' | 'permission_denied' | 'into_itself' | 'failed'
/** `paths`: the resulting Project paths. A failure names the path it stopped at; `done` lists what already happened. */
export type FileOperationResult =
  | { status: 'ok'; paths: ProjectPath[] }
  | { status: 'failed'; reason: FileOperationFailure; path: ProjectPath; done: ProjectPath[] }

export interface FileCreateRequest extends FilesProjectRef {
  /** Directory to create in ('' = Project root). */
  parent: ProjectPath
  /** One name, or `a/b/c.ts` to create the missing folders on the way (as VS Code does). */
  name: string
  kind: 'file' | 'directory'
}
export interface FileRenameRequest extends FilesPathRef { name: string }
/** Move or copy `paths` into the directory `target`. */
export interface FileTransferRequest extends FilesProjectRef { paths: ProjectPath[]; target: ProjectPath }
export interface FilePathsRequest extends FilesProjectRef { paths: ProjectPath[] }

export type ExternalEditor = 'vscode' | 'cursor'
export type FileOpenTarget = 'default' | 'finder' | ExternalEditor
export interface FileOpenRequest extends FilesPathRef { target: FileOpenTarget; line?: number }
export type FileOpenResult = { status: 'ok' } | { status: 'failed'; reason: FileOperationFailure | 'app_missing'; detail?: string }
/** Editors registered on this Mac (by their URL scheme); only these are offered. */
export interface ExternalEditors { vscode: boolean; cursor: boolean }

/** Terminal link detection: which of these paths are existing regular files / folders (null: neither, or refused). */
export type FileKindResult = ('file' | 'directory' | null)[]
export const FILES_STAT_LIMIT = 64

export type FileIndexResult =
  | { status: 'ok'; paths: ProjectPath[]; truncated: boolean }
  | { status: 'unavailable'; reason: 'project_unavailable' | 'project_closing' | 'timeout' | 'failed' }

export type FileImageResult =
  | { status: 'ok'; path: ProjectPath; mime: string; size: number; base64: string }
  | { status: 'unavailable'; path: ProjectPath; reason: FileUnavailableReason | 'not_image'; size?: number }

/** Image types the viewer previews, by extension (lower case). SVG is shown as an image, so its scripts never run. */
export const IMAGE_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  ico: 'image/x-icon', svg: 'image/svg+xml', avif: 'image/avif'
}
export function imageTypeOf(path: ProjectPath): string | null {
  const name = projectPathName(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? IMAGE_TYPES[name.slice(dot + 1).toLowerCase()] ?? null : null
}
