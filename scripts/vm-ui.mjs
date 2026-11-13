import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { git } from './check-paths.mjs'
import {
  IMAGE, INSTALL_CLIS, INSTALL_DEPS, PARALLEL_MEMORY, SHARE, VM_CONFIG, defaultDeps as vmCiDeps, quote, releaseSlots, stateDir, untilReady, vmList, waitForSlots
} from './vm-ci.mjs'

const usage = 'Usage: node scripts/vm-ui.mjs start [--label <label>] [--ttl <minutes>] [--real]\n' +
  '       node scripts/vm-ui.mjs ab <label> <agent-browser args...>\n' +
  '       node scripts/vm-ui.mjs open-project <label> [<guest dir>]\n' +
  '       node scripts/vm-ui.mjs stop <label>'

// The version .agents/skills/README.md records; the installed skill describes this CLI.
export const AGENT_BROWSER_VERSION = '0.38.2'
export const DEFAULT_PROJECT = '/tmp/vm-ui-project'
const DEFAULT_TTL_MINUTES = 60
const PORTS = { cdp: 9341, inspector: 9342 }
// A closed terminal sends SIGHUP; without a handler the VM would outlive its holder.
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP']
const STOP_TIMEOUT_MS = 300_000

export const defaultLabel = branch => branch.replace(/[^a-z0-9-]/g, '-')

/** Everything a VM session owns derives from its label. The `vmci-` prefix puts the VM under vm-ci's orphan cleanup. */
export function session(label, cwd = process.cwd()) {
  if (!/^[a-z0-9-]+$/.test(label ?? '')) throw new Error(`Invalid label "${label ?? ''}": use lowercase letters, digits and hyphens.`)
  return { label, name: `vmci-ui-${label}`, ref: `refs/vm-ui/${label}/head`, evidence: path.resolve(cwd, '.runtime', 'vm-ui', label), ports: PORTS }
}

/** Checks out the tested commit, builds it and leaves the app running with both debugging ports open. */
export function setupScript({ ref, ports }, head, { real = false } = {}) {
  const answers = `curl -sf http://127.0.0.1:${ports.cdp}/json/version > /dev/null && curl -sf http://127.0.0.1:${ports.inspector}/json/list > /dev/null`
  return [
    '#!/bin/zsh',
    'set -eu',
    'source ~/.zprofile 2>/dev/null || true',
    'export CI=true HUSKY=0',
    'cd ~/ai-studio',
    `git fetch --quiet --no-tags "${SHARE}/repo" +${ref}:refs/vm-ui/head`,
    `git checkout --quiet --force --detach ${head}`,
    'git clean -ffdq',
    // The image's build output belongs to another commit.
    'rm -rf packages/agent-adapter/dist apps/desktop/out apps/desktop/dist',
    INSTALL_DEPS,
    'pnpm --filter @ai-studio/agent-adapter run build',
    'pnpm --filter @ai-studio/desktop run build',
    `npm install --prefix "$HOME/ab" --no-audit --no-fund agent-browser@${AGENT_BROWSER_VERSION}`,
    // Real mode runs the pinned CLIs against the connection the agent enters in Settings; nothing is logged in.
    ...(real ? [INSTALL_CLIS, 'source ~/.zprofile'] : []),
    'cd apps/desktop',
    `${real ? '' : 'STUDIO_E2E_PROVIDERS=1 '}nohup ./node_modules/.bin/electron . --studio-user-data-dir="$(mktemp -d)" --remote-debugging-port=${ports.cdp} --inspect=${ports.inspector} > "${SHARE}/out/electron.log" 2>&1 &!`,
    `for attempt in {1..60}; do { ${answers} } && break; sleep 1; done`,
    `{ ${answers} } || { echo "Electron did not open ports ${ports.cdp} and ${ports.inspector} within 60 s:"; tail -n 20 "${SHARE}/out/electron.log"; exit 1 }`,
    ''
  ].join('\n')
}

const guestShell = ['source ~/.zprofile 2>/dev/null', 'export PATH="$HOME/ab/node_modules/.bin:$PATH"']

