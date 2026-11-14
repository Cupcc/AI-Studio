import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { affectedPlan, buildConfigChange, packageVersionOnlyChange, runPlan, workbenchPackageIncludeChange } from './check-affected.mjs'

const d = 'apps/desktop/'
const a = 'packages/agent-adapter/'
const available = [
  'scripts/check-affected.mjs', 'scripts/check-affected.test.mjs', 'scripts/check-workflow.test.mjs',
  '.codex/scripts/agent-docs-hook.test.mjs',
  `${d}src/renderer/src/features/input/Composer.tsx`,
  `${d}src/renderer/src/features/navigation/Navigation.tsx`,
  `${d}src/shared/workbench/resources/template.ts`,
  `${d}src/renderer/src/features/input/file-references.test.tsx`,
  `${d}src/renderer/src/features/tools/files/files-store.test.ts`,
  `${d}src/main/services/files/references.test.ts`,
  `${d}src/main/services/session/service.test.ts`,
  `${d}src/main/services/workbench/workbench-service.test.ts`,
  `${d}src/main/services/workbench/package-runtime.test.ts`,
  `${d}src/main/services/workbench/selection-model.test.ts`,
  `${d}src/main/services/workbench/agents.test.ts`,
  `${d}src/renderer/src/features/workbench/portable-pages.test.ts`,
  `${d}src/shared/project-view/schema.test.ts`,
  `${d}src/renderer/src/features/workbench/workbench.test.tsx`,
  `${d}src/renderer/src/features/workbench/page-bridge.test.ts`,
  `${d}src/main/security/hardening.test.ts`,
  `${d}src/main/security/policy.test.ts`,
  `${d}electron.vite.config.ts`,
  `${d}src/preload/bridge.test.ts`, `${d}src/shared/ipc/contract.test.ts`,
  `${d}src/renderer/src/features/session/session.test.tsx`,
  `${d}src/renderer/src/features/tools/terminal-panel.test.tsx`,
  `${d}src/renderer/src/features/settings/settings.test.tsx`,
  `${d}src/renderer/src/features/app-info/app-info.test.tsx`,
  `${d}src/main/services/updates/update-service.test.ts`,
  ...['files', 'session', 'cli-default', 'composer', 'app', 'alignment', 'runtime-tools', 'settings',
    'project', 'project-view', 'workbench', 'product-selection', 'diff', 'turn-diff', 'vscode-parity', 'claude-effort'].map(name => `${d}e2e/${name}.spec.ts`),
  `${a}src/codex/driver.ts`, `${a}test/codex/driver.test.ts`,
  `${a}test/claude/driver.test.ts`, `${a}test/codex/real.integration.test.ts`
]
const plan = files => affectedPlan(files, available, { base: 'missing-test-baseline' })
const commandText = value => value.commands.flat().join(' ')

