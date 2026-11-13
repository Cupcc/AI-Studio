import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, openSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const [worktree, label, outDir] = process.argv.slice(2)
const { acquireSlots, releaseSlots, stateDir, IMAGE, VM_CONFIG, PARALLEL_MEMORY } = await import(path.join(worktree, 'scripts/vm-ci.mjs'))
const tartBin = '/opt/homebrew/bin/tart'
const tart = (args, options = {}) => execFileSync(tartBin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options })
const git = args => execFileSync('git', args, { cwd: worktree, encoding: 'utf8' }).trim()
const SHARE = '/Volumes/My Shared Files'
const name = `vmci-uiprobe-${label}`
const head = git(['rev-parse', 'HEAD'])
const ref = `refs/vm-ci/uiprobe-${label}/head`
const shared = stateDir(worktree)
const out = path.resolve(outDir)
mkdirSync(out, { recursive: true })

const owner = { pid: process.pid, id: `uiprobe-${label}`, branch: git(['branch', '--show-current']), cwd: worktree, vms: [name], started: new Date().toISOString() }
const { slots, holders } = acquireSlots(path.join(shared, 'ai-studio-vm-ci', 'slots'), 1, owner)
if (!slots) { console.error(`No free VM slot: ${JSON.stringify(holders)}`); process.exit(2) }

const staging = mkdtempSync(path.join(tmpdir(), 'vm-ui-'))
symlinkSync(shared, path.join(staging, 'repo'))
symlinkSync(out, path.join(staging, 'out'))
writeFileSync(path.join(out, 'setup.zsh'), [
  '#!/bin/zsh',
  'set -eu',
  'source ~/.zprofile 2>/dev/null || true',
  'export HUSKY=0 CI=true',
  'cd ~/ai-studio',
  `git fetch --quiet --no-tags "${SHARE}/repo" +${ref}:refs/vm-ci/head`,
  `git checkout --quiet --force --detach ${head} && git clean -ffdq`,
  'pnpm install --frozen-lockfile --prefer-offline',
  'pnpm --filter @ai-studio/agent-adapter run build',
  'pnpm --filter @ai-studio/desktop run build',
  'npm install --prefix "$HOME/ab" --no-audit --no-fund agent-browser@0.38.2',
  'cd apps/desktop',
  `STUDIO_E2E_PROVIDERS=1 nohup ./node_modules/.bin/electron . --studio-user-data-dir=/tmp/ud-probe --remote-debugging-port=9341 > "${SHARE}/out/electron.log" 2>&1 &!`,
  'for i in {1..60}; do curl -sf http://127.0.0.1:9341/json/version > /dev/null && break; sleep 1; done',
  'curl -sf http://127.0.0.1:9341/json/version',
  ''
].join('\n'))

let child
const cleanup = () => {
  try { tart(['stop', name, '--timeout', '5']) } catch { /* not running */ }
  try { tart(['delete', name]) } catch { /* not created */ }
  try { git(['update-ref', '-d', ref]) } catch { /* already removed */ }
  releaseSlots(slots)
  rmSync(staging, { recursive: true, force: true })
}
let stopping = false
const stop = () => { if (stopping) return; stopping = true; cleanup(); process.exit(0) }
process.once('SIGINT', stop); process.once('SIGTERM', stop)

try {
  const t0 = Date.now()
  git(['update-ref', ref, head])
  tart(['clone', IMAGE, name])
  tart(['set', name, '--cpu', String(VM_CONFIG.cpu), '--memory', String(PARALLEL_MEMORY), '--display', VM_CONFIG.display])
  const log = openSync(path.join(out, 'tart.log'), 'w')
  child = spawn(tartBin, ['run', name, '--no-graphics', `--dir=repo:${path.join(staging, 'repo')}:ro`, `--dir=out:${path.join(staging, 'out')}`], { stdio: ['ignore', log, log] })
  for (;;) {
    try { tart(['exec', name, 'test', '-f', `${SHARE}/out/setup.zsh`], { timeout: 15_000 }); break } catch { /* booting */ }
    if (Date.now() - t0 > 240_000) throw new Error('VM did not become ready')
    await sleep(2000)
  }
  console.log(`booted ${name} in ${Math.round((Date.now() - t0) / 1000)}s`)
  const setup = spawn(tartBin, ['exec', name, 'zsh', `${SHARE}/out/setup.zsh`], { stdio: ['ignore', openSync(path.join(out, 'setup.log'), 'w'), 'pipe'] })
  let stderr = ''
  setup.stderr.on('data', chunk => { stderr += chunk })
  const code = await new Promise(resolve => setup.on('close', resolve))
  if (code !== 0) throw new Error(`setup failed (exit ${code}): ${stderr.slice(-800)}`)
  console.log(`READY ${name} after ${Math.round((Date.now() - t0) / 1000)}s`)
  await new Promise(() => {})
} catch (error) {
  console.error(error.message)
  cleanup()
  process.exit(1)
}
