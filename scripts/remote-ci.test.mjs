import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { git } from './check-paths.mjs'
import { remoteCi } from './remote-ci.mjs'

const temporary = []
beforeEach(() => {
  for (const name of Object.keys(process.env)) if (name.startsWith('GIT_')) vi.stubEnv(name, undefined)
})
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

// A fake gh records every call and serves one run that is in progress on the first view.
const fakeGh = `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_GH_DIR/calls"
case "$1 $2" in
  "workflow run") echo "https://github.com/owner/repo/actions/runs/42" ;;
  "run download") mkdir -p "$5/desktop-test-evidence-1" && echo shot > "$5/desktop-test-evidence-1/shot.png" ;;
  "run view")
    if [ "$4" = "--log-failed" ]; then echo "macOS arm64 checks  1 failed"; exit 0; fi
    if [ -f "$FAKE_GH_DIR/viewed" ]; then status=completed; conclusion="$FAKE_GH_CONCLUSION"; else status=in_progress; conclusion=""; fi
    touch "$FAKE_GH_DIR/viewed"
    printf '{"status":"%s","conclusion":"%s","headSha":"%s","url":"https://github.com/owner/repo/actions/runs/42","jobs":[{"name":"macOS arm64 checks","status":"%s","conclusion":"%s"}]}\\n' \\
      "$status" "$conclusion" "$FAKE_GH_SHA" "$status" "$conclusion" ;;
  *) exit 2 ;;
esac
`

function fixture(conclusion = 'success') {
  const dir = mkdtempSync(path.join(tmpdir(), 'studio-remote-ci-'))
  temporary.push(dir)
  const origin = path.join(dir, 'origin.git'), work = path.join(dir, '任务 worktree'), bin = path.join(dir, 'bin')
  git(['init', '-q', '--bare', origin], dir)
  git(['init', '-q', '-b', 'feat/example', work], dir)
  git(['config', 'user.email', 'fixture@example.invalid'], work)
  git(['config', 'user.name', 'Fixture'], work)
  git(['config', 'core.hooksPath', path.join(dir, 'no-hooks')], work)
  git(['remote', 'add', 'origin', origin], work)
  writeFileSync(path.join(work, 'feature.txt'), 'committed')
  git(['add', '.'], work)
  git(['commit', '-qm', 'fixture'], work)
  const head = git(['rev-parse', 'HEAD'], work).trim()
  mkdirSync(bin)
  writeFileSync(path.join(bin, 'gh'), fakeGh)
  chmodSync(path.join(bin, 'gh'), 0o755)
  vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env.PATH}`)
  vi.stubEnv('FAKE_GH_DIR', dir)
  vi.stubEnv('FAKE_GH_SHA', head)
  vi.stubEnv('FAKE_GH_CONCLUSION', conclusion)
  const calls = () => existsSync(path.join(dir, 'calls')) ? readFileSync(path.join(dir, 'calls'), 'utf8').trim().split('\n') : []
  return { work, head, calls, push: () => git(['push', '-q', 'origin', 'feat/example'], work) }
}

const run = (f, options) => remoteCi({ cwd: f.work, pollMs: 0, log: () => {}, ...options })

test('refuses uncommitted or unpushed work before dispatching', async () => {
  const f = fixture()
  await expect(run(f)).rejects.toThrow('git push -u origin feat/example')
  f.push()
  writeFileSync(path.join(f.work, 'draft.txt'), 'untracked')
  await expect(run(f)).rejects.toThrow('uncommitted')
  rmSync(path.join(f.work, 'draft.txt'))
  writeFileSync(path.join(f.work, 'feature.txt'), 'next')
  git(['commit', '-qam', 'unpushed'], f.work)
  await expect(run(f)).rejects.toThrow('Push first')
  expect(f.calls()).toEqual([])
})

test('dispatches the pushed branch, waits for completion and downloads evidence', async () => {
  const f = fixture()
  f.push()
  const result = await run(f)
  expect(result).toMatchObject({ id: '42', conclusion: 'success', url: 'https://github.com/owner/repo/actions/runs/42' })
  expect(readFileSync(path.join(result.dir, 'desktop-test-evidence-1', 'shot.png'), 'utf8').trim()).toBe('shot')
  expect(existsSync(path.join(result.dir, 'failed.log'))).toBe(false)
  const calls = f.calls()
  expect(calls[0]).toBe('workflow run ci.yml --ref feat/example -f scope=affected')
  expect(calls.filter(call => call.startsWith('run view 42 --json'))).toHaveLength(2)
  expect(calls.at(-1)).toBe(`run download 42 --dir ${result.dir}`)
})

test('runs requested specs and keeps the failed log', async () => {
  const f = fixture('failure')
  f.push()
  const result = await run(f, { scope: 'e2e', specs: ['workbench.spec.ts', 'project.spec.ts'], grep: 'drag' })
  expect(result.conclusion).toBe('failure')
  expect(f.calls()[0]).toBe('workflow run ci.yml --ref feat/example -f scope=e2e -f specs=workbench.spec.ts project.spec.ts -f grep=drag')
  expect(readFileSync(path.join(result.dir, 'failed.log'), 'utf8')).toContain('1 failed')
})

test('rejects options that do not match the scope', async () => {
  const f = fixture()
  f.push()
  await expect(run(f, { scope: 'e2e' })).rejects.toThrow('--spec')
  await expect(run(f, { grep: 'drag' })).rejects.toThrow('--spec')
  await expect(run(f, { scope: 'nightly' })).rejects.toThrow('Usage')
  await expect(run(f, { scope: 'package', specs: ['workbench.spec.ts'] })).rejects.toThrow('--spec')
  expect(f.calls()).toEqual([])
})

test('dispatches the package scope without spec inputs', async () => {
  const f = fixture()
  f.push()
  await run(f, { scope: 'package' })
  expect(f.calls()[0]).toBe('workflow run ci.yml --ref feat/example -f scope=package')
})
