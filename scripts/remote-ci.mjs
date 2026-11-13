import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { git } from './check-paths.mjs'

const usage = 'Usage: node scripts/remote-ci.mjs [--scope affected|e2e|package|full] [--spec <file>]... [--grep <pattern>]'
const gh = (args, cwd) => execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })

// The runner checks out the pushed commit, so local changes and unpushed commits would make the result misleading.
export function pushedHead(cwd = process.cwd()) {
  const branch = git(['branch', '--show-current'], cwd).trim()
  if (!branch) throw new Error('Check out the task branch; a detached HEAD cannot be dispatched.')
  if (git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], cwd)) throw new Error('The worktree has uncommitted changes; commit them and push before running remote CI.')
  const head = git(['rev-parse', 'HEAD'], cwd).trim()
  const remote = git(['ls-remote', 'origin', `refs/heads/${branch}`], cwd).split('\t')[0].trim()
  if (remote !== head) {
    throw new Error(remote
      ? `origin/${branch} is at ${remote.slice(0, 12)}, not HEAD ${head.slice(0, 12)}. Push first (after a rebase: git push --force-with-lease origin ${branch}).`
      : `origin has no ${branch}. Push first: git push -u origin ${branch}`)
  }
  return { branch, head }
}

export async function remoteCi({ scope = 'affected', specs = [], grep = '', cwd = process.cwd(), pollMs = 30_000, log = console.log } = {}) {
  if (!['affected', 'e2e', 'package', 'full'].includes(scope)) throw new Error(usage)
  if ((scope === 'e2e') !== (specs.length > 0) || (grep && scope !== 'e2e')) throw new Error('--spec is required for, and --spec/--grep only apply to, --scope e2e.')
  const { branch, head } = pushedHead(cwd)
  const fields = ['-f', `scope=${scope}`, ...(scope === 'e2e' ? ['-f', `specs=${specs.join(' ')}`, '-f', `grep=${grep}`] : [])]
  const dispatched = gh(['workflow', 'run', 'ci.yml', '--ref', branch, ...fields], cwd)
  const id = /\/actions\/runs\/(\d+)/.exec(dispatched)?.[1]
  if (!id) throw new Error(`gh did not return the run URL:\n${dispatched}`)
  log(`Dispatched ${scope} CI for ${branch} at ${head.slice(0, 12)}: ${dispatched.trim()}`)

  let run, progress = '', failures = 0
  for (;;) {
    // One failed status query must not abandon a run that is still going; give up after three in a row.
    try { run = JSON.parse(gh(['run', 'view', id, '--json', 'status,conclusion,headSha,url,jobs'], cwd)); failures = 0 }
    catch (error) {
      if (++failures >= 3) throw error
      log(`Status query failed, retrying: ${String(error.stderr || error.message).trim().split('\n')[0]}`)
      await sleep(pollMs)
      continue
    }
    if (run.headSha !== head) throw new Error(`Run ${id} checked out ${run.headSha}, not ${head}; the branch moved during dispatch.`)
    const line = run.jobs.map(job => `${job.name}: ${job.conclusion || job.status}`).join('; ') || run.status
    if (line !== progress) log(progress = line)
    if (run.status === 'completed') break
    await sleep(pollMs)
  }

  const dir = path.join(cwd, '.runtime', 'remote-ci', id)
  mkdirSync(dir, { recursive: true })
  try { gh(['run', 'download', id, '--dir', dir], cwd) }
  catch (error) { log(`No evidence downloaded: ${String(error.stderr || error.message).trim()}`) }
  if (run.conclusion !== 'success') {
    // Keep the whole failed-step log on disk and print only its end, where Playwright summarizes failures.
    let failed
    try { failed = gh(['run', 'view', id, '--log-failed'], cwd) }
    catch (error) { failed = String(error.stderr || error.message) }
    writeFileSync(path.join(dir, 'failed.log'), failed)
    log(failed.trimEnd().split('\n').slice(-60).join('\n'))
  }
  log(`${run.conclusion}: ${run.url}\nEvidence: ${path.relative(cwd, dir)}`)
  return { id, url: run.url, conclusion: run.conclusion, dir }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: { scope: { type: 'string' }, spec: { type: 'string', multiple: true }, grep: { type: 'string' } }
    })
    if (positionals.length) throw new Error(usage)
    const result = await remoteCi({ scope: values.scope, specs: values.spec ?? [], grep: values.grep ?? '' })
    process.exitCode = result.conclusion === 'success' ? 0 : 1
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
