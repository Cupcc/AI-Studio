import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { affectedPlan, inventory } from './check-affected.mjs'
import { changedPaths, git } from './check-paths.mjs'
import { devRed, e2eSummary } from './remote-ci.mjs'

const usage = 'Usage: node scripts/vm-ci.mjs [--scope affected|e2e|package|full] [--spec <file>]... [--grep <pattern>] [--parallel] [--base <commit>] [--keep]\n' +
  '       node scripts/vm-ci.mjs --setup'

export const IMAGE = 'ai-studio-ci'
export const BASE_IMAGE = 'ghcr.io/cirruslabs/macos-tahoe-base:latest'
// 4 CPU / 8 GB: E2E runs one worker, so more cores barely help; 1920×1080 at 1x fits the layout specs (as CI's displayplacer).
export const VM_CONFIG = { cpu: 4, memory: 8192, display: '1920x1080px' }
// Two 8 GB guests push a 32 GB host into swap; 6 GB measured without guest swap. Parallel runs use it for both VMs.
export const PARALLEL_MEMORY = 6144
// macOS allows two macOS guests per host; every vm-ci run on this Mac shares these slots.
export const MAX_VMS = 2
const DEFAULT_SPEC_SECONDS = 15
const SHARE = '/Volumes/My Shared Files'

const pnpm = (...args) => ['pnpm', ...args]
const build = [
  { name: 'build-adapter', cmd: pnpm('--filter', '@ai-studio/agent-adapter', 'run', 'build') },
  { name: 'build-desktop', cmd: pnpm('--filter', '@ai-studio/desktop', 'run', 'build') }
]
const packaging = [
  { name: 'package', cmd: pnpm('--filter', '@ai-studio/desktop', 'run', 'package:built') },
  // LaunchServices starts the packaged app with a minimal PATH; the login shell must find these CLIs (as on CI). The
  // tested commit's ci.yml pins their versions.
  { name: 'install-clis', shell: 'clis=(${(f)"$(grep -oE "@(openai/codex|anthropic-ai/claude-code)@[0-9][^ ]*" .github/workflows/ci.yml | sort -u)"}) && ' +
    '(( $#clis == 2 )) && npm install --prefix "$HOME/studio-cli" --no-audit --no-fund $clis && ' +
    'printf \'\\nexport PATH="%s:%s:$PATH"\\n\' "$HOME/studio-cli/node_modules/.bin" "$(dirname "$(command -v node)")" | tee -a "$HOME/.bash_profile" "$HOME/.zprofile" && ' +
    '"$HOME/studio-cli/node_modules/.bin/codex" --version && "$HOME/studio-cli/node_modules/.bin/claude" --version' },
  { name: 'smoke-packaged', cmd: pnpm('smoke:packaged') }
]

/** Playwright treats file arguments as regular expressions; `e2e/diff.spec.ts` no longer matches `turn-diff.spec.ts`. */
export function specPath(spec) {
  const name = spec.replace(/^(?:apps\/desktop\/)?(?:e2e\/)?/, '')
  if (!/^[\w.-]+\.spec\.ts$/.test(name)) throw new Error(`Not an E2E spec file name: ${spec}`)
  return `e2e/${name}`
}

export function e2eCommands(units) {
  const groups = new Map()
  for (const unit of units) groups.set(unit.grep ?? '', [...(groups.get(unit.grep ?? '') ?? []), unit.file])
  return [...groups].map(([grep, files], index) => ({
    name: `e2e${groups.size > 1 ? `-${index + 1}` : ''}`, grep,
    cmd: pnpm('--filter', '@ai-studio/desktop', 'run', 'test:e2e:built', ...files, ...(grep ? ['--grep', grep] : []))
  }))
}

/** Longest-first greedy split into two VMs; `preload` is the non-E2E work each VM already has, in seconds. */
export function partition(units, weight, preload = [0, 0]) {
  const bins = preload.map(load => ({ load, units: [] }))
  for (const unit of [...units].sort((a, b) => weight(b) - weight(a) || a.file.localeCompare(b.file))) {
    const bin = bins.reduce((low, item) => item.load < low.load ? item : low)
    bin.units.push(unit); bin.load += weight(unit)
  }
  return bins
}

