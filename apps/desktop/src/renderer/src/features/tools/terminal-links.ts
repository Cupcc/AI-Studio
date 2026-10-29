// Terminal link detection (FR-TOOL-004 2026-10-26), as in VS Code: web addresses and `path:line[:column]` are
// underlined and open with ⌘+click. Local addresses open in the Project's Browser, other sites in the system browser,
// and existing Project files in Files at that line. Only files the main process confirms exist become links.
import type { ProjectPath } from '@shared/tools/files'

export type TerminalLinkTarget =
  | { kind: 'url'; url: string; local: boolean }
  | { kind: 'file'; candidate: string; line?: number; column?: number }
export interface TerminalLinkMatch { start: number; end: number; text: string; target: TerminalLinkTarget }

const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>`]+/g
// path(:line(:col)) or path(line,col); a path needs an extension or a line number.
// Quoted paths preserve spaces. Unquoted absolute paths may contain spaces when a location suffix makes their end
// unambiguous. The final pattern handles ordinary / shell-escaped paths and Unicode names without taking a suffix
// of a non-ASCII filename. All offsets remain UTF-16 indices for xterm's cell mapping.
const PATH_PATTERNS = [
  /"([^"\r\n]+?)"(?::(\d+)(?::(\d+))?|\((\d+)(?:,\s*(\d+))?\))?/gu,
  /'([^'\r\n]+?)'(?::(\d+)(?::(\d+))?|\((\d+)(?:,\s*(\d+))?\))?/gu,
  /(?<![\p{L}\p{N}\p{M}_/.@+-])(\/[\p{L}\p{N}\p{M}_ .@+/-]+)(?::(\d+)(?::(\d+))?|\((\d+)(?:,\s*(\d+))?\))/gu,
  /(?<![\p{L}\p{N}\p{M}_/.@+-])((?:\.{0,2}\/)?[\p{L}\p{N}\p{M}_.@+-]+\/[\p{L}\p{N}\p{M}_ .@+/-]+)(?::(\d+)(?::(\d+))?|\((\d+)(?:,\s*(\d+))?\))/gu,
  /(?<![\p{L}\p{N}\p{M}_/.@+-])((?:\.{0,2}\/)?(?:[\p{L}\p{N}\p{M}_.@+-]|\\ )+(?:\/(?:[\p{L}\p{N}\p{M}_.@+-]|\\ )+)*)(?::(\d+)(?::(\d+))?|\((\d+)(?:,\s*(\d+))?\))?/gu
]
const TRAILING = /[).,;:!?\]}>'"]+$/

function isLocal(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost') || /^127\.|^0\.0\.0\.0$|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === '[::1]'
}

export function findLinks(line: string): TerminalLinkMatch[] {
  const links: TerminalLinkMatch[] = []
  const taken: [number, number][] = []
  for (const match of line.matchAll(URL_PATTERN)) {
    const text = match[0].replace(TRAILING, '')
    try {
      const url = new URL(text)
      links.push({ start: match.index!, end: match.index! + text.length, text, target: { kind: 'url', url: url.href, local: isLocal(url.hostname) } })
      taken.push([match.index!, match.index! + text.length])
    } catch { /* not a URL */ }
  }
  for (const pattern of PATH_PATTERNS) for (const match of line.matchAll(pattern)) {
    const start = match.index!, end = start + match[0].length
    if (taken.some(([from, to]) => start < to && end > from)) continue
    // A compiler can put the location inside the quotes too.
    const inner = /^(.*?):(\d+)(?::(\d+))?$/.exec(match[1]!)
    const path = (inner?.[1] ?? match[1]!).replace(/\\ /g, ' ')
    const line = match[2] ?? match[4] ?? inner?.[2], column = match[3] ?? match[5] ?? inner?.[3]
    if (!line && !/\.[\p{L}\p{N}]{1,12}$/u.test(path)) continue
    if (/^\d+(\.\d+)*$/.test(path) || path.includes('://')) continue
    links.push({ start, end, text: match[0], target: { kind: 'file', candidate: path, ...(line ? { line: Number(line) } : {}), ...(column ? { column: Number(column) } : {}) } })
    taken.push([start, end])
  }
  return links.sort((a, b) => a.start - b.start)
}

/**
 * Turns a path printed by a program into a Project path: relative to the terminal's start directory, or absolute
 * inside the Project. Null when it leaves the Project.
 */
export function toProjectPath(candidate: string, root: string, cwd: string): ProjectPath | null {
  const base = candidate.startsWith('/') ? candidate : `${cwd.replace(/\/+$/, '')}/${candidate}`
  const prefix = root.endsWith('/') ? root : `${root}/`
  if (!base.startsWith(prefix)) return null
  const parts: string[] = []
  for (const part of base.slice(prefix.length).split('/')) {
    if (!part || part === '.') continue
    if (part === '..') { if (!parts.length) return null; parts.pop(); continue }
    parts.push(part)
  }
  return parts.length ? parts.join('/') : null
}

/** POSIX shell quoting for inserting paths into the prompt (drag and drop). */
export function shellQuote(path: string): string {
  return /^[\w@%+=:,./-]+$/.test(path) ? path : `'${path.replace(/'/g, `'\\''`)}'`
}
