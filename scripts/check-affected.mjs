import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { changedPaths, docsOnly, git, paths } from './check-paths.mjs'

const desktop = 'apps/desktop/'
const adapter = 'packages/agent-adapter/'
const unit = /\.test\.[cm]?[jt]sx?$/

// IPC and lazy imports are not captured by Vitest's import graph. Keep module
// tests and E2E consumers explicit; static imports add other dependents.
const domains = {
  files: ['files', 'composer'], input: ['composer', 'files', 'cli-default'],
  session: ['session', 'composer', 'cli-default'], chat: ['composer', 'cli-default'],
  project: ['project', 'app', 'workbench'], 'project-view': ['project-view', 'workbench'], settings: ['settings'],
  workbench: ['workbench'], navigation: ['project', 'workbench', 'alignment'],
  diff: ['diff', 'turn-diff'], 'turn-diff': ['turn-diff'],
  code: ['files', 'diff', 'vscode-parity'], search: ['files'], 'quick-open': ['files'],
  browser: ['runtime-tools'], terminal: ['runtime-tools'], pty: ['runtime-tools'],
  database: ['project', 'session'], 'shell-env': ['cli-default', 'runtime-tools'],
  'app-info': ['app'], menu: ['app', 'project']
}

function domainFor(file) {
  const relative = file.replace(/^src\/(?:main\/(?:services|ipc)|shared\/(?:ipc|tools)|renderer\/src\/features)\//, '')
  return Object.keys(domains).sort((a, b) => b.length - a.length).find(name =>
    relative === `${name}.ts` || relative === `${name}.test.ts` || relative.startsWith(`${name}/`) ||
    relative.startsWith(`tools/${name}/`) || relative.startsWith(`tools/${name}-`) ||
    relative.startsWith(`tools/${name[0].toUpperCase()}${name.slice(1)}`) ||
    file.startsWith(`src/shared/${name}/`))
}

export function inventory(cwd = process.cwd()) {
  return [...new Set(paths(git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd)))]
    .filter(file => existsSync(`${cwd}/${file}`))
}

