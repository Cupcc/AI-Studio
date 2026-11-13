import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { git } from './check-paths.mjs'
import { IMAGE } from './vm-ci.mjs'
import { AGENT_BROWSER_VERSION, ab, defaultLabel, expandPlaceholders, openProject, session, setupScript, start, stop } from './vm-ui.mjs'

const temporary = []
beforeEach(() => {
  for (const name of Object.keys(process.env)) if (name.startsWith('GIT_')) vi.stubEnv(name, undefined)
})
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

function temporaryDir(prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  temporary.push(dir)
  return dir
}

function repo() {
  const work = path.join(temporaryDir('studio-vm-ui-'), '任务 worktree')
  git(['init', '-q', '-b', 'feat/example', work], path.dirname(work))
  git(['config', 'user.email', 'fixture@example.invalid'], work)
  git(['config', 'user.name', 'Fixture'], work)
  writeFileSync(path.join(work, '.gitignore'), '.runtime/\n')
  git(['add', '-A'], work)
  git(['commit', '-q', '-m', 'fixture'], work)
  return work
}

/** A guest that is only a home directory: `tart exec <vm> zsh -c <script>` runs the script in the local zsh with these stubs on PATH. */
function fakeGuest() {
  const home = temporaryDir('studio-vm-ui-guest-')
  const stub = (file, lines) => {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, ['#!/bin/sh', ...lines, ''].join('\n'))
    chmodSync(file, 0o755)
  }
  // One record per call, one field per argument, so argument boundaries stay visible.
  const record = name => `{ for arg in "$@"; do printf '%s\\037' "$arg"; done; printf '\\036'; } >> "$HOME/${name}.calls"`
  stub(path.join(home, 'ab', 'node_modules', '.bin', 'agent-browser'), [record('agent-browser'), '[ "$3" = fail ] && exit 7', 'echo "ran $3"'])
  stub(path.join(home, 'bin', 'node'), [record('node')])
  const calls = name => existsSync(path.join(home, `${name}.calls`))
    ? readFileSync(path.join(home, `${name}.calls`), 'utf8').split('\u001e').slice(0, -1).map(call => call.split('\u001f').slice(0, -1))
    : []
  return { home, calls, env: { HOME: home, PATH: `${path.join(home, 'bin')}:/usr/bin:/bin` } }
}

/** A fake tart: VMs boot instantly and the setup script exits with `setupExit` after writing fifty log lines. */
function fakeDeps({ setupExit = 0, vms = [IMAGE], guest = null, interruptSetup = false } = {}) {
  const calls = [], logs = [], signals = [], shares = {}
  const state = { clock: 1794500000000 }
  const present = new Set(vms), running = new Map()
  const child = () => Object.assign(new EventEmitter(), { exitCode: null, kill() { this.exitCode = 143; this.emit('close', 143) } })
  return {
    calls, logs, signals, state, vms: () => [...present],
    deps: {
      tart: args => {
        calls.push(args.join(' '))
        const [command, name] = args
        if (command === 'list') return JSON.stringify([...present].map(Name => ({ Name, Running: running.has(Name) })))
        if (command === 'clone') present.add(args[2])
        if (command === 'stop') {
          if (!running.has(name)) throw new Error(`${name} is not running`)
          const vm = running.get(name)
          running.delete(name); vm.exitCode = 0; vm.emit('exit', 0)
        }
        if (command === 'delete' && !present.delete(name)) throw new Error(`${name} does not exist`)
        return ''
      },
      spawnTart: args => {
        calls.push(args.join(' '))
        if (args[0] === 'run') {
          shares[args[1]] = args.find(arg => arg.startsWith('--dir=out:')).slice('--dir=out:'.length)
          running.set(args[1], child())
          return running.get(args[1])
        }
        if (args[3] === '-c') return spawn('zsh', ['-c', args[4]], { env: guest.env, stdio: 'ignore' })
        const proc = child()
        if (interruptSetup) { setImmediate(() => process.emit('SIGINT')); return proc }
        setImmediate(() => {
          writeFileSync(path.join(shares[args[1]], 'setup.log'), Array.from({ length: 50 }, (_, index) => `setup line ${String(index + 1).padStart(2, '0')}\n`).join(''))
          proc.exitCode = setupExit; proc.emit('close', setupExit)
        })
        return proc
      },
      sleep: () => new Promise(resolve => setImmediate(resolve)),
      alive: pid => pid === process.pid, now: () => state.clock, log: line => logs.push(line),
      kill: (pid, signal) => { signals.push([pid, signal]); process.emit(signal) }
    }
  }
}

