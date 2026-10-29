// Quick Open matching, modelled on VS Code's fuzzy scorer: the query characters must appear in order; matches in the
// file name, at word starts and in runs score higher; shorter paths win ties. Spaces split the query into pieces that
// must all match. A trailing `:line` (or `:line:column`) opens the file at that line.

export interface QuickOpenQuery { pieces: string[]; line?: number }
export interface Scored { path: string; score: number; /** Matched character indexes in `path`. */ positions: number[] }

export function parseQuickOpenQuery(raw: string): QuickOpenQuery {
  let text = raw.trim()
  let line: number | undefined
  const suffix = /:(\d+)(?::\d+)?$/.exec(text)
  if (suffix) { line = Number(suffix[1]); text = text.slice(0, suffix.index) }
  // A leading `./` or `/` names the Project root in VS Code.
  text = text.replace(/^\.?\//, '')
  return { pieces: text.split(/\s+/).filter(Boolean), ...(line && line > 0 ? { line } : {}) }
}

const SEPARATORS = new Set(['/', '\\', '_', '-', '.', ' '])

function isWordStart(path: string, index: number): boolean {
  if (index === 0) return true
  const previous = path[index - 1]!, current = path[index]!
  return SEPARATORS.has(previous) || (previous.toLowerCase() === previous && current.toUpperCase() === current && current.toLowerCase() !== current)
}

/** Scores one piece against `path` from `from`; greedy with a preference for the file name. Null when it does not match. */
function scorePiece(path: string, lower: string, piece: string, nameStart: number): { score: number; positions: number[] } | null {
  const query = piece.toLowerCase()
  // Prefer a match fully inside the file name, then anywhere in the path.
  for (const start of nameStart > 0 ? [nameStart, 0] : [0]) {
    const positions: number[] = []
    let at = start, score = 0, run = 0
    for (let q = 0; q < query.length; q++) {
      const index = lower.indexOf(query[q]!, at)
      if (index < 0) { positions.length = 0; break }
      positions.push(index)
      run = index === at && q > 0 ? run + 1 : 0
      score += 1 + run * 3 + (isWordStart(path, index) ? 4 : 0) + (path[index] === piece[q] ? 1 : 0) + (index >= nameStart ? 2 : 0)
      at = index + 1
    }
    if (positions.length === query.length) {
      // Exact or prefix file-name matches are what people mean most of the time.
      const name = lower.slice(nameStart)
      if (name === query) score += 40
      else if (name.startsWith(query)) score += 20
      return { score, positions }
    }
  }
  return null
}

export function scorePath(path: string, pieces: readonly string[]): Scored | null {
  if (!pieces.length) return { path, score: 0, positions: [] }
  const lower = path.toLowerCase()
  const nameStart = path.lastIndexOf('/') + 1
  let score = 0
  const positions: number[] = []
  for (const piece of pieces) {
    const result = scorePiece(path, lower, piece, nameStart)
    if (!result) return null
    score += result.score
    positions.push(...result.positions)
  }
  // Shorter (less nested) paths first among equal matches.
  return { path, score: score - path.length / 100, positions: [...new Set(positions)].sort((a, b) => a - b) }
}

export function rankPaths(paths: readonly string[], query: QuickOpenQuery, limit: number, recent: readonly string[] = []): Scored[] {
  if (!query.pieces.length) {
    const seen = new Set<string>()
    return [...recent, ...paths].filter(path => !seen.has(path) && seen.add(path)).slice(0, limit).map(path => ({ path, score: 0, positions: [] }))
  }
  const recentRank = new Map(recent.map((path, index) => [path, recent.length - index]))
  const scored: Scored[] = []
  for (const path of paths) {
    const result = scorePath(path, query.pieces)
    if (result) scored.push(recentRank.has(path) ? { ...result, score: result.score + 5 + recentRank.get(path)! } : result)
  }
  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
  return scored.slice(0, limit)
}