beforeEach(() => {
  for (const name of Object.keys(process.env)) if (name.startsWith('GIT_')) vi.stubEnv(name, undefined)
  // runPlan's injected runners simulate commands; do not report them as real CI executions.
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

test('docs, evidence and empty diff do not run application checks', () => {
  for (const files of [[], ['README.md'], ['docs/08. System Architecture.html'], ['tasks/T-example/evidence/check.mjs'],
    ['.ignore'], ['.gitignore'], ['.agents/archive/tasks/T-example/task.md'],
    ['.agents/archive/tasks/T-example/evidence/check.mjs'],
    ['tasks/archive/.gitkeep', '.agents/archive/tasks/.gitkeep']]) {
    expect(plan(files)).toMatchObject({ commands: [], e2e: [], unknown: [] })
  }
})
test('agent rule documents run no application checks', () => {
  expect(plan(['.agents/rules/design.md'])).toMatchObject({ commands: [], e2e: [], unknown: [] })
})
test('Claude Code skills, subagents and settings run no application checks', () => {
  expect(plan(['.claude/skills/impeccable/SKILL.md', '.claude/skills/impeccable/scripts/live-browser.js',
    '.claude/agents/impeccable-documenter.md', '.claude/settings.json'])).toMatchObject({ commands: [], e2e: [], unknown: [] })
  for (const file of ['.claude/settings.local.json', '.claude/agents/nested/role.md', '.claude/commands/run.mjs']) {
    expect(plan([file]).unknown).toEqual([file])
  }
})
test('input selects related module, not terminal/settings/adapter suites', () => {
  const result = plan([`${d}src/renderer/src/features/input/Composer.tsx`])
  expect(result.unknown).toEqual([])
  expect(commandText(result)).toContain('related src/renderer/src/features/input/Composer.tsx --run')
  expect(commandText(result)).toContain('tsconfig.web.json')
  expect(commandText(result)).not.toMatch(/terminal-panel|settings.test|tsconfig.node|check:code| run test /)
  expect(result.e2e).toEqual(['e2e/cli-default.spec.ts', 'e2e/composer.spec.ts', 'e2e/files.spec.ts'])
})
test('project agent definitions do not run app checks or exempt other Codex files', () => {
  expect(plan(['.codex/agents/reviewer.toml', '.codex/agents/README.md']))
    .toMatchObject({ commands: [], e2e: [], unknown: [] })
  for (const file of ['.codex/config.toml', '.codex/agents/run.mjs', '.codex/agents/nested/role.toml']) {
    expect(plan([file]).unknown).toEqual([file])
  }
  expect(commandText(plan(['.codex/hooks.json']))).toContain('vitest')
})
test('IPC files seam includes main, renderer, input and preload tests', () => {
  const result = plan([`${d}src/shared/ipc/files.ts`])
  expect(commandText(result)).toMatch(/references.test.ts/)
  expect(commandText(result)).toContain('files-store.test.ts')
  expect(commandText(result)).toContain('bridge.test.ts')
  expect(commandText(result)).toContain('file-references.test.tsx')
  expect(commandText(result)).toContain('tsconfig.node.json')
  expect(commandText(result)).toContain('tsconfig.web.json')
})
test('deleted and renamed source retain both module seams', () => {
  const result = plan([`${d}src/main/services/files/removed.ts`, `${d}src/main/services/session/new.ts`])
  expect(commandText(result)).toContain('references.test.ts')
  expect(commandText(result)).toContain('service.test.ts')
  expect(commandText(result)).not.toContain('removed.ts')
  expect(result.e2e).toContain('e2e/session.spec.ts')
})
test('deleted source with no remaining module tests blocks even alongside another change', () => {
  const deleted = `${d}src/renderer/src/features/navigation/removed.ts`
  const result = plan([deleted, `${d}src/renderer/src/features/input/Composer.tsx`])
  expect(result.unknown).toContain(deleted)
  const run = vi.fn()
  expect(runPlan(result, { run })).toBe(1)
  expect(run).not.toHaveBeenCalled()
  const script = 'scripts/check-deleted.mjs'
  expect(affectedPlan([script], []).unknown).toContain(script)
  const adapterFile = `${a}src/core/deleted.ts`
  expect(affectedPlan([adapterFile], []).unknown).toContain(adapterFile)
  const shared = `${d}src/renderer/src/lib/deleted.ts`
  expect(affectedPlan([shared], []).unknown).toContain(shared)
})
test('adapter provider updates cover dist consumers, not unrelated provider suite', () => {
  const result = plan([`${a}src/codex/driver.ts`])
  expect(commandText(result)).toContain('related src/codex/driver.ts --run')
  expect(commandText(result)).toContain('features/session/session.test.tsx')
  expect(commandText(result)).not.toMatch(/test\/claude|real.integration.test/)
})
test('unit-test-only edits do not select E2E; E2E-only selects exact spec', () => {
  expect(plan([`${d}src/preload/bridge.test.ts`]).e2e).toEqual([])
  const result = plan([`${d}e2e/files.spec.ts`])
  expect(result.e2e).toEqual(['e2e/files.spec.ts'])
  expect(commandText(result)).not.toContain('vitest')
})
test('unknown/global config blocks before any commands, never falls back to full', () => {
  const run = vi.fn()
  for (const file of ['pnpm-lock.yaml', 'package.json', `${d}package.json`, 'unknown.ts']) {
    expect(runPlan(plan([file]), { run })).toBe(1)
  }
  // An E2E support module that no spec imports has no consumer to run.
  const unused = `${d}e2e/fixture.ts`
  expect(runPlan(affectedPlan([unused], [...available, unused], { base: 'missing-test-baseline' }), { run })).toBe(1)
  expect(run).not.toHaveBeenCalled()
})
test('E2E support modules select the specs that import them; the Playwright config selects every spec', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'studio-e2e-support-'))
  mkdirSync(join(cwd, `${d}e2e`), { recursive: true })
  writeFileSync(join(cwd, `${d}e2e/files.spec.ts`), "import { launchElectron } from './harness'\n")
  writeFileSync(join(cwd, `${d}e2e/diff.spec.ts`), "import { closeTestApp } from './quit'\n")
  const support = [`${d}e2e/harness.ts`, `${d}e2e/quit.ts`]
  try {
    const helper = affectedPlan([`${d}e2e/harness.ts`], [...available, ...support], { cwd })
    expect(helper).toMatchObject({ e2e: ['e2e/files.spec.ts'], unknown: [] })
    expect(commandText(helper)).toContain('tsconfig.e2e.json')
    // Deleting a support module leaves only the type check, which catches a spec that still imports it.
    expect(affectedPlan([`${d}e2e/old-helper.ts`], available, { cwd })).toMatchObject({ e2e: [], unknown: [] })
    const config = affectedPlan([`${d}playwright.config.ts`], available, { cwd })
    expect(config.unknown).toEqual([])
    expect(config.e2e).toEqual(available.filter(file => file.startsWith(`${d}e2e/`)).map(file => file.slice(d.length)).sort())
    expect(config.e2eFilters).toEqual({})
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})
test('local checks never run Electron; CI builds once then passes explicit specs', () => {
  const run = vi.fn(() => ({ status: 0 }))
  const result = plan([`${d}e2e/files.spec.ts`])
  expect(runPlan(result, { run })).toBe(0)
  expect(run.mock.calls.flat(2).join(' ')).not.toContain('test:e2e')
  run.mockClear()
  expect(runPlan(result, { run, ci: true })).toBe(0)
  expect(run.mock.calls.at(-1)[1]).toEqual(['--filter', '@ai-studio/desktop', 'run', 'test:e2e:built', 'e2e/files.spec.ts'])
  expect(run.mock.calls.filter(([, args]) => args.includes('build') && args.includes('@ai-studio/desktop'))).toHaveLength(1)
})
test('failed checks stop immediately and propagate status', () => {
  const run = vi.fn(() => ({ status: 7 }))
  expect(runPlan(plan([`${a}src/codex/driver.ts`]), { run, ci: true })).toBe(7)
  expect(run).toHaveBeenCalledTimes(1)
})
test('deleted or renamed selected E2E blocks instead of silently losing coverage', () => {
  const run = vi.fn()
  const result = affectedPlan([`${d}src/shared/ipc/files.ts`, `${d}e2e/files.spec.ts`],
    available.filter(file => file !== `${d}e2e/files.spec.ts`))
  expect(result.missingTests).toEqual(['e2e/files.spec.ts'])
  expect(runPlan(result, { run, ci: true })).toBe(1)
  expect(run).not.toHaveBeenCalled()
})
test('unit selection must find tests; no green pass for an empty selection', () => {
  expect(commandText(plan(['scripts/check-affected.mjs']))).toContain('--no-passWithNoTests')
})
// Only manual runs can select the full or e2e mode; push and PR scopes are always affected (check-workflow.test.mjs).
test('automatic workflow cannot run full checks, requested specs or package', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const steps = workflow.split(/\n      - name:/).slice(1)
  for (const step of steps) {
    if (/run: pnpm (check:code|smoke:packaged)|run: pnpm --filter @ai-studio\/desktop run (test:e2e:built|package:built)/.test(step)) {
      expect(step).toContain("if: needs.scope.outputs.mode == 'full'")
    }
  }
  expect(steps.find(step => step.includes('test:e2e:built "${args[@]}"'))).toContain("if: needs.scope.outputs.mode == 'e2e'")
  expect(workflow).toContain('node scripts/check-affected.mjs --base "$CHECK_BASE" --head HEAD --ci')
})