export function affectedPlan(files, available) {
  const seeds = { scripts: new Set(), desktop: new Set(), adapter: new Set() }
  const types = new Set()
  const e2e = new Set()
  const unknown = []
  const tests = available.filter(file => unit.test(file) && !file.includes('.integration.test.'))
  const addTests = (group, predicate) => {
    for (const file of tests.filter(predicate)) seeds[group].add(file)
  }
  const addDomain = name => {
    for (const spec of domains[name]) e2e.add(`e2e/${spec}.spec.ts`)
    addTests('desktop', file => file.startsWith(desktop) && domainFor(file.slice(desktop.length)) === name)
    if (['files', 'input', 'chat'].includes(name)) {
      addTests('desktop', file => file.startsWith(`${desktop}src/renderer/src/features/input/`))
    }
    if (['database', 'shell-env'].includes(name)) {
      addTests('desktop', file => file.startsWith(`${desktop}src/main/services/session/`))
    }
  }
  for (const file of [...new Set(files)].sort()) {
    if (docsOnly([file]) || /^(?:tasks\/(?:archive\/)?T[^/]+\/evidence|design)\//.test(file)) continue
    if (/^(?:scripts\/(?:check-[\w-]+(?:\.test)?|vitest\.config)\.mjs|\.codex\/(?:hooks\.json|scripts\/agent-docs-hook(?:\.test)?\.mjs)|\.husky\/(?:pre-commit|commit-msg)|commitlint\.config\.cjs|\.github\/workflows\/ci\.yml)$/.test(file)) {
      seeds.scripts.add(file)
      addTests('scripts', test => test.startsWith('scripts/') || test.startsWith('.codex/scripts/'))
      continue
    }
    if (file.startsWith(adapter) && /^(?:(?:src|test)\/.*\.(?:[cm]?ts|json)|tsconfig[^/]*\.json)$/.test(file.slice(adapter.length))) {
      types.add('adapter')
      if (available.includes(file) && !file.includes('.integration.test.')) seeds.adapter.add(file)
      if (unit.test(file) && available.includes(file)) continue
      const provider = /\/(codex|claude)\//.exec(file)?.[1]
      addTests('adapter', test => test.startsWith(`${adapter}test/${provider ?? 'core'}/`))
      // Desktop imports dist, so its graph cannot trace back into adapter/src.
      types.add('node'); types.add('web')
      addDomain('session')
      if (provider === 'claude') e2e.add('e2e/claude-effort.spec.ts')
      continue
    }
    if (file === `${desktop}electron.vite.config.ts`) {
      types.add('node'); types.add('web')
      seeds.desktop.add(file)
      addDomain('workbench')
      addTests('desktop', test => /src\/main\/security\/.*\.test\.ts$/.test(test))
      e2e.add('e2e/app.spec.ts'); e2e.add('e2e/runtime-tools.spec.ts')
      continue
    }
    if (file.startsWith(`${desktop}e2e/`)) {
      types.add('e2e')
      if (file.endsWith('.spec.ts') && available.includes(file)) e2e.add(file.slice(desktop.length))
      else if (!file.endsWith('.spec.ts')) unknown.push(file)
      continue
    }
    if (file.startsWith(`${desktop}src/`) && /\.(?:[cm]?[jt]sx?|css|html|json)$/.test(file)) {
      const relative = file.slice(desktop.length)
      if (relative.startsWith('src/renderer/')) types.add('web')
      else if (relative.startsWith('src/shared/')) { types.add('node'); types.add('web') }
      else types.add('node')
      if (available.includes(file) && /\.[cm]?[jt]sx?$/.test(file)) seeds.desktop.add(file)
      if (unit.test(file) && available.includes(file)) continue
      const domain = domainFor(relative)
      if (domain) {
        addDomain(domain)
        if (relative.startsWith('src/shared/') || relative.startsWith('src/main/ipc/')) {
          addTests('desktop', test => /src\/(preload|shared\/ipc)\/.*\.test\.ts$/.test(test))
        }
      } else if (/^src\/(preload\/|shared\/ipc\/|main\/(ipc\/|index\.ts|security\/|window\/|launch-options|shutdown|menu\/)|renderer\/(index\.html|src\/(app\/|lib\/|styles\/|main\.tsx|env\.d\.ts|features\/tools\/[^/]+\.(?:ts|tsx|css)$)))/.test(relative)) {
        // Shared shell/bridge: smoke + layout, not every feature's E2E.
        e2e.add('e2e/app.spec.ts'); e2e.add('e2e/alignment.spec.ts')
        addTests('desktop', test => /src\/(preload|shared\/ipc|main\/(ipc|security|window))\/.*\.test\.ts$/.test(test) || test.endsWith('/features/project/shell.test.tsx'))
        if (relative.startsWith('src/renderer/src/features/tools/')) {
          e2e.add('e2e/runtime-tools.spec.ts')
          addTests('desktop', test => test === `${desktop}src/renderer/src/features/tools/integration.test.ts`)
        }
      } else unknown.push(file)
      continue
    }
    unknown.push(file)
  }
  const commands = []
  const add = (...args) => commands.push(args)
  const related = (group, prefix, pkg) => {
    const selected = [...seeds[group]].filter(file => available.includes(file)).sort()
    if (!selected.length) return
    add(...(pkg ? ['--filter', pkg, 'exec'] : ['exec']), 'vitest', 'related',
      ...selected.map(file => file.slice(prefix.length)), '--run',
      ...(group === 'scripts' ? ['--config', 'scripts/vitest.config.mjs'] : []))
  }
  related('scripts', '', null)
  if (types.size || seeds.desktop.size || seeds.adapter.size) add('--filter', '@ai-studio/agent-adapter', 'run', 'build')
  if (types.has('adapter')) add('--filter', '@ai-studio/agent-adapter', 'run', 'typecheck')
  for (const project of ['node', 'web', 'e2e']) {
    if (types.has(project)) add('--filter', '@ai-studio/desktop', 'exec', 'tsc', '--noEmit', '-p', `tsconfig.${project}.json`)
  }
  related('adapter', adapter, '@ai-studio/agent-adapter')
  related('desktop', desktop, '@ai-studio/desktop')
  const selectedE2e = [...e2e].sort()
  const missingTests = selectedE2e.filter(file => !available.includes(`${desktop}${file}`))
  return { files, commands, e2e: selectedE2e, unknown, missingTests }
}

export function runPlan(plan, { ci = false, cwd = process.cwd(), run = spawnSync } = {}) {
  console.log(JSON.stringify(plan, null, 2))
  if (plan.unknown.length) {
    console.error(`No reliable affected scope for: ${plan.unknown.join(', ')}. Add a reviewed mapping in scripts/check-affected.mjs with focused regression tests; full checks are never an automatic fallback.`)
    return 1
  }
  if (plan.missingTests.length) {
    console.error(`Selected E2E tests are missing: ${plan.missingTests.join(', ')}. Update the module mapping; do not silently drop coverage.`)
    return 1
  }
  const commands = [...plan.commands]
  if (ci && plan.e2e.length) {
    commands.push(['--filter', '@ai-studio/desktop', 'run', 'build'])
    commands.push(['--filter', '@ai-studio/desktop', 'run', 'test:e2e:built', ...plan.e2e])
  }
  for (const args of commands) {
    console.log(`> pnpm ${args.join(' ')}`)
    const result = run('pnpm', args, { cwd, stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) return result.status ?? 1
  }
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'HEAD'
  const head = args.includes('--head') ? args[args.indexOf('--head') + 1] : undefined
  const available = inventory()
  const files = head ? changedPaths(base, head) : [...new Set([
    ...paths(git(['diff', '--name-only', '--no-renames', '-z', base, '--'])),
    ...paths(git(['ls-files', '--others', '--exclude-standard', '-z']))
  ])]
  const plan = affectedPlan(files, available)
  if (args.includes('--dry-run')) {
    console.log(JSON.stringify(plan, null, 2))
    process.exitCode = plan.unknown.length || plan.missingTests.length ? 1 : 0
  } else process.exitCode = runPlan(plan, { ci: args.includes('--ci') })
}
