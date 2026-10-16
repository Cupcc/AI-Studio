// W18 independent checks of the temporary Git index: representation compatibility and racy-clean fidelity.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareGitIndex } from '../../../apps/desktop/src/main/services/diff/git-index'
import { GIT_GLOBAL_ARGS, scrubbedGitEnv } from '../../../apps/desktop/src/main/services/diff/git-env'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture(hash: 'sha1' | 'sha256' = 'sha1') {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'w18-index-')))
  roots.push(base)
  const root = join(base, 'repo')
  const home = join(base, 'home')
  mkdirSync(root); mkdirSync(home)
  const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: home, XDG_CONFIG_HOME: home, LC_ALL: 'C', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }
  const git = (args: string[], extra: Record<string, string> = {}) => execFileSync('/usr/bin/git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, env: { ...env, ...extra }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  git(['init', '-q', `--object-format=${hash}`])
  git(['config', 'user.name', 'W18 fixture']); git(['config', 'user.email', 'fixture@example.invalid'])
  const files = ['a.txt', 'longer name.txt', '前缀-甲.txt', '前缀-乙.txt']
  for (const name of files) writeFileSync(join(root, name), 'one\n')
  git(['add', '-A']); git(['commit', '-qm', 'fixture'])
  return { root, env, git, files, index: join(root, '.git', 'index') }
}

describe('W18 index isolation compatibility', () => {
  for (const hash of ['sha1', 'sha256'] as const) {
    for (const version of [2, 3, 4]) {
      it(`${hash} index v${version}: staged and working-tree changes survive a byte-faithful isolated query`, async () => {
        const f = fixture(hash)
        writeFileSync(join(f.root, 'a.txt'), 'staged\n'); f.git(['add', 'a.txt'])
        writeFileSync(join(f.root, 'longer name.txt'), 'worktree\n')
        if (version === 3) { writeFileSync(join(f.root, 'intent.txt'), 'intent\n'); f.git(['add', '-N', 'intent.txt']) }
        f.git(['update-index', `--index-version=${version}`])
        const before = readFileSync(f.index)
        const beforeTime = statSync(f.index, { bigint: true }).mtimeNs
        const prepared = await prepareGitIndex(f.root, scrubbedGitEnv(f.env))
        try {
          expect(readFileSync(prepared.env.GIT_INDEX_FILE!), 'private index must retain Git format, including extensions and hash width').toEqual(before)
          const result = f.git([...GIT_GLOBAL_ARGS, 'diff', 'HEAD', '--name-only', '-z', '--'], prepared.env as Record<string, string>)
          expect(result.split('\0').filter(Boolean)).toEqual(version === 3 ? ['a.txt', 'intent.txt', 'longer name.txt'] : ['a.txt', 'longer name.txt'])
        } finally { await prepared.cleanup() }
        expect(readFileSync(f.index)).toEqual(before)
        expect(statSync(f.index, { bigint: true }).mtimeNs).toBe(beforeTime)
      })
    }
  }

  it('a racy-clean same-size edit remains visible while the real index bytes and mtime stay unchanged', async () => {
    const f = fixture()
    f.git(['config', 'core.trustctime', 'false'])
    const instant = new Date('2001-09-09T01:46:40.000Z')
    const file = join(f.root, 'a.txt')
    utimesSync(file, instant, instant)
    f.git(['add', 'a.txt'])
    utimesSync(f.index, instant, instant)
    writeFileSync(file, 'two\n'); utimesSync(file, instant, instant)
    const before = readFileSync(f.index)
    const beforeTime = statSync(f.index, { bigint: true }).mtimeNs
    const prepared = await prepareGitIndex(f.root, scrubbedGitEnv(f.env))
    try {
      const changed = f.git([...GIT_GLOBAL_ARGS, 'diff', 'HEAD', '--name-only', '-z', '--', 'a.txt'], prepared.env as Record<string, string>)
      expect(changed).toBe('a.txt\0')
    } finally { await prepared.cleanup() }
    expect(readFileSync(f.index)).toEqual(before)
    expect(statSync(f.index, { bigint: true }).mtimeNs).toBe(beforeTime)
  })

  it('split-index queries preserve real index bytes/mtime and sharedindex data; records cache keepalive metadata', async () => {
    const f = fixture()
    f.git(['update-index', '--split-index'])
    const gitDir = join(f.root, '.git')
    const snapshot = () => new Map(readdirSync(gitDir).filter((name) => name === 'index' || name.startsWith('sharedindex.')).map((name) => [name, { bytes: readFileSync(join(gitDir, name)), mtime: statSync(join(gitDir, name), { bigint: true }).mtimeNs }]))
    const before = snapshot()
    writeFileSync(join(f.root, 'a.txt'), 'modified\n')
    const prepared = await prepareGitIndex(f.root, scrubbedGitEnv(f.env))
    try {
      const changed = f.git([...GIT_GLOBAL_ARGS, 'diff', 'HEAD', '--name-only', '-z', '--'], prepared.env as Record<string, string>)
      expect(changed).toBe('a.txt\0')
    } finally { await prepared.cleanup() }
    const after = snapshot()
    expect([...after.keys()]).toEqual([...before.keys()])
    expect(after.get('index')).toEqual(before.get('index'))
    for (const [name, original] of before) {
      expect(after.get(name)!.bytes).toEqual(original.bytes)
      if (name.startsWith('sharedindex.')) console.info(`[W18 split-index] shared bytes unchanged; cache mtime changed=${after.get(name)!.mtime !== original.mtime}`)
    }
  })
})