const unitKey = unit => unit.grep ? `${unit.file}|${unit.grep}` : unit.file
export const unitWeight = timings => unit => timings[unitKey(unit)] ?? (unit.grep && timings[unit.file] ? timings[unit.file] / 2 : timings[unit.file]) ?? DEFAULT_SPEC_SECONDS

/**
 * What runs where. The host computes the plan (the same selector as check-affected.mjs and the CI scope job) and checks
 * the docs; the VMs only execute commands. A plan without VM work starts no VM.
 */
export function planRun({ scope, specs = [], grep = '', parallel = false, base, head, cwd, timings = {} }) {
  const host = [], notes = []
  let checks = [], units = [], tail = [], full = false
  if (scope === 'affected') {
    const plan = affectedPlan(changedPaths(base, head, cwd), inventory(cwd), { base, head, cwd })
    if (plan.unknown.length) throw new Error(`No reliable affected scope for: ${plan.unknown.join(', ')}. Add a reviewed mapping in scripts/check-affected.mjs with focused regression tests.`)
    if (plan.missingTests.length) throw new Error(`Selected tests are missing: ${plan.missingTests.join(', ')}. Update the module mapping.`)
    host.push({ name: 'docs', cmd: ['node', 'scripts/check-docs.mjs', '--base', base, '--head', head] })
    checks = plan.commands.map((args, index) => ({ name: `check-${index + 1}`, cmd: pnpm(...args) }))
    units = plan.e2e.map(file => ({ file, grep: plan.e2eFilters[file] ?? '' }))
    if (plan.packaging?.length) notes.push(`Packaging inputs changed (${plan.packaging.join(', ')}); run \`node scripts/vm-ci.mjs --scope package\` as well.`)
  } else if (scope === 'e2e') {
    units = specs.map(spec => ({ file: specPath(spec), grep }))
  } else if (scope === 'package') {
    tail = packaging
  } else {
    checks = [{ name: 'check-code', cmd: pnpm('check:code') }]
    units = readdirSync(path.join(cwd, 'apps/desktop/e2e')).filter(name => name.endsWith('.spec.ts')).sort().map(name => ({ file: `e2e/${name}`, grep: '' }))
    tail = packaging; full = true
  }
  if (!checks.length && !units.length && !tail.length) return { host, vms: [], notes }

  const weight = unitWeight(timings)
  const steps = (work, e2e, after) => [...work, ...(e2e.length || after.length ? build : []), ...e2eCommands(e2e), ...after]
  if (parallel && units.length > 1) {
    // Checks and packaging each take about a minute; place them first, then balance the specs by recorded duration.
    const [a, b] = partition(units, weight, [checks.length ? 45 : 0, tail.length ? 45 : 0])
    return { host, notes, vms: [{ label: 'a', steps: steps(checks, a.units, []), e2e: a.units }, { label: 'b', steps: steps([], b.units, tail), e2e: b.units }] }
  }
  if (parallel) notes.push('Fewer than two E2E specs selected; running in one VM.')
  // A single full run calls Playwright without file arguments, exactly as CI does.
  const e2eSteps = full ? [{ name: 'e2e', cmd: pnpm('--filter', '@ai-studio/desktop', 'run', 'test:e2e:built') }] : e2eCommands(units)
  return { host, notes, vms: [{ label: 'a', steps: [...checks, ...(units.length || tail.length ? build : []), ...e2eSteps, ...tail], e2e: units }] }
}

const GUEST_SETUP_STEPS = 2
// Dependency inputs: when they match the image's, its node_modules are current and installing again only costs time.
const DEPS_HASH = 'cat pnpm-lock.yaml pnpm-workspace.yaml package.json apps/*/package.json packages/*/package.json 2>/dev/null | shasum -a 256 | cut -d" " -f1'
/** Step log names: numbered in run order, so the last log of a failed VM is the failing step. */
export const stepLog = (index, step) => `${String(index + 1).padStart(2, '0')}-${step.name}`