test('workbench IPC selects its host, UI, bridge and focused E2E', () => {
  const result = plan([`${d}src/shared/ipc/workbench.ts`])
  expect(result.unknown).toEqual([])
  expect(commandText(result)).toContain('workbench-service.test.ts')
  expect(commandText(result)).toContain('workbench.test.tsx')
  expect(commandText(result)).toContain('src/shared/project-view/schema.test.ts')
  expect(commandText(result)).toContain('bridge.test.ts')
  expect(result.e2e).toEqual(['e2e/product-selection.spec.ts', 'e2e/project-view.spec.ts', 'e2e/workbench.spec.ts'])
})
test('plugin assets and navigation keep the workbench regression selected', () => {
  for (const path of ['src/shared/workbench/resources/template.ts', 'src/renderer/src/features/navigation/Navigation.tsx']) {
    const result = plan([`${d}${path}`])
    expect(result.unknown).toEqual([])
    expect(result.e2e).toContain('e2e/workbench.spec.ts')
  }
})
test('packaging inputs run nothing locally or in affected CI and require the manual package mode', () => {
  const run = vi.fn(() => ({ status: 0 }))
  const builder = `${d}electron-builder.yml`
  const only = plan([builder, `${d}scripts/after-pack.cjs`])
  expect(only).toMatchObject({ commands: [], e2e: [], unknown: [], packaging: [builder, `${d}scripts/after-pack.cjs`] })
  expect(runPlan(only, { run, ci: true })).toBe(0)
  expect(run).not.toHaveBeenCalled()
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('node scripts/vm-ci.mjs --scope package'))
  const mixed = plan([builder, `${d}src/renderer/src/features/settings/settings.test.tsx`])
  expect(mixed.packaging).toEqual([builder])
  expect(commandText(mixed)).toContain('settings.test.tsx')
  expect(commandText(mixed)).not.toMatch(/package|smoke/)
})

