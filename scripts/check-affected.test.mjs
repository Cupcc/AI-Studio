import { expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { affectedPlan, runPlan } from './check-affected.mjs'

const d = 'apps/desktop/'
const a = 'packages/agent-adapter/'
const available = [
  'scripts/check-affected.mjs', 'scripts/check-affected.test.mjs', 'scripts/check-workflow.test.mjs',
  `${d}src/renderer/src/features/input/Composer.tsx`,
  `${d}src/renderer/src/features/input/file-references.test.tsx`,
  `${d}src/renderer/src/features/tools/files/files-store.test.ts`,
  `${d}src/main/services/files/references.test.ts`,
  `${d}src/main/services/session/service.test.ts`,
  `${d}src/preload/bridge.test.ts`, `${d}src/shared/ipc/contract.test.ts`,
  `${d}src/renderer/src/features/session/session.test.tsx`,
  `${d}src/renderer/src/features/tools/terminal-panel.test.tsx`,
  `${d}src/renderer/src/features/settings/settings.test.tsx`,
  ...['files', 'session', 'cli-default', 'composer', 'app', 'alignment', 'runtime-tools', 'settings',
    'project', 'project-view', 'diff', 'turn-diff', 'vscode-parity', 'claude-effort'].map(name => `${d}e2e/${name}.spec.ts`),
  `${a}src/codex/driver.ts`, `${a}test/codex/driver.test.ts`,
  `${a}test/claude/driver.test.ts`, `${a}test/codex/real.integration.test.ts`
]
const plan = files => affectedPlan(files, available)
const commandText = value => value.commands.flat().join(' ')

test('docs, evidence and empty diff do not run application checks', () => {
  for (const files of [[], ['README.md'], ['docs/08. System Architecture.html'], ['tasks/T-example/evidence/check.mjs']]) {
    expect(plan(files)).toMatchObject({ commands: [], e2e: [], unknown: [] })
  }
})
test('input selects related module, not terminal/settings/adapter suites', () => {
  const result = plan([`${d}src/renderer/src/features/input/Composer.tsx`])
  expect(result.unknown).toEqual([])
  expect(commandText(result)).toContain('file-references.test.tsx')
  expect(commandText(result)).toContain('tsconfig.web.json')
  expect(commandText(result)).not.toMatch(/terminal-panel|settings.test|tsconfig.node|check:code| run test /)
  expect(result.e2e).toEqual(['e2e/cli-default.spec.ts', 'e2e/composer.spec.ts', 'e2e/files.spec.ts'])
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
test('adapter provider updates cover dist consumers, not unrelated provider suite', () => {
  const result = plan([`${a}src/codex/driver.ts`])
  expect(commandText(result)).toContain('test/codex/driver.test.ts')
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
  for (const file of ['pnpm-lock.yaml', 'package.json', `${d}e2e/fixture.ts`, 'unknown.ts']) {
    expect(runPlan(plan([file]), { run })).toBe(1)
  }
  expect(run).not.toHaveBeenCalled()
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
  expect(commandText(plan(['scripts/check-affected.mjs']))).not.toContain('--passWithNoTests')
})
test('automatic workflow cannot run full checks or package', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  for (const step of workflow.split(/\n      - name:/).slice(1)) {
    if (/run: pnpm (check:code|smoke:packaged)|run: pnpm --filter @ai-studio\/desktop run (test:e2e:built|package:built)/.test(step)) {
      expect(step).toContain("if: github.event_name == 'workflow_dispatch'")
    }
  }
  expect(workflow).toContain('node scripts/check-affected.mjs --base "$CHECK_BASE" --head HEAD --ci')
})
