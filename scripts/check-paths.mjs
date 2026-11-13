import { execFileSync } from 'node:child_process'

export function git(args, cwd = process.cwd()) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 })
}

export function paths(output) {
  return output.split('\0').filter(Boolean)
}

const documentation = new Set([
  'AGENTS.md', 'CONTRIBUTING.md', 'README.md', 'scripts/README.md',
  'apps/desktop/README.md', 'packages/agent-adapter/src/codex/README.md',
  'docs/08. System Architecture.html', '.codex/agents/README.md',
  '.agents/skills/README.md', '.agents/skills/vercel-react-best-practices/AGENTS.md'
])

export function docsOnly(files) {
  return files.length > 0 && files.every(file => documentation.has(file) ||
    /^(docs|specs|tasks|design|\.agents\/archive)\/.*\.md$/.test(file))
}

export function changedPaths(base, head, cwd) {
  // Both removed source and added destination must be classified on a rename.
  return paths(git(['diff', '--name-only', '--no-renames', '-z', base, head, '--'], cwd))
}