const quote = value => /^[\w@%+=:,./-]+$/.test(value) ? value : `'${String(value).replaceAll("'", "'\\''")}'`
const render = step => step.shell ? `zsh -c ${quote(step.shell)}` : step.cmd.map(quote).join(' ')

/** The script one VM runs: check out the tested commit from the read-only repository share, run the steps, keep evidence. */
export function guestScript({ id, head, label, steps }) {
  const checkout = `git fetch --quiet --no-tags "${SHARE}/repo" +refs/vm-ci/${id}/head:refs/vm-ci/head && ` +
    `git checkout --quiet --force --detach ${head} && git clean -ffdq && ` +
    // A fresh checkout has no build output; do not let the image's stale Adapter dist or app build mask a failure.
    'rm -rf .runtime/desktop-e2e .runtime/desktop packages/agent-adapter/dist apps/desktop/out apps/desktop/dist'
  const install = `if [[ "$(${DEPS_HASH})" == "$(cat ~/.ai-studio-ci.deps 2>/dev/null)" ]]; then echo "Dependencies match the image; install skipped."; ` +
    'else pnpm install --frozen-lockfile; fi'
  const all = [{ name: 'checkout', shell: checkout }, { name: 'install', shell: install }, ...steps]
  return [
    '#!/bin/zsh',
    'set -u',
    'source ~/.zprofile 2>/dev/null',
    'export CI=true HUSKY=0 HOMEBREW_NO_AUTO_UPDATE=1',
    `OUT="${SHARE}/ci/${label}"`,
    'mkdir -p "$OUT"',
    'cd ~/ai-studio || exit 1',
    'rc=0',
    'step() { local name=$1; shift; local t0=$SECONDS; print -r -- "::step $name start"; "$@" > "$OUT/$name.log" 2>&1; local code=$?; print -r -- "::step $name $code $((SECONDS - t0))"; return $code }',
    'run() { (( rc )) && return 0; step "$@" || rc=$?; return 0 }',
    // Each E2E run replaces the report and traces, so move them aside per step: <label>/<step>/desktop-e2e/ is where
    // e2eSummary looks for them.
    'keep() { [[ -d .runtime/desktop-e2e ]] && mkdir -p "$OUT/$1" && mv .runtime/desktop-e2e "$OUT/$1/"; return 0 }',
    ...all.flatMap((step, index) => [`run ${stepLog(index, step)} ${render(step)}`, ...(step.name.startsWith('e2e') ? [`keep ${step.name}`] : [])]),
    '[[ -f .runtime/desktop/packaged-smoke.json ]] && cp .runtime/desktop/packaged-smoke.json "$OUT/"',
    'exit $rc',
    ''
  ].join('\n')
}

export function provisionScript({ id, head }) {
  return [
    '#!/bin/zsh',
    'set -euo pipefail',
    'export HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1 HOMEBREW_NO_ENV_HINTS=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0',
    'eval "$(/opt/homebrew/bin/brew shellenv)"',
    'brew list node@24 >/dev/null 2>&1 || brew install node@24',
    'node_bin="$(brew --prefix node@24)/bin"',
    'grep -q "node@24" ~/.zprofile 2>/dev/null || printf \'\\nexport PATH="%s:$PATH"\\n\' "$node_bin" >> ~/.zprofile',
    'grep -q COREPACK_ENABLE_DOWNLOAD_PROMPT ~/.zprofile || echo "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0" >> ~/.zprofile',
    'export PATH="$node_bin:$PATH"',
    'corepack enable',
    // The repository share belongs to the host user; git refuses unknown owners by default.
    'git config --global safe.directory "*"',
    'git config --global advice.detachedHead false',
    'rm -rf ~/ai-studio && git init --quiet ~/ai-studio && cd ~/ai-studio',
    `git fetch --quiet --no-tags "${SHARE}/repo" +refs/vm-ci/${id}/head:refs/vm-ci/head`,
    `git checkout --quiet --force --detach ${head}`,
    'pnpm install --frozen-lockfile',
    `${DEPS_HASH} > ~/.ai-studio-ci.deps`,
    `print -r -- "{\\"commit\\":\\"${head}\\",\\"node\\":\\"$(node --version)\\",\\"pnpm\\":\\"$(pnpm --version)\\"}" > ~/.ai-studio-ci.json`,
    // `tart stop` powers the VM off without flushing the guest's disk cache; unsynced writes never reach the image.
    'sync',
    ''
  ].join('\n')
}