test('a version-only package.json change selects the app smoke spec and the manual package mode', () => {
  const before = JSON.stringify({ name: 'x', version: '1.0.0', scripts: { build: 'a' } })
  expect(packageVersionOnlyChange(before, before.replace('1.0.0', '1.1.0'))).toBe(true)
  expect(packageVersionOnlyChange(before, before)).toBe(false)
  expect(packageVersionOnlyChange(before, before.replace('1.0.0', '1.1.0').replace('"a"', '"b"'))).toBe(false)
  expect(packageVersionOnlyChange(before, 'not json')).toBe(false)
  // Without a readable baseline the file stays unmapped instead of guessing.
  expect(plan([`${d}package.json`]).unknown).toEqual([`${d}package.json`])
})

test('unknown desktop config changes and missing baselines block', () => {
  for (const file of [`${d}electron.vite.config.ts`, `${d}vitest.config.ts`]) {
    expect(plan([file]).unknown).toEqual([file])
  }
})

test('standard webpage package assets select their host, SDK and iframe regression consumers', () => {
  for (const file of ['build/workbenches/overview/manifest.json', 'build/workbench-common/page.js', 'scripts/build-workbench-packages.mjs']) {
    const result = plan([`${d}${file}`])
    expect(result.unknown).toEqual([])
    expect(result.e2e).toEqual(['e2e/product-selection.spec.ts', 'e2e/project-view.spec.ts', 'e2e/workbench.spec.ts'])
    expect(commandText(result)).toContain('workbench-service.test.ts')
    expect(commandText(result)).toContain('portable-pages.test.ts')
    expect(commandText(result)).not.toMatch(/terminal|session|navigation.test/)
  }
})

test('styles select UI regression without backend tests, builds or typechecks', () => {
  for (const file of ['src/renderer/src/features/workbench/workbench.css', 'build/workbench-common/style.css']) {
    expect(plan([`${d}${file}`])).toMatchObject({
      commands: [], e2e: ['e2e/product-selection.spec.ts', 'e2e/project-view.spec.ts', 'e2e/workbench.spec.ts'], unknown: [], missingTests: []
    })
  }
  expect(plan([`${d}src/renderer/src/features/tools/tools.css`])).toMatchObject({
    commands: [], e2e: ['e2e/alignment.spec.ts', 'e2e/app.spec.ts', 'e2e/runtime-tools.spec.ts'],
    e2eFilters: { 'e2e/runtime-tools.spec.ts': 'FR-TOOL-003|FR-TOOL-004' }, unknown: []
  })
})

test('renderer library leaves do not seed unrelated IPC and backend tests', () => {
  const file = `${d}src/renderer/src/lib/example.ts`
  const result = affectedPlan([file], [...available, file])
  expect(result.unknown).toEqual([])
  expect(commandText(result)).toContain('related src/renderer/src/lib/example.ts --run')
  expect(commandText(result)).not.toMatch(/\.test\.|tsconfig.node/)
})

