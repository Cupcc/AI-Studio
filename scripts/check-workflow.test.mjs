import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { changedPaths, ciScope, docsOnly, git, paths } from './check-scope.mjs'
import { checkDocs, documentIssues, newIssues, snapshot } from './check-docs.mjs'

const temporary = []
// Git hooks export repository-local variables, including an alternate index.
// All fixture Git operations AND gate subprocesses must be detached from them.
// Production check-commit intentionally keeps that environment to inspect the real index.
beforeEach(() => {
  for (const name of Object.keys(process.env)) {
    if (name.startsWith('GIT_')) vi.stubEnv(name, undefined)
  }
})
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true })
  vi.unstubAllEnvs()
})
function repo() {
  const cwd = mkdtempSync(path.join(tmpdir(), 'studio-checks-'))
  temporary.push(cwd)
  git(['init', '-q'], cwd)
  git(['config', 'user.email', 'fixture@example.invalid'], cwd)
  git(['config', 'user.name', 'Fixture'], cwd)
  // Never inherit the real repository hooks or call real application/model processes.
  git(['config', 'core.hooksPath', path.join(cwd, 'no-hooks')], cwd)
  const write = (file, contents) => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true })
    writeFileSync(path.join(cwd, file), contents)
  }
  const commit = () => {
    git(['add', '.'], cwd)
    git(['commit', '-qm', 'fixture'], cwd)
    return git(['rev-parse', 'HEAD'], cwd).trim()
  }
  return { cwd, write, commit }
}

test('fixture environment excludes inherited Git repository and index overrides', () => {
  expect(Object.keys(process.env).filter(name => name.startsWith('GIT_'))).toEqual([])
})

test.each([
  ['README.md'], ['AGENTS.md'], ['CONTRIBUTING.md'], ['docs/中文 文档.md'],
  ['tasks/archive/T-example/task.md'], ['specs/session/spec.md'], ['templates/task.md'],
  ['design/README.md'], ['apps/desktop/README.md'], ['scripts/README.md']
])('allows documented path %s', file => expect(docsOnly([file])).toBe(true))

test.each([
  'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.github/workflows/ci.yml',
  '.husky/pre-commit', 'scripts/check-scope.mjs', 'apps/desktop/src/help.md',
  'docs/example.ts', 'design/prototypes/index.html', 'tasks/T/evidence/check.mjs',
  'unknown.md', 'docs/README.MD'
])('does not exempt code, config or unknown path %s', file => {
  expect(docsOnly(['README.md', file])).toBe(false)
})
test('empty change list and NUL-delimited paths are conservative', () => {
  expect(docsOnly([])).toBe(false)
  expect(paths('docs/中文 空格.md\0docs/a\nb.md\0')).toEqual(['docs/中文 空格.md', 'docs/a\nb.md'])
})

test('valid Markdown links, references, tables, Unicode, spaces and duplicate headings', () => {
  const files = new Map([
    ['README.md', '# Root\n[文档](<docs/中文 空格.md#标题>)\n[second][ref]\n\n[ref]: docs/other.md#same-1\n\n| Link |\n|---|\n| [directory](docs/) |\n\n![image](docs/pic.png)\n[external](https://example.invalid)\n'],
    ['docs/中文 空格.md', '# 标题\n[root](/README.md#root)\n[encoded](%E4%B8%AD%E6%96%87%20%E7%A9%BA%E6%A0%BC.md#标题)'],
    ['docs/other.md', '# Same\n# Same\n<a id="custom"></a>\n[custom](#custom)'],
    ['docs/pic.png', null]
  ])
  expect(documentIssues(files)).toEqual([])
})

test('new missing target, anchor and invalid encoding fail; code examples are ignored', () => {
  const files = new Map([['README.md', '# Root\n[bad](missing.md)\n[bad](#absent)\n[bad](bad%XX.md)\n`[example](ignored.md)`\n\n```md\n[example](ignored.md)\n```']])
  expect(documentIssues(files).map(issue => issue.reason)).toEqual([
    'missing local target', 'missing Markdown anchor', 'invalid URL encoding'
  ])
})

test('removed targets and renamed headings break unchanged incoming links', () => {
  const before = new Map([['README.md', '[target](docs/a.md#old)'], ['docs/a.md', '# Old']])
  const removed = new Map([['README.md', before.get('README.md')]])
  expect(newIssues(before, removed)).toHaveLength(1)
  const renamed = new Map(before).set('docs/a.md', '# New')
  expect(newIssues(before, renamed)[0].reason).toBe('missing Markdown anchor')
  expect(newIssues(before, new Map(renamed).set('README.md', '[target](docs/a.md#new)'))).toEqual([])
})