/** Per-file seconds from Playwright's list reporter, for balancing the next parallel run. */
export function specTimings(output, grep = '') {
  const timings = {}
  for (const line of output.replace(/\u001b\[[0-9;]*m/g, '').split('\n')) {
    const match = /[✓✘]\s+\d+\s+(e2e\/[\w.-]+\.spec\.ts):\d+:\d+ .*\((\d+(?:\.\d+)?)(m?s)\)\s*$/.exec(line)
    if (!match) continue
    const key = grep ? `${match[1]}|${grep}` : match[1]
    timings[key] = (timings[key] ?? 0) + Number(match[2]) / (match[3] === 'ms' ? 1000 : 1)
  }
  return timings
}

// Run records live in the Git common directory, shared by every worktree; integrate-branch.mjs reads them as its gate.
export const stateDir = cwd => path.resolve(cwd, git(['rev-parse', '--git-common-dir'], cwd).trim())

export function writeRecord(cwd, record) {
  const dir = path.join(stateDir(cwd), 'ai-studio-ci')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `${record.id}.json`), `${JSON.stringify({ ...record, runner: 'vm' })}\n`)
}

const pidAlive = pid => { try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' } }

/** Slots are directories (mkdir is atomic) holding the owner; a slot whose owner process died is free again. */
export function acquireSlots(dir, count, owner, alive = pidAlive) {
  mkdirSync(dir, { recursive: true })
  const taken = [], holders = []
  for (let index = 0; index < MAX_VMS && taken.length < count; index++) {
    const slot = path.join(dir, `slot-${index}`)
    try { mkdirSync(slot) } catch (error) {
      if (error.code !== 'EEXIST') throw error
      let holder = null
      try { holder = JSON.parse(readFileSync(path.join(slot, 'owner.json'), 'utf8')) } catch { /* being written */ }
      if (holder && !alive(holder.pid)) { rmSync(slot, { recursive: true, force: true }); index--; continue }
      if (holder) holders.push(holder)
      continue
    }
    writeFileSync(path.join(slot, 'owner.json'), JSON.stringify(owner))
    taken.push(slot)
  }
  if (taken.length < count) { releaseSlots(taken); return { slots: null, holders } }
  return { slots: taken, holders }
}

export function releaseSlots(slots) {
  for (const slot of slots ?? []) rmSync(slot, { recursive: true, force: true })
}

function tartBinary() {
  if (process.env.TART) return process.env.TART
  const found = spawnSync('sh', ['-c', 'command -v tart'], { encoding: 'utf8' }).stdout.trim()
  if (found) return found
  if (existsSync('/opt/homebrew/bin/tart')) return '/opt/homebrew/bin/tart'
  throw new Error('tart is not installed: brew install openai/tools/tart')
}

export function defaultDeps() {
  const tart = tartBinary()
  return {
    tart: (args, options = {}) => execFileSync(tart, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, ...options }),
    // Long-running tart processes (run / exec / clone from a registry); output goes to a log or is parsed by the caller.
    spawnTart: (args, output) => spawn(tart, args, { stdio: ['ignore', output ?? 'pipe', output ?? 'pipe'] }),
    run: (command, args, options) => spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options }),
    sleep, alive: pidAlive, now: Date.now, log: console.log, devRed
  }
}

// The tested commit must be committed; the VM fetches it by a temporary ref, so pushing is not required.
export function testedHead(cwd) {
  if (git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], cwd)) throw new Error('The worktree has uncommitted changes; commit them before running vm-ci (it tests HEAD).')
  return { branch: git(['branch', '--show-current'], cwd).trim(), head: git(['rev-parse', 'HEAD'], cwd).trim() }
}

