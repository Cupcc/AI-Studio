// Independent probe: an index copy must retain the source timestamp for Git's racy-clean detection.
// Only isolated os.tmpdir repositories are written. No application / model process is started.
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'w18-index-racy-'))
const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', LC_ALL: 'C' }
for (const key of Object.keys(env)) if (key.startsWith('GIT_') && !['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM'].includes(key)) delete env[key]
const git = (args, extra = {}) => execFileSync('/usr/bin/git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, env: { ...env, ...extra }, encoding: 'utf8' })
try {
  git(['init', '-q'])
  git(['config', 'user.name', 'W18 fixture'])
  git(['config', 'user.email', 'fixture@example.invalid'])
  git(['config', 'core.trustctime', 'false'])
  const file = join(root, 'a.txt')
  const instant = new Date('2001-09-09T01:46:40.000Z')
  writeFileSync(file, 'one\n')
  utimesSync(file, instant, instant)
  git(['add', 'a.txt'])
  git(['commit', '-qm', 'fixture'])
  const index = join(root, '.git', 'index')
  utimesSync(index, instant, instant)
  writeFileSync(file, 'two\n')
  utimesSync(file, instant, instant)
  const indexBefore = readFileSync(index)
  const indexStat = statSync(index)
  const fresh = join(root, 'fresh-index')
  const preserved = join(root, 'preserved-index')
  copyFileSync(index, fresh)
  copyFileSync(index, preserved)
  utimesSync(preserved, indexStat.atime, indexStat.mtime)
  const args = ['--no-optional-locks', '--literal-pathspecs', 'diff', 'HEAD', '--raw', '--', 'a.txt']
  const observed = {
    sourceIndexMtimeMs: indexStat.mtimeMs,
    freshIndexMtimeMs: statSync(fresh).mtimeMs,
    preservedIndexMtimeMs: statSync(preserved).mtimeMs,
    direct: git(args),
    freshCopy: git(args, { GIT_INDEX_FILE: fresh }),
    preservedCopy: git(args, { GIT_INDEX_FILE: preserved }),
    sourceIndexBytesUnchanged: readFileSync(index).equals(indexBefore)
  }
  console.log(JSON.stringify(observed, null, 2))
  if (!observed.direct || observed.freshCopy || !observed.preservedCopy || !observed.sourceIndexBytesUnchanged) process.exitCode = 1
} finally {
  rmSync(root, { recursive: true, force: true })
}
