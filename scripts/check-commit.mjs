import { checkDocs } from './check-docs.mjs'
import { changedPaths, docsOnly, git, paths } from './check-scope.mjs'
import { affectedPlan, inventory, runPlan } from './check-affected.mjs'
import { checkTasks, worktreeTasks } from './tasks.mjs'

// Inspect the actual index, not unstaged edits that might conceal a broken link.
const head = git(['write-tree']).trim()
let base
try { base = git(['rev-parse', '--verify', 'HEAD']).trim() } catch { base = '' }
const files = base ? changedPaths(base, head) : paths(git(['ls-files', '-z']))
if (!checkDocs({ base, head })) process.exit(1)
if (files.some(file => file.startsWith('tasks/') && !file.startsWith('tasks/templates/'))) {
  const problems = checkTasks(worktreeTasks(process.cwd()))
  if (problems.length) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
}
if (!files.length || docsOnly(files)) {
  console.log('Documentation-only or empty index: application checks not required.')
} else {
  // Tests execute the worktree: don't let unstaged code conceal a broken index.
  const unstaged = [...paths(git(['diff', '--name-only', '-z'])),
    ...paths(git(['ls-files', '--others', '--exclude-standard', '-z']))]
    .filter(file => !docsOnly([file]))
  if (unstaged.length) {
    console.error(`Stage or isolate unstaged non-document changes before checking the index: ${unstaged.join(', ')}`)
    process.exit(1)
  }
  process.exitCode = runPlan(affectedPlan(files, inventory(), { base, head }))
}
