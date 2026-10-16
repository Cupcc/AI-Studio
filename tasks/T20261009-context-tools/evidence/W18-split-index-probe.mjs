// Git's shared-index cache keepalive is metadata-only; changing core.splitIndex does not suppress it on reads.
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const root = mkdtempSync(join(tmpdir(), 'w18-split-index-'))
const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: root, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', LC_ALL: 'C' }
const git = (args, extra = {}) => execFileSync('/usr/bin/git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, env: { ...env, ...extra }, encoding: 'utf8' })
try {
  git(['init', '-q']); git(['config', 'user.name', 'W18 fixture']); git(['config', 'user.email', 'fixture@example.invalid'])
  writeFileSync(join(root, 'a.txt'), 'one\n'); git(['add', 'a.txt']); git(['commit', '-qm', 'fixture']); git(['update-index', '--split-index'])
  writeFileSync(join(root, 'a.txt'), 'modified\n')
  const gitdir = join(root, '.git'), index = join(gitdir, 'index')
  const shared = join(gitdir, readdirSync(gitdir).find((name) => name.startsWith('sharedindex.')))
  const beforeBytes = readFileSync(shared), sourceBytes = readFileSync(index), sourceMtime = statSync(index, { bigint: true }).mtimeNs
  for (const mode of [[], ['-c', 'core.splitIndex=false']]) {
    utimesSync(shared, 1_000_000_000, 1_000_000_000)
    const before = statSync(shared, { bigint: true }).mtimeNs
    const isolated = join(root, 'isolated-index'); copyFileSync(index, isolated)
    const info = statSync(index); utimesSync(isolated, info.atime, info.mtime)
    const output = git(['--no-optional-locks', ...mode, 'diff', 'HEAD', '--name-only', '--', 'a.txt'], { GIT_INDEX_FILE: isolated })
    console.log(JSON.stringify({ mode: mode.join(' ') || 'default', output: output.trim(), sharedMtimeChanged: statSync(shared, { bigint: true }).mtimeNs !== before, sharedBytesUnchanged: readFileSync(shared).equals(beforeBytes), sourceIndexBytesUnchanged: readFileSync(index).equals(sourceBytes), sourceIndexMtimeUnchanged: statSync(index, { bigint: true }).mtimeNs === sourceMtime }))
  }
} finally { rmSync(root, { recursive: true, force: true }) }
