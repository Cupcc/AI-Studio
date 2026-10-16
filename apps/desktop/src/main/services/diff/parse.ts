// Parsers for the machine formats of Git (`-z`, NUL separated). Pure functions over Buffers: path bytes are never
// interpreted by a shell or a regular expression, so spaces, newlines, tabs, a leading '-' and glob characters are
// ordinary data. Anything that does not match the documented shape throws `GitParseError`; callers turn it into a
// `failed` snapshot instead of guessing.
import { parseProjectPath, type ProjectPath } from '@shared/tools/files'

export class GitParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitParseError'
  }
}

export interface RawRecord {
  /** Single status letter: A C D M R T U X B. */
  letter: string
  /** Similarity percentage of a rename or copy. */
  score: number | null
  oldMode: string
  newMode: string
  oldSha: string
  newSha: string
  path: string
  oldPath: string | null
  /** false when a path is not valid UTF-8 (the text is then lossy and the entry cannot be addressed). */
  valid: boolean
}

export interface NumstatRecord {
  /** null = binary. */
  additions: number | null
  deletions: number | null
  path: string
  oldPath: string | null
}

export interface DiffListing {
  raw: RawRecord[]
  numstat: NumstatRecord[]
  /** The stream ended inside a record (output cap): the partial record was dropped. */
  incomplete: boolean
}

export interface StageRecord { mode: string; sha: string; stage: number; path: string; valid: boolean }

const HEADER = /^:(\d{6}) (\d{6}) ([0-9a-f]{40,64}) ([0-9a-f]{40,64}) ([A-Z])(\d*)$/
const COUNT = /^(?:\d+|-)$/
const STAGE = /^(\d{6}) ([0-9a-f]{40,64}) ([0-3])$/
const strictUtf8 = new TextDecoder('utf-8', { fatal: true })
const lossyUtf8 = new TextDecoder('utf-8')

export function splitNul(buffer: Buffer): { tokens: Buffer[]; incomplete: boolean } {
  const tokens: Buffer[] = []
  let start = 0
  for (let index = buffer.indexOf(0); index >= 0; index = buffer.indexOf(0, start)) {
    tokens.push(buffer.subarray(start, index))
    start = index + 1
  }
  return { tokens, incomplete: start < buffer.length }
}

function decodePath(bytes: Buffer): { text: string; valid: boolean } {
  try { return { text: strictUtf8.decode(bytes), valid: true } } catch { return { text: lossyUtf8.decode(bytes), valid: false } }
}

/**
 * `diff --raw --numstat -z` prints every raw record first, then every numstat record (verified on Git 2.39.2):
 *   :omode nmode osha nsha S[score]\0path\0[newpath\0] ...  then  add\tdel\tpath\0   or   add\tdel\t\0old\0new\0
 * Either section may be absent. A path that starts with ':' cannot be mistaken for a header because paths are only
 * read at the position that follows a header.
 */
export function parseDiffListing(buffer: Buffer): DiffListing {
  const { tokens, incomplete: tail } = splitNul(buffer)
  const raw: RawRecord[] = []
  const numstat: NumstatRecord[] = []
  let incomplete = tail
  let index = 0
  while (index < tokens.length) {
    const token = tokens[index]!
    if (token.length === 0 && index === tokens.length - 1) break
    const text = token.toString('latin1')
    if (text.startsWith(':')) {
      const match = HEADER.exec(text)
      if (!match) throw new GitParseError('Unexpected raw record')
      const letter = match[5]!
      const paths = letter === 'R' || letter === 'C' ? 2 : 1
      if (index + paths >= tokens.length) { incomplete = true; break }
      const first = decodePath(tokens[index + 1]!)
      const second = paths === 2 ? decodePath(tokens[index + 2]!) : null
      raw.push({
        letter, score: match[6] ? Number(match[6]) : null,
        oldMode: match[1]!, newMode: match[2]!, oldSha: match[3]!, newSha: match[4]!,
        // For R / C Git prints the source first, then the destination.
        path: second ? second.text : first.text, oldPath: second ? first.text : null,
        valid: first.valid && (second?.valid ?? true)
      })
      index += 1 + paths
      continue
    }
    const counts = splitNumstat(token)
    if (!counts) throw new GitParseError('Unexpected numstat record')
    const count = (value: string) => (value === '-' ? null : Number(value))
    if (counts.rest.length === 0) {
      if (index + 2 >= tokens.length) { incomplete = true; break }
      numstat.push({
        additions: count(counts.added), deletions: count(counts.deleted),
        oldPath: decodePath(tokens[index + 1]!).text, path: decodePath(tokens[index + 2]!).text
      })
      index += 3
    } else {
      numstat.push({ additions: count(counts.added), deletions: count(counts.deleted), path: decodePath(counts.rest).text, oldPath: null })
      index += 1
    }
  }
  return { raw, numstat, incomplete }
}

/** `ls-files -o -z` and friends: plain NUL separated names. A trailing '/' marks a nested repository directory. */
export function parseNameList(buffer: Buffer): { names: { path: string; valid: boolean }[]; incomplete: boolean } {
  const { tokens, incomplete } = splitNul(buffer)
  return { names: tokens.filter((token) => token.length > 0).map((token) => { const { text, valid } = decodePath(token); return { path: text, valid } }), incomplete }
}

/** `ls-files -s -z` / `-u -z`: `mode sha stage\tpath\0`. */
export function parseStageList(buffer: Buffer): { records: StageRecord[]; incomplete: boolean } {
  const { tokens, incomplete } = splitNul(buffer)
  const records: StageRecord[] = []
  for (const token of tokens) {
    if (token.length === 0) continue
    // The header is ASCII; the path may hold arbitrary bytes, so only the part before the first tab is matched.
    const tab = token.indexOf(9)
    const match = tab < 0 ? null : STAGE.exec(token.subarray(0, tab).toString('latin1'))
    if (!match) throw new GitParseError('Unexpected ls-files record')
    const path = decodePath(token.subarray(tab + 1))
    records.push({ mode: match[1]!, sha: match[2]!, stage: Number(match[3]), path: path.text, valid: path.valid })
  }
  return { records, incomplete }
}

function splitNumstat(token: Buffer): { added: string; deleted: string; rest: Buffer } | null {
  const first = token.indexOf(9)
  const second = first < 0 ? -1 : token.indexOf(9, first + 1)
  if (second < 0) return null
  const added = token.subarray(0, first).toString('latin1'), deleted = token.subarray(first + 1, second).toString('latin1')
  return COUNT.test(added) && COUNT.test(deleted) ? { added, deleted, rest: token.subarray(second + 1) } : null
}

/** True when the text satisfies the ProjectPath rules (length, segments, no NUL). */
export function toProjectPath(path: string): ProjectPath | null {
  try { return parseProjectPath(path) } catch { return null }
}