test('mapped package consumers cannot silently disappear', () => {
  const missing = `${d}src/renderer/src/features/workbench/portable-pages.test.ts`
  const result = affectedPlan([`${d}build/workbench-common/page.js`], available.filter(file => file !== missing))
  expect(result.missingTests).toEqual([missing])
  const run = vi.fn()
  expect(runPlan(result, { run })).toBe(1)
  expect(run).not.toHaveBeenCalled()
})

const config = readFileSync(new URL('../apps/desktop/electron.vite.config.ts', import.meta.url), 'utf8')
const withoutPackage = config.replace("import { buildWorkbenchPackages } from './scripts/build-workbench-packages.mjs'\n", '')
  .replace('buildWorkbenchPackages()\n', '')
const cspChange = config.replace("frame-src app://workbench", "frame-src 'none'")

test('classifies exact package wiring and CSP changes, rejects unrelated or mixed edits', () => {
  expect(buildConfigChange(withoutPackage, config)).toBe('workbench-package')
  expect(buildConfigChange(config, withoutPackage)).toBe('workbench-package')
  expect(buildConfigChange(config, cspChange)).toBe('csp')
  expect(buildConfigChange(config, config)).toBeNull()
  expect(buildConfigChange(withoutPackage, config.replace('plugins: [react()', 'plugins: [unknown()'))).toBeNull()
  expect(buildConfigChange(withoutPackage, cspChange)).toBeNull()
})

test('classifies the build metadata define alone and selects the About checks', () => {
  const withoutBuildInfo = config.replace("import { execFileSync } from 'node:child_process'\n", '')
    .replace(/^\/\*\* Shown in Settings › 关于[^\n]*\nfunction buildInfo\(\)[\s\S]*?^\}\n\n/m, '')
    .replace("    define: { __STUDIO_BUILD__: JSON.stringify(buildInfo()) },\n", '')
  expect(withoutBuildInfo).not.toContain('buildInfo')
  expect(buildConfigChange(withoutBuildInfo, config)).toBe('build-info')
  expect(buildConfigChange(withoutBuildInfo, config.replace('JSON.stringify(buildInfo())', 'JSON.stringify({})'))).toBeNull()
  expect(buildConfigChange(withoutBuildInfo, cspChange)).toBeNull()
})

test('update service, About assets and build metadata select the settings and app checks', () => {
  expect(plan([`${d}src/main/services/updates/installer.ts`])).toMatchObject({ e2e: ['e2e/settings.spec.ts'], unknown: [] })
  expect(plan([`${d}src/renderer/src/assets/app-icon.png`])).toMatchObject({ commands: [], e2e: ['e2e/app.spec.ts', 'e2e/settings.spec.ts'], unknown: [] })
  const buildInfo = plan([`${d}src/main/build-info.ts`])
  expect(buildInfo).toMatchObject({ e2e: ['e2e/alignment.spec.ts', 'e2e/app.spec.ts'], unknown: [] })
  expect(commandText(buildInfo)).toContain('tsconfig.node.json')
})

