// xterm link provider for the Terminal (FR-TOOL-004 2026-10-26). Ranges are computed per cell, so wide (CJK) characters
// before a link do not shift its underline. File links are shown only for files the main process confirms exist.
import type { IBufferLine, ILink, ILinkProvider, Terminal } from '@xterm/xterm'
import { FILES_STAT_LIMIT, type ProjectPath } from '@shared/tools/files'
import { openInBrowserTool } from './browser-requests'
import { filesApi } from './files/api'
import { openProjectFile } from './quick-open/QuickOpen'
import { findLinks, toProjectPath, type TerminalLinkMatch } from './terminal-links'

export interface LinkContext { projectId: string; root: string; cwd: string }

/** The line's text and, for every UTF-16 index, the 1-based cell where that character starts. */
export function lineCells(line: IBufferLine, cols: number): { text: string; cellOf: number[] } {
  let text = ''
  const cellOf: number[] = []
  for (let x = 0; x < cols; x++) {
    const cell = line.getCell(x)
    if (!cell || cell.getWidth() === 0) continue
    const chars = cell.getChars() || ' '
    for (let i = 0; i < chars.length; i++) cellOf.push(x + 1)
    text += chars
  }
  const trimmed = text.replace(/\s+$/, '')
  return { text: trimmed, cellOf: cellOf.slice(0, trimmed.length) }
}

const CACHE_LIMIT = 500

export function createLinkProvider(term: Terminal, context: () => LinkContext | null, setTip: (tip: string) => void): ILinkProvider {
  const known = new Map<ProjectPath, boolean>()
  const remember = (path: ProjectPath, exists: boolean) => {
    if (known.size >= CACHE_LIMIT) known.delete(known.keys().next().value!)
    known.set(path, exists)
  }
  const link = (match: TerminalLinkMatch, cellOf: number[], y: number, open: () => void, tip: string): ILink => ({
    range: { start: { x: cellOf[match.start] ?? 1, y }, end: { x: cellOf[match.end - 1] ?? 1, y } },
    text: match.text,
    decorations: { underline: true, pointerCursor: true },
    // ⌘+click, as in VS Code: a plain click keeps selecting text.
    activate: (event) => { if (event.metaKey || event.ctrlKey) open() },
    hover: () => setTip(tip),
    leave: () => setTip('')
  })
  return {
    provideLinks(y, callback) {
      const ctx = context()
      const line = term.buffer.active.getLine(y - 1)
      if (!ctx || !line) { callback(undefined); return }
      const { text, cellOf } = lineCells(line, term.cols)
      const matches = findLinks(text)
      if (!matches.length) { callback(undefined); return }
      const files = matches.flatMap(match => {
        if (match.target.kind !== 'file') return []
        const path = toProjectPath(match.target.candidate, ctx.root, ctx.cwd)
        return path ? [{ match, path }] : []
      })
      const unknown = [...new Set(files.map(file => file.path).filter(path => !known.has(path)))].slice(0, FILES_STAT_LIMIT)
      const build = () => {
        const links: ILink[] = []
        for (const match of matches) {
          const target = match.target
          if (target.kind === 'url') {
            links.push(link(match, cellOf, y, () => {
              // Local servers open in the Project's Browser; other sites in the system browser (VS Code's default).
              if (target.local) openInBrowserTool(ctx.projectId, target.url)
              else window.open(target.url, '_blank', 'noopener')
            }, target.local ? '⌘ + 点击在 Browser 中打开' : '⌘ + 点击在系统浏览器中打开'))
            continue
          }
          const file = files.find(item => item.match === match)
          if (file && known.get(file.path)) {
            links.push(link(match, cellOf, y, () => openProjectFile(ctx.projectId, file.path, target.line), '⌘ + 点击在 Files 中打开'))
          }
        }
        callback(links.length ? links : undefined)
      }
      if (!unknown.length) { build(); return }
      void filesApi().stat({ projectId: ctx.projectId, paths: unknown })
        .then(kinds => unknown.forEach((path, index) => remember(path, kinds[index] === 'file')))
        .catch(() => unknown.forEach(path => remember(path, false)))
        .finally(build)
    }
  }
}
