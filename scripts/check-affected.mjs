import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { changedPaths, docsOnly, git, paths } from './check-paths.mjs'

const desktop = 'apps/desktop/'
const adapter = 'packages/agent-adapter/'
const unit = /\.test\.[cm]?[jt]sx?$/

// Ordinary source uses Vitest's import graph. These domains select E2E and
// supply unit tests only where IPC, generated assets or deletion break that graph.
const domains = {
  files: ['files', 'composer'], input: ['composer', 'files', 'cli-default'],
  session: ['session', 'composer', 'cli-default'], chat: ['composer', 'cli-default'],
  project: ['project', 'app', 'workbench'], 'project-view': ['project-view', 'workbench'], settings: ['settings'],
  workbench: ['project-view', 'workbench', 'product-selection'], navigation: ['project', 'workbench', 'alignment'],
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

export function workbenchPackageIncludeChange(before, after) {
  const prior = JSON.parse(before), next = JSON.parse(after)
  const include = 'build/workbenches/**/*.json'
  if (!Array.isArray(prior.include) || !Array.isArray(next.include)) return false
  return JSON.stringify({ ...next, include: next.include.filter(path => path !== include) }) === JSON.stringify(prior) &&
    next.include.filter(path => path === include).length === 1
}

function workbenchConfigPaths(files, { base = 'HEAD', head, cwd = process.cwd() }) {
  const accepted = new Set()
  for (const file of files.filter(path => /^apps\/desktop\/tsconfig\.(?:node|web)\.json$/.test(path))) {
    try {
      const before = git(['show', `${base}:${file}`], cwd)
      const after = head ? git(['show', `${head}:${file}`], cwd) : readFileSync(`${cwd}/${file}`, 'utf8')
      if (workbenchPackageIncludeChange(before, after)) accepted.add(file)
    } catch { /* Other compiler/configuration changes still require an impact mapping. */ }
  }
  return accepted
}

export function buildConfigChange(before, after) {
  const stripPackage = text => text
    .replace(/^import \{ buildWorkbenchPackages \} from '\.\/scripts\/build-workbench-packages\.mjs'\r?\n/m, '')
    .replace(/^buildWorkbenchPackages\(\)\r?\n/m, '')
  if (before !== after && stripPackage(before) === stripPackage(after)) return 'workbench-package'
  // Only the two existing CSP arrays may change. Build entries, plugins and
  // other configuration require a new reviewed mapping rather than broad tests.
  const stripCsp = text => text.replace(/^export const CSP_(PRODUCTION|DEVELOPMENT) = \[\n[\s\S]*?^\]\.join\('; '\)/gm, 'CSP_$1')
  if (before !== after && stripCsp(before) === stripCsp(after)) return 'csp'
  return null
}

function configChange(file, comparison) {
  const { base = 'HEAD', head, cwd = process.cwd() } = comparison
  try {
    return buildConfigChange(git(['show', `${base}:${file}`], cwd),
      head ? git(['show', `${head}:${file}`], cwd) : readFileSync(`${cwd}/${file}`, 'utf8'))
  } catch { return null }
}

export function affectedPlan(files, available, comparison = {}) {
  const workbenchConfigs = workbenchConfigPaths(files, comparison)
  const seeds = { scripts: new Set(), desktop: new Set(), adapter: new Set() }
  const types = new Set()
  const e2e = new Set()
  const fullE2e = new Set()
  const e2eFilters = {}
  const unknown = []
  const missingTests = []
  const packaging = []
  const tests = available.filter(file => unit.test(file) && !file.includes('.integration.test.'))
  const addTests = (group, predicate) => {
    const selected = tests.filter(predicate)
    for (const file of selected) seeds[group].add(file)
    return selected.length
  }
  const specs = available.filter(file => file.startsWith(`${desktop}e2e/`) && file.endsWith('.spec.ts'))
  const addE2e = file => { e2e.add(file.slice(desktop.length)); fullE2e.add(file.slice(desktop.length)) }
  const cwd = comparison.cwd ?? process.cwd()
  const source = file => existsSync(`${cwd}/${file}`) ? readFileSync(`${cwd}/${file}`, 'utf8') : ''
  const addDomainE2e = name => {
    for (const spec of domains[name]) {
      e2e.add(`e2e/${spec}.spec.ts`)
      fullE2e.add(`e2e/${spec}.spec.ts`)
    }
  }
  const addDomainTests = name => {
    let count = addTests('desktop', file => file.startsWith(desktop) && domainFor(file.slice(desktop.length)) === name)
    if (name === 'workbench') {
      count += addTests('desktop', file => file.startsWith(desktop) && domainFor(file.slice(desktop.length)) === 'project-view')
    }
    if (['files', 'input', 'chat'].includes(name)) {
      count += addTests('desktop', file => file.startsWith(`${desktop}src/renderer/src/features/input/`))
    }
    if (['database', 'shell-env'].includes(name)) {
      count += addTests('desktop', file => file.startsWith(`${desktop}src/main/services/session/`))
    }
    return count
  }
  const addDomain = name => { addDomainE2e(name); addDomainTests(name) }
  const requireTests = files => {
    for (const relative of files) {
      const file = `${desktop}${relative}`
      if (available.includes(file)) seeds.desktop.add(file)
      else missingTests.push(file)
    }
  }
  const addPackageTests = () => {
    // These tests read out/workbench-packages, not its build inputs.
    requireTests([
      'src/main/services/workbench/package-runtime.test.ts',
      'src/main/services/workbench/workbench-service.test.ts',
      'src/renderer/src/features/workbench/portable-pages.test.ts'
    ])
    addDomainE2e('workbench')
  }
  for (const file of [...new Set(files)].sort()) {
    if (/^\.agents\/rules\/[\w-]+\.md$/.test(file)) continue // agent rule documents; no code reads them
    const legacyTemplate = /^templates\/(acceptance|plan|report|spec|task)\.md$/.exec(file)
    if (legacyTemplate && !available.includes(file) &&
      available.includes(`${legacyTemplate[1] === 'spec' ? 'specs' : 'tasks'}/templates/${legacyTemplate[1]}.md`)) continue
    // `.ignore` and `.gitignore` only decide what search and Git see; no code reads them.
    if (docsOnly([file]) || file === '.ignore' || file === '.gitignore' || /^\.codex\/agents\/[\w-]+\.toml$/.test(file) ||
      /^(?:\.agents\/archive|tasks\/archive|tasks\/T[^/]+\/evidence|design)\//.test(file)) continue
    if (/^(?:scripts\/(?:check-[\w-]+(?:\.test)?|integrate-branch(?:\.test)?|remote-ci(?:\.test)?|vm-ci(?:\.test)?|tasks(?:\.test)?|acceptance(?:\.test)?|vitest\.config)\.mjs|\.codex\/(?:hooks\.json|scripts\/agent-docs-hook(?:\.test)?\.mjs)|\.husky\/(?:pre-commit|commit-msg)|commitlint\.config\.cjs|\.github\/workflows\/ci\.yml)$/.test(file)) {
      seeds.scripts.add(file)
      if (file === '.codex/hooks.json') seeds.scripts.add('.codex/scripts/agent-docs-hook.test.mjs')
      else if (/^(?:\.husky\/|commitlint\.|\.github\/)/.test(file)) {
        seeds.scripts.add('scripts/check-workflow.test.mjs')
        seeds.scripts.add('scripts/check-affected.test.mjs')
      } else if (!available.includes(file) || file === 'scripts/vitest.config.mjs') {
        addTests('scripts', test => test.startsWith('scripts/') || test.startsWith('.codex/scripts/'))
      }
      // The workflow tests execute these entry points in child processes.
      if (/^scripts\/check-(?:commit|scope|affected|paths)\.mjs$/.test(file)) seeds.scripts.add('scripts/check-workflow.test.mjs')
      continue
    }
    if (file.startsWith(adapter) && /^(?:(?:src|test)\/.*\.(?:[cm]?ts|json)|tsconfig[^/]*\.json)$/.test(file.slice(adapter.length))) {
      types.add('adapter')
      if (available.includes(file) && !file.includes('.integration.test.')) seeds.adapter.add(file)
      if (unit.test(file) && available.includes(file)) continue
      const provider = /\/(codex|claude)\//.exec(file)?.[1]
      if (!available.includes(file) || /tsconfig[^/]*\.json$/.test(file)) {
        if (!addTests('adapter', test => test.startsWith(`${adapter}test/${provider ?? 'core'}/`))) unknown.push(file)
      }
      // Desktop imports dist, so its graph cannot trace back into adapter/src.
      types.add('node'); types.add('web')
      addDomain('session')
      if (provider === 'claude') e2e.add('e2e/claude-effort.spec.ts')
      continue
    }
    // Packaging inputs only shape the electron-builder output. Local checks never launch Electron and automatic CI
    // never packages, so only a manual package (or full) CI run covers them; runPlan says so.
    if (file === `${desktop}electron-builder.yml` || file === `${desktop}scripts/after-pack.cjs`) {
      packaging.push(file)
      continue
    }
    if (file === `${desktop}electron.vite.config.ts`) {
      const change = configChange(file, comparison)
      if (!change) { unknown.push(file); continue }
      types.add('node'); types.add('web')
      if (change === 'workbench-package') addPackageTests()
      else {
        requireTests(['src/main/security/policy.test.ts', 'src/main/security/hardening.test.ts'])
        addDomainE2e('workbench')
        e2e.add('e2e/runtime-tools.spec.ts')
        // CSP affects renderer Shell styles and web preview isolation, not quit cleanup.
        e2eFilters['e2e/runtime-tools.spec.ts'] = 'FR-TOOL-003|FR-TOOL-004'
      }
      e2e.add('e2e/app.spec.ts')
      continue
    }
    if (file.startsWith(`${desktop}build/workbenches/`) || file.startsWith(`${desktop}build/workbench-common/`) ||
      /^apps\/desktop\/scripts\/build-workbench-packages\.(?:mjs|d\.mts)$/.test(file) ||
      workbenchConfigs.has(file) || (file === `${desktop}vitest.config.ts` && configChange(file, comparison) === 'workbench-package')) {
      // Static webpage packages and their build/config inputs are consumed outside Vitest's import graph.
      if (file.endsWith('.css')) addDomainE2e('workbench')
      else {
        types.add('node'); types.add('web')
        addPackageTests()
        if (file.startsWith(`${desktop}build/workbenches/product-selection/`)) requireTests(['src/main/services/workbench/selection-model.test.ts', 'src/main/services/workbench/agents.test.ts'])
      }
      continue
    }
    if (file.startsWith(`${desktop}e2e/`)) {
      types.add('e2e')
      if (file.endsWith('.spec.ts') && available.includes(file)) addE2e(file)
      else if (!file.endsWith('.spec.ts') && available.includes(file)) {
        // Support modules (launch, quit, fixtures) run every spec that imports them. A deleted one needs only the
        // type check, which catches a spec still importing it.
        const name = file.slice(`${desktop}e2e/`.length).replace(/\.ts$/, '')
        const importers = specs.filter(spec => source(spec).includes(`from './${name}'`))
        if (importers.length) importers.forEach(addE2e)
        else unknown.push(file)
      }
      continue
    }
    // The Playwright config shapes every E2E run (retries, reporters, output), so every spec runs.
    if (file === `${desktop}playwright.config.ts`) {
      types.add('e2e')
      specs.forEach(addE2e)
      continue
    }
    if (file.startsWith(`${desktop}src/`) && /\.(?:[cm]?[jt]sx?|css|html|json)$/.test(file)) {
      const relative = file.slice(desktop.length)
      const domain = domainFor(relative)
      if (relative.endsWith('.css') || relative.endsWith('.html')) {
        if (domain) addDomainE2e(domain)
        else if (/^src\/renderer\/(index\.html|src\/(app|styles|features\/tools)\/)/.test(relative)) {
          e2e.add('e2e/app.spec.ts'); e2e.add('e2e/alignment.spec.ts')
          if (relative.startsWith('src/renderer/src/features/tools/')) {
            e2e.add('e2e/runtime-tools.spec.ts')
            e2eFilters['e2e/runtime-tools.spec.ts'] = 'FR-TOOL-003|FR-TOOL-004'
          }
        } else unknown.push(file)
        continue
      }
      if (relative.startsWith('src/renderer/')) types.add('web')
      else if (relative.startsWith('src/shared/')) { types.add('node'); types.add('web') }
      else types.add('node')
      if (available.includes(file) && /\.(?:[cm]?[jt]sx?|json)$/.test(file)) seeds.desktop.add(file)
      if (unit.test(file) && available.includes(file)) continue
      if (domain) {
        addDomainE2e(domain)
        // Deleted paths cannot appear in the current import graph. IPC bridges
        // use generated APIs and mocks, so explicitly cover both sides.
        if (!available.includes(file) || /^src\/(shared\/ipc|main\/ipc)\//.test(relative) ||
          /^src\/shared\/.*\/types\.ts$/.test(relative)) {
          if (!addDomainTests(domain) && !available.includes(file)) unknown.push(file)
        }
        if (/^src\/(shared\/ipc|main\/ipc)\//.test(relative)) {
          addTests('desktop', test => /src\/(preload|shared\/ipc)\/.*\.test\.ts$/.test(test))
        }
      } else if (/^src\/(preload\/|shared\/ipc\/|main\/(ipc\/|index\.ts|security\/|window\/|launch-options|shutdown|menu\/)|renderer\/(index\.html|src\/(app\/|lib\/|styles\/|main\.tsx|env\.d\.ts|features\/tools\/[^/]+\.(?:ts|tsx|css)$)))/.test(relative)) {
        // Shared shell/bridge: smoke + layout, not every feature's E2E.
        e2e.add('e2e/app.spec.ts'); e2e.add('e2e/alignment.spec.ts')
        if (!available.includes(file) || /^src\/(preload\/|shared\/ipc\/|main\/(ipc\/|index\.ts))/.test(relative)) {
          const count = addTests('desktop', test => /src\/(preload|shared\/ipc|main\/(ipc|security|window))\/.*\.test\.ts$/.test(test) || test.endsWith('/features/project/shell.test.tsx'))
          if (!count && !available.includes(file)) unknown.push(file)
        }
        if (relative.startsWith('src/renderer/src/features/tools/')) {
          e2e.add('e2e/runtime-tools.spec.ts')
          fullE2e.add('e2e/runtime-tools.spec.ts')
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
    if (!selected.length) {
      unknown.push(...seeds[group])
      return
    }
    add(...(pkg ? ['--filter', pkg, 'exec'] : ['exec']), 'vitest', 'related',
      ...selected.map(file => file.slice(prefix.length)), '--run', '--no-passWithNoTests',
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
  // Merge requirements, not path prefixes: test-only and unrelated module edits
  // must not turn another change's focused scenarios into an entire E2E suite.
  for (const file of fullE2e) delete e2eFilters[file]
  missingTests.push(...selectedE2e.filter(file => !available.includes(`${desktop}${file}`)))
  return { files, commands, e2e: selectedE2e, e2eFilters, unknown, missingTests: [...new Set(missingTests)], packaging }
}

export function runPlan(plan, { ci = false, cwd = process.cwd(), run = spawnSync } = {}) {
  console.log(JSON.stringify(plan, null, 2))
  if (plan.unknown.length) {
    console.error(`No reliable affected scope for: ${plan.unknown.join(', ')}. Add a reviewed mapping in scripts/check-affected.mjs with focused regression tests; full checks are never an automatic fallback.`)
    return 1
  }
  if (plan.missingTests.length) {
    console.error(`Selected tests are missing: ${plan.missingTests.join(', ')}. Update the module mapping; do not silently drop coverage.`)
    return 1
  }
  if (plan.packaging?.length) {
    console.log(`Packaging inputs changed (${plan.packaging.join(', ')}): no local or affected check covers them. Before integrating, run \`node scripts/vm-ci.mjs --scope package\` (build, package and packaged smoke); the integration command requires a passing package or full run.`)
  }
  const commands = [...plan.commands]
  if (ci && plan.e2e.length) {
    commands.push(['--filter', '@ai-studio/desktop', 'run', 'build'])
    const full = plan.e2e.filter(file => !plan.e2eFilters[file])
    if (full.length) commands.push(['--filter', '@ai-studio/desktop', 'run', 'test:e2e:built', ...full])
    for (const file of plan.e2e.filter(file => plan.e2eFilters[file])) {
      commands.push(['--filter', '@ai-studio/desktop', 'run', 'test:e2e:built', file, '--grep', plan.e2eFilters[file]])
    }
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
  const plan = affectedPlan(files, available, { base, head })
  if (args.includes('--dry-run')) {
    console.log(JSON.stringify(plan, null, 2))
    process.exitCode = plan.unknown.length || plan.missingTests.length ? 1 : 0
  } else process.exitCode = runPlan(plan, { ci: args.includes('--ci') })
}
