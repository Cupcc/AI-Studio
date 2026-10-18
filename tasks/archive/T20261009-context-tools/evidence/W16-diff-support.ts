// W16 Diff 用例的辅助：临时 Git 仓库、标记脚本（运行即写一行到 markers 文件）、与真实服务的接线。
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll } from 'vitest'
import { createDiffService, type DiffService } from '../../../../apps/desktop/src/main/services/diff/service'
import { createGitLocator } from '../../../../apps/desktop/src/main/services/diff/git-locate'
import { createGitRunner, type GitRunner, type GitRunnerOptions } from '../../../../apps/desktop/src/main/services/diff/git-runner'

export const hermeticHome = realpathSync.native(mkdtempSync(join(tmpdir(), 'w16-diff-home-')))
// vitest 的 worker 不保证触发 process 'exit'，所以在文件级 afterAll 里清理
afterAll(() => { rmSync(hermeticHome, { recursive: true, force: true }) })

const FIXTURE_ENV = {
  HOME: hermeticHome, XDG_CONFIG_HOME: hermeticHome, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', LC_ALL: 'C',
  GIT_AUTHOR_NAME: 'W16', GIT_AUTHOR_EMAIL: 'w16@example.invalid', GIT_COMMITTER_NAME: 'W16', GIT_COMMITTER_EMAIL: 'w16@example.invalid',
  GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z'
}

/** 只含 PATH 的最小环境 + 夹具变量；绝不继承宿主的 GIT_*。 */
export function fixtureEnv(extra: Record<string, string> = {}): Record<string, string> {
  return { PATH: process.env.PATH ?? '/usr/bin:/bin', ...FIXTURE_ENV, ...extra }
}

export interface Repo {
  /** 容器目录（含 repo、bin、markers 等），清理时整体删除。 */
  base: string
  root: string
  markers: string
  git(...args: string[]): string
  write(path: string, content?: string | Buffer): string
  /** 在 base/bin 下创建一个会向 markers 写一行（名字 + 参数）并 `exec cat` 的脚本，返回绝对路径。 */
  script(name: string, body?: string): string
  markerLines(): string[]
  commitAll(message?: string): void
  cleanup(): void
}

export function createRepo(options: { label?: string; commit?: Record<string, string> | false; init?: boolean } = {}): Repo {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), `w16-${options.label ?? 'repo'}-`)))
  const root = join(base, 'repo')
  mkdirSync(root)
  mkdirSync(join(base, 'bin'))
  const markers = join(base, 'markers')
  writeFileSync(markers, '')
  const git = (...args: string[]) => execFileSync('git', ['-c', 'init.defaultBranch=main', '-c', 'core.autocrlf=false', ...args], {
    cwd: root, env: fixtureEnv(), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']
  })
  const repo: Repo = {
    base, root, markers, git,
    write(path, content = path) {
      const target = join(root, path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, content)
      return target
    },
    script(name, body = '') {
      const path = join(base, 'bin', name)
      writeFileSync(path, `#!/bin/sh\necho "${name} $*" >> "${markers}"\n${body}\nexec cat\n`)
      chmodSync(path, 0o755)
      return path
    },
    markerLines: () => readFileSync(markers, 'utf8').split('\n').filter(Boolean),
    commitAll(message = 'commit') { git('add', '-A'); git('commit', '-q', '-m', message) },
    cleanup: () => rmSync(base, { recursive: true, force: true })
  }
  if (options.init !== false) {
    git('init', '-q', '.')
    if (options.commit !== false) {
      for (const [path, content] of Object.entries(options.commit ?? { 'README.md': 'readme\n' })) repo.write(path, content)
      repo.commitAll('initial')
    }
  }
  return repo
}

/** 把所有文件的 mtime 往后推（内容不变）：让索引里的 stat 信息过期，模拟“拷贝 / 解压 / 编辑器重存”。 */
export function touchAll(root: string, paths: string[], seconds = 5): void {
  const when = new Date(Date.now() + seconds * 1000)
  for (const path of paths) if (existsSync(join(root, path))) utimesSync(join(root, path), when, when)
}

export interface Harness {
  service: DiffService
  runner: GitRunner
  invalidated: unknown[]
  watchChanged: unknown[]
}

export function harness(roots: Record<string, string>, options: { env?: Record<string, string>; runner?: Partial<GitRunnerOptions> } = {}): Harness {
  const invalidated: unknown[] = []
  const watchChanged: unknown[] = []
  const environment = async () => fixtureEnv(options.env)
  const runner = createGitRunner({ locate: createGitLocator({ env: environment }), environment, ...options.runner })
  const service = createDiffService({
    projectPath: (id) => (Object.prototype.hasOwnProperty.call(roots, id) ? roots[id]! : null),
    runner, invalidated: (event) => invalidated.push(event), watchChanged: (event) => watchChanged.push(event)
  })
  return { service, runner, invalidated, watchChanged }
}
