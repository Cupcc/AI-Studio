import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { git } from './check-paths.mjs'
import { freezeDev, frozenAt, integrateBranch, unfreezeDev } from './integrate-branch.mjs'

const temporary = []
beforeEach(() => {
  for (const name of Object.keys(process.env)) if (name.startsWith('GIT_')) vi.stubEnv(name, undefined)
})
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'studio-integration-'))
  temporary.push(dir)
  const dev = path.join(dir, 'dev'), source = path.join(dir, '功能 worktree')
  mkdirSync(dev)
  git(['init', '-q', '-b', 'dev'], dev)
  git(['config', 'user.email', 'fixture@example.invalid'], dev)
  git(['config', 'user.name', 'Fixture'], dev)
  git(['config', 'core.hooksPath', path.join(dir, 'no-hooks')], dev)
  const commit = cwd => { git(['add', '.'], cwd); git(['commit', '-qm', 'fixture'], cwd); return git(['rev-parse', 'HEAD'], cwd).trim() }
  writeFileSync(path.join(dev, 'base.txt'), 'stable')
  const base = commit(dev)
  git(['worktree', 'add', '-q', '-b', 'feat/example', source], dev)
  return { dev, source, base, commit }
}
function feature(f) {
  writeFileSync(path.join(f.source, 'feature.txt'), 'committed feature')
  return f.commit(f.source)
}
function unchanged(f) {
  expect(git(['rev-parse', 'HEAD'], f.dev).trim()).toBe(f.base)
  expect(existsSync(path.join(f.dev, 'feature.txt'))).toBe(false)
}

const title = 'feat(example): add the example feature'
const integrate = (f, branch = 'feat/example', cwd = f.dev) => integrateBranch({ branch, title, cwd })

test('squashes the task branch into one dev commit with the checked tree', () => {
  const f = fixture(), first = feature(f)
  writeFileSync(path.join(f.source, 'second.txt'), 'second commit')
  const head = f.commit(f.source)
  const result = integrateBranch({ branch: 'feat/example', title, body: 'Verified by the fixture.', cwd: f.dev })
  expect(result).toMatchObject({ branch: 'feat/example', sourceCommit: head })
  expect(git(['rev-parse', 'HEAD'], f.dev).trim()).toBe(result.commit)
  expect(git(['rev-list', '--parents', '-n1', 'HEAD'], f.dev).trim().split(' ')).toEqual([result.commit, f.base])
  expect(git(['rev-parse', 'HEAD^{tree}'], f.dev)).toBe(git(['rev-parse', `${head}^{tree}`], f.dev))
  const message = git(['log', '-1', '--format=%B', 'HEAD'], f.dev)
  expect(message.startsWith(`${title}\n\nVerified by the fixture.\n\nSquashed commits:\n- ${first.slice(0, 7)}`)).toBe(true)
  expect(message).toContain(`Source-Branch: feat/example\nSource-Commit: ${head}`)
  expect(readFileSync(path.join(f.dev, 'second.txt'), 'utf8')).toBe('second commit')
  expect(git(['branch', '--show-current'], f.dev).trim()).toBe('dev')
  expect(git(['rev-parse', 'HEAD'], f.source).trim()).toBe(head)
  expect(git(['status', '--porcelain'], f.source)).toBe('')
})

test('keeps body trailers in the final trailer block', () => {
  const f = fixture(), head = feature(f)
  const body = 'Checked with the fixture.\nNote: the first line stays in the body.\n\nCo-Authored-By: Helper <helper@example.invalid>\n'
  integrateBranch({ branch: 'feat/example', title, body, cwd: f.dev })
  const message = git(['log', '-1', '--format=%B', 'HEAD'], f.dev)
  expect(message).toContain('Checked with the fixture.\nNote: the first line stays in the body.\n\nSquashed commits:')
  expect(git(['log', '-1', '--format=%(trailers:only,unfold)', 'HEAD'], f.dev).trim().split('\n')).toEqual([
    'Co-Authored-By: Helper <helper@example.invalid>', 'Source-Branch: feat/example', `Source-Commit: ${head}`
  ])
})

test('requires a Conventional Commit title before changing dev', () => {
  const f = fixture(); feature(f)
  expect(() => integrateBranch({ branch: 'feat/example', title: ' ', cwd: f.dev })).toThrow('--title')
  expect(() => integrateBranch({ branch: 'feat/example', title: 'add the example feature', cwd: f.dev })).toThrow('commitlint')
  unchanged(f)
})

