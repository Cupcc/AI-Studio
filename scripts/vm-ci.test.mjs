import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { git } from './check-paths.mjs'
import {
  IMAGE, MAX_VMS, acquireSlots, e2eCommands, guestScript, partition, planRun, provisionScript, releaseSlots, specPath, specTimings,
  stepLog, testedHead, unitWeight, vmCi, writeRecord
} from './vm-ci.mjs'

const temporary = []
beforeEach(() => {
  for (const name of Object.keys(process.env)) if (name.startsWith('GIT_')) vi.stubEnv(name, undefined)
})
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

function repo(files = { 'README.md': '# fixture\n' }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'studio-vm-ci-'))
  temporary.push(dir)
  const work = path.join(dir, '任务 worktree')
  git(['init', '-q', '-b', 'feat/example', work], dir)
  git(['config', 'user.email', 'fixture@example.invalid'], work)
  git(['config', 'user.name', 'Fixture'], work)
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(work, file)), { recursive: true })
    writeFileSync(path.join(work, file), text)
  }
  git(['add', '-A'], work)
  git(['commit', '-q', '-m', 'fixture'], work)
  return work
}

test('spec arguments become exact e2e/ paths, so diff.spec.ts no longer selects turn-diff.spec.ts', () => {
  expect(specPath('diff.spec.ts')).toBe('e2e/diff.spec.ts')
  expect(specPath('e2e/diff.spec.ts')).toBe('e2e/diff.spec.ts')
  expect(specPath('apps/desktop/e2e/project.spec.ts')).toBe('e2e/project.spec.ts')
  expect(() => specPath('diff')).toThrow('Not an E2E spec file name')
  expect(() => specPath('../x.spec.ts')).toThrow()
})

test('E2E commands group files by filter and keep each filtered spec separate', () => {
  const commands = e2eCommands([{ file: 'e2e/a.spec.ts', grep: '' }, { file: 'e2e/b.spec.ts', grep: '' }, { file: 'e2e/runtime-tools.spec.ts', grep: 'FR-TOOL-003|FR-TOOL-004' }])
  expect(commands.map(step => step.cmd.join(' '))).toEqual([
    'pnpm --filter @ai-studio/desktop run test:e2e:built e2e/a.spec.ts e2e/b.spec.ts',
    'pnpm --filter @ai-studio/desktop run test:e2e:built e2e/runtime-tools.spec.ts --grep FR-TOOL-003|FR-TOOL-004'
  ])
  expect(commands.map(step => [step.name, step.grep])).toEqual([['e2e-1', ''], ['e2e-2', 'FR-TOOL-003|FR-TOOL-004']])
})

test('partition balances recorded durations after the work each VM already has', () => {
  const units = ['a', 'b', 'c', 'd', 'e'].map(name => ({ file: `e2e/${name}.spec.ts`, grep: '' }))
  const timings = { 'e2e/a.spec.ts': 46, 'e2e/b.spec.ts': 42, 'e2e/c.spec.ts': 30, 'e2e/d.spec.ts': 29 }
  const [first, second] = partition(units, unitWeight(timings), [45, 0])
  expect([...first.units, ...second.units].map(unit => unit.file).sort()).toEqual(units.map(unit => unit.file))
  expect(Math.abs(first.load - second.load)).toBeLessThanOrEqual(15)
  expect(unitWeight(timings)({ file: 'e2e/e.spec.ts', grep: '' })).toBe(15)
  expect(unitWeight(timings)({ file: 'e2e/a.spec.ts', grep: 'only' })).toBe(23)
})

