import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { changedPaths, docsOnly, git } from './check-paths.mjs'
export { changedPaths, docsOnly, git, paths } from './check-paths.mjs'

// Manual specs name files in apps/desktop/e2e; Playwright receives them as e2e/<name>.
function requestedSpecs(value = '', cwd = '.') {
  const names = value.trim().split(/\s+/).filter(Boolean).map(name => name.replace(/^e2e\//, ''))
  const invalid = names.filter(name => !/^[\w-]+\.spec\.ts$/.test(name) || !existsSync(path.join(cwd, 'apps/desktop/e2e', name)))
  if (!names.length || invalid.length) return { error: `Pass existing apps/desktop/e2e spec files for the e2e scope${invalid.length ? `; not found: ${invalid.join(', ')}` : ''}.` }
  return { specs: [...new Set(names)].map(name => `e2e/${name}`).join(' ') }
}

export function ciScope(eventName, event, cwd) {
  const scope = eventName === 'workflow_dispatch' ? event.inputs?.scope || 'full' : 'affected'
  if (scope === 'full') return { app: true, base: '', mode: 'full' }
  if (scope === 'e2e') {
    const { specs, error } = requestedSpecs(event.inputs?.specs, cwd)
    return error ? { app: false, base: '', error } : { app: true, base: '', mode: 'e2e', specs }
  }
  if (scope !== 'affected') return { app: false, base: '', error: `Unknown manual scope: ${scope}.` }
  try {
    let base
    if (eventName === 'workflow_dispatch') {
      // A task branch is checked against the dev it would be integrated into.
      base = git(['merge-base', 'refs/remotes/origin/dev', 'HEAD'], cwd).trim()
    } else if (eventName === 'pull_request') {
      base = git(['merge-base', event.pull_request.base.sha, 'HEAD'], cwd).trim()
    } else if (eventName === 'push' && /^[a-f0-9]{40}$/.test(event.before) && !/^0+$/.test(event.before)) {
      base = git(['rev-parse', '--verify', `${event.before}^{commit}`], cwd).trim()
    } else if (eventName === 'push' && /^0{40}$/.test(event.before) && event.ref === 'refs/heads/dev') {
      base = git(['merge-base', 'refs/remotes/origin/main', 'HEAD'], cwd).trim()
    } else return { app: false, base: '', error: 'Missing comparison baseline; restore history or explicitly run manual CI.' }
    const files = changedPaths(base, 'HEAD', cwd)
    return { app: files.length > 0 && !docsOnly(files), base, mode: 'affected' }
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
  if (result.mode === 'affected') {
    const { affectedPlan, inventory } = await import('./check-affected.mjs')
    const plan = affectedPlan(changedPaths(result.base, 'HEAD'), inventory(), { base: result.base, head: 'HEAD' })
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
    appendFileSync(process.env.GITHUB_OUTPUT, `app=${result.app}\nbase=${result.base}\ne2e=${result.e2e}\nmode=${result.mode}\nspecs=${result.specs ?? ''}\n`)
  }
}