/** One agent-browser command in the guest. The marker lives in the guest, so it goes away with the VM. */
export function abScript({ ports }, args) {
  const agentBrowser = 'agent-browser --session ui'
  return [
    ...guestShell,
    'if [[ ! -e "$HOME/ab/.connected" ]]; then',
    `  output=$(${agentBrowser} connect ${ports.cdp} 2>&1) || { print -ru2 -- "$output"; exit 1 }`,
    '  touch "$HOME/ab/.connected"',
    'fi',
    `exec ${agentBrowser} ${args.map(quote).join(' ')}`,
    ''
  ].join('\n')
}

// agent-browser cannot drive a native dialog; the main-process inspector replaces it with a fixed answer.
const dialogStub = ports => [
  'const dir = process.argv[1]',
  `const [target] = await (await fetch("http://127.0.0.1:${ports.inspector}/json/list")).json()`,
  'const socket = new WebSocket(target.webSocketDebuggerUrl)',
  'const expression = "process.mainModule.require(\\"electron\\").dialog.showOpenDialog = async () => (" + JSON.stringify({ canceled: false, filePaths: [dir] }) + "); true"',
  'const reply = await new Promise((resolve, reject) => {',
  `  socket.onerror = () => reject(new Error("Cannot reach the main-process inspector on port ${ports.inspector}."))`,
  '  socket.onopen = () => socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression } }))',
  '  socket.onmessage = event => { const message = JSON.parse(event.data); if (message.id === 1) resolve(message) }',
  '})',
  'socket.close()',
  'if (reply.error || reply.result.exceptionDetails) throw new Error("The dialog stub failed: " + JSON.stringify(reply))',
  'console.log("The folder dialog now returns " + dir)'
].join('\n')

export function openProjectScript({ ports }, dir) {
  return [
    ...guestShell,
    `dir=${quote(dir)}`,
    'mkdir -p "$dir" || exit 1',
    '[[ -n "$(ls -A "$dir")" ]] || print -r -- "# vm-ui project" > "$dir/README.md"',
    `node --input-type=module -e ${quote(dialogStub(ports))} "$dir"`,
    ''
  ].join('\n')
}

/** The untracked connection settings a person keeps in the main checkout; task worktrees do not carry the file. */
export function localConfig(cwd = process.cwd()) {
  const main = /^worktree (.+)$/m.exec(git(['worktree', 'list', '--porcelain'], cwd))[1]
  const file = path.join(main, 'apps/desktop/.env.local')
  if (!existsSync(file)) throw new Error(`${file} does not exist; it holds the values that {{name}} placeholders stand for.`)
  return Object.fromEntries(readFileSync(file, 'utf8').split('\n').filter(line => /^[\w.-]+=/.test(line))
    .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]))
}

/** `{{name}}` stands for a local setting, so a key reaches the guest without appearing in a command, a log or a transcript. */
export function expandPlaceholders(args, config) {
  let values
  return args.map(arg => arg.replace(/\{\{([\w.-]+)\}\}/g, (_match, name) => {
    values ??= config()
    if (!(name in values)) throw new Error(`No local setting named "${name}"; available: ${Object.keys(values).join(', ') || 'none'}.`)
    return values[name]
  }))
}

export const defaultDeps = () => ({ ...vmCiDeps(), kill: (pid, signal) => process.kill(pid, signal) })

const slotsDir = cwd => path.join(stateDir(cwd), 'ai-studio-vm-ci', 'slots')

function holderOf(dir, name) {
  for (const slot of existsSync(dir) ? readdirSync(dir) : []) {
    try {
      const owner = JSON.parse(readFileSync(path.join(dir, slot, 'owner.json'), 'utf8'))
      if (owner.vms?.includes(name)) return { slot: path.join(dir, slot), owner }
    } catch { /* being written */ }
  }
  return null
}

const vmExists = (deps, name) => vmList(deps).some(vm => vm.Name === name)

