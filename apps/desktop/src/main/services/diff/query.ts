// Shared plumbing of the snapshot and file queries: one Git step with its failure mapping, the repository probe, and
// the sanitizer that keeps absolute paths and long Git messages out of what the renderer receives.
import { homedir } from 'node:os'
import type { DiffAvailability, DiffHead } from '@shared/tools/diff'
import { DIFF_LIMITS } from '@shared/tools/diff'
import { toProjectPath } from './parse'
import type { GitRunResult, GitRunner } from './git-runner'
import type { ProjectPath } from '@shared/tools/files'

export type FailureAvailability = Exclude<DiffAvailability, 'ready' | 'clean' | 'no_head'>

/** A query that cannot produce data; carries the availability the renderer shows. */
export class QueryFailure extends Error {
  constructor(readonly availability: FailureAvailability, readonly detail: string | null = null) {
    super(`${availability}${detail ? `: ${detail}` : ''}`)
    this.name = 'QueryFailure'
  }
}

/** The query was cancelled (superseded, or the Project is closing). Never reaches the renderer as an error. */
export class QueryAborted extends Error {
  constructor() {
    super('aborted')
    this.name = 'QueryAborted'
  }
}

export interface QueryContext {
  projectId: string
  root: string
  signal: AbortSignal
  runner: GitRunner
  timeoutMs: number
}

export interface GitStepOptions { maxBytes?: number; timeoutMs?: number }

const SMALL = 64 * 1024

/** Runs one git command. Returns the finished result (any exit code); throws for abort, timeout and spawn problems. */
export async function gitStep(context: QueryContext, args: readonly string[], options: GitStepOptions = {}): Promise<Extract<GitRunResult, { kind: 'done' }>> {
  const result = await context.runner.run({
    projectId: context.projectId, cwd: context.root, args, signal: context.signal,
    maxBytes: options.maxBytes ?? SMALL, timeoutMs: options.timeoutMs ?? context.timeoutMs
  })
  switch (result.kind) {
    case 'done': return result
    case 'aborted': throw new QueryAborted()
    case 'timeout': throw new QueryFailure('timeout')
    case 'missing': throw new QueryFailure('git_missing')
    case 'cwd_missing': throw new QueryFailure('project_unavailable')
    case 'spawn_failed': throw new QueryFailure('failed', sanitizeDetail(result.message, context.root))
  }
}

const DUBIOUS = /detected dubious ownership/i
const NOT_A_REPOSITORY = /not a git repository/i

/** Maps a non-zero exit to the availability that explains it. Never suggests or performs `safe.directory`. */
export function failureOfExit(result: { code: number; stderr: string }, root: string): QueryFailure {
  if (DUBIOUS.test(result.stderr)) return new QueryFailure('git_unsafe_directory', 'Git does not trust this directory because its owner differs from the current user')
  if (NOT_A_REPOSITORY.test(result.stderr)) return new QueryFailure('not_git')
  const message = sanitizeDetail(result.stderr, root)
  return new QueryFailure('failed', message || `git exited with code ${result.code}`)
}

/** Detail goes to the renderer: no absolute paths (project root, home or anything path-like), one line, 300 characters. */
export function sanitizeDetail(text: string, root: string): string {
  let clean = text
  for (const secret of [root, homedir()].filter((value) => value.length > 1)) clean = clean.split(secret).join('<path>')
  // Git quotes many filenames and config paths. Replace the whole quoted absolute path before collapsing
  // whitespace, otherwise a path such as `/Volumes/My Disk/alice smith/config` leaves its later components behind.
  clean = clean.replace(/(['"])(\/(?:[^'"\r\n]*))\1/g, '<path>')
  // Also cover diagnostics that print an absolute path without quotes. Spaces are valid filename characters, so the
  // match deliberately consumes path-like words separated by spaces until normal punctuation ends the detail.
  clean = clean.replace(/\/(?:[A-Za-z0-9._~+@%=-]+(?:[ \t]+[A-Za-z0-9._~+@%=-]+)*(?:\/[A-Za-z0-9._~+@%=-]+(?:[ \t]+[A-Za-z0-9._~+@%=-]+)*)*)/g, '<path>')
  clean = clean
    .replace(/(?:<path>){2,}/g, '<path>')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/(?:\/[^\s'"`:]+){2,}/g, '<path>')
    .replace(/\s+/g, ' ')
    .trim()
  return clean.length > 300 ? `${clean.slice(0, 299)}…` : clean
}

export interface RepoProbe {
  /** '' at the repository top level. */
  repoPrefix: ProjectPath
  head: DiffHead | null
  /** false = unborn HEAD (no commit yet). */
  hasHead: boolean
}

/** Is this a work tree, where inside the repository is it, and what does HEAD point at. */
export async function probeRepository(context: QueryContext): Promise<RepoProbe> {
  const inside = await gitStep(context, ['rev-parse', '--is-inside-work-tree', '--show-prefix'])
  if (inside.code !== 0) throw failureOfExit(inside, context.root)
  const output = inside.stdout.toString('utf8')
  // Inside `.git` or a bare repository Git prints "false" and succeeds: that is not a Project work tree.
  if (!output.startsWith('true\n')) throw new QueryFailure('not_git')
  const prefix = toProjectPath(output.slice(5).replace(/\n$/, '').replace(/\/$/, ''))
  if (prefix === null) throw new QueryFailure('failed', 'The Project path inside the repository cannot be represented')
  const [commit, branch] = await Promise.all([
    gitStep(context, ['rev-parse', '--verify', '-q', '--short=9', 'HEAD^{commit}']),
    gitStep(context, ['symbolic-ref', '-q', '--short', 'HEAD'])
  ])
  // Exit 1 with no message is Git's "does not exist" answer for both; anything else is a real failure.
  if (commit.code > 1) throw failureOfExit(commit, context.root)
  if (branch.code > 1) throw failureOfExit(branch, context.root)
  const branchName = branch.code === 0 ? branch.stdout.toString('utf8').trim() || null : null
  if (commit.code === 0) {
    return { repoPrefix: prefix, hasHead: true, head: { branch: branchName, commit: commit.stdout.toString('utf8').trim() || null, detached: branchName === null } }
  }
  // HEAD names a branch that has no commit yet: an unborn repository, not a repository without changes.
  if (branchName !== null) return { repoPrefix: prefix, hasHead: false, head: { branch: branchName, commit: null, detached: false } }
  throw new QueryFailure('failed', 'HEAD cannot be resolved')
}

export const LIST_OPTIONS = { maxBytes: DIFF_LIMITS.rawOutputBytes } as const
