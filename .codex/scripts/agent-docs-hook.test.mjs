import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { changedDocuments, handleHook, hookFailure, runLinkCheck } from './agent-docs-hook.mjs'

const temporary = []
beforeEach(() => {
  for (const name of Object.keys(process.env)) if (name.startsWith('GIT_')) vi.stubEnv(name, undefined)
})
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true })
  vi.unstubAllEnvs()
})
function fixture({ start = true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'studio doc hook '))
  temporary.push(root)
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  const write = (file, text) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), text)
  }
  git(['init', '-q'])
  git(['config', 'user.email', 'fixture@example.invalid'])
  git(['config', 'user.name', 'Fixture'])
  git(['config', 'core.hooksPath', path.join(root, 'no-hooks')])
  write('.gitignore', '.runtime/\n')
  write('README.md', '# Root\n')
  write('docs/中文 空格.md', '# 标题\n')
  git(['add', '.'])
  git(['commit', '-qm', 'fixture'])
  const check = vi.fn(() => ({ ok: true, detail: 'pass' }))
  const call = (event, extra = {}) => handleHook({
    session_id: 'session-a', turn_id: 'turn-a', hook_event_name: event,
    tool_name: 'Bash', tool_input: { command: 'arbitrary script' }, ...extra
  }, { root, check })
  if (start) call('SessionStart', { source: 'startup' })
  return { root, git, write, check, call }
}

test('SessionStart baselines pre-existing documentation changes', () => {
  const { write, call, check } = fixture({ start: false })
  write('README.md', '# Changed before session')
  expect(call('SessionStart', { source: 'startup' })).toEqual({})
  expect(call('Stop')).toEqual({})
  expect(check).not.toHaveBeenCalled()
  write('README.md', '# Changed during session')
  expect(call('PostToolUse').hookSpecificOutput).toBeDefined()
  expect(call('Stop').decision).toBe('block')
  expect(check).toHaveBeenCalledTimes(1)
})

test('clean and code-only tools do not remind or invoke the link checker', () => {
  const { write, call, check } = fixture()
  expect(call('PostToolUse')).toEqual({})
  write('source.ts', 'export const a = 1')
  expect(call('PostToolUse')).toEqual({})
  expect(call('Stop')).toEqual({})
  expect(check).not.toHaveBeenCalled()
})

test('Shell edits are detected from disk; repeated edits remind once and check once at Stop', () => {
  const { write, call, check } = fixture()
  write('docs/中文 空格.md', '# Changed')
  expect(call('PostToolUse').hookSpecificOutput.additionalContext).toContain('中文 空格.md')
  expect(call('PostToolUse')).toEqual({})
  write('docs/中文 空格.md', '# Changed again')
  expect(call('PostToolUse')).toEqual({})
  expect(check).not.toHaveBeenCalled()
  expect(call('Stop')).toEqual({})
  expect(call('Stop')).toEqual({})
  expect(check).toHaveBeenCalledTimes(1)
  write('docs/中文 空格.md', '# Another turn')
  expect(call('PostToolUse', { turn_id: 'turn-b' }).hookSpecificOutput).toBeDefined()
  call('Stop', { turn_id: 'turn-b' })
  expect(check).toHaveBeenCalledTimes(2)
})

test('add, delete, staged rename and HTML docs all trigger, including both rename paths', () => {
  const { root, git, write, call } = fixture()
  git(['mv', 'docs/中文 空格.md', 'docs/moved.md'])
  rmSync(path.join(root, 'README.md'))
  write('docs/new.md', '# New')
  write('docs/08. Architecture.html', '<h1>Architecture</h1>')
  expect(Object.keys(changedDocuments(root).documents).sort()).toEqual([
    'README.md', 'docs/08. Architecture.html', 'docs/moved.md', 'docs/new.md', 'docs/中文 空格.md'
  ])
  expect(call('PostToolUse', { tool_name: 'apply_patch' }).hookSpecificOutput).toBeDefined()
})

test('Stop catches missed PostToolUse events and requests only one review continuation', () => {
  const { write, call, check } = fixture()
  write('README.md', '# Missed event')
  expect(call('Stop').decision).toBe('block')
  expect(call('Stop', { stop_hook_active: true, turn_id: 'continuation' })).toEqual({})
  expect(call('Stop', { turn_id: 'later' })).toEqual({})
  expect(check).toHaveBeenCalledTimes(1)
})