test('plans run one VM by default and split specs across two with --parallel', () => {
  const single = planRun({ scope: 'e2e', specs: ['diff.spec.ts', 'files.spec.ts'], grep: 'drag', head: 'h', cwd: '/x' })
  expect(single.vms).toHaveLength(1)
  expect(single.vms[0].steps.map(step => step.name)).toEqual(['build-adapter', 'build-desktop', 'e2e'])
  expect(single.vms[0].steps.at(-1).cmd.slice(-4)).toEqual(['e2e/diff.spec.ts', 'e2e/files.spec.ts', '--grep', 'drag'])

  const parallel = planRun({ scope: 'e2e', specs: ['diff.spec.ts', 'files.spec.ts'], parallel: true, head: 'h', cwd: '/x' })
  expect(parallel.vms.map(vm => vm.e2e.map(unit => unit.file))).toEqual([['e2e/diff.spec.ts'], ['e2e/files.spec.ts']])

  const one = planRun({ scope: 'e2e', specs: ['diff.spec.ts'], parallel: true, head: 'h', cwd: '/x' })
  expect(one.vms).toHaveLength(1)
  expect(one.notes.join('\n')).toContain('one VM')

  const packaging = planRun({ scope: 'package', head: 'h', cwd: '/x' }).vms[0].steps
  expect(packaging.map(step => step.name)).toEqual(['build-adapter', 'build-desktop', 'package', 'install-clis', 'smoke-packaged'])
  // The CLI versions come from the tested commit's ci.yml, the same pins as GitHub CI.
  expect(packaging[3].shell).toContain('.github/workflows/ci.yml')
})

test('full runs every spec, all of them in one Playwright call on a single VM, and packages once in parallel', () => {
  const work = repo({ 'apps/desktop/e2e/a.spec.ts': '', 'apps/desktop/e2e/b.spec.ts': '', 'apps/desktop/e2e/fixture.ts': '' })
  const single = planRun({ scope: 'full', head: 'h', cwd: work })
  expect(single.vms[0].steps.map(step => step.name)).toEqual(['check-code', 'build-adapter', 'build-desktop', 'e2e', 'package', 'install-clis', 'smoke-packaged'])
  expect(single.vms[0].steps[3].cmd).toEqual(['pnpm', '--filter', '@ai-studio/desktop', 'run', 'test:e2e:built'])

  const parallel = planRun({ scope: 'full', parallel: true, head: 'h', cwd: work })
  const names = parallel.vms.map(vm => vm.steps.map(step => step.name))
  expect(names[0]).toEqual(['check-code', 'build-adapter', 'build-desktop', 'e2e'])
  expect(names[1]).toEqual(['build-adapter', 'build-desktop', 'e2e', 'package', 'install-clis', 'smoke-packaged'])
  expect(parallel.vms.flatMap(vm => vm.e2e.map(unit => unit.file)).sort()).toEqual(['e2e/a.spec.ts', 'e2e/b.spec.ts'])
})

test('affected checks the docs on the host and starts no VM for a documentation-only change', () => {
  const work = repo()
  const base = git(['rev-parse', 'HEAD'], work).trim()
  writeFileSync(path.join(work, 'README.md'), '# fixture\n\nMore.\n')
  git(['commit', '-qam', 'docs'], work)
  const plan = planRun({ scope: 'affected', base, head: git(['rev-parse', 'HEAD'], work).trim(), cwd: work })
  expect(plan.host.map(step => step.cmd.slice(0, 2))).toEqual([['node', 'scripts/check-docs.mjs']])
  expect(plan.vms).toEqual([])
})

test('the guest script fetches the tested commit by its temporary ref, removes stale builds and stops at the first failure', () => {
  const script = guestScript({ id: '17', head: 'abc123', label: 'a', steps: e2eCommands([{ file: 'e2e/a.spec.ts', grep: 'a b|c' }]) })
  expect(script).toContain('+refs/vm-ci/17/head:refs/vm-ci/head')
  expect(script).toContain('git checkout --quiet --force --detach abc123')
  expect(script).toContain('rm -rf .runtime/desktop-e2e .runtime/desktop packages/agent-adapter/dist apps/desktop/out')
  expect(script).toContain("run 03-e2e pnpm --filter @ai-studio/desktop run test:e2e:built e2e/a.spec.ts --grep 'a b|c'\nkeep e2e\n")
  expect(script).toContain('mv .runtime/desktop-e2e "$OUT/$1/"')
  expect(script).toContain('run() { (( rc )) && return 0;')
  expect(script).toContain('export CI=true HUSKY=0')
  expect(script).toContain('cat ~/.ai-studio-ci.deps')
  expect(script).toContain('else pnpm install --frozen-lockfile; fi')
  expect(script.trimEnd().endsWith('exit $rc')).toBe(true)
  expect(stepLog(2, { name: 'e2e' })).toBe('03-e2e')
})

