import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { git } from './check-paths.mjs'
import { integrateBranch } from './integrate-branch.mjs'

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

test('integrates committed work by fast-forward without changing either checkout branch', () => {
  const f = fixture(), head = feature(f)
  expect(integrateBranch('feat/example', f.dev)).toEqual({ branch: 'feat/example', sourceCommit: head })
  expect(git(['rev-parse', 'HEAD'], f.dev).trim()).toBe(head)
  expect(readFileSync(path.join(f.dev, 'feature.txt'), 'utf8')).toBe('committed feature')
  expect(git(['branch', '--show-current'], f.dev).trim()).toBe('dev')
  expect(git(['branch', '--show-current'], f.source).trim()).toBe('feat/example')
  expect(git(['status', '--porcelain'], f.source)).toBe('')
})

test.each(['unstaged', 'staged', 'untracked'])('refuses %s source changes without copying or committing them', kind => {
  const f = fixture(), committed = feature(f)
  writeFileSync(path.join(f.source, kind === 'untracked' ? 'extra.txt' : 'feature.txt'), 'unsaved work')
  if (kind === 'staged') git(['add', '.'], f.source)
  expect(() => integrateBranch('feat/example', f.dev)).toThrow('source worktree has uncommitted')
  expect(git(['rev-parse', 'HEAD'], f.source).trim()).toBe(committed)
  expect(readFileSync(path.join(f.source, kind === 'untracked' ? 'extra.txt' : 'feature.txt'), 'utf8')).toBe('unsaved work')
  unchanged(f)
})

test.each(['unstaged', 'staged', 'untracked'])('refuses %s destination changes without modifying them', kind => {
  const f = fixture(); feature(f)
  const file = path.join(f.dev, kind === 'untracked' ? 'local.txt' : 'base.txt')
  writeFileSync(file, 'local work')
  if (kind === 'staged') git(['add', '.'], f.dev)
  expect(() => integrateBranch('feat/example', f.dev)).toThrow('dev checkout has uncommitted')
  expect(readFileSync(file, 'utf8')).toBe('local work')
  unchanged(f)
})

test('requires source commits and an independent source worktree', () => {
  const f = fixture()
  expect(() => integrateBranch('feat/example', f.dev)).toThrow('no new commits')
  expect(() => integrateBranch('feat/missing', f.dev)).toThrow('own worktree')
  for (const branch of ['dev', 'main', '', '--help']) expect(() => integrateBranch(branch, f.dev)).toThrow()
  unchanged(f)
})

test('refuses integration from a feature checkout', () => {
  const f = fixture(); feature(f)
  expect(() => integrateBranch('feat/example', f.source)).toThrow('from the dev checkout')
  unchanged(f)
})

test('requires rebase before integration and leaves no merge state on divergence', () => {
  const f = fixture(); feature(f)
  writeFileSync(path.join(f.dev, 'dev.txt'), 'new dev work')
  const head = f.commit(f.dev)
  expect(() => integrateBranch('feat/example', f.dev)).toThrow('Rebase the task branch')
  expect(git(['rev-parse', 'HEAD'], f.dev).trim()).toBe(head)
  expect(existsSync(path.join(f.dev, 'feature.txt'))).toBe(false)
  expect(() => git(['rev-parse', '--verify', 'MERGE_HEAD'], f.dev)).toThrow()
})

test('CLI rejects a dirty source with a nonzero status and unchanged dev', () => {
  const f = fixture(); feature(f)
  writeFileSync(path.join(f.source, 'extra.txt'), 'not committed')
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./integrate-branch.mjs', import.meta.url)), 'feat/example'], { cwd: f.dev, encoding: 'utf8' })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('commit them on the task branch first')
  unchanged(f)
})