const ready = logs => vi.waitFor(() => expect(logs.some(line => line.startsWith('READY '))).toBe(true))
const slotOwners = work => {
  const dir = path.join(work, '.git', 'ai-studio-vm-ci', 'slots')
  return existsSync(dir) ? readdirSync(dir).map(slot => JSON.parse(readFileSync(path.join(dir, slot, 'owner.json'), 'utf8'))) : []
}
const stagingOf = calls => calls.find(call => call.startsWith('run ')).match(/--dir=repo:(\S+)\/repo:ro/)[1]
function expectCleanedUp(work, fake) {
  expect(fake.vms()).toEqual([IMAGE])
  expect(git(['for-each-ref', 'refs/vm-ui'], work).trim()).toBe('')
  expect(slotOwners(work)).toEqual([])
}

test('the label defaults to the branch name with every other character replaced by a hyphen', async () => {
  expect(defaultLabel('ci/vm-ui-checks')).toBe('ci-vm-ui-checks')
  expect(defaultLabel('feat/Workbench_v2.1')).toBe('feat--orkbench-v2-1')
  expect(session('ci-vm-ui-checks', '/x')).toEqual({
    label: 'ci-vm-ui-checks', name: 'vmci-ui-ci-vm-ui-checks', ref: 'refs/vm-ui/ci-vm-ui-checks/head',
    evidence: '/x/.runtime/vm-ui/ci-vm-ui-checks', ports: { cdp: 9341, inspector: 9342 }
  })
  expect(() => session('a b', '/x')).toThrow('Invalid label')
  expect(() => session('../x', '/x')).toThrow('Invalid label')

  const work = repo()
  const { calls, logs, deps } = fakeDeps()
  const holder = start({ cwd: work, deps })
  await ready(logs)
  expect(calls).toContain(`clone ${IMAGE} vmci-ui-feat-example`)
  process.emit('SIGTERM')
  await holder
})

test('the setup script checks out the tested commit, pins agent-browser and starts the app with the simulated provider on both ports', () => {
  const script = setupScript(session('probe', '/x'), 'abc123')
  expect(script).toContain('git fetch --quiet --no-tags "/Volumes/My Shared Files/repo" +refs/vm-ui/probe/head:refs/vm-ui/head')
  expect(script).toContain('git checkout --quiet --force --detach abc123')
  expect(script).toContain('cat ~/.ai-studio-ci.deps')
  expect(script).toContain('else pnpm install --frozen-lockfile; fi')
  expect(AGENT_BROWSER_VERSION).toBe('0.38.2')
  expect(script).toContain('npm install --prefix "$HOME/ab" --no-audit --no-fund agent-browser@0.38.2')
  expect(script).toMatch(/STUDIO_E2E_PROVIDERS=1 nohup \.\/node_modules\/\.bin\/electron \. --studio-user-data-dir="\$\(mktemp -d\)" --remote-debugging-port=9341 --inspect=9342 > "\/Volumes\/My Shared Files\/out\/electron\.log"/)
  expect(script).toContain('curl -sf http://127.0.0.1:9341/json/version')
  expect(script).toContain('curl -sf http://127.0.0.1:9342/json/list')
  expect(script.indexOf('pnpm --filter @ai-studio/desktop run build')).toBeLessThan(script.indexOf('nohup ./node_modules/.bin/electron'))
})

test('real mode installs the CLIs that ci.yml pins and starts the app without the simulated provider', () => {
  const script = setupScript(session('probe', '/x'), 'abc123', { real: true })
  expect(script).toContain('npm install --prefix "$HOME/studio-cli" --no-audit --no-fund $clis')
  expect(script).toContain('.github/workflows/ci.yml')
  expect(script).not.toContain('STUDIO_E2E_PROVIDERS')
  expect(script.indexOf('studio-cli')).toBeLessThan(script.indexOf('nohup ./node_modules/.bin/electron'))
})

test('ab replaces {{name}} with the local setting and names the available settings when one is missing', async () => {
  const guest = fakeGuest()
  const { deps } = fakeDeps({ guest })
  const config = () => ({ codex_api_key: 'sk test $1', codex_api_base_url: 'http://gateway' })
  expect(await ab({ label: 'probe', args: ['fill', '@e1', '{{codex_api_base_url}}/v1 {{codex_api_key}}'], cwd: '/x', deps, config })).toBe(0)
  expect(guest.calls('agent-browser').at(-1)).toEqual(['--session', 'ui', 'fill', '@e1', 'http://gateway/v1 sk test $1'])
  expect(() => expandPlaceholders(['{{missing}}'], config)).toThrow('available: codex_api_key, codex_api_base_url')
  expect(expandPlaceholders(['plain'], () => { throw new Error('the settings file is read only for a placeholder') })).toEqual(['plain'])
})