test('provisioning records the dependency hash and flushes the disk before the VM is powered off', () => {
  const script = provisionScript({ id: '17', head: 'abc123' })
  expect(script).toContain('> ~/.ai-studio-ci.deps')
  expect(script.trimEnd().endsWith('sync')).toBe(true)
})

test('spec timings sum per file from the list reporter, keyed by filter', () => {
  const output = [
    '  \u001b[32m✓\u001b[39m  1 e2e/a.spec.ts:10:5 › one (1.5s)',
    '  ✘  2 e2e/a.spec.ts:20:5 › two (500ms)',
    '  ✓  3 e2e/b.spec.ts:5:5 › three (2.0s)',
    '  -  4 e2e/c.spec.ts:5:5 › skipped'
  ].join('\n')
  expect(specTimings(output)).toEqual({ 'e2e/a.spec.ts': 2, 'e2e/b.spec.ts': 2 })
  expect(specTimings(output, 'x')).toEqual({ 'e2e/a.spec.ts|x': 2, 'e2e/b.spec.ts|x': 2 })
})

test('at most two VM slots are held machine-wide; a slot of a dead owner is reclaimed', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'studio-vm-slots-'))
  temporary.push(dir)
  const alive = pid => pid !== 404
  const first = acquireSlots(dir, 1, { pid: 1, branch: 'a' }, alive)
  const second = acquireSlots(dir, 1, { pid: 2, branch: 'b' }, alive)
  expect(MAX_VMS).toBe(2)
  expect([first.slots, second.slots].every(slots => slots?.length === 1)).toBe(true)
  const blocked = acquireSlots(dir, 1, { pid: 3 }, alive)
  expect(blocked.slots).toBeNull()
  expect(blocked.holders.map(holder => holder.branch).sort()).toEqual(['a', 'b'])
  releaseSlots(second.slots)
  expect(acquireSlots(dir, 2, { pid: 3 }, alive).slots).toBeNull()
  expect(readdirSync(dir)).toEqual(['slot-0'])
  writeFileSync(path.join(first.slots[0], 'owner.json'), JSON.stringify({ pid: 404 }))
  expect(acquireSlots(dir, 2, { pid: 5 }, alive).slots).toHaveLength(2)
})

test('run records use the integration gate format in the common Git directory, also from a linked worktree', () => {
  const work = repo()
  const linked = path.join(path.dirname(work), 'linked worktree')
  git(['worktree', 'add', '-q', '-b', 'feat/other', linked], work)
  writeRecord(linked, { id: '7', url: '.runtime/vm-ci/7', branch: 'feat/other', headSha: 'abc', scope: 'affected', conclusion: 'success' })
  const record = JSON.parse(readFileSync(path.join(work, '.git', 'ai-studio-ci', '7.json'), 'utf8'))
  expect(record).toEqual({ id: '7', url: '.runtime/vm-ci/7', branch: 'feat/other', headSha: 'abc', scope: 'affected', conclusion: 'success', runner: 'vm' })
})

test('only committed work is tested', () => {
  const work = repo()
  expect(testedHead(work).branch).toBe('feat/example')
  writeFileSync(path.join(work, 'new.txt'), 'x')
  expect(() => testedHead(work)).toThrow('uncommitted changes')
})