test('failure is surfaced once, cached, and cannot trap the agent in a Stop loop', () => {
  const { write, call, check } = fixture()
  check.mockReturnValue({ ok: false, detail: 'missing local target' })
  write('README.md', '# Changed')
  call('PostToolUse')
  expect(call('Stop').reason).toContain('missing local target')
  expect(call('Stop', { stop_hook_active: true })).toEqual({})
  expect(call('Stop')).toEqual({})
  expect(check).toHaveBeenCalledTimes(1)
})

test('a repair during continuation invalidates the cached check without another continuation', () => {
  const { write, call, check } = fixture()
  check.mockReturnValueOnce({ ok: false, detail: 'broken' })
  write('README.md', '# Broken')
  call('PostToolUse')
  expect(call('Stop').decision).toBe('block')
  write('README.md', '# Repaired')
  call('PostToolUse', { turn_id: 'continuation' })
  expect(call('Stop', { stop_hook_active: true, turn_id: 'continuation' })).toEqual({})
  expect(check).toHaveBeenCalledTimes(2)
})

test('a non-Markdown link target repair also invalidates the cached result', () => {
  const { write, call, check } = fixture()
  check.mockReturnValueOnce({ ok: false, detail: 'missing image.png' })
  write('README.md', '![image](image.png)')
  call('PostToolUse')
  call('Stop')
  write('image.png', 'fixture')
  expect(call('Stop', { stop_hook_active: true })).toEqual({})
  expect(check).toHaveBeenCalledTimes(2)
})

test('session states are isolated, names are hashed, and command text is not persisted', () => {
  const { root, write, call } = fixture()
  write('README.md', '# Shared dirty file')
  call('PostToolUse')
  expect(call('PostToolUse', { session_id: '../../other-session' }).hookSpecificOutput).toBeDefined()
  const files = readdirSync(path.join(root, '.runtime/agent-docs-hook'))
  expect(files).toHaveLength(2)
  for (const file of files) {
    expect(file).toMatch(/^[a-f0-9]{64}\.json$/)
    expect(readFileSync(path.join(root, '.runtime/agent-docs-hook', file), 'utf8')).not.toContain('arbitrary script')
  }
})

test('real link checker detects broken links, passes repairs, and times out a stalled process', () => {
  const { root, write } = fixture()
  write('README.md', '[broken](missing.md)')
  expect(runLinkCheck(root).ok).toBe(false)
  write('missing.md', '# Target')
  expect(runLinkCheck(root).ok).toBe(true)
  write('stall.mjs', 'setInterval(() => {}, 1000)')
  const result = runLinkCheck(root, { timeout: 100, script: path.join(root, 'stall.mjs') })
  expect(result).toEqual({ ok: false, detail: '链接检查超时，未完成。' })
})

test('entry point emits JSON with real hook input and tolerates a nested cwd with spaces', () => {
  const { root, write } = fixture()
  write('scripts/agent-docs-hook.mjs', readFileSync(new URL('./agent-docs-hook.mjs', import.meta.url), 'utf8'))
  write('docs/中文 空格.md', '# Edited')
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/agent-docs-hook.mjs')], {
    cwd: path.join(root, 'docs'), encoding: 'utf8', input: JSON.stringify({
      hook_event_name: 'PostToolUse', session_id: 'fixture', tool_name: 'apply_patch',
      tool_input: { command: '*** Begin Patch\n*** Update File: docs/中文 空格.md\n*** End Patch' }
    })
  })
  expect(result.status).toBe(0)
  expect(JSON.parse(result.stdout).hookSpecificOutput.hookEventName).toBe('PostToolUse')
})

test('detection/storage failures request manual review but never block a continuation', () => {
  expect(hookFailure({ hook_event_name: 'PostToolUse' }).hookSpecificOutput).toBeDefined()
  expect(hookFailure({ hook_event_name: 'Stop' }).decision).toBe('block')
  expect(hookFailure({ hook_event_name: 'Stop', stop_hook_active: true })).toEqual({})
})

test('project configuration matches native tools and sets short finite timeouts', () => {
  const config = JSON.parse(readFileSync(new URL('../.codex/hooks.json', import.meta.url), 'utf8'))
  const start = config.hooks.SessionStart[0]
  expect('startup').toMatch(new RegExp(start.matcher))
  expect(start.hooks[0].timeout).toBe(3)
  const post = config.hooks.PostToolUse[0]
  expect('Bash').toMatch(new RegExp(post.matcher))
  expect('apply_patch').toMatch(new RegExp(post.matcher))
  expect(post.hooks[0].timeout).toBe(3)
  expect(config.hooks.Stop[0].hooks[0].timeout).toBe(12)
})
