// Full-text search of a Project (FR-TOOL-005, DEC-25), run by ripgrep like VS Code's Search view. Read-only: no replace.
import type { ProjectPath } from './files'

export const SEARCH_LIMITS = {
  queryLength: 1000,
  globsLength: 2000,
  /** Matches returned in one search; beyond it the result says `limitHit`. */
  matches: 10_000,
  files: 2_000,
  /** Characters of a line shown around a match. */
  previewChars: 240,
  timeoutMs: 20_000,
  /** Files larger than this are skipped, as generated or binary blobs. */
  maxFileSize: '5M',
  /** Raw ripgrep JSON caps apply before parsing (a minified line can contain millions of submatches). */
  recordBytes: 2 * 1024 * 1024,
  outputBytes: 16 * 1024 * 1024
} as const

export interface SearchOptions {
  query: string
  isRegex: boolean
  caseSensitive: boolean
  wholeWord: boolean
  /** Comma-separated globs or folder paths ("src, docs/**\/*.md"); empty = everything not ignored. */
  include: string
  exclude: string
}
export interface SearchRequest extends SearchOptions { projectId: string; searchId: string }

/** One match in a line preview; offsets are UTF-16 code units into `preview`. */
export interface SearchRange { start: number; end: number }
export interface SearchLine { line: number; column: number; preview: string; ranges: SearchRange[] }
export interface SearchFileResult { path: ProjectPath; lines: SearchLine[]; matches: number }

export type SearchResult =
  | { status: 'ok'; searchId: string; files: SearchFileResult[]; matches: number; limitHit: boolean; durationMs: number }
  | { status: 'invalid'; searchId: string; message: string }
  | { status: 'cancelled'; searchId: string }
  | { status: 'unavailable'; searchId: string; reason: 'project_unavailable' | 'project_closing' | 'timeout' | 'failed'; message?: string }

/** VS Code's include/exclude syntax: a plain path also matches everything below it. */
export function searchGlobs(text: string): string[] {
  return text.split(',').map(part => part.trim()).filter(Boolean).flatMap(part => {
    const clean = part.replace(/^\.\//, '').replace(/\/+$/, '')
    if (!clean) return []
    if (/[*?[\]{}]/.test(clean)) return [clean]
    return [clean, `${clean}/**`]
  })
}
