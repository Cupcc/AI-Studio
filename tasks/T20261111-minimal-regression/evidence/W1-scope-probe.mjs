import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: fileURLToPath(new URL('.', import.meta.url)), env, encoding: 'utf8' }).trim()
const { affectedPlan, inventory, runPlan } = await import(join(root, 'scripts/check-affected.mjs'))
const available = inventory(root)
const desktop = 'apps/desktop/'
const runtime = 'e2e/runtime-tools.spec.ts'
const file = desktop + 'electron.vite.config.ts'
const config = readFileSync(join(root, file), 'utf8')
const cwd = mkdtempSync(join(tmpdir(), 'review-csp-'))
const git = args => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim()
const results = []
try {
  git(['init', '-q'])
  mkdirSync(join(cwd, desktop), { recursive: true })
  writeFileSync(join(cwd, file), config)
  git(['add', '.'])
  const base = git(['write-tree'])
  writeFileSync(join(cwd, file), config.replace('frame-src app://workbench', "frame-src 'none'"))
  for (const [extra, filtered] of [
    [null, true],
    ['src/renderer/src/features/tools/tools.css', true],
    ['src/renderer/src/features/tools/terminal-font.test.ts', true],
    ['src/renderer/src/features/tools/diff/diff-format.test.ts', true],
    ['src/renderer/src/features/tools/diff/diff-format.ts', true],
    ['src/renderer/src/features/tools/TerminalPanel.tsx', false],
    ['e2e/runtime-tools.spec.ts', false]
  ]) {
    const paths = [file, ...(extra ? [desktop + extra] : [])]
    const plan = affectedPlan(paths, available, { cwd, base })
    assert.deepEqual(plan.unknown, [])
    assert.equal(Boolean(plan.e2eFilters[runtime]), filtered)
    results.push({ extra, filtered, result: 'passed' })
  }
  const css = affectedPlan([desktop + 'src/renderer/src/features/tools/tools.css'], available)
  assert.deepEqual(css.commands, [])
  assert(css.e2e.includes(runtime))
  assert.equal(css.e2eFilters[runtime], 'FR-TOOL-003|FR-TOOL-004')
  const workbench = affectedPlan([desktop + 'src/renderer/src/features/workbench/workbench.css'], available)
  assert.deepEqual(workbench.commands, [])
  assert(!workbench.e2e.includes(runtime))
  const missing = desktop + 'src/renderer/src/features/workbench/portable-pages.test.ts'
  const broken = affectedPlan([desktop + 'build/workbench-common/page.js'], available.filter(path => path !== missing))
  assert(broken.missingTests.includes(missing))
  assert.equal(runPlan(broken, { run() { throw new Error('Must block before commands') } }), 1)
  for (const [source, candidates] of [
    [desktop + 'src/main/services/navigation/removed.ts', available],
    ['packages/agent-adapter/src/codex/removed.ts', available.filter(path => !path.startsWith('packages/agent-adapter/test/codex/'))],
    ['scripts/check-removed.mjs', []],
    [desktop + 'src/renderer/src/lib/removed.ts', []]
  ]) {
    assert(affectedPlan([source], candidates).unknown.includes(source))
    results.push({ deleted: source, result: 'blocked without candidates' })
  }
  assert.deepEqual(affectedPlan([
    desktop + 'src/main/services/workbench/removed.ts',
    desktop + 'src/main/services/workbench/another-removed.ts'
  ], available).unknown, [])
  console.log(JSON.stringify({
    reviewedSourceSha256: createHash('sha256').update(readFileSync(join(root, 'scripts/check-affected.mjs'))).digest('hex'),
    checks: results, css: 'both scopes passed', missingPackageConsumer: 'blocked before commands'
  }, null, 2))
} finally { rmSync(cwd, { recursive: true, force: true }) }
