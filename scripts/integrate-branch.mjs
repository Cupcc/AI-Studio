import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { git } from './check-paths.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const usage = 'Usage: node scripts/integrate-branch.mjs <task-branch> --title "<type(scope): subject>" [--body-file <path>]\n' +
  '       node scripts/integrate-branch.mjs --freeze | --unfreeze'

function freezeFile(cwd) {
  return path.resolve(cwd, git(['rev-parse', '--git-common-dir'], cwd).trim(), 'ai-studio-acceptance')
}

export function frozenAt(cwd = process.cwd()) {
  const file = freezeFile(cwd)
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : null
}

function requireCleanDev(cwd) {
  if (git(['branch', '--show-current'], cwd).trim() !== 'dev') throw new Error('Run this command from the dev checkout.')
  if (git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], cwd)) throw new Error('The dev checkout has uncommitted changes; commit or isolate them first.')
}

export function freezeDev(cwd = process.cwd()) {
  requireCleanDev(cwd)
  const current = frozenAt(cwd)
  if (current) throw new Error(`dev is already frozen for acceptance at ${current}.`)
  const sha = git(['rev-parse', 'HEAD'], cwd).trim()
  writeFileSync(freezeFile(cwd), `${sha}\n`)
  return sha
}

export function unfreezeDev(cwd = process.cwd()) {
  const sha = frozenAt(cwd)
  if (!sha) throw new Error('dev is not frozen.')
  rmSync(freezeFile(cwd))
  return sha
}

function lintMessage(message) {
  const cli = createRequire(path.join(root, 'package.json')).resolve('@commitlint/cli/cli.js')
  try {
    execFileSync(process.execPath, [cli], { cwd: root, input: message, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (error) {
    throw new Error(`The squash commit message fails commitlint:\n${error.stdout || error.stderr || error.message}`)
  }
}

export function integrateBranch({ branch, title, body = '', cwd = process.cwd() }) {
  if (!branch || branch === 'dev' || branch === 'main' || branch.startsWith('-')) throw new Error('Specify a local task branch to integrate into dev.')
  if (!title?.trim()) throw new Error('Pass --title with the Conventional Commit title of the squash commit.')
  requireCleanDev(cwd)
  const frozen = frozenAt(cwd)
  if (frozen) throw new Error(`dev is frozen for acceptance at ${frozen}; integrate after the result is recorded and dev is unfrozen.`)

  const ref = `refs/heads/${branch}`
  const records = git(['worktree', 'list', '--porcelain', '-z'], cwd).split('\0\0')
  const source = records.find(record => record.split('\0').includes(`branch ${ref}`))
    ?.split('\0').find(line => line.startsWith('worktree '))?.slice('worktree '.length)
  if (!source) throw new Error('The task branch must be checked out in its own worktree.')
  if (git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], source)) throw new Error('The source worktree has uncommitted changes; commit them on the task branch first.')

  const head = git(['rev-parse', 'HEAD'], cwd).trim()
  const sourceCommit = git(['rev-parse', '--verify', `${ref}^{commit}`], cwd).trim()
  if (head === sourceCommit) throw new Error('The task branch has no new commits to integrate.')
  try { git(['merge-base', '--is-ancestor', head, sourceCommit], cwd) }
  catch { throw new Error('Rebase the task branch onto dev in its worktree, resolve conflicts and commit before integrating.') }

  // dev is an ancestor of the source, so the squash commit gets exactly the tree the task branch committed and checked.
  const squashed = git(['log', '--reverse', '--format=- %h %s', `${head}..${sourceCommit}`], cwd).trim().split('\n').map(line => line.slice(0, 100))
  // Git reads trailers only from the last paragraph, so the body's trailers move below the commit list.
  const paragraphs = body.trim() ? body.trim().split(/\n\s*\n/) : []
  const trailers = paragraphs.length && paragraphs.at(-1).split('\n').every(line => /^[\w-]+: \S/.test(line)) ? paragraphs.pop() : ''
  const message = [title.trim(), paragraphs.join('\n\n'), ['Squashed commits:', ...squashed].join('\n'),
    [trailers, `Source-Branch: ${branch}`, `Source-Commit: ${sourceCommit}`].filter(Boolean).join('\n')].filter(Boolean).join('\n\n') + '\n'
  lintMessage(message)
  const tree = git(['rev-parse', `${sourceCommit}^{tree}`], cwd).trim()
  const commit = execFileSync('git', ['commit-tree', tree, '-p', head, '-F', '-'], { cwd, input: message, encoding: 'utf8' }).trim()
  git(['merge', '--ff-only', commit], cwd)
  // dev now holds the delivery, so the worktree list keeps only unfinished work. A failed removal leaves dev integrated.
  try {
    git(['worktree', 'remove', source], cwd)
    // Unlike branch -D, this refuses when the branch gained a commit after the checks above.
    git(['update-ref', '-d', ref, sourceCommit], cwd)
    return { branch, sourceCommit, commit, worktree: source }
  } catch (error) {
    return { branch, sourceCommit, commit, worktree: source, cleanupError: error.stderr?.trim() || error.message }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: { title: { type: 'string' }, 'body-file': { type: 'string' }, freeze: { type: 'boolean' }, unfreeze: { type: 'boolean' } }
    })
    if (values.freeze || values.unfreeze) {
      if (positionals.length || values.title || values['body-file'] || (values.freeze && values.unfreeze)) throw new Error(usage)
      if (values.freeze) console.log(`Froze dev for acceptance at ${freezeDev()}.`)
      else console.log(`Unfroze dev; the acceptance version was ${unfreezeDev()}.`)
    } else {
      if (positionals.length !== 1) throw new Error(usage)
      const body = values['body-file'] ? readFileSync(values['body-file'], 'utf8') : ''
      const result = integrateBranch({ branch: positionals[0], title: values.title, body })
      console.log(`Squashed ${result.branch} at ${result.sourceCommit} into dev as ${result.commit}.`)
      if (result.cleanupError) console.error(`dev is integrated, but the worktree ${result.worktree} or the branch ${result.branch} was not removed. ` +
        `Clean up by hand as CONTRIBUTING.md §5 清理 describes, without --force:\n${result.cleanupError}`)
      else console.log(`Removed the worktree ${result.worktree} and the branch ${result.branch}.`)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