const vmList = deps => JSON.parse(deps.tart(['list', '--format', 'json', '--source', 'local']))

async function untilReady(deps, name, file, timeoutMs = 240_000) {
  const started = deps.now()
  for (;;) {
    try { deps.tart(['exec', name, 'test', '-f', file], { timeout: 15_000 }); return } catch { /* booting, or the share is not mounted yet */ }
    if (deps.now() - started > timeoutMs) throw new Error(`${name} did not become ready within ${timeoutMs / 1000}s`)
    await deps.sleep(2000)
  }
}

async function waitForSlots(dir, count, owner, deps) {
  let shown = 0
  for (;;) {
    const { slots, holders } = acquireSlots(dir, count, owner, deps.alive)
    if (slots) return slots
    if (deps.now() - shown > 60_000) {
      deps.log(`Waiting for ${count} free VM slot(s); in use by ${holders.map(holder => `${holder.branch || 'detached'} (pid ${holder.pid})`).join(', ') || 'another run'}.`)
      shown = deps.now()
    }
    await deps.sleep(10_000)
  }
}

/** Clones left by a run that was killed: their slot no longer names them. */
function removeOrphans(deps, slotsDir) {
  const owned = new Set()
  for (const name of existsSync(slotsDir) ? readdirSync(slotsDir) : []) {
    try { for (const vm of JSON.parse(readFileSync(path.join(slotsDir, name, 'owner.json'), 'utf8')).vms ?? []) owned.add(vm) } catch { /* stale */ }
  }
  for (const vm of vmList(deps).filter(item => item.Name.startsWith('vmci-') && !owned.has(item.Name))) {
    try { if (vm.Running) deps.tart(['stop', vm.Name, '--timeout', '10']) } catch { /* already gone */ }
    try { deps.tart(['delete', vm.Name]) } catch { /* already gone */ }
  }
}

/**
 * Boot the clones, run one guest script per VM concurrently and always clean up: VMs, the temporary ref and the slots.
 * Returns the exit code of every VM.
 */
async function runInVms({ cwd, id, head, branch, vms, scripts, slotsDir, keep, deps, evidence }) {
  const memory = vms.length > 1 ? PARALLEL_MEMORY : VM_CONFIG.memory
  const names = vms.map(vm => `vmci-${id}-${vm.label}`)
  const staging = mkdtempSync(path.join(tmpdir(), 'vm-ci-'))
  // tart's --dir rejects paths with spaces (the worktrees directory has one); share space-free symlinks instead.
  symlinkSync(stateDir(cwd), path.join(staging, 'repo'))
  mkdirSync(path.join(staging, 'ci'))
  vms.forEach((vm, index) => writeFileSync(path.join(staging, 'ci', `${vm.label}.zsh`), scripts[index]))
  const slots = await waitForSlots(slotsDir, vms.length, { pid: process.pid, id, branch, cwd, vms: names, started: new Date(deps.now()).toISOString() }, deps)
  const ref = `refs/vm-ci/${id}/head`
  const booted = [], running = []
  let interrupted = false
  const stop = () => { interrupted = true; for (const child of running) child.kill('SIGTERM') }
  process.once('SIGINT', stop); process.once('SIGTERM', stop)
  try {
    git(['update-ref', ref, head], cwd)
    for (const name of names) {
      deps.tart(['clone', IMAGE, name])
      deps.tart(['set', name, '--cpu', String(VM_CONFIG.cpu), '--memory', String(memory), '--display', VM_CONFIG.display])
      const log = createWriteStream(path.join(evidence, `${name}.tart.log`))
      await new Promise(resolve => log.once('open', resolve))
      booted.push({ name, process: deps.spawnTart(['run', name, '--no-graphics', `--dir=repo:${path.join(staging, 'repo')}:ro`, `--dir=ci:${path.join(staging, 'ci')}`], log) })
    }
    await Promise.all(vms.map((vm, index) => untilReady(deps, names[index], `${SHARE}/ci/${vm.label}.zsh`)))
    return await Promise.all(vms.map((vm, index) => new Promise(resolve => {
      if (interrupted) return resolve(130)
      const child = deps.spawnTart(['exec', names[index], 'zsh', `${SHARE}/ci/${vm.label}.zsh`])
      running.push(child)
      const out = createWriteStream(path.join(evidence, `${vm.label}.log`))
      let buffer = ''
      child.stdout.on('data', chunk => {
        out.write(chunk); buffer += chunk
        const lines = buffer.split('\n'); buffer = lines.pop()
        for (const line of lines) {
          const match = /^::step (\S+) (start|\d+) ?(\d+)?$/.exec(line.trim())
          if (match && match[2] !== 'start') deps.log(`[${vm.label}] ${match[1]} ${match[2] === '0' ? 'ok' : `FAILED (exit ${match[2]})`} ${match[3]}s`)
        }
      })
      child.stderr.on('data', chunk => out.write(chunk))
      child.on('close', code => { out.end(); resolve(interrupted ? 130 : code ?? 1) })
    })))
  } finally {
    process.off('SIGINT', stop); process.off('SIGTERM', stop)
    for (const { name, process: child } of booted) {
      try { deps.tart(['stop', name, '--timeout', '5']) } catch { /* not running */ }
      await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve))
      if (!keep) { try { deps.tart(['delete', name]) } catch { /* already gone */ } }
    }
    try { git(['update-ref', '-d', ref], cwd) } catch { /* already removed */ }
    releaseSlots(slots)
    // Keep step logs and test evidence with the run; the staging directory is temporary.
    for (const vm of vms) {
      const from = path.join(staging, 'ci', vm.label)
      if (existsSync(from)) cpSync(from, path.join(evidence, vm.label), { recursive: true })
    }
    rmSync(staging, { recursive: true, force: true })
  }
}

