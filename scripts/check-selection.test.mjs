import { expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { affectedPlan, inventory } from './check-affected.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const desktop = 'apps/desktop/'

test('real related command fails empty selection and executes only importing tests', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'affected-related-'))
  try {
    mkdirSync(join(cwd, 'scripts'))
    symlinkSync(join(root, 'node_modules'), join(cwd, 'node_modules'), 'dir')
    const source = 'scripts/check-example.mjs'
    writeFileSync(join(cwd, source), 'export const value = 42')
    writeFileSync(join(cwd, 'scripts/vitest.config.mjs'), "export default { test: { include: ['scripts/**/*.test.mjs'] } }")
    const plan = affectedPlan([source], [source])
    const command = plan.commands.find(args => args.includes('vitest'))
    const run = () => spawnSync(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'),
      ...command.slice(command.indexOf('vitest') + 1)], { cwd, encoding: 'utf8', timeout: 15000 })
    const empty = run()
    expect(empty.error).toBeUndefined()
    expect(empty.status).toBe(1)
    expect(empty.stdout + empty.stderr).toContain('No test files found')

    writeFileSync(join(cwd, 'scripts/example.test.mjs'),
      "import { test, expect } from 'vitest'; import { value } from './check-example.mjs'; test('value', () => expect(value).toBe(42))")
    writeFileSync(join(cwd, 'scripts/unrelated.test.mjs'),
      "import { test } from 'vitest'; test('must not run', () => { throw new Error('Unrelated test executed') })")
    const selected = run()
    expect(selected.error).toBeUndefined()
    expect(selected.status, selected.stdout + selected.stderr).toBe(0)
    expect(selected.stdout).toMatch(/1 passed/)
    expect(selected.stdout + selected.stderr).not.toContain('Unrelated test executed')
  } finally { rmSync(cwd, { recursive: true, force: true }) }
}, 20000)

test('actual desktop dependency graph keeps leaf changes focused and IPC consumers covered', () => {
  // Desktop resolves the adapter through dist. A fresh checkout must build it
  // before Vite can inspect imports, even though no application tests execute.
  const build = spawnSync('pnpm', ['--filter', '@ai-studio/agent-adapter', 'run', 'build'],
    { cwd: root, encoding: 'utf8', timeout: 15000 })
  expect(build.error).toBeUndefined()
  expect(build.status, build.stderr).toBe(0)
  const available = inventory(root)
  const paths = {
    title: 'src/renderer/src/features/workbench/use-view-title.ts',
    input: 'src/renderer/src/features/input/Composer.tsx',
    ipc: 'src/shared/ipc/workbench.ts',
    package: 'build/workbench-common/page.js',
    testOnly: 'src/renderer/src/features/workbench/navigation.test.tsx'
  }
  const seeds = Object.fromEntries(Object.entries(paths).map(([name, path]) => {
    const plan = affectedPlan([desktop + path], available)
    expect(plan.unknown).toEqual([])
    expect(plan.missingTests).toEqual([])
    const command = plan.commands.find(args => args.includes('related'))
    return [name, command.slice(command.indexOf('related') + 1, command.indexOf('--run'))]
  }))
  // Ask Vitest for its actual selection; never import or execute application tests.
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { createVitest } from 'vitest/node'
    import { resolve } from 'node:path'
    const root = resolve('apps/desktop')
    const ctx = await createVitest({ root, watch: false, run: true })
    try {
      const selected = {}
      for (const [name, seeds] of Object.entries(${JSON.stringify(seeds)})) {
        ctx.config.related = seeds.map(file => resolve(root, file))
        selected[name] = (await ctx.getRelevantTestSpecifications()).map(spec => spec.moduleId.slice(root.length + 1)).sort()
      }
      const scripts = await createVitest({ root: process.cwd(), config: resolve('scripts/vitest.config.mjs'),
        watch: false, run: true, related: ['scripts/integrate-branch.mjs'] })
      try {
        selected.integration = (await scripts.getRelevantTestSpecifications()).map(spec => spec.moduleId.slice(process.cwd().length + 1)).sort()
      } finally { await scripts.close() }
      console.log('SELECTED:' + JSON.stringify(selected))
    } finally { await ctx.close() }
  `], { cwd: root, encoding: 'utf8', timeout: 20000 })
  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr.slice(0, 1500)).toBe(0)
  const selected = JSON.parse(result.stdout.split('\n').find(line => line.startsWith('SELECTED:')).slice(9))
  expect(selected.title).toEqual([
    'src/renderer/src/features/input/file-references.test.tsx',
    'src/renderer/src/features/project/shell.test.tsx',
    'src/renderer/src/features/session/session.test.tsx',
    'src/renderer/src/features/workbench/lifecycle.test.tsx'
  ])
  expect(selected.input).toContain('src/renderer/src/features/input/file-references.test.tsx')
  expect(selected.testOnly).toEqual([paths.testOnly])
  expect(selected.integration).toEqual(['scripts/integrate-branch.test.mjs'])
  expect(selected.ipc).toEqual(expect.arrayContaining([
    'src/main/services/workbench/ipc.test.ts',
    'src/renderer/src/features/workbench/workbench.test.tsx',
    'src/preload/bridge.test.ts', 'src/shared/ipc/contract.test.ts'
  ]))
  expect(selected.package).toEqual([
    'src/main/services/workbench/package-runtime.test.ts',
    'src/main/services/workbench/workbench-service.test.ts',
    'src/renderer/src/features/workbench/portable-pages.test.ts'
  ])
  for (const tests of Object.values(selected)) expect(tests.join('\n')).not.toMatch(/terminal|browser|settings/)
}, 25000)

test('CSP runtime grep lists the two relevant scenarios without quit cleanup', () => {
  const result = spawnSync('pnpm', ['--filter', '@ai-studio/desktop', 'exec', 'playwright', 'test',
    'e2e/runtime-tools.spec.ts', '--grep', 'FR-TOOL-003|FR-TOOL-004', '--list'],
  { cwd: root, encoding: 'utf8', timeout: 15000 })
  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('Total: 2 tests in 1 file')
  expect(result.stdout).toContain('FR-TOOL-003')
  expect(result.stdout).toContain('FR-TOOL-004')
  expect(result.stdout).not.toContain('Terminal-only/mixed quit')
}, 20000)