/** A fake tart: VMs boot instantly; each guest script reports its steps and writes logs into the shared ci directory. */
function fakeDeps({ failStep = '', report = null, interrupt = false, vms = [{ Name: IMAGE, Running: false }, { Name: 'vmci-1-a', Running: true }] } = {}) {
  const calls = [], logs = [], shares = {}
  let clock = 1794500000000
  const child = () => Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null, kill() { this.exitCode = 143; this.emit('exit', 143); this.emit('close', 143) } })
  const running = new Map()
  return {
    calls, logs,
    deps: {
      tart: args => {
        calls.push(args.join(' '))
        if (args[0] === 'list') return JSON.stringify(vms)
        if (args[0] === 'stop' && running.has(args[1])) { const vm = running.get(args[1]); vm.exitCode = 0; vm.emit('exit', 0) }
        return ''
      },
      spawnTart: args => {
        calls.push(args.join(' '))
        const proc = child()
        if (args[0] === 'run') {
          shares[args[1]] = args.find(arg => arg.startsWith('--dir=ci:')).slice('--dir=ci:'.length)
          running.set(args[1], proc)
        } else if (args[0] === 'exec') {
          const label = path.basename(args[3], '.zsh'), out = path.join(shares[args[1]], label)
          const script = readFileSync(path.join(shares[args[1]], `${label}.zsh`), 'utf8')
          const steps = [...script.matchAll(/^run (\S+) /gm)].map(match => match[1])
          // Ctrl-C while the guest runs: the step never finishes; the runner kills `tart exec`.
          if (interrupt) { setImmediate(() => process.emit('SIGINT')); return proc }
          setImmediate(() => {
            mkdirSync(out, { recursive: true })
            let code = 0
            for (const step of steps) {
              const failed = step.endsWith(failStep) && failStep
              writeFileSync(path.join(out, `${step}.log`), step.includes('e2e') ? `  ✓  1 e2e/${label}.spec.ts:1:1 › t (3.0s)\n` : `${failed ? 'boom\n' : 'ok\n'}`)
              if (step.includes('e2e') && report) {
                const kept = path.join(out, 'e2e', 'desktop-e2e')
                mkdirSync(path.join(kept, 'test-results', 't'), { recursive: true })
                writeFileSync(path.join(kept, 'test-results', 't', 'trace.zip'), '')
                writeFileSync(path.join(kept, 'report.json'), JSON.stringify(report))
              }
              proc.stdout.write(`::step ${step} start\n::step ${step} ${failed ? 1 : 0} 3\n`)
              if (failed) { code = 1; break }
            }
            proc.stdout.end(); proc.exitCode = code; proc.emit('close', code)
          })
        }
        return proc
      },
      run: () => ({ status: 0, stdout: 'docs ok\n', stderr: '' }),
      sleep: async () => {}, alive: () => true, now: () => clock++, log: line => logs.push(line)
    }
  }
}

test('a parallel run boots two clones, merges their results and always cleans up', async () => {
  const work = repo()
  const { calls, logs, deps } = fakeDeps()
  const result = await vmCi({ scope: 'e2e', specs: ['a.spec.ts', 'b.spec.ts'], parallel: true, cwd: work, deps })
  expect(result.conclusion).toBe('success')
  expect(result.codes).toEqual([0, 0])
  const id = result.id
  for (const label of ['a', 'b']) {
    expect(calls).toContain(`clone ${IMAGE} vmci-${id}-${label}`)
    expect(calls).toContain(`set vmci-${id}-${label} --cpu 4 --memory 6144 --display 1920x1080px`)
    expect(calls.some(call => call.startsWith(`run vmci-${id}-${label} --no-graphics --dir=repo:`) && call.endsWith(':ro --dir=ci:' + call.split('--dir=ci:')[1]))).toBe(true)
    expect(calls).toContain(`delete vmci-${id}-${label}`)
  }
  // The clone left behind by a killed run is removed before booting.
  expect(calls).toContain('delete vmci-1-a')
  expect(git(['for-each-ref', 'refs/vm-ci'], work).trim()).toBe('')
  const shared = path.join(work, '.git', 'ai-studio-vm-ci')
  expect(readdirSync(path.join(shared, 'slots'))).toEqual([])
  expect(JSON.parse(readFileSync(path.join(shared, 'timings.json'), 'utf8'))).toMatchObject({ 'e2e/a.spec.ts': 3, 'e2e/b.spec.ts': 3 })
  const record = JSON.parse(readFileSync(path.join(work, '.git', 'ai-studio-ci', `${id}.json`), 'utf8'))
  expect(record).toMatchObject({ scope: 'e2e', conclusion: 'success', branch: 'feat/example', runner: 'vm', url: `vm-ci ${id}` })
  expect(existsSync(path.join(work, '.runtime', 'vm-ci', id, 'b', '05-e2e.log'))).toBe(true)
  expect(logs.some(line => line.startsWith('[b] 05-e2e ok'))).toBe(true)
})

