import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Real temporary Git repositories for the Diff specs. The environment is fixed so that results do not depend on the
// developer's own Git setup: no global / system configuration, no inherited GIT_* variables, a fixed identity.
function gitEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) if (!key.startsWith('GIT_') && value !== undefined) env[key] = value
  return {
    ...env,
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.test',
    GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.test'
  }
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.quotepath=false', ...args], { cwd, env: gitEnvironment(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

export function put(root: string, path: string, content: string | Buffer = path): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), content)
}

/** `git init` on branch main; the caller commits (or deliberately does not, for the unborn-HEAD case). */
export function initRepo(root: string): void {
  mkdirSync(root, { recursive: true })
  git(root, 'init', '-q', '-b', 'main')
}

export function commitAll(root: string, message = 'initial'): void {
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', message)
}
