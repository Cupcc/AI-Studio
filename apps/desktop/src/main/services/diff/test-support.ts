// Test-only helpers: real temporary Git repositories and a service wired to the real Git CLI. Imported by tests only.
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { DiffInvalidated, DiffWatchChanged } from '@shared/tools/diff'
import type { Env } from '../shell-env/login-env'
import { createGitLocator } from './git-locate'
import { createGitRunner, type GitRunner, type GitRunnerOptions, type GitRunRequest, type GitRunResult } from './git-runner'
import { createDiffService, type DiffService, type DiffServiceOptions } from './service'

/** Host Git variables (a commit hook sets GIT_INDEX_FILE, GIT_DIR ...) must never reach fixture commands. */
export function cleanEnv(extra: Record<string, string> = {}): Env {
  const env: Env = {}
  for (const [key, value] of Object.entries(process.env)) if (typeof value === 'string' && !key.startsWith('GIT_')) env[key] = value
  return { ...env, ...extra }
}

// An empty HOME keeps the developer's own Git configuration out of every test.
const home = realpathSync.native(mkdtempSync(join(tmpdir(), 'diff home ')))
process.once('exit', () => rmSync(home, { recursive: true, force: true }))
const fixtureEnv = (): Env => cleanEnv({
  HOME: home, XDG_CONFIG_HOME: home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z', LC_ALL: 'C'
})

/** Environment handed to the service under test: login-like, hermetic home, host GIT_* deliberately kept (the runner must drop them). */
export function serviceEnv(): Env {
  const env: Env = {}
  for (const [key, value] of Object.entries(process.env)) if (typeof value === 'string') env[key] = value
  return { ...env, HOME: home, XDG_CONFIG_HOME: home }
}

export interface Fixture {
  /** Canonical path of the work tree. */
  root: string
  git(...args: string[]): string
  write(path: string, content?: string | Buffer, mode?: number): void
  symlink(target: string, path: string): void
  remove(path: string): void
  commitAll(message?: string): void
  cleanup(): void
}

export function createFixture(options: { commit?: Record<string, string> | false; label?: string } = {}): Fixture {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), `diff ${options.label ?? 'repo'} `)))
  const git = (...args: string[]) => execFileSync('git', ['-c', 'init.defaultBranch=main', '-c', 'core.autocrlf=false', '-c', 'core.quotepath=false', ...args], {
    cwd: root, env: fixtureEnv(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']
  })
  const fixture: Fixture = {
    root, git,
    write(path, content = path, mode) {
      const target = join(root, path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, content)
      if (mode !== undefined) chmodSync(target, mode)
    },
    symlink(target, path) { mkdirSync(dirname(join(root, path)), { recursive: true }); symlinkSync(target, join(root, path)) },
    remove(path) { rmSync(join(root, path), { recursive: true, force: true }) },
    commitAll(message = 'commit') { git('add', '-A'); git('commit', '-q', '-m', message) },
    cleanup() { rmSync(root, { recursive: true, force: true }) }
  }
  git('init', '-q', '.')
  if (options.commit !== false) {
    for (const [path, content] of Object.entries(options.commit ?? { 'README.md': 'readme\n' })) fixture.write(path, content)
    fixture.commitAll('initial')
  }
  return fixture
}

export interface Harness {
  service: DiffService
  runner: GitRunner
  invalidated: DiffInvalidated[]
  watchChanged: DiffWatchChanged[]
}

export function createHarness(roots: Record<string, string>, overrides: {
  service?: Partial<DiffServiceOptions>
  runner?: Partial<GitRunnerOptions>
  wrapRunner?: (runner: GitRunner) => GitRunner
} = {}): Harness {
  const invalidated: DiffInvalidated[] = []
  const watchChanged: DiffWatchChanged[] = []
  const environment = async () => serviceEnv()
  const real = createGitRunner({ locate: createGitLocator({ env: environment }), environment, ...overrides.runner })
  const runner = overrides.wrapRunner ? overrides.wrapRunner(real) : real
  const service = createDiffService({
    projectPath: (id) => roots[id] ?? null,
    runner,
    invalidated: (event) => invalidated.push(event),
    watchChanged: (event) => watchChanged.push(event),
    ...overrides.service
  })
  return { service, runner: real, invalidated, watchChanged }
}

/** Whether a process (or any member of its group, with a negative pid) is alive. */
export function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM' }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('waitFor timed out')
    await sleep(10)
  }
}

export interface RunnerHook {
  /** Return a result to answer the request without running Git. */
  before?(request: GitRunRequest, index: number): Promise<GitRunResult | void>
  after?(request: GitRunRequest, result: GitRunResult, index: number): Promise<GitRunResult | void>
}

/** Wraps a runner so a test can delay, replace or observe individual Git calls while everything else stays real. */
export function hookRunner(real: GitRunner, hook: RunnerHook, calls: GitRunRequest[] = []): GitRunner {
  return {
    ...real,
    async run(request) {
      const index = calls.push(request) - 1
      const early = await hook.before?.(request, index)
      if (early) return early
      const result = await real.run(request)
      return (await hook.after?.(request, result, index)) ?? result
    }
  }
}

/** A promise that resolves when `open()` is called; `wait(signal)` resolves early (false) when the signal aborts. */
export function gate() {
  let open!: () => void
  const opened = new Promise<void>((resolve) => { open = resolve })
  return {
    open,
    wait(signal?: AbortSignal): Promise<boolean> {
      return new Promise((resolve) => {
        if (signal?.aborted) return resolve(false)
        signal?.addEventListener('abort', () => resolve(false), { once: true })
        void opened.then(() => resolve(true))
      })
    }
  }
}

export const subcommand = (request: GitRunRequest) => request.args[0] ?? ''