test('config scope reads Git index, committed snapshots and working tree independently', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'scope-config-'))
  const file = `${d}electron.vite.config.ts`
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))
  const git = args => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  try {
    git(['init', '-q'])
    mkdirSync(join(cwd, d), { recursive: true })
    writeFileSync(join(cwd, file), withoutPackage)
    git(['add', '.'])
    const base = git(['write-tree'])
    writeFileSync(join(cwd, file), config)
    git(['add', '.'])
    const head = git(['write-tree'])
    writeFileSync(join(cwd, file), config.replace('plugins: [react()', 'plugins: [unknown()'))
    const result = affectedPlan([file], available, { cwd, base, head })
    expect(result.unknown).toEqual([])
    expect(result.e2e).toEqual(['e2e/app.spec.ts', 'e2e/product-selection.spec.ts', 'e2e/project-view.spec.ts', 'e2e/workbench.spec.ts'])
    expect(commandText(result)).not.toContain('terminal')
    expect(affectedPlan([file], available, { cwd, base }).unknown).toEqual([file])

    writeFileSync(join(cwd, file), cspChange)
    const csp = affectedPlan([file], available, { cwd, base: head })
    expect(csp.unknown).toEqual([])
    expect(csp.e2eFilters).toEqual({ 'e2e/runtime-tools.spec.ts': 'FR-TOOL-003|FR-TOOL-004' })
    const run = vi.fn(() => ({ status: 0 }))
    expect(runPlan(csp, { ci: true, run })).toBe(0)
    expect(run.mock.calls.at(-1)[1]).toEqual(['--filter', '@ai-studio/desktop', 'run', 'test:e2e:built',
      'e2e/runtime-tools.spec.ts', '--grep', 'FR-TOOL-003|FR-TOOL-004'])
    expect(run.mock.calls.filter(([, args]) => args.includes('@ai-studio/desktop') && args.includes('build'))).toHaveLength(1)
    const combined = affectedPlan([file, `${d}e2e/runtime-tools.spec.ts`], available, { cwd, base: head })
    expect(combined.e2eFilters).toEqual({})
    const styles = `${d}src/renderer/src/features/tools/tools.css`
    expect(affectedPlan([file, styles], available, { cwd, base: head }).e2eFilters).toEqual(csp.e2eFilters)
    for (const runtime of ['src/main/services/terminal/service.ts', 'src/renderer/src/features/tools/TerminalPanel.tsx']) {
      expect(affectedPlan([file, styles, `${d}${runtime}`], available, { cwd, base: head }).e2eFilters).toEqual({})
    }
    for (const unrelated of ['src/renderer/src/features/tools/terminal-font.test.ts',
      'src/renderer/src/features/tools/diff/diff-format.test.ts', 'src/renderer/src/features/tools/diff/diff-format.ts']) {
      const changed = `${d}${unrelated}`
      expect(affectedPlan([file, styles, changed], [...available, changed], { cwd, base: head }).e2eFilters).toEqual(csp.e2eFilters)
    }
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test('only the known package JSON include change is mapped, unrelated compiler edits stay unknown', () => {
  const prior = { compilerOptions: { composite: true }, include: ['src/shared/**/*'] }
  const next = { ...prior, include: [...prior.include, 'build/workbenches/**/*.json'] }
  expect(workbenchPackageIncludeChange(JSON.stringify(prior), JSON.stringify(next))).toBe(true)
  expect(workbenchPackageIncludeChange(JSON.stringify(prior), JSON.stringify({ ...next, compilerOptions: { composite: false } }))).toBe(false)
  expect(workbenchPackageIncludeChange(JSON.stringify(prior), JSON.stringify({ ...next, include: [...next.include, 'other/**/*'] }))).toBe(false)
})

test('classifies removed templates only when their owning replacement exists', () => {
  for (const name of ['acceptance', 'plan', 'report', 'spec', 'task']) {
    const old = `templates/${name}.md`
    const next = `${name === 'spec' ? 'specs' : 'tasks'}/templates/${name}.md`
    expect(affectedPlan([old, next], [...available, next]).unknown).toEqual([])
    expect(affectedPlan([old], available).unknown).toEqual([old])
    expect(affectedPlan([old], [...available, old, next]).unknown).toEqual([old])
  }
})

test.each([
  ['integration command', ['scripts/integrate-branch.mjs', 'scripts/integrate-branch.test.mjs']],
  ['remote CI command', ['scripts/remote-ci.mjs', 'scripts/remote-ci.test.mjs']],
  ['local VM CI command', ['scripts/vm-ci.mjs', 'scripts/vm-ci.test.mjs']],
  ['local VM UI check command', ['scripts/vm-ui.mjs', 'scripts/vm-ui.test.mjs']],
  ['task overview command', ['scripts/tasks.mjs', 'scripts/tasks.test.mjs']],
  ['acceptance checklist command', ['scripts/acceptance.mjs', 'scripts/acceptance.test.mjs']]
])('%s and its tests run script checks without application suites', (_name, files) => {
  for (const file of files) {
    const result = affectedPlan([file], [...available, ...files])
    expect(result.unknown).toEqual([])
    expect(commandText(result)).toContain(`related ${file} --run`)
    expect(commandText(result)).not.toContain('scripts/check-workflow.test.mjs')
    expect(commandText(result)).not.toContain('@ai-studio/desktop')
    expect(result.e2e).toEqual([])
  }
})


test('selection business assets include their directly read model and actual Session seam', () => {
  const result = plan([`${d}build/workbenches/product-selection/model.js`])
  expect(result.missingTests).toEqual([])
  expect(commandText(result)).toContain('selection-model.test.ts')
  expect(commandText(result)).toContain('agents.test.ts')
  expect(result.e2e).toContain('e2e/product-selection.spec.ts')
  expect(commandText(plan([`${d}build/workbenches/product-selection/selection.css`]))).toBe('')
})