test('existing baseline defects do not block unrelated changes; new defects do', () => {
  const before = new Map([['README.md', '[legacy](missing.md)']])
  expect(newIssues(before, new Map(before).set('README.md', '# Added\n[legacy](missing.md)'))).toEqual([])
  expect(newIssues(before, new Map(before).set('README.md', '[legacy](missing.md)\n[new](new.md)'))).toHaveLength(1)
})

test('index snapshot cannot be masked by unstaged repairs or untracked targets', () => {
  const { cwd, write, commit } = repo()
  write('README.md', '# Start')
  const base = commit()
  write('README.md', '[broken](<docs/中文 空格.md>)')
  git(['add', 'README.md'], cwd)
  const head = git(['write-tree'], cwd).trim()
  write('docs/中文 空格.md', '# Untracked repair')
  expect(checkDocs({ base, head, cwd })).toBe(false)
  expect(checkDocs({ base, cwd })).toBe(true)
  expect(docsOnly(changedPaths(base, head, cwd))).toBe(true)
  expect(snapshot(head, cwd).has('docs/中文 空格.md')).toBe(false)
})

test('rename classification includes both old and new paths', () => {
  const { cwd, write, commit } = repo()
  write('unknown.md', '# Unknown source')
  const base = commit()
  git(['mv', 'unknown.md', 'README.md'], cwd)
  const head = git(['write-tree'], cwd).trim()
  expect(changedPaths(base, head, cwd).sort()).toEqual(['README.md', 'unknown.md'])
  expect(docsOnly(changedPaths(base, head, cwd))).toBe(false)
})

test('CI covers the whole push, PR comparison, manual, empty and missing baselines', () => {
  const { cwd, write, commit } = repo()
  write('README.md', '# First')
  const base = commit()
  write('README.md', '# Second')
  const docsHead = commit()
  expect(ciScope('push', { before: base }, cwd)).toEqual({ app: false, base })
  expect(ciScope('pull_request', { pull_request: { base: { sha: base } } }, cwd)).toEqual({ app: false, base })
  write('code.ts', 'export const changed = true')
  commit()
  write('README.md', '# Third')
  commit()
  expect(ciScope('push', { before: docsHead }, cwd).app).toBe(true)
  expect(ciScope('workflow_dispatch', {}, cwd)).toEqual({ app: true, base: '' })
  expect(ciScope('push', { before: '0'.repeat(40) }, cwd).app).toBe(true)
  expect(ciScope('push', { before: '1'.repeat(40) }, cwd).app).toBe(true)
  expect(ciScope('push', { before: git(['rev-parse', 'HEAD'], cwd).trim() }, cwd).app).toBe(true)
})

test.each(['docs', 'code', 'empty', 'broken-docs', 'failed-code'])('commit entry point: %s', kind => {
  const { cwd, write, commit } = repo()
  write('README.md', '# Baseline')
  commit()
  // Fake only the expensive child command; exercise the real scope and docs entry point.
  write('fake-bin/pnpm', `#!/bin/sh\nprintf 'BASIC_CHECK:%s\\n' "$*"\nexit ${kind === 'failed-code' ? 7 : 0}\n`)
  chmodSync(path.join(cwd, 'fake-bin/pnpm'), 0o755)
  if (kind === 'docs' || kind === 'broken-docs') {
    write('README.md', kind === 'docs' ? '# Updated' : '[missing](missing.md)')
    git(['add', 'README.md'], cwd)
  } else if (kind !== 'empty') {
    write('source.ts', 'export const changed = true')
    git(['add', 'source.ts'], cwd)
  }
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./check-commit.mjs', import.meta.url))], {
    cwd, encoding: 'utf8', env: { ...process.env, PATH: `${path.join(cwd, 'fake-bin')}${path.delimiter}${process.env.PATH}` }
  })
  if (kind === 'broken-docs') {
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('missing local target')
    expect(result.stdout).not.toContain('BASIC_CHECK')
  } else {
    expect(result.status).toBe(kind === 'failed-code' ? 7 : 0)
    expect(result.stdout.includes('BASIC_CHECK:check:code')).toBe(kind !== 'docs')
  }
})
