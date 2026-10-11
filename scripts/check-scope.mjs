import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function git(args, cwd = process.cwd()) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 })
}

export function paths(output) {
  return output.split('\0').filter(Boolean)
}

const documentation = new Set([
  'AGENTS.md', 'CONTRIBUTING.md', 'README.md', 'scripts/README.md',
  'apps/desktop/README.md', 'packages/agent-adapter/src/codex/README.md'
])

export function docsOnly(files) {
  return files.length > 0 && files.every(file => documentation.has(file) ||
    /^(docs|specs|tasks|templates|design)\/.*\.md$/.test(file))
}

export function changedPaths(base, head, cwd) {
  // No rename detection: both the removed source and added destination must be classified.
  return paths(git(['diff', '--name-only', '--no-renames', '-z', base, head, '--'], cwd))
}

export function ciScope(eventName, event, cwd) {
  if (eventName === 'workflow_dispatch') return { app: true, base: '' }
  try {
    let base
    if (eventName === 'pull_request') {
      base = git(['merge-base', event.pull_request.base.sha, 'HEAD'], cwd).trim()
    } else if (eventName === 'push' && /^[a-f0-9]{40}$/.test(event.before) && !/^0+$/.test(event.before)) {
      base = git(['rev-parse', '--verify', `${event.before}^{commit}`], cwd).trim()
    } else return { app: true, base: '' }
    return { app: !docsOnly(changedPaths(base, 'HEAD', cwd)), base }
  } catch {
    // Missing history / invalid base must never produce a documentation exemption.
    return { app: true, base: '' }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  const result = ciScope(process.env.GITHUB_EVENT_NAME, event)
  console.log(JSON.stringify(result))
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `app=${result.app}\nbase=${result.base}\n`)
  }
}