/** Every step tolerates a session that never got that far, so this also cleans up after a holder that was killed. */
async function teardown(target, { cwd, deps, vm = null, slots = [], staging = '' }) {
  try { deps.tart(['stop', target.name, '--timeout', '5']) } catch { /* not running */ }
  if (vm) await new Promise(resolve => vm.exitCode !== null ? resolve() : vm.once('exit', resolve))
  try { deps.tart(['delete', target.name]) } catch { /* not created */ }
  try { git(['update-ref', '-d', target.ref], cwd) } catch { /* not created */ }
  releaseSlots(slots)
  if (staging) rmSync(staging, { recursive: true, force: true })
}

async function logStream(file) {
  const stream = createWriteStream(file)
  await new Promise(resolve => stream.once('open', resolve))
  return stream
}

/**
 * Hold one VM with the app running until a signal or the TTL, then remove everything but the evidence directory.
 * Returns what ended the session; a failed step throws after the same cleanup.
 */
export async function start({ label, ttl = DEFAULT_TTL_MINUTES, real = false, cwd = process.cwd(), deps = defaultDeps() } = {}) {
  if (git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], cwd)) throw new Error('The worktree has uncommitted changes; commit them before starting vm-ui (it checks HEAD).')
  const branch = git(['branch', '--show-current'], cwd).trim(), head = git(['rev-parse', 'HEAD'], cwd).trim()
  if (!label && !branch) throw new Error('No branch is checked out; name the session with --label.')
  const target = session(label || defaultLabel(branch), cwd)
  const slotDir = slotsDir(cwd)
  const vms = vmList(deps)
  if (!vms.some(vm => vm.Name === IMAGE)) throw new Error(`The VM image ${IMAGE} does not exist. Create it once with: node scripts/vm-ci.mjs --setup`)
  const holder = holderOf(slotDir, target.name)
  if (vms.some(vm => vm.Name === target.name) || (holder && deps.alive(holder.owner.pid))) {
    throw new Error(`${target.name} already exists. Stop it with \`node scripts/vm-ui.mjs stop ${target.label}\` or choose another --label.`)
  }

  deps.log(`vm-ui ${target.label} for ${branch || 'detached HEAD'} at ${head.slice(0, 12)}${real ? ' with the real CLIs' : ''}`)
  const slots = await waitForSlots(slotDir, 1, { pid: process.pid, id: `ui-${target.label}`, branch, cwd, vms: [target.name], started: new Date(deps.now()).toISOString() }, deps)
  const staging = mkdtempSync(path.join(tmpdir(), 'vm-ui-'))
  let vm = null, setup = null, stopped = ''
  const handlers = SIGNALS.map(signal => [signal, () => { stopped ||= signal; setup?.kill('SIGTERM') }])
  for (const [signal, handler] of handlers) process.on(signal, handler)
  try {
    mkdirSync(target.evidence, { recursive: true })
    git(['update-ref', target.ref, head], cwd)
    deps.tart(['clone', IMAGE, target.name])
    deps.tart(['set', target.name, '--cpu', String(VM_CONFIG.cpu), '--memory', String(PARALLEL_MEMORY), '--display', VM_CONFIG.display])
    // tart's --dir rejects paths with spaces (the worktrees directory has one); share space-free symlinks instead.
    symlinkSync(stateDir(cwd), path.join(staging, 'repo'))
    symlinkSync(target.evidence, path.join(staging, 'out'))
    writeFileSync(path.join(target.evidence, 'setup.zsh'), setupScript(target, head, { real }))
    vm = deps.spawnTart(['run', target.name, '--no-graphics', `--dir=repo:${path.join(staging, 'repo')}:ro`, `--dir=out:${path.join(staging, 'out')}`], await logStream(path.join(target.evidence, 'tart.log')))
    await untilReady(deps, target.name, `${SHARE}/out/setup.zsh`)
    if (!stopped) {
      const log = path.join(target.evidence, 'setup.log')
      setup = deps.spawnTart(['exec', target.name, 'zsh', `${SHARE}/out/setup.zsh`], await logStream(log))
      const code = await new Promise(resolve => setup.on('close', resolve))
      if (!stopped && code !== 0) {
        deps.log(readFileSync(log, 'utf8').trimEnd().split('\n').slice(-40).join('\n'))
        throw new Error(`Guest setup failed (exit ${code}). Full log: ${log}`)
      }
    }
    if (!stopped) {
      deps.log(`READY ${target.name} evidence=${target.evidence}`)
      const deadline = deps.now() + ttl * 60_000
      while (!stopped) {
        if (deps.now() >= deadline) stopped = 'ttl'
        else await deps.sleep(1000)
      }
    }
    return { name: target.name, stopped }
  } finally {
    await teardown(target, { cwd, deps, vm, slots, staging })
    // Still registered during the teardown, so a second signal cannot interrupt it.
    for (const [signal, handler] of handlers) process.off(signal, handler)
    if (stopped) deps.log(`Stopped ${target.name} (${stopped === 'ttl' ? `after ${ttl} minutes` : stopped}).`)
  }
}

