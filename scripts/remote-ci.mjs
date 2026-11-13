import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { git } from './check-paths.mjs'

const usage = 'Usage: node scripts/remote-ci.mjs [--scope affected|e2e|package|full] [--spec <file>]... [--grep <pattern>]'
const gh = (args, cwd) => execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })

// Finished runs are recorded in the Git common directory, shared by every worktree, for the integration gate.
const recordDir = cwd => path.resolve(cwd, git(['rev-parse', '--git-common-dir'], cwd).trim(), 'ai-studio-ci')

export function ciRecords(cwd = process.cwd()) {
  const dir = recordDir(cwd)
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(name => name.endsWith('.json'))
    .map(name => JSON.parse(readFileSync(path.join(dir, name), 'utf8')))
    .sort((a, b) => Number(b.id) - Number(a.id))
}

const ansi = /\u001b\[[0-9;]*m/g

// Playwright's JSON report (apps/desktop/playwright.config.ts) names each failed or flaky test with its error, trace and
// page snapshot. Paths in it point into the runner's checkout; map them to the downloaded evidence.
export function e2eSummary(dir, cwd = process.cwd()) {
  const local = file => {
    const tail = file.split('/.runtime/')[1]
    const artifact = tail && readdirSync(dir).map(name => path.join(dir, name, tail)).find(existsSync)
    return artifact ? path.relative(cwd, artifact) : file
  }
  const failed = [], flaky = []
  const reports = existsSync(dir) ? readdirSync(dir, { recursive: true }).filter(name => path.basename(String(name)) === 'report.json') : []
  for (const name of reports) {
    let report
    try { report = JSON.parse(readFileSync(path.join(dir, String(name)), 'utf8')) } catch { continue }
    const specs = suite => [...(suite.specs ?? []), ...(suite.suites ?? []).flatMap(specs)]
    for (const spec of (report.suites ?? []).flatMap(specs)) for (const test of spec.tests ?? []) {
      if (test.status !== 'unexpected' && test.status !== 'flaky') continue
      const result = test.results?.find(item => item.status !== 'passed' && item.status !== 'skipped')
      const lines = [`${spec.file}:${spec.line} › ${spec.title}`,
        ...String(result?.error?.message ?? '').replace(ansi, '').trim().split('\n').filter(Boolean).slice(0, 4).map(line => `    ${line}`),
        ...(result?.attachments ?? []).filter(item => item.path && ['trace', 'error-context'].includes(item.name))
          .map(item => `    ${item.name}: ${local(item.path)}`)]
      ;(test.status === 'flaky' ? flaky : failed).push(lines.join('\n'))
    }
  }
  return {
    failed, flaky,
    lines: [...(failed.length ? [`Failed E2E tests (${failed.length}):`, ...failed] : []),
      ...(flaky.length ? [`Flaky E2E tests, passed on retry (${flaky.length}); fix them separately:`, ...flaky] : [])]
  }
}

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

  mkdirSync(recordDir(cwd), { recursive: true })
  writeFileSync(path.join(recordDir(cwd), `${id}.json`),
    `${JSON.stringify({ id, url: run.url, branch, headSha: head, scope, conclusion: run.conclusion })}\n`)
  const dir = path.join(cwd, '.runtime', 'remote-ci', id)
  mkdirSync(dir, { recursive: true })
  try { gh(['run', 'download', id, '--dir', dir], cwd) }
  catch (error) { log(`No evidence downloaded: ${String(error.stderr || error.message).trim()}`) }
  const e2e = e2eSummary(dir, cwd)
  if (run.conclusion !== 'success') {
    // Keep the whole failed-step log on disk. Failed E2E tests are named by the report; any other failure (types,
    // unit tests, packaging) is summarized at the end of the log.
    let failed
    try { failed = gh(['run', 'view', id, '--log-failed'], cwd) }
    catch (error) { failed = String(error.stderr || error.message) }
    writeFileSync(path.join(dir, 'failed.log'), failed)
    log(e2e.failed.length
      ? [...e2e.lines, `Full log: ${path.relative(cwd, path.join(dir, 'failed.log'))}`].join('\n')
      : failed.trimEnd().split('\n').slice(-60).join('\n'))
  } else if (e2e.lines.length) log(e2e.lines.join('\n'))
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
