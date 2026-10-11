import { spawnSync } from 'node:child_process'
import { checkDocs } from './check-docs.mjs'
import { changedPaths, docsOnly, git } from './check-scope.mjs'

// Inspect the actual index, not unstaged edits that might conceal a broken link.
const head = git(['write-tree']).trim()
let base
try { base = git(['rev-parse', '--verify', 'HEAD']).trim() } catch { base = '' }
const files = base ? changedPaths(base, head) : []
if (!checkDocs({ base, head })) process.exit(1)
if (docsOnly(files)) {
  console.log('Documentation-only index: application checks not required.')
} else {
  console.log('Code/configuration/unknown or empty index: running all basic checks.')
  const result = spawnSync('pnpm', ['check:code'], { stdio: 'inherit' })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
}
