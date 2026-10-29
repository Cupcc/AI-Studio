// Full-text search with ripgrep's JSON output (FR-TOOL-005). Bounded in matches, files, line preview and time; the
// child is killed when a limit is hit, the search is cancelled or the Project closes.
import { spawn } from 'node:child_process'
import { parseProjectPath } from '@shared/tools/files'
import { SEARCH_LIMITS, searchGlobs, type SearchFileResult, type SearchLine, type SearchOptions, type SearchRange, type SearchResult } from '@shared/tools/search'
import { projectRipgrep, RIPGREP_COMMON_ARGS, ripgrepEnv } from '../files/file-index'

export interface SearchLimits { matches: number; files: number; previewChars: number; timeoutMs: number; maxFileSize: string }

export function searchArgs(options: SearchOptions, limits: Pick<SearchLimits, 'maxFileSize'> = SEARCH_LIMITS): string[] {
  const args = [...RIPGREP_COMMON_ARGS, '--json', '--max-filesize', limits.maxFileSize, '--max-columns', '4000', '--max-columns-preview']
  if (!options.isRegex) args.push('--fixed-strings')
  args.push(options.caseSensitive ? '--case-sensitive' : '--ignore-case')
  if (options.wholeWord) args.push('--word-regexp')
  for (const glob of searchGlobs(options.include)) args.push('--glob', glob)
  for (const glob of searchGlobs(options.exclude)) args.push('--glob', `!${glob}`)
  // --regexp keeps a query that starts with "-" from being read as an option.
  args.push('--regexp', options.query)
  return args
}

interface RgText { text?: string; bytes?: string }
interface RgMatch {
  type: 'match'
  data: { path: RgText; lines: RgText; line_number: number; submatches: { start: number; end: number }[] }
}

/** Byte offsets of ripgrep → UTF-16 offsets of the JavaScript string. */
function utf16Offsets(text: string, byteRanges: { start: number; end: number }[]): SearchRange[] {
  // ripgrep submatches are ordered and non-overlapping: scan once instead of decoding every growing prefix.
  let bytes = 0, units = 0
  const at = (target: number) => {
    while (bytes < target && units < text.length) {
      const point = text.codePointAt(units)!
      bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4
      units += point > 0xffff ? 2 : 1
    }
    return units
  }
  return byteRanges.map(range => ({ start: at(range.start), end: at(range.end) }))
}

/** A preview window around the first match, so long minified lines stay readable. Ranges are clipped to the window. */
export function previewLine(text: string, ranges: SearchRange[], max: number): { preview: string; ranges: SearchRange[] } {
  const line = text.replace(/\r?\n$/, '')
  const first = ranges[0]?.start ?? 0
  if (line.length <= max) return { preview: line, ranges: ranges.filter(range => range.start < line.length).map(range => ({ start: range.start, end: Math.min(range.end, line.length) })) }
  const from = Math.max(0, Math.min(first - 40, line.length - max))
  const prefix = from > 0 ? '…' : ''
  const body = line.slice(from, from + max)
  const shift = prefix.length - from
  return {
    preview: prefix + body + (from + max < line.length ? '…' : ''),
    ranges: ranges.filter(range => range.end > from && range.start < from + max)
      .map(range => ({ start: Math.max(range.start, from) + shift, end: Math.min(range.end, from + max) + shift }))
  }
}

/** Keeps ripgrep's diagnostics short and free of absolute paths. */
function cleanMessage(stderr: string, root: string): string {
  return stderr.split(root).join('').split('\n').map(line => line.trim()).filter(Boolean).slice(0, 6).join('\n').slice(0, 600)
}