test('start holds a slot that names its VM, prints READY and cleans up on a signal', async () => {
  const work = repo()
  const head = git(['rev-parse', 'HEAD'], work).trim()
  const fake = fakeDeps(), { calls, logs, deps } = fake
  const listeners = process.listenerCount('SIGTERM')
  const holder = start({ label: 'probe', cwd: work, deps })
  await ready(logs)

  const evidence = path.join(work, '.runtime', 'vm-ui', 'probe')
  expect(logs).toContain(`READY vmci-ui-probe evidence=${evidence}`)
  expect(slotOwners(work)).toMatchObject([{ pid: process.pid, branch: 'feat/example', vms: ['vmci-ui-probe'] }])
  expect(git(['rev-parse', 'refs/vm-ui/probe/head'], work).trim()).toBe(head)
  expect(calls).toContain(`clone ${IMAGE} vmci-ui-probe`)
  expect(calls).toContain('set vmci-ui-probe --cpu 4 --memory 6144 --display 1920x1080px')
  const staging = stagingOf(calls)
  expect(calls).toContain(`run vmci-ui-probe --no-graphics --dir=repo:${staging}/repo:ro --dir=out:${staging}/out`)
  expect(staging).not.toContain(' ')
  expect(readFileSync(path.join(staging, 'out', 'setup.zsh'), 'utf8')).toContain(`--detach ${head}`)
  expect(calls).toContain('exec vmci-ui-probe zsh /Volumes/My Shared Files/out/setup.zsh')

  process.emit('SIGTERM')
  expect(await holder).toEqual({ name: 'vmci-ui-probe', stopped: 'SIGTERM' })
  expect(calls.indexOf('stop vmci-ui-probe --timeout 5')).toBeLessThan(calls.indexOf('delete vmci-ui-probe'))
  expectCleanedUp(work, fake)
  expect(existsSync(staging)).toBe(false)
  expect(existsSync(path.join(evidence, 'setup.log'))).toBe(true)
  expect(process.listenerCount('SIGTERM')).toBe(listeners)
})

test('a failed setup prints the last 40 lines of its log and cleans up', async () => {
  const work = repo()
  const fake = fakeDeps({ setupExit: 3 }), { calls, logs, deps } = fake
  await expect(start({ label: 'probe', cwd: work, deps })).rejects.toThrow(`Guest setup failed (exit 3). Full log: ${path.join(work, '.runtime', 'vm-ui', 'probe', 'setup.log')}`)
  const printed = logs.join('\n')
  expect(printed).toContain('setup line 11\n')
  expect(printed).toContain('setup line 50')
  expect(printed).not.toContain('setup line 10')
  expect(printed).not.toContain('READY')
  expectCleanedUp(work, fake)
  expect(existsSync(stagingOf(calls))).toBe(false)
})

test('a signal during setup ends it without READY and cleans up', async () => {
  const work = repo()
  const fake = fakeDeps({ interruptSetup: true }), { logs, deps } = fake
  expect(await start({ label: 'probe', cwd: work, deps })).toEqual({ name: 'vmci-ui-probe', stopped: 'SIGINT' })
  expect(logs.join('\n')).not.toContain('READY')
  expectCleanedUp(work, fake)
})

test('start refuses a dirty tree and an existing VM name without taking a slot', async () => {
  const work = repo()
  const taken = fakeDeps({ vms: [IMAGE, 'vmci-ui-probe'] })
  await expect(start({ label: 'probe', cwd: work, deps: taken.deps })).rejects.toThrow('vmci-ui-probe already exists')
  expect(taken.calls).toEqual(['list --format json --source local'])
  expect(slotOwners(work)).toEqual([])

  const noImage = fakeDeps({ vms: [] })
  await expect(start({ label: 'probe', cwd: work, deps: noImage.deps })).rejects.toThrow('vm-ci.mjs --setup')

  writeFileSync(path.join(work, 'new.txt'), 'x')
  const dirty = fakeDeps()
  await expect(start({ label: 'probe', cwd: work, deps: dirty.deps })).rejects.toThrow('uncommitted changes')
  expect(dirty.calls).toEqual([])
  expect(slotOwners(work)).toEqual([])
  expect(existsSync(path.join(work, '.runtime'))).toBe(false)
})

