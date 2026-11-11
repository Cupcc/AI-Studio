import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { changedDocuments, handleHook, hookFailure } from './agent-docs-hook.mjs'

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
  const call = (event, extra = {}) => handleHook({
    session_id: 'session-a', hook_event_name: event,
    tool_name: 'Bash', tool_input: { command: 'arbitrary script' }, ...extra
  }, { root })
  if (start) call('SessionStart')
  return { root, git, write, call }
}

test('SessionStart baselines pre-existing changes, including on resume', () => {
  const { write, call } = fixture({ start: false })
  write('README.md', '# Changed before session')
  expect(call('SessionStart')).toEqual({})
  expect(call('PostToolUse')).toEqual({})
  write('README.md', '# Changed during session')
  expect(call('SessionStart')).toEqual({})
  expect(call('PostToolUse').hookSpecificOutput).toBeDefined()
})

test('clean and code-only tools do not remind', () => {
  const { write, call } = fixture()
  expect(call('PostToolUse')).toEqual({})
  write('source.ts', 'export const a = 1')
  expect(call('PostToolUse')).toEqual({})
})

test('Shell edits remind once per session and name only changed documents', () => {
  const { write, call } = fixture({ start: false })
  write('README.md', '# Pre-existing change')
  call('SessionStart')
  write('docs/中文 空格.md', '# Changed')
  const message = call('PostToolUse').hookSpecificOutput.additionalContext
  expect(message).toContain('中文 空格.md')
  expect(message).not.toContain('README.md')
  expect(call('PostToolUse')).toEqual({})
  write('docs/中文 空格.md', '# Changed again')
  expect(call('PostToolUse')).toEqual({})
  expect(call('Stop')).toEqual({})
  write('README.md', '# Another edit')
  expect(call('PostToolUse')).toEqual({})
})

test('adds, deletes, renames and HTML documents trigger with both rename paths', () => {
  const { root, git, write, call } = fixture()
  git(['mv', 'docs/中文 空格.md', 'docs/moved.md'])
  rmSync(path.join(root, 'README.md'))
  write('docs/new.md', '# New')
  write('docs/08. Architecture.html', '<h1>Architecture</h1>')
  expect(Object.keys(changedDocuments(root)).sort()).toEqual([
    'README.md', 'docs/08. Architecture.html', 'docs/moved.md', 'docs/new.md', 'docs/中文 空格.md'
  ])
  expect(call('PostToolUse', { tool_name: 'apply_patch' }).hookSpecificOutput).toBeDefined()
})

test('Stop does no work, even without valid input or a repository', () => {
  expect(handleHook({ hook_event_name: 'Stop' }, { root: '/missing/repository' })).toEqual({})
  const { root, write, call } = fixture()
  write('README.md', '[broken](missing.md)')
  const directory = path.join(root, '.runtime/agent-docs-hook')
  const stateFile = path.join(directory, readdirSync(directory)[0])
  const before = readFileSync(stateFile, 'utf8')
  expect(call('Stop')).toEqual({})
  expect(readFileSync(stateFile, 'utf8')).toBe(before)
})

test('session state stores only document metadata and reminder flags', () => {
  const { root, write, call } = fixture()
  write('README.md', '# Shared dirty file')
  call('PostToolUse')
  expect(call('PostToolUse', { session_id: '../../other-session' }).hookSpecificOutput).toBeDefined()
  const files = readdirSync(path.join(root, '.runtime/agent-docs-hook'))
  expect(files).toHaveLength(2)
  for (const file of files) {
    expect(file).toMatch(/^[a-f0-9]{64}\.json$/)
    const state = readFileSync(path.join(root, '.runtime/agent-docs-hook', file), 'utf8')
    expect(state).not.toContain('arbitrary script')
    expect(Object.keys(JSON.parse(state)).sort()).toEqual(['baselined', 'documents', 'notified'])
  }
})

test('entry point emits JSON and supports a nested cwd with spaces', () => {
  const { root, write } = fixture()
  write('.codex/scripts/agent-docs-hook.mjs', readFileSync(new URL('./agent-docs-hook.mjs', import.meta.url), 'utf8'))
  write('docs/中文 空格.md', '# Edited')
  const result = spawnSync(process.execPath, [path.join(root, '.codex/scripts/agent-docs-hook.mjs')], {
    cwd: path.join(root, 'docs'), encoding: 'utf8', input: JSON.stringify({
      hook_event_name: 'PostToolUse', session_id: 'fixture', tool_name: 'apply_patch'
    })
  })
  expect(result.status).toBe(0)
  expect(JSON.parse(result.stdout).hookSpecificOutput.hookEventName).toBe('PostToolUse')
})

test('detection or storage failures only remind and never block', () => {
  for (const event of ['SessionStart', 'PostToolUse']) {
    const result = hookFailure({ hook_event_name: event })
    expect(result.hookSpecificOutput.hookEventName).toBe(event)
    expect(result.decision).toBeUndefined()
  }
  expect(hookFailure({ hook_event_name: 'Stop' })).toEqual({})
})

test('project configuration contains only bounded baseline and reminder hooks', () => {
  const config = JSON.parse(readFileSync(new URL('../hooks.json', import.meta.url), 'utf8'))
  expect(Object.keys(config.hooks).sort()).toEqual(['PostToolUse', 'SessionStart'])
  expect('startup').toMatch(new RegExp(config.hooks.SessionStart[0].matcher))
  expect('Bash').toMatch(new RegExp(config.hooks.PostToolUse[0].matcher))
  expect('apply_patch').toMatch(new RegExp(config.hooks.PostToolUse[0].matcher))
  for (const event of Object.values(config.hooks)) expect(event[0].hooks[0].timeout).toBe(3)
})