const hasRef = (cwd, ref) => spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd }).status === 0
const lockHash = cwd => createHash('sha256').update(readFileSync(path.join(cwd, 'pnpm-lock.yaml'))).digest('hex')

export async function vmCi({ scope = 'affected', specs = [], grep = '', parallel = false, base = '', keep = false, cwd = process.cwd(), deps = defaultDeps() } = {}) {
  if (!['affected', 'e2e', 'package', 'full'].includes(scope)) throw new Error(usage)
  if ((scope === 'e2e') !== (specs.length > 0) || (grep && scope !== 'e2e')) throw new Error('--spec is required for, and --spec/--grep only apply to, --scope e2e.')
  if (base && scope !== 'affected') throw new Error('--base only applies to --scope affected.')
  const { branch, head } = testedHead(cwd)
  const shared = path.join(stateDir(cwd), 'ai-studio-vm-ci')
  const timingsFile = path.join(shared, 'timings.json')
  const timings = existsSync(timingsFile) ? JSON.parse(readFileSync(timingsFile, 'utf8')) : {}
  const comparison = scope === 'affected' ? base || git(['merge-base', 'HEAD', hasRef(cwd, 'refs/heads/dev') ? 'dev' : 'origin/dev'], cwd).trim() : ''
  const plan = planRun({ scope, specs, grep, parallel, base: comparison, head, cwd, timings })
  const id = String(deps.now())
  const evidence = path.join(cwd, '.runtime', 'vm-ci', id)
  mkdirSync(evidence, { recursive: true })
  deps.log(`vm-ci ${scope}${parallel && plan.vms.length > 1 ? ' (2 VMs)' : ''} for ${branch || 'detached HEAD'} at ${head.slice(0, 12)}${comparison ? ` (base ${comparison.slice(0, 12)})` : ''}`)
  for (const note of plan.notes) deps.log(note)

  let failed = null
  for (const step of plan.host) {
    const result = deps.run(step.cmd[0], step.cmd.slice(1), { cwd })
    writeFileSync(path.join(evidence, `host-${step.name}.log`), `${result.stdout ?? ''}${result.stderr ?? ''}`)
    deps.log(`[host] ${step.name} ${result.status === 0 ? 'ok' : `FAILED (exit ${result.status})`}`)
    if (result.status !== 0) { failed = { label: 'host', log: path.join(evidence, `host-${step.name}.log`) }; break }
  }

  let codes = []
  if (!failed && plan.vms.length) {
    if (!vmList(deps).some(vm => vm.Name === IMAGE)) throw new Error(`The VM image ${IMAGE} does not exist. Create it once with: node scripts/vm-ci.mjs --setup`)
    const image = path.join(shared, 'image.json')
    if (existsSync(image) && JSON.parse(readFileSync(image, 'utf8')).lockHash !== lockHash(cwd)) {
      deps.log('Dependencies changed since the VM image was built, so installing takes longer; refresh it with --setup when convenient.')
    }
    removeOrphans(deps, path.join(shared, 'slots'))
    const scripts = plan.vms.map(vm => guestScript({ id, head, label: vm.label, steps: vm.steps }))
    codes = await runInVms({ cwd, id, head, branch, vms: plan.vms, scripts, slotsDir: path.join(shared, 'slots'), keep, deps, evidence })
    const index = codes.findIndex(code => code !== 0)
    if (index >= 0) {
      const dir = path.join(evidence, plan.vms[index].label)
      const logs = existsSync(dir) ? readdirSync(dir).filter(name => name.endsWith('.log')).sort() : []
      failed = { label: plan.vms[index].label, log: logs.length ? path.join(dir, logs.at(-1)) : path.join(evidence, `${plan.vms[index].label}.log`) }
    }
    // Spec durations from this run balance the next parallel one.
    const measured = {}
    for (const vm of plan.vms) {
      vm.steps.forEach((step, index) => {
        const log = path.join(evidence, vm.label, `${stepLog(index + GUEST_SETUP_STEPS, step)}.log`)
        if (step.name.startsWith('e2e') && existsSync(log)) Object.assign(measured, specTimings(readFileSync(log, 'utf8'), step.grep ?? ''))
      })
    }
    if (Object.keys(measured).length) { mkdirSync(shared, { recursive: true }); writeFileSync(timingsFile, `${JSON.stringify({ ...timings, ...measured }, null, 2)}\n`) }
  }

  // An interrupted run is neither a pass nor a finding; its logs end mid-step.
  const cancelled = codes.includes(130)
  const conclusion = cancelled ? 'cancelled' : failed ? 'failure' : 'success'
  // The evidence goes with the worktree when it is integrated; the record in the Git common directory stays, so the
  // integration's CI-Run trailer names the run, not the evidence path.
  writeRecord(cwd, { id, url: `vm-ci ${id}`, branch, headSha: head, scope, conclusion })
  const e2e = plan.vms.map(vm => e2eSummary(path.join(evidence, vm.label), cwd))
  const failedTests = e2e.flatMap(item => item.failed), flaky = e2e.flatMap(item => item.flaky)
  const summary = [...(failedTests.length ? [`Failed E2E tests (${failedTests.length}):`, ...failedTests] : []),
    ...(flaky.length ? [`Flaky E2E tests, passed on retry (${flaky.length}); fix them separately:`, ...flaky] : [])]
  // Failed E2E tests are named by the report; any other failure is summarized at the end of its step log.
  if (cancelled) { /* nothing to summarize */ } else if (failed && failedTests.length) deps.log([...summary, `Full log: ${path.relative(cwd, failed.log)}`].join('\n'))
  else {
    if (failed && existsSync(failed.log)) deps.log(readFileSync(failed.log, 'utf8').trimEnd().split('\n').slice(-60).join('\n'))
    if (summary.length) deps.log(summary.join('\n'))
  }
  const red = failed && !cancelled && deps.devRed?.(branch, cwd)
  if (red) deps.log(red)
  deps.log(`${conclusion}: vm-ci ${id}${plan.vms.length ? '' : ' (no VM work)'}\nEvidence: ${path.relative(cwd, evidence)}`)
  return { id, conclusion, dir: evidence, codes }
}