test('the session ends by itself when the TTL runs out', async () => {
  const work = repo()
  const fake = fakeDeps(), { logs, state, deps } = fake
  let ended = null
  const holder = start({ label: 'probe', ttl: 5, cwd: work, deps }).then(result => { ended = result })
  await ready(logs)
  state.clock += 5 * 60_000 - 1
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(ended).toBeNull()
  state.clock += 1
  await holder
  expect(ended).toEqual({ name: 'vmci-ui-probe', stopped: 'ttl' })
  expectCleanedUp(work, fake)
})

test('ab connects once, then forwards arguments with spaces and Chinese text intact and returns the guest exit code', async () => {
  const guest = fakeGuest()
  const { calls, deps } = fakeDeps({ guest })
  const fill = ['find', 'role', 'textbox', 'fill', '虚拟机里的 界面检查', '--name', "it's 消息", '']
  expect(await ab({ label: 'probe', args: fill, cwd: '/x', deps })).toBe(0)
  expect(await ab({ label: 'probe', args: ['screenshot', '/Volumes/My Shared Files/out/$HOME `id`.png'], cwd: '/x', deps })).toBe(0)
  expect(await ab({ label: 'probe', args: ['fail'], cwd: '/x', deps })).toBe(7)
  expect(guest.calls('agent-browser')).toEqual([
    ['--session', 'ui', 'connect', '9341'],
    ['--session', 'ui', ...fill],
    ['--session', 'ui', 'screenshot', '/Volumes/My Shared Files/out/$HOME `id`.png'],
    ['--session', 'ui', 'fail']
  ])
  expect(calls.every(call => call.startsWith('exec vmci-ui-probe zsh -c '))).toBe(true)
})

test('open-project creates the directory and stubs the folder dialog with it', async () => {
  const guest = fakeGuest()
  const { calls, deps } = fakeDeps({ guest })
  const dir = path.join(guest.home, '我的 project')
  expect(await openProject({ label: 'probe', dir, cwd: '/x', deps })).toBe(0)
  expect(readFileSync(path.join(dir, 'README.md'), 'utf8')).toBe('# vm-ui project\n')
  const [[inputType, flag, stub, argument]] = guest.calls('node')
  expect([inputType, flag, argument]).toEqual(['--input-type=module', '-e', dir])
  expect(stub).toContain('fetch("http://127.0.0.1:9342/json/list")')
  expect(stub).toContain('"Runtime.evaluate"')
  expect(stub).toContain('process.mainModule.require(\\"electron\\").dialog.showOpenDialog = async () => (" + JSON.stringify({ canceled: false, filePaths: [dir] })')
  expect(calls[0].startsWith('exec vmci-ui-probe zsh -c ')).toBe(true)

  writeFileSync(path.join(dir, 'README.md'), 'kept\n')
  await openProject({ label: 'probe', dir, cwd: '/x', deps })
  expect(readFileSync(path.join(dir, 'README.md'), 'utf8')).toBe('kept\n')
  expect(() => openProject({ label: 'probe', dir: 'relative', cwd: '/x', deps })).toThrow('absolute path')
})

test('stop signals the holder and returns once the VM and its slot are gone', async () => {
  const work = repo()
  const fake = fakeDeps(), { logs, signals, deps } = fake
  const holder = start({ label: 'probe', cwd: work, deps })
  await ready(logs)
  expect(await stop({ label: 'probe', cwd: work, deps })).toBe(true)
  expect(signals).toEqual([[process.pid, 'SIGTERM']])
  expect(await holder).toMatchObject({ stopped: 'SIGTERM' })
  expectCleanedUp(work, fake)
  expect(logs.at(-1)).toBe('Stopped vmci-ui-probe.')
})

test('stop reports a missing session and cleans up after a holder that was killed', async () => {
  const work = repo()
  const missing = fakeDeps()
  expect(await stop({ label: 'probe', cwd: work, deps: missing.deps })).toBe(false)
  expect(missing.logs.join('\n')).toContain('No VM UI session "probe"')
  expect(missing.signals).toEqual([])

  const slot = path.join(work, '.git', 'ai-studio-vm-ci', 'slots', 'slot-0')
  mkdirSync(slot, { recursive: true })
  writeFileSync(path.join(slot, 'owner.json'), JSON.stringify({ pid: 404, vms: ['vmci-ui-probe'] }))
  git(['update-ref', 'refs/vm-ui/probe/head', 'HEAD'], work)
  const killed = fakeDeps({ vms: [IMAGE, 'vmci-ui-probe'] })
  expect(await stop({ label: 'probe', cwd: work, deps: killed.deps })).toBe(true)
  expect(killed.signals).toEqual([])
  expectCleanedUp(work, killed)
})
