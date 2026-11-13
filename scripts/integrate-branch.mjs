import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { lacksTryLine, userFacingTypes } from './acceptance.mjs'
import { affectedPlan, inventory } from './check-affected.mjs'
import { changedPaths, git } from './check-paths.mjs'
import { ciRecords } from './remote-ci.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const usage = 'Usage: node scripts/integrate-branch.mjs <task-branch> --title "<type(scope): subject>" [--body-file <path>] [--skip-ci "<reason>"]'

function lintMessage(message) {
  const cli = createRequire(path.join(root, 'package.json')).resolve('@commitlint/cli/cli.js')
  try {
    execFileSync(process.execPath, [cli], { cwd: root, input: message, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (error) {
    throw new Error(`The squash commit message fails commitlint:\n${error.stdout || error.stderr || error.message}`)
  }
}

function patchId(base, commit, cwd) {
  const diff = git(['diff', '--binary', base, commit], cwd)
  return diff ? execFileSync('git', ['patch-id', '--stable'], { cwd, input: diff, encoding: 'utf8' }).split(' ')[0] : ''
}

// The dev push runs the same selector, so the branch must already have passed the checks it selects, in a recorded run
// (vm-ci.mjs, or remote-ci.mjs as the fallback, writes the records). A run from before a rebase still counts when the branch's own changes are
// identical; the dev push run covers the combination.
export function verifyCi({ branch, head, sourceCommit, source, repo, runs = ciRecords }) {
  const plan = affectedPlan(changedPaths(head, sourceCommit, repo), inventory(source), { base: head, head: sourceCommit, cwd: source })
  const needs = []
  if (plan.commands.length || plan.e2e.length || plan.unknown.length || plan.missingTests.length) needs.push(['affected', 'full'])
  if (plan.packaging.length) needs.push(['package', 'full'])
  if (!needs.length) return []
  const own = patchId(head, sourceCommit, repo)
  const same = sha => {
    if (sha === sourceCommit) return true
    try { return patchId(git(['merge-base', sha, head], repo).trim(), sha, repo) === own }
    catch { return false }
  }
  const passed = runs(repo).filter(run => run.branch === branch && run.conclusion === 'success')
  return needs.map(scopes => {
    const run = passed.find(item => scopes.includes(item.scope) && same(item.headSha))
    if (run) return run.headSha === sourceCommit ? run.url : `${run.url} (before rebase)`
    throw new Error(`No passing ${scopes.join(' or ')} CI run covers the changes of ${branch} at ${sourceCommit.slice(0, 12)}. ` +
      `Run \`node scripts/vm-ci.mjs${scopes.includes('package') ? ' --scope package' : ''}\` in its worktree, then integrate. ` +
      'If CI cannot judge this change, pass --skip-ci "<reason>".')
  })
}

export function integrateBranch({ branch, title, body = '', skipCi = '', cwd = process.cwd(), runs }) {
  if (!branch || branch === 'dev' || branch === 'main' || branch.startsWith('-')) throw new Error('Specify a local task branch to integrate into dev.')
  if (!title?.trim()) throw new Error('Pass --title with the Conventional Commit title of the squash commit.')
  if (lacksTryLine(title, body)) throw new Error(`Squash commits of type ${userFacingTypes.join(', ')} must say how to try the change. Add a line that starts with "体验：" to the --body-file: ` +
    'the steps a person follows in the running app, such as "体验：打开设置页，点击测试连接，看到通过提示", or "体验：无" when nothing is user-visible.')
  // Run from the shared Git directory so removing the source worktree never pulls the ground from under a later command.
  const repo = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd).trim()

  const ref = `refs/heads/${branch}`
  const worktrees = git(['worktree', 'list', '--porcelain', '-z'], repo).split('\0\0').map(record => record.split('\0'))
  const checkout = name => worktrees.find(lines => lines.includes(`branch refs/heads/${name}`))?.find(line => line.startsWith('worktree '))?.slice('worktree '.length)
  // Integration only moves the dev ref, so a checkout of dev would silently fall behind its own HEAD.
  const devCheckout = checkout('dev')
  if (devCheckout) throw new Error(`dev is checked out in ${devCheckout}; run \`git switch --detach\` there, since integration only moves the dev ref.`)
  const source = checkout(branch)
  if (!source) throw new Error('The task branch must be checked out in its own worktree.')
  if (git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], source)) throw new Error('The source worktree has uncommitted changes; commit them on the task branch first.')

  const head = git(['rev-parse', '--verify', 'refs/heads/dev^{commit}'], repo).trim()
  const sourceCommit = git(['rev-parse', '--verify', `${ref}^{commit}`], repo).trim()
  if (head === sourceCommit) throw new Error('The task branch has no new commits to integrate.')
  try { git(['merge-base', '--is-ancestor', head, sourceCommit], repo) }
  catch { throw new Error('Rebase the task branch onto dev in its worktree, resolve conflicts and commit before integrating.') }
  const ciRuns = skipCi.trim() ? [`skipped (${skipCi.trim()})`] : verifyCi({ branch, head, sourceCommit, source, repo, runs })

  // dev is an ancestor of the source, so the squash commit gets exactly the tree the task branch committed and checked.
  const squashed = git(['log', '--reverse', '--format=- %h %s', `${head}..${sourceCommit}`], repo).trim().split('\n').map(line => line.slice(0, 100))
  // Git reads trailers only from the last paragraph, so the body's trailers move below the commit list.
  const paragraphs = body.trim() ? body.trim().split(/\n\s*\n/) : []
  const trailers = paragraphs.length && paragraphs.at(-1).split('\n').every(line => /^[\w-]+: \S/.test(line)) ? paragraphs.pop() : ''
  const message = [title.trim(), paragraphs.join('\n\n'), ['Squashed commits:', ...squashed].join('\n'),
    [trailers, `Source-Branch: ${branch}`, `Source-Commit: ${sourceCommit}`, ...ciRuns.map(run => `CI-Run: ${run}`)].filter(Boolean).join('\n')].filter(Boolean).join('\n\n') + '\n'
  lintMessage(message)
  const tree = git(['rev-parse', `${sourceCommit}^{tree}`], repo).trim()
  const commit = execFileSync('git', ['commit-tree', tree, '-p', head, '-F', '-'], { cwd: repo, input: message, encoding: 'utf8' }).trim()
  // The old value makes this refuse when another integration moved dev after the checks above.
  try { git(['update-ref', '-m', `integrate ${branch}`, 'refs/heads/dev', commit, head], repo) }
  catch { throw new Error('dev moved during integration; rebase the task branch onto the new dev and integrate again.') }
  // dev now holds the delivery, so the worktree list keeps only unfinished work. A failed removal leaves dev integrated.
  try {
    git(['worktree', 'remove', source], repo)
    // Unlike branch -D, this refuses when the branch gained a commit after the checks above.
    git(['update-ref', '-d', ref, sourceCommit], repo)
    return { branch, sourceCommit, commit, worktree: source }
  } catch (error) {
    return { branch, sourceCommit, commit, worktree: source, cleanupError: error.stderr?.trim() || error.message }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: { title: { type: 'string' }, 'body-file': { type: 'string' }, 'skip-ci': { type: 'string' } } })
    if (positionals.length !== 1) throw new Error(usage)
    const body = values['body-file'] ? readFileSync(values['body-file'], 'utf8') : ''
    const result = integrateBranch({ branch: positionals[0], title: values.title, body, skipCi: values['skip-ci'] ?? '' })
    console.log(`Squashed ${result.branch} at ${result.sourceCommit} into dev as ${result.commit}.`)
    if (result.cleanupError) console.error(`dev is integrated, but the worktree ${result.worktree} or the branch ${result.branch} was not removed. ` +
      `Clean up by hand as CONTRIBUTING.md §5 清理 describes, without --force:\n${result.cleanupError}`)
    else console.log(`Removed the worktree ${result.worktree} and the branch ${result.branch}.`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