export async function runSearch(root: string, rg: string, searchId: string, options: SearchOptions, signal: AbortSignal, limits: SearchLimits = SEARCH_LIMITS): Promise<SearchResult> {
  const started = Date.now()
  if (signal.aborted) return { status: 'cancelled', searchId }
  const launch = await projectRipgrep(root, rg, searchArgs(options, limits))
  if (signal.aborted) return { status: 'cancelled', searchId }
  if (!launch) return { status: 'unavailable', searchId, reason: 'project_unavailable' }
  const result = await new Promise<SearchResult>((resolve) => {
    const child = spawn(launch.command, launch.args, { env: ripgrepEnv(), stdio: ['ignore', 'pipe', 'pipe'] })
    const files = new Map<string, SearchFileResult>()
    let matches = 0, limitHit = false, settled = false, pending = '', pendingBytes = 0, outputBytes = 0, stderr = ''
    const finish = (result: SearchResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer); signal.removeEventListener('abort', abort)
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      resolve(result)
    }
    const ok = (): SearchResult => ({ status: 'ok', searchId, files: [...files.values()], matches, limitHit, durationMs: Date.now() - started })
    const abort = () => finish({ status: 'cancelled', searchId })
    const timer = setTimeout(() => finish(matches ? { ...ok(), limitHit: true } as SearchResult : { status: 'unavailable', searchId, reason: 'timeout' }), limits.timeoutMs)
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    const take = (line: string) => {
      if (settled) return
      if (Buffer.byteLength(line) > SEARCH_LIMITS.recordBytes) { limitHit = true; finish(ok()); return }
      if (!line.startsWith('{"type":"match"')) return
      let event: RgMatch
      try { event = JSON.parse(line) as RgMatch } catch { return }
      const pathText = event.data.path.text, lineText = event.data.lines.text
      if (pathText === undefined || lineText === undefined) return
      let path: string
      try { path = parseProjectPath(pathText.replace(/^\.\//, '')) } catch { return }
      let file = files.get(path)
      if (!file) {
        if (files.size >= limits.files) { limitHit = true; finish(ok()); return }
        file = { path, lines: [], matches: 0 }
        files.set(path, file)
      }
      const count = Math.min(Math.max(1, event.data.submatches.length), limits.matches - matches)
      const offsets = utf16Offsets(lineText, event.data.submatches.slice(0, count))
      const { preview, ranges } = previewLine(lineText, offsets, limits.previewChars)
      const entry: SearchLine = { line: event.data.line_number, column: (offsets[0]?.start ?? 0) + 1, preview, ranges }
      file.lines.push(entry)
      file.matches += count
      matches += count
      if (matches >= limits.matches) { limitHit = true; finish(ok()) }
    }
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      if (settled) return
      const bytes = Buffer.byteLength(chunk)
      outputBytes += bytes
      if (outputBytes > SEARCH_LIMITS.outputBytes) { limitHit = true; finish(ok()); return }
      pending += chunk
      pendingBytes += bytes
      let newline = pending.indexOf('\n')
      while (newline >= 0 && !settled) {
        take(pending.slice(0, newline))
        pendingBytes -= Buffer.byteLength(pending.slice(0, newline)) + 1
        pending = pending.slice(newline + 1)
        newline = pending.indexOf('\n')
      }
      if (!settled && pendingBytes > SEARCH_LIMITS.recordBytes) { limitHit = true; finish(ok()) }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => { if (stderr.length < 8192) stderr += chunk })
    child.on('error', (error) => finish({ status: 'unavailable', searchId, reason: 'failed', message: error.message }))
    child.on('close', (code) => {
      if (settled) return
      if (pending) take(pending)
      // 0: matches; 1: none; 2: an error. A regex error produces no results and explains itself on stderr.
      if (code === 2 && !matches && /regex|parse|syntax/i.test(stderr)) finish({ status: 'invalid', searchId, message: cleanMessage(stderr, root) })
      else if (code === 0 || code === 1 || code === 2) finish(ok())
      else finish({ status: 'unavailable', searchId, reason: 'failed', message: cleanMessage(stderr, root) })
    })
  })
  if (signal.aborted) return { status: 'cancelled', searchId }
  return await launch.current() ? result : { status: 'unavailable', searchId, reason: 'project_unavailable' }
}