/** Build or refresh the golden image from the base image: Node 24, pnpm and a warm dependency store at HEAD. */
export async function setupImage({ cwd = process.cwd(), deps = defaultDeps() } = {}) {
  const { branch, head } = testedHead(cwd)
  const id = String(deps.now())
  const name = `vmci-setup-${id}`
  const shared = path.join(stateDir(cwd), 'ai-studio-vm-ci')
  const evidence = path.join(cwd, '.runtime', 'vm-ci', id)
  mkdirSync(evidence, { recursive: true })
  deps.log(`Cloning ${BASE_IMAGE} (downloads about 27 GB the first time)…`)
  const slots = await waitForSlots(path.join(shared, 'slots'), 1, { pid: process.pid, id, branch, cwd, vms: [name], started: new Date(deps.now()).toISOString() }, deps)
  const staging = mkdtempSync(path.join(tmpdir(), 'vm-ci-'))
  const ref = `refs/vm-ci/${id}/head`
  let child = null, done = false
  try {
    const clone = deps.spawnTart(['clone', BASE_IMAGE, name], 'inherit')
    const cloned = await new Promise(resolve => clone.on('close', resolve))
    if (cloned !== 0) throw new Error(`tart clone ${BASE_IMAGE} failed (exit ${cloned}); retry, it does not resume partial downloads.`)
    deps.tart(['set', name, '--cpu', String(VM_CONFIG.cpu), '--memory', String(VM_CONFIG.memory), '--display', VM_CONFIG.display])
    symlinkSync(stateDir(cwd), path.join(staging, 'repo'))
    mkdirSync(path.join(staging, 'ci'))
    writeFileSync(path.join(staging, 'ci', 'provision.zsh'), provisionScript({ id, head }))
    git(['update-ref', ref, head], cwd)
    const log = createWriteStream(path.join(evidence, `${name}.tart.log`))
    await new Promise(resolve => log.once('open', resolve))
    child = deps.spawnTart(['run', name, '--no-graphics', `--dir=repo:${path.join(staging, 'repo')}:ro`, `--dir=ci:${path.join(staging, 'ci')}`], log)
    await untilReady(deps, name, `${SHARE}/ci/provision.zsh`)
    const provision = deps.spawnTart(['exec', name, 'zsh', `${SHARE}/ci/provision.zsh`], 'inherit')
    const code = await new Promise(resolve => provision.on('close', resolve))
    if (code !== 0) throw new Error(`Provisioning failed (exit ${code}); the previous image is unchanged.`)
    deps.tart(['stop', name, '--timeout', '60'])
    await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve))
    if (vmList(deps).some(vm => vm.Name === IMAGE)) deps.tart(['delete', IMAGE])
    deps.tart(['rename', name, IMAGE])
    mkdirSync(shared, { recursive: true })
    writeFileSync(path.join(shared, 'image.json'), `${JSON.stringify({ commit: head, lockHash: lockHash(cwd), created: new Date(deps.now()).toISOString() })}\n`)
    done = true
    deps.log(`VM image ${IMAGE} is ready at ${head.slice(0, 12)}.`)
  } finally {
    if (!done) {
      try { deps.tart(['stop', name, '--timeout', '10']) } catch { /* not running */ }
      if (child) await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve))
      try { deps.tart(['delete', name]) } catch { /* not created */ }
    }
    try { git(['update-ref', '-d', ref], cwd) } catch { /* not created */ }
    releaseSlots(slots)
    rmSync(staging, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        scope: { type: 'string' }, spec: { type: 'string', multiple: true }, grep: { type: 'string' },
        parallel: { type: 'boolean' }, base: { type: 'string' }, keep: { type: 'boolean' }, setup: { type: 'boolean' }
      }
    })
    if (positionals.length) throw new Error(usage)
    if (values.setup) await setupImage()
    else {
      const result = await vmCi({ scope: values.scope, specs: values.spec ?? [], grep: values.grep ?? '', parallel: !!values.parallel, base: values.base ?? '', keep: !!values.keep })
      process.exitCode = result.conclusion === 'success' ? 0 : 1
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
