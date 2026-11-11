import { pathToFileURL } from 'node:url'
import { git } from './check-paths.mjs'

export function integrateBranch(branch, cwd = process.cwd()) {
  if (!branch || branch === 'dev' || branch === 'main') throw new Error('Specify a local task branch to integrate into dev.')
  if (git(['branch', '--show-current'], cwd).trim() !== 'dev') throw new Error('Run integration from the dev checkout.')
  if (git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], cwd)) throw new Error('The dev checkout has uncommitted changes; commit or isolate them first.')

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

  git(['merge', '--ff-only', sourceCommit], cwd)
  return { branch, sourceCommit }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/integrate-branch.mjs <task-branch>')
    const result = integrateBranch(process.argv[2])
    console.log(`Integrated ${result.branch} at ${result.sourceCommit} into dev via fast-forward.`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