test('refuses integration while dev is frozen for acceptance', () => {
  const f = fixture(); feature(f)
  expect(freezeDev(f.dev)).toBe(f.base)
  expect(frozenAt(f.source)).toBe(f.base)
  expect(() => freezeDev(f.dev)).toThrow('already frozen')
  expect(() => integrate(f)).toThrow(`frozen for acceptance at ${f.base}`)
  unchanged(f)
  expect(unfreezeDev(f.dev)).toBe(f.base)
  expect(() => unfreezeDev(f.dev)).toThrow('not frozen')
  expect(integrate(f).commit).toBe(git(['rev-parse', 'HEAD'], f.dev).trim())
})

test('freezes only a clean dev checkout', () => {
  const f = fixture()
  expect(() => freezeDev(f.source)).toThrow('from the dev checkout')
  writeFileSync(path.join(f.dev, 'local.txt'), 'local work')
  expect(() => freezeDev(f.dev)).toThrow('uncommitted')
  expect(frozenAt(f.dev)).toBe(null)
})

test.each(['unstaged', 'staged', 'untracked'])('refuses %s source changes without copying or committing them', kind => {
  const f = fixture(), committed = feature(f)
  writeFileSync(path.join(f.source, kind === 'untracked' ? 'extra.txt' : 'feature.txt'), 'unsaved work')
  if (kind === 'staged') git(['add', '.'], f.source)
  expect(() => integrate(f)).toThrow('source worktree has uncommitted')
  expect(git(['rev-parse', 'HEAD'], f.source).trim()).toBe(committed)
  expect(readFileSync(path.join(f.source, kind === 'untracked' ? 'extra.txt' : 'feature.txt'), 'utf8')).toBe('unsaved work')
  unchanged(f)
})

test.each(['unstaged', 'staged', 'untracked'])('refuses %s destination changes without modifying them', kind => {
  const f = fixture(); feature(f)
  const file = path.join(f.dev, kind === 'untracked' ? 'local.txt' : 'base.txt')
  writeFileSync(file, 'local work')
  if (kind === 'staged') git(['add', '.'], f.dev)
  expect(() => integrate(f)).toThrow('dev checkout has uncommitted')
  expect(readFileSync(file, 'utf8')).toBe('local work')
  unchanged(f)
})

test('requires source commits and an independent source worktree', () => {
  const f = fixture()
  expect(() => integrate(f)).toThrow('no new commits')
  expect(() => integrate(f, 'feat/missing')).toThrow('own worktree')
  for (const branch of ['dev', 'main', '', '--help']) expect(() => integrate(f, branch)).toThrow('Specify a local task branch')
  unchanged(f)
})

test('refuses integration from a feature checkout', () => {
  const f = fixture(); feature(f)
  expect(() => integrate(f, 'feat/example', f.source)).toThrow('from the dev checkout')
  unchanged(f)
})

test('requires rebase before integration and leaves no merge state on divergence', () => {
  const f = fixture(); feature(f)
  writeFileSync(path.join(f.dev, 'dev.txt'), 'new dev work')
  const head = f.commit(f.dev)
  expect(() => integrate(f)).toThrow('Rebase the task branch')
  expect(git(['rev-parse', 'HEAD'], f.dev).trim()).toBe(head)
  expect(existsSync(path.join(f.dev, 'feature.txt'))).toBe(false)
  expect(() => git(['rev-parse', '--verify', 'MERGE_HEAD'], f.dev)).toThrow()
})

const cli = (args, cwd) => spawnSync(process.execPath, [fileURLToPath(new URL('./integrate-branch.mjs', import.meta.url)), ...args], { cwd, encoding: 'utf8' })

test('CLI rejects a dirty source with a nonzero status and unchanged dev', () => {
  const f = fixture(); feature(f)
  writeFileSync(path.join(f.source, 'extra.txt'), 'not committed')
  const result = cli(['feat/example', '--title', title], f.dev)
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('commit them on the task branch first')
  unchanged(f)
})

test('CLI squashes with a body file and toggles the acceptance freeze', () => {
  const f = fixture(), head = feature(f)
  const bodyFile = path.join(path.dirname(f.dev), 'body.md')
  writeFileSync(bodyFile, 'Checked with the fixture.\n')
  expect(cli(['--freeze'], f.dev).stdout).toContain(f.base)
  expect(cli(['feat/example', '--title', title, '--body-file', bodyFile], f.dev).status).toBe(1)
  expect(cli(['--unfreeze'], f.dev).stdout).toContain(f.base)
  const result = cli(['feat/example', '--title', title, '--body-file', bodyFile], f.dev)
  expect(result.status).toBe(0)
  expect(result.stdout).toContain(`at ${head} into dev as`)
  expect(git(['log', '-1', '--format=%B', 'HEAD'], f.dev)).toContain('Checked with the fixture.')
  expect(cli(['feat/example'], f.dev).status).toBe(1)
})
