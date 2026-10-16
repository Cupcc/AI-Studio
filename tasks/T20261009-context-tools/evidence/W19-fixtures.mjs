// W19 fixture 构建脚本：只在 os.tmpdir() 下的 ROOT/projects/<name> 创建测试 Project / Git 仓库，不接触仓库源码或用户数据。
// 用法：node W19-fixtures.mjs <ROOT> <fixture...>
// Git 一律使用固定环境：GIT_CONFIG_GLOBAL=/dev/null、GIT_CONFIG_SYSTEM=/dev/null、固定作者，真实 git 2.39.2（Apple Git）。
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, chmodSync, symlinkSync, existsSync, rmSync, readFileSync, utimesSync } from 'node:fs'
import { dirname, join } from 'node:path'

const [root, ...which] = process.argv.slice(2)
if (!root) throw new Error('usage: W19-fixtures.mjs <ROOT> <fixture...>')
const base = join(root, 'projects')

export function gitEnv() {
  const env = {}
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_') && v !== undefined) env[k] = v
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'W19 Fixture', GIT_AUTHOR_EMAIL: 'w19@example.test', GIT_COMMITTER_NAME: 'W19 Fixture', GIT_COMMITTER_EMAIL: 'w19@example.test' }
}
const git = (cwd, ...args) => execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.quotepath=false', '-c', 'protocol.file.allow=always', ...args], { cwd, env: gitEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const put = (dir, rel, content = rel + '\n') => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), content) }
const fresh = name => { const dir = join(base, name); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); return dir }
const init = dir => git(dir, 'init', '-q', '-b', 'main')
const commitAll = (dir, message = 'initial') => { git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', message) }
const lines = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('\n') + '\n'

const TS = `// W19 sample: TypeScript with keywords, strings, numbers and comments
import { readFileSync } from 'node:fs'

export interface User { id: number; name: string; tags: string[] }

/** Returns a greeting. */
export function greet(user: User, loud = false): string {
  const base = \`Hello, \${user.name}! You have \${user.tags.length} tags.\`
  return loud ? base.toUpperCase() : base // trailing comment 12345
}

export class Counter {
  private value = 0
  increment(by: number = 1) { this.value += by; return this.value }
}

const pattern = /[a-z]+\\d{2,}/gi
console.log(greet({ id: 1, name: 'Ada', tags: ['x', 'y'] }), pattern.test('abc123'), readFileSync)
`

const builders = {
  // 正常 Files fixture：非 Git 目录，嵌套目录、多语言文件、空目录、被忽略的 node_modules。
  'files-normal'() {
    const dir = fresh('W19 Files Normal')
    put(dir, 'README.md', '# W19 Files Normal\n\n`inline code` and a [link](https://example.com).\n\n- item one\n- item two\n')
    put(dir, 'package.json', JSON.stringify({ name: 'w19', version: '1.0.0', scripts: { test: 'vitest' }, nested: { ok: true, n: 42 } }, null, 2) + '\n')
    put(dir, 'src/index.ts', TS)
    put(dir, 'src/styles.css', 'body { color: #333; margin: 0 auto; }\n.card:hover > .title { font-weight: 600; }\n')
    put(dir, 'src/lib/util.ts', 'export const add = (a: number, b: number) => a + b\n')
    put(dir, 'src/lib/deep/more/leaf.txt', 'deep leaf\n')
    put(dir, 'docs/my file.md', '# spaced name\n')
    put(dir, 'docs/guide.md', '# Guide\n\nSome text.\n')
    put(dir, 'app.py', 'def greet(name: str) -> str:\n    """Say hi."""\n    return f"hi {name}"  # comment\n\nclass A:\n    pass\n')
    put(dir, 'main.go', 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("hello", 42)\n}\n')
    put(dir, 'data.json', '{"a": 1, "b": [true, null, "x"]}\n')
    put(dir, 'index.html', '<!doctype html>\n<html><body><h1 class="t">Hi</h1><script>let a = 1</script></body></html>\n')
    put(dir, 'script.sh', '#!/bin/sh\nset -e\necho "hello $USER" # note\n')
    put(dir, 'Makefile', 'all:\n\techo build\n')
    put(dir, '.hidden-file', 'dotfile\n')
    put(dir, 'node_modules/pkg/index.js', 'module.exports = 1\n')
    mkdirSync(join(dir, 'empty-dir'))
    return dir
  },
  // 失败 / 边界 fixture（非 Git）。
  'files-failure'() {
    const dir = fresh('W19 Files Failure')
    const outside = join(root, 'outside-secret.txt'); writeFileSync(outside, 'OUTSIDE THE PROJECT\n')
    put(dir, 'src/inside.ts', 'export const inside = true\n')
    writeFileSync(join(dir, 'bin.dat'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x03]))
    writeFileSync(join(dir, 'bad-utf8.txt'), Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0xc3, 0x28, 0x0a]))
    writeFileSync(join(dir, 'utf16le-bom.txt'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('UTF-16 LE text 你好\nsecond line\n', 'utf16le')]))
    writeFileSync(join(dir, 'utf16be-bom.txt'), Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from('UTF-16 BE text\n', 'utf16le').swap16()]))
    writeFileSync(join(dir, 'utf8-bom.txt'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('utf8 with bom\n')]))
    writeFileSync(join(dir, 'too-large-1.3MiB.txt'), Buffer.alloc(1_363_149, 0x61))
    writeFileSync(join(dir, 'exact-1MiB.txt'), Buffer.concat([Buffer.alloc(1_048_575, 0x62), Buffer.from('\n')]))
    writeFileSync(join(dir, 'over-1MiB-by-1.txt'), Buffer.alloc(1_048_577, 0x63))
    writeFileSync(join(dir, 'crlf.txt'), 'line1\r\nline2\r\nline3\r\n')
    writeFileSync(join(dir, 'mixed.txt'), 'lf\ncrlf\r\nlf again\nlast cr\r\n')
    writeFileSync(join(dir, 'secret.txt'), 'unreadable\n'); chmodSync(join(dir, 'secret.txt'), 0)
    symlinkSync('src/inside.ts', join(dir, 'link-to-file'))
    symlinkSync('src', join(dir, 'link-to-dir'))
    symlinkSync(outside, join(dir, 'link-to-outside'))
    symlinkSync('no-such-target', join(dir, 'link-dangling'))
    symlinkSync('link-loop-b', join(dir, 'link-loop-a')); symlinkSync('link-loop-a', join(dir, 'link-loop-b'))
    execFileSync('mkfifo', [join(dir, 'pipe.fifo')])
    for (const name of ['space name.txt', '-dash.txt', 'glob[1]*?.txt', '日本語.md', 'emoji-😀.txt', 'bad\nname.txt', 'rlo\u202Ename.txt', 'bell\u0007.txt', 'nel\u0085name.txt', 'ls\u2028name.txt', 'tab\tname.txt', ':(top)colon.txt', '--output=x.txt']) put(dir, name, `content of ${JSON.stringify(name)}\n`)
    put(dir, 'x'.repeat(251) + '.txt', '255-character name\n')
    mkdirSync(join(dir, 'empty'))
    mkdirSync(join(dir, 'locked-dir')); put(dir, 'locked-dir/inner.txt', 'inner\n'); chmodSync(join(dir, 'locked-dir'), 0)
    mkdirSync(join(dir, 'many'))
    for (let i = 0; i < 2500; i++) writeFileSync(join(dir, 'many', `f${String(i).padStart(4, '0')}.txt`), '')
    return dir
  },
  // 大目录：用于「只读根」的惰性验证与 2000 条截断。
  'files-huge'() {
    const dir = fresh('W19 Files Huge')
    put(dir, 'top.txt', 'top\n')
    mkdirSync(join(dir, 'huge'))
    for (let i = 0; i < 30000; i++) writeFileSync(join(dir, 'huge', `e${String(i).padStart(5, '0')}`), '')
    mkdirSync(join(dir, 'a/b/c/d'), { recursive: true }); put(dir, 'a/b/c/d/leaf.txt', 'leaf\n')
    return dir
  },
  // 相对路径 891 B 的有效目录：短子项可读，CJK 子项总路径 1046 B 超过契约上限。
  'files-long-paths'() {
    const dir = fresh('W19 Long Paths'), previous = process.cwd()
    try {
      process.chdir(dir)
      for (let i = 0; i < 4; i++) { const name = `${i}-` + 'p'.repeat(220); mkdirSync(name); process.chdir(name) }
      writeFileSync('ok.txt', 'valid sibling\n')
      writeFileSync('界'.repeat(50) + '.txt', 'over relative limit\n')
    } finally { process.chdir(previous) }
    return dir
  },
  // 主要 Diff fixture：已暂存 / 未暂存 / 两者并存 / 未跟踪 / git mv 加编辑 / 删除 / 仅模式 / 二进制 / 特殊名。
  'diff-main'() {
    const dir = fresh('W19 Diff Main'); init(dir)
    put(dir, 'staged.txt', lines(8, i => `staged line ${i}`))
    put(dir, 'unstaged.txt', lines(8, i => `unstaged line ${i}`))
    put(dir, 'both.txt', lines(8, i => `both line ${i}`))
    put(dir, 'deleted.txt', lines(6, i => `to be deleted ${i}`))
    put(dir, 'old-name.ts', lines(12, i => `export const v${i} = ${i} // rename source`))
    put(dir, 'run.sh', '#!/bin/sh\necho run\n')
    writeFileSync(join(dir, 'image.bin'), Buffer.from([0, 1, 2, 3, 0, 255, 254, 253, 0, 9]))
    put(dir, 'src/app.ts', TS)
    put(dir, 'unchanged.txt', 'never changes\n')
    put(dir, 'link-me', 'target\n'); symlinkSync('link-me', join(dir, 'a-link'))
    commitAll(dir)
    // staged
    put(dir, 'staged.txt', lines(8, i => i === 3 ? 'staged line CHANGED' : `staged line ${i}`)); git(dir, 'add', 'staged.txt')
    // unstaged
    put(dir, 'unstaged.txt', lines(9, i => i === 5 ? 'unstaged line CHANGED' : `unstaged line ${i}`))
    // both on one file
    put(dir, 'both.txt', lines(8, i => i === 1 ? 'both STAGED edit' : `both line ${i}`)); git(dir, 'add', 'both.txt')
    put(dir, 'both.txt', lines(8, i => i === 1 ? 'both STAGED edit' : i === 6 ? 'both UNSTAGED edit' : `both line ${i}`))
    // delete (working tree only)
    rmSync(join(dir, 'deleted.txt'))
    // git mv with edits
    mkdirSync(join(dir, 'renamed')); git(dir, 'mv', 'old-name.ts', 'renamed/new-name.ts')
    put(dir, 'renamed/new-name.ts', lines(12, i => i === 4 ? 'export const v4 = 4444 // edited after mv' : `export const v${i} = ${i} // rename source`))
    // mode only
    chmodSync(join(dir, 'run.sh'), 0o755)
    // binary change
    writeFileSync(join(dir, 'image.bin'), Buffer.from([0, 1, 2, 3, 0, 255, 254, 0, 0, 7, 7]))
    // symlink retarget
    rmSync(join(dir, 'a-link')); symlinkSync('src/app.ts', join(dir, 'a-link'))
    // ts edit
    put(dir, 'src/app.ts', TS.replace("loud = false", "loud = true").replace('Hello', 'Howdy') + 'export const added = 1\n')
    // untracked + special names
    put(dir, 'untracked.txt', 'brand new file\nsecond line\n')
    put(dir, 'new dir/untracked 2.txt', 'in a new directory\n')
    for (const name of ['-dash.txt', 'glob[1]*.txt', '日本語.md', 'sp ace.txt', 'emoji-😀.txt', 'new\nline.txt', 'tab\tname.txt', ':(top)colon.txt', 'rlo\u202Ename.txt', 'nel\u0085name.txt', 'ls\u2028name.txt']) put(dir, name, `special ${JSON.stringify(name)}\n`)
    return dir
  },
  // 冲突、子模块、嵌套仓库。
  'diff-conflict'() {
    const dir = fresh('W19 Diff Conflict'); init(dir)
    put(dir, 'conflict.txt', lines(5, i => `base ${i}`)); put(dir, 'fine.txt', 'fine\n')
    commitAll(dir)
    git(dir, 'checkout', '-q', '-b', 'topic'); put(dir, 'conflict.txt', lines(5, i => i === 2 ? 'TOPIC change' : `base ${i}`)); commitAll(dir, 'topic')
    git(dir, 'checkout', '-q', 'main'); put(dir, 'conflict.txt', lines(5, i => i === 2 ? 'MAIN change' : `base ${i}`)); commitAll(dir, 'main change')
    try { git(dir, 'merge', 'topic') } catch { /* expected conflict */ }
    return dir
  },
  'diff-submodule'() {
    const dir = fresh('W19 Diff Submodule'); init(dir)
    const sub = join(root, 'projects', 'W19 Sub Origin'); rmSync(sub, { recursive: true, force: true }); mkdirSync(sub); init(sub); put(sub, 'sub.txt', 'sub\n'); commitAll(sub)
    put(dir, 'main.txt', 'main\n'); commitAll(dir)
    git(dir, 'submodule', 'add', '-q', sub, 'vendor/sub'); git(dir, 'commit', '-q', '-m', 'add submodule')
    put(dir, 'vendor/sub/sub.txt', 'sub modified inside submodule\n')           // dirty submodule worktree
    put(dir, 'vendor/sub/untracked-in-sub.txt', 'u\n')
    // nested repository (untracked directory with its own .git)
    const nested = join(dir, 'nested-repo'); mkdirSync(nested); init(nested); put(nested, 'n.txt', 'n\n'); commitAll(nested)
    put(dir, 'tracked-change.txt', 'x\n')
    return dir
  },
  // 巨大补丁：2 MiB 全部改写（补丁上限 1 MiB 会被截断）。
  'diff-huge-patch'() {
    const dir = fresh('W19 Diff Huge Patch'); init(dir)
    put(dir, 'huge.txt', lines(40000, i => `old line number ${i} with some padding text to make it longer`)); put(dir, 'small.txt', 'small\n')
    commitAll(dir)
    put(dir, 'huge.txt', lines(40000, i => `NEW line number ${i} with different padding text to make it longer!!`))
    put(dir, 'small.txt', 'small changed\n')
    return dir
  },
  // 性能：两个完全不同的 ~500 KiB 文件（两侧 Monaco diff）。
  'diff-big-sides'() {
    const dir = fresh('W19 Diff Big Sides'); init(dir)
    const mk = (tag, n) => lines(n, i => `${tag} ${String(i).padStart(6, '0')} ${(i * 2654435761 >>> 0).toString(36)} lorem ipsum dolor sit amet`)
    put(dir, 'a.txt', mk('alpha', 8000)); put(dir, 'b.txt', mk('bravo', 8000)); put(dir, 'tiny.txt', 'tiny\n')
    commitAll(dir)
    put(dir, 'a.txt', mk('omega', 8000)); put(dir, 'b.txt', mk('sigma', 8000)); put(dir, 'tiny.txt', 'tiny two\n')
    return dir
  },
  'diff-clean'() {
    const dir = fresh('W19 Diff Clean'); init(dir); put(dir, 'a.txt', 'a\n'); put(dir, 'sub/b.txt', 'b\n'); commitAll(dir)
    return dir
  },
  'diff-unborn'() {
    const dir = fresh('W19 Diff Unborn'); init(dir)
    put(dir, 'readme.md', '# unborn\n'); put(dir, 'src/a.ts', 'export const a = 1\n'); put(dir, 'src/b.ts', 'export const b = 2\n'); put(dir, 'sp ace.txt', 'x\n')
    git(dir, 'add', 'src/a.ts') // one staged, others untracked: still no HEAD
    return dir
  },
  'diff-unborn-empty'() {
    const dir = fresh('W19 Diff Unborn Empty'); init(dir)
    return dir
  },
  'diff-notgit'() {
    const dir = fresh('W19 Diff NotGit'); put(dir, 'a.txt', 'a\n'); put(dir, 'sub/b.txt', 'b\n')
    return dir
  },
  // Project 是仓库的子目录；仓库根与其他目录也有改动。
  'diff-subdir'() {
    const repo = fresh('W19 Diff Repo'); init(repo)
    put(repo, 'root.txt', 'root\n'); put(repo, 'pkg/inner.txt', 'inner\n'); put(repo, 'pkg/deep/d.txt', 'd\n'); put(repo, 'other/o.txt', 'o\n')
    commitAll(repo)
    put(repo, 'root.txt', 'root changed\n'); put(repo, 'pkg/inner.txt', 'inner changed\n'); put(repo, 'other/o.txt', 'o changed\n'); put(repo, 'pkg/new.txt', 'new in pkg\n'); put(repo, 'other/new.txt', 'new in other\n')
    return join(repo, 'pkg')
  },
  // 5000 个未跟踪文件。
  'diff-5000'() {
    const dir = fresh('W19 Diff Five Thousand'); init(dir); put(dir, 'tracked.txt', 't\n'); commitAll(dir)
    for (let i = 0; i < 5000; i++) { mkdirSync(join(dir, `d${i % 50}`), { recursive: true }); writeFileSync(join(dir, `d${i % 50}`, `u${String(i).padStart(4, '0')}.txt`), `${i}\n`) }
    put(dir, 'tracked.txt', 't changed\n')
    return dir
  },
  // 空 Project（引用链路用的第二个 Project）。
  'plain-two'() {
    const dir = fresh('W19 Plain Two'); put(dir, 'two.txt', 'project two file\n'); put(dir, 'shared-name.txt', 'from project two\n')
    return dir
  },
  // 文件引用 fixture 中的小目录。
  'refs'() {
    const dir = fresh('W19 Refs'); put(dir, 'a.txt', 'a\n'); put(dir, 'b.txt', 'b\n'); put(dir, 'docs/my file.md', 'spaced\n'); put(dir, 'shared-name.txt', 'from refs\n'); put(dir, '日本語.md', 'jp\n'); put(dir, 'bad\nname.txt', 'x\n'); put(dir, 'bin.dat', Buffer.from([0, 1, 2]))
    for (let i = 0; i < 23; i++) put(dir, `many/m${String(i).padStart(2, '0')}.txt`, `m${i}\n`)
    return dir
  }
}
for (const name of which) {
  if (!builders[name]) throw new Error('unknown fixture ' + name + '; known: ' + Object.keys(builders).join(', '))
  console.log(name, '->', builders[name]())
}