test('a failing step fails the run, prints the end of its log and still removes the VM', async () => {
  const work = repo()
  const { calls, logs, deps } = fakeDeps({ failStep: 'build-desktop', vms: [{ Name: IMAGE, Running: false }] })
  const result = await vmCi({ scope: 'e2e', specs: ['a.spec.ts'], cwd: work, deps })
  expect(result.conclusion).toBe('failure')
  expect(logs).toContain('boom')
  expect(logs.some(line => line.startsWith('[a] 04-build-desktop FAILED (exit 1)'))).toBe(true)
  expect(calls).toContain(`set vmci-${result.id}-a --cpu 4 --memory 8192 --display 1920x1080px`)
  expect(calls).toContain(`delete vmci-${result.id}-a`)
  expect(JSON.parse(readFileSync(path.join(work, '.git', 'ai-studio-ci', `${result.id}.json`), 'utf8')).conclusion).toBe('failure')
})

test('a failing E2E step names the failed tests from the report, with traces mapped to the evidence', async () => {
  const work = repo()
  const report = { suites: [{ specs: [{ file: 'a.spec.ts', line: 7, title: 'opens', tests: [{ status: 'unexpected', results: [{
    status: 'failed', error: { message: 'Timed out waiting' },
    attachments: [{ name: 'trace', path: '/Users/admin/ai-studio/.runtime/desktop-e2e/test-results/t/trace.zip' }]
  }] }] }] }] }
  const { logs, deps } = fakeDeps({ failStep: 'e2e', report, vms: [{ Name: IMAGE, Running: false }] })
  deps.devRed = branch => `dev is red as well (${branch})`
  const result = await vmCi({ scope: 'e2e', specs: ['a.spec.ts'], cwd: work, deps })
  expect(result.conclusion).toBe('failure')
  const summary = logs.find(line => line.startsWith('Failed E2E tests (1):'))
  expect(summary).toContain('a.spec.ts:7 › opens\n    Timed out waiting')
  expect(summary).toContain(`trace: .runtime/vm-ci/${result.id}/a/e2e/desktop-e2e/test-results/t/trace.zip`)
  expect(summary).toContain(`Full log: .runtime/vm-ci/${result.id}/a/05-e2e.log`)
  expect(logs).toContain('dev is red as well (feat/example)')
})

test('an interrupted run is recorded as cancelled and still removes the VM and its ref', async () => {
  const work = repo()
  const { calls, logs, deps } = fakeDeps({ interrupt: true, vms: [{ Name: IMAGE, Running: false }] })
  const listeners = process.listenerCount('SIGINT')
  const result = await vmCi({ scope: 'e2e', specs: ['a.spec.ts'], cwd: work, deps })
  expect(result.conclusion).toBe('cancelled')
  expect(calls).toContain(`delete vmci-${result.id}-a`)
  expect(git(['for-each-ref', 'refs/vm-ci'], work).trim()).toBe('')
  expect(JSON.parse(readFileSync(path.join(work, '.git', 'ai-studio-ci', `${result.id}.json`), 'utf8')).conclusion).toBe('cancelled')
  expect(logs.some(line => line.startsWith(`cancelled: vm-ci ${result.id}`))).toBe(true)
  expect(process.listenerCount('SIGINT')).toBe(listeners)
})

test('without the image the run stops before booting anything', async () => {
  const work = repo()
  const { calls, deps } = fakeDeps({ vms: [] })
  await expect(vmCi({ scope: 'e2e', specs: ['a.spec.ts'], cwd: work, deps })).rejects.toThrow('--setup')
  expect(calls.some(call => call.startsWith('clone'))).toBe(false)
})

test('option combinations match remote CI', async () => {
  const work = repo()
  const { deps } = fakeDeps()
  await expect(vmCi({ scope: 'e2e', cwd: work, deps })).rejects.toThrow('--spec is required')
  await expect(vmCi({ scope: 'affected', grep: 'x', cwd: work, deps })).rejects.toThrow('--spec/--grep only apply')
  await expect(vmCi({ scope: 'full', base: 'HEAD', cwd: work, deps })).rejects.toThrow('--base only applies')
  await expect(vmCi({ scope: 'nightly', cwd: work, deps })).rejects.toThrow('Usage')
})