const guestExit = child => new Promise(resolve => child.on('close', code => resolve(code ?? 1)))

/** Run one agent-browser command in the session's VM; resolves to the guest's exit code. */
export function ab({ label, args, cwd = process.cwd(), deps = defaultDeps(), config = () => localConfig(cwd) }) {
  const target = session(label, cwd)
  return guestExit(deps.spawnTart(['exec', target.name, 'zsh', '-c', abScript(target, expandPlaceholders(args, config))], 'inherit'))
}

/** Make the next folder dialog in the guest app return `dir`; resolves to the guest's exit code. */
export function openProject({ label, dir = DEFAULT_PROJECT, cwd = process.cwd(), deps = defaultDeps() }) {
  if (!path.posix.isAbsolute(dir)) throw new Error(`The guest directory must be an absolute path: ${dir}`)
  const target = session(label, cwd)
  return guestExit(deps.spawnTart(['exec', target.name, 'zsh', '-c', openProjectScript(target, dir)], 'inherit'))
}

/** Ask the holder to clean up and wait until it has; resolves to false when there is no such session. */
export async function stop({ label, cwd = process.cwd(), deps = defaultDeps() }) {
  const target = session(label, cwd)
  const dir = slotsDir(cwd)
  const holder = holderOf(dir, target.name)
  if (!holder && !vmExists(deps, target.name)) {
    deps.log(`No VM UI session "${target.label}" exists (no slot owner and no VM named ${target.name}).`)
    return false
  }
  if (holder && deps.alive(holder.owner.pid)) {
    deps.kill(holder.owner.pid, 'SIGTERM')
    const started = deps.now()
    while (holderOf(dir, target.name) || vmExists(deps, target.name)) {
      if (deps.now() - started > STOP_TIMEOUT_MS) throw new Error(`${target.name} is still there ${STOP_TIMEOUT_MS / 1000}s after SIGTERM to pid ${holder.owner.pid}.`)
      await deps.sleep(1000)
    }
  } else {
    // The holder is gone and cannot clean up after itself.
    await teardown(target, { cwd, deps, slots: holder ? [holder.slot] : [] })
  }
  deps.log(`Stopped ${target.name}.`)
  return true
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [command, ...rest] = process.argv.slice(2)
    if (command === 'start') {
      const { values } = parseArgs({ args: rest, options: { label: { type: 'string' }, ttl: { type: 'string' }, real: { type: 'boolean' } } })
      const ttl = values.ttl === undefined ? DEFAULT_TTL_MINUTES : Number(values.ttl)
      if (!(ttl > 0) || !Number.isFinite(ttl)) throw new Error(usage)
      await start({ label: values.label, ttl, real: values.real })
    } else if (command === 'ab' && rest.length > 1) {
      // Everything after the label belongs to agent-browser, flags included.
      process.exitCode = await ab({ label: rest[0], args: rest.slice(1) })
    } else if (command === 'open-project' && (rest.length === 1 || rest.length === 2)) {
      process.exitCode = await openProject({ label: rest[0], dir: rest[1] })
    } else if (command === 'stop' && rest.length === 1) {
      process.exitCode = await stop({ label: rest[0] }) ? 0 : 1
    } else throw new Error(usage)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
