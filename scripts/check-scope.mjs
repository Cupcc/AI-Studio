import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { changedPaths, docsOnly, git } from './check-paths.mjs'
export { changedPaths, docsOnly, git, paths } from './check-paths.mjs'

export function ciScope(eventName, event, cwd) {
  if (eventName === 'workflow_dispatch') return { app: true, base: '' }
  try {
    let base
    if (eventName === 'pull_request') {
      base = git(['merge-base', event.pull_request.base.sha, 'HEAD'], cwd).trim()
    } else if (eventName === 'push' && /^[a-f0-9]{40}$/.test(event.before) && !/^0+$/.test(event.before)) {
      base = git(['rev-parse', '--verify', `${event.before}^{commit}`], cwd).trim()
    } else return { app: false, base: '', error: 'Missing comparison baseline; restore history or explicitly run manual CI.' }
    const files = changedPaths(base, 'HEAD', cwd)
    return { app: files.length > 0 && !docsOnly(files), base }
  } catch {
    return { app: false, base: '', error: 'Invalid comparison baseline; restore history or explicitly run manual CI.' }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  const result = ciScope(process.env.GITHUB_EVENT_NAME, event)
  if (result.error) {
    console.error(result.error)
    process.exit(1)
  }
  if (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    const { affectedPlan, inventory } = await import('./check-affected.mjs')
    const plan = affectedPlan(changedPaths(result.base, 'HEAD'), inventory())
    console.log(JSON.stringify(plan, null, 2))
    if (plan.unknown.length || plan.missingTests.length) {
      console.error(`Unmapped paths: ${plan.unknown.join(', ')}; missing selected tests: ${plan.missingTests.join(', ')}. Fix focused scope mappings; refusing automatic full checks.`)
      process.exit(1)
    }
    result.app = plan.commands.length > 0 || plan.e2e.length > 0
    result.e2e = plan.e2e.length > 0
  } else result.e2e = true
  console.log(JSON.stringify(result))
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `app=${result.app}\nbase=${result.base}\ne2e=${result.e2e}\n`)
  }
}
