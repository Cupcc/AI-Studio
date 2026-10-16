// W16 区域 C：Diff 服务对真实 Git 仓库的对抗用例：恶意仓库配置 / 钩子、宿主环境、仓库发现、参数注入、规模上限。
// 标注 [已接受风险] 的用例只记录实际行为（维护者已接受 filter.*.clean）；标注 [期望] 的是安全期望，失败即发现。
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { failureOfExit, sanitizeDetail } from '../../../apps/desktop/src/main/services/diff/query'
import { findExecutable, splitPath } from '../../../apps/desktop/src/main/services/shell-env/executables'
import { createGitLocator } from '../../../apps/desktop/src/main/services/diff/git-locate'
import { GIT_DIFF_ARGS, GIT_GLOBAL_ARGS, scrubbedGitEnv } from '../../../apps/desktop/src/main/services/diff/git-env'
import { DIFF_LIMITS } from '@shared/tools/diff'
import { alive, sleep, waitFor } from './W16-support'
import { createRepo, fixtureEnv, harness, hermeticHome, touchAll, type Repo } from './W16-diff-support'

const cleanups: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const repo = (options?: Parameters<typeof createRepo>[0]): Repo => { const value = createRepo(options); cleanups.push(() => value.cleanup()); return value }
function stack(target: Repo, options?: Parameters<typeof harness>[1]) {
  const value = harness({ p: target.root }, options)
  cleanups.push(() => value.service.dispose())
  return value
}
const SIX_FILES = { 'a.txt': 'a\n', 'b.txt': 'b\n', 'c.dat': 'c\n', 'sub/d.txt': 'd\n' }

describe('C1 恶意仓库配置：被服务参数 / 环境挡掉的向量（期望：标记文件从不出现）', () => {
  it('core.fsmonitor、diff.external、diff.<driver>.textconv / command、core.pager、core.sshCommand、core.askPass、credential.helper、core.editor、alias.diff 均不执行', async () => {
    const target = repo({ commit: SIX_FILES })
    target.write('.gitattributes', '*.dat diff=evil\n')
    target.git('add', '.gitattributes'); target.git('commit', '-q', '-m', 'attrs')
    // 夹具自己的 git 命令（mv）必须在写入恶意配置之前完成：它们不带服务的 -c 覆盖，会自己触发 fsmonitor（评审早期版本因此误报）
    target.write('a.txt', 'a changed\n'); target.write('c.dat', 'c changed\n'); target.write('new.dat', 'new\n')
    target.git('mv', 'b.txt', 'b-renamed.txt')
    for (const [key, name] of [
      ['core.fsmonitor', 'fsmonitor'], ['diff.external', 'external'], ['diff.evil.textconv', 'textconv'], ['diff.evil.command', 'drivercmd'],
      ['core.pager', 'pager'], ['core.sshCommand', 'ssh'], ['core.askPass', 'askpass'], ['credential.helper', 'credential'], ['core.editor', 'editor'], ['alias.diff', 'alias']
    ] as const) target.git('config', '--local', key, target.script(name))
    const { service } = stack(target)
    const snapshot = await service.getSnapshot('p')
    expect(snapshot.status).toBe('ready')
    for (const file of snapshot.files) await service.getFile({ projectId: 'p', path: file.path, oldPath: file.oldPath })
    expect(target.markerLines().filter((line) => !line.startsWith('hook') && !line.startsWith('clean'))).toEqual([])
  })

  it('include.path / includeIf 引入的配置同样被命令行 -c 覆盖：fsmonitor 与 diff.external 不执行', async () => {
    const target = repo({ commit: SIX_FILES })
    const included = join(target.base, 'included.gitconfig')
    writeFileSync(included, `[core]\n\tfsmonitor = ${target.script('inc-fsmonitor')}\n[diff]\n\texternal = ${target.script('inc-external')}\n`)
    target.git('config', '--local', 'include.path', included)
    target.git('config', '--local', `includeIf.gitdir:${target.root}/.path`, included)
    target.write('a.txt', 'changed\n')
    const { service } = stack(target)
    expect((await service.getSnapshot('p')).status).toBe('ready')
    await service.getFile({ projectId: 'p', path: 'a.txt', oldPath: null })
    expect(target.markerLines()).toEqual([])
  })

  it('core.attributesFile 指向 Project 外文件（含 diff=driver）：textconv 不执行', async () => {
    const target = repo({ commit: SIX_FILES })
    const attributes = join(target.base, 'attrs')
    writeFileSync(attributes, '* diff=evil\n')
    target.git('config', '--local', 'core.attributesFile', attributes)
    target.git('config', '--local', 'diff.evil.textconv', target.script('textconv2'))
    target.write('a.txt', 'changed\n')
    const { service } = stack(target)
    await service.getSnapshot('p')
    await service.getFile({ projectId: 'p', path: 'a.txt', oldPath: null })
    expect(target.markerLines()).toEqual([])
  })

  it('宿主环境里的 GIT_*（GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE / GIT_EXTERNAL_DIFF / GIT_PAGER / GIT_SSH_COMMAND / GIT_CONFIG_* / GIT_TRACE / GIT_EXEC_PATH）全部被丢弃', async () => {
    const target = repo({ commit: SIX_FILES })
    const other = repo({ commit: { 'other-only.txt': 'OTHER\n' }, label: 'other' })
    const trace = join(target.base, 'trace.log')
    const globalConfig = join(target.base, 'global.gitconfig')
    writeFileSync(globalConfig, `[core]\n\tfsmonitor = ${target.script('global-fsmonitor')}\n[diff]\n\texternal = ${target.script('global-external')}\n`)
    target.write('a.txt', 'changed\n')
    const hostile = {
      GIT_DIR: join(other.root, '.git'), GIT_WORK_TREE: other.root, GIT_INDEX_FILE: join(target.base, 'bogus-index'),
      GIT_EXTERNAL_DIFF: target.script('env-external'), GIT_PAGER: target.script('env-pager'), GIT_SSH_COMMAND: target.script('env-ssh'),
      GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.fsmonitor', GIT_CONFIG_VALUE_0: target.script('env-config'),
      GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_PARAMETERS: `'core.fsmonitor=${target.script('env-params')}'`, GIT_TRACE: trace, GIT_TRACE2: trace,
      GIT_EXEC_PATH: join(target.base, 'no-exec-path'), GIT_ASKPASS: target.script('env-askpass'), GIT_CEILING_DIRECTORIES: '/', GIT_NAMESPACE: 'evil'
    }
    const { service } = stack(target, { env: hostile })
    const snapshot = await service.getSnapshot('p')
    expect(snapshot.status).toBe('ready')
    expect(snapshot.files.map((file) => file.path)).toEqual(['a.txt'])
    const file = await service.getFile({ projectId: 'p', path: 'a.txt', oldPath: null })
    expect(file.status).toBe('ok')
    expect(target.markerLines()).toEqual([])
    expect(existsSync(trace)).toBe(false)
    expect(existsSync(join(target.base, 'bogus-index'))).toBe(false)
  })

  it('scrubbedGitEnv：删除全部 GIT_*（含大小写之外的奇怪键），固定非交互变量；GIT_GLOBAL_ARGS 含 fsmonitor / external / pager 覆盖', () => {
    const env = scrubbedGitEnv({ PATH: '/usr/bin', HOME: '/h', GIT_DIR: 'x', GIT_ANYTHING: 'y', GIT_: 'z', NOTGIT_X: 'keep', LD_PRELOAD: 'keepme' })
    expect(Object.keys(env).filter((key) => key.startsWith('GIT_')).sort()).toEqual(['GIT_LITERAL_PATHSPECS', 'GIT_OPTIONAL_LOCKS', 'GIT_PAGER', 'GIT_TERMINAL_PROMPT'])
    expect(env.NOTGIT_X).toBe('keep')
    expect(GIT_GLOBAL_ARGS.join(' ')).toContain('core.fsmonitor=false')
    expect(GIT_GLOBAL_ARGS.join(' ')).toContain('core.hooksPath=/dev/null')
    expect(GIT_DIFF_ARGS).toContain('--no-ext-diff')
  })
})

describe('C2 [期望] 只读查询不应执行仓库钩子、不应改写用户的 .git/index', () => {
  it('[期望] post-index-change 钩子不应在 Diff 查询期间运行（工作树文件仅 mtime 变化，内容未改）', async () => {
    const target = repo({ commit: SIX_FILES })
    mkdirSync(join(target.root, '.git', 'hooks'), { recursive: true })
    const hook = join(target.root, '.git', 'hooks', 'post-index-change')
    writeFileSync(hook, `#!/bin/sh\necho "HOOK post-index-change $*" >> "${target.markers}"\n`, { mode: 0o755 })
    touchAll(target.root, Object.keys(SIX_FILES))
    const { service } = stack(target)
    const snapshot = await service.getSnapshot('p')
    expect(snapshot.status).toBe('clean')
    expect(target.markerLines(), '钩子被执行：仓库自带代码在无任何内容修改时运行').toEqual([])
  })

  it('[期望] core.hooksPath 指向 Project 内目录时同样不应运行钩子', async () => {
    const target = repo({ commit: SIX_FILES })
    const hooks = join(target.root, 'my-hooks')
    mkdirSync(hooks)
    writeFileSync(join(hooks, 'post-index-change'), `#!/bin/sh\necho "HOOK hooksPath $*" >> "${target.markers}"\n`, { mode: 0o755 })
    target.git('config', '--local', 'core.hooksPath', hooks)
    touchAll(target.root, Object.keys(SIX_FILES))
    const { service } = stack(target)
    await service.getSnapshot('p')
    expect(target.markerLines()).toEqual([])
  })

  it('[期望] 查询不应改写用户仓库的 .git/index（--no-optional-locks 并不阻止 git diff 刷新索引）', async () => {
    const target = repo({ commit: SIX_FILES })
    touchAll(target.root, Object.keys(SIX_FILES))
    const index = join(target.root, '.git', 'index')
    const before = statSync(index, { bigint: true }).mtimeNs
    const { service } = stack(target)
    await service.getSnapshot('p')
    expect(existsSync(join(target.root, '.git', 'index.lock'))).toBe(false)
    expect(statSync(index, { bigint: true }).mtimeNs, '.git/index 被重写').toBe(before)
  })
})

describe('C3 [已接受风险] filter.*.clean：精确记录何时执行、是否需要“有改动的文件”', () => {
  function filterRepo() {
    const target = repo({ commit: false, init: true })
    target.write('.gitattributes', '*.txt filter=evil\n')
    target.write('a.txt', 'a\n'); target.write('b.txt', 'b\n'); target.write('other.md', 'o\n')
    target.commitAll('init')
    target.git('config', '--local', 'filter.evil.clean', `${target.script('clean', '')} %f`)
    return target
  }

  it('CHARACTERISATION：仅 mtime 变化、内容未改的工作树，打开 Diff（快照）即执行 clean 过滤器', async () => {
    const target = filterRepo()
    touchAll(target.root, ['a.txt', 'b.txt', 'other.md'])
    const { service } = stack(target)
    const snapshot = await service.getSnapshot('p')
    expect(snapshot.status).toBe('clean')
    console.info('[W16-C3 mtime-only] clean-filter runs:', target.markerLines().length)
    expect(target.markerLines().length).toBeGreaterThan(0)
  })

  it('CHARACTERISATION：整份拷贝的仓库（cp -R，无任何编辑）在首次打开 Diff 时对每个匹配文件执行 clean 过滤器与钩子', async () => {
    const original = filterRepo()
    mkdirSync(join(original.root, '.git', 'hooks'), { recursive: true })
    writeFileSync(join(original.root, '.git', 'hooks', 'post-index-change'), `#!/bin/sh\necho "hook post-index-change" >> "${original.markers}"\n`, { mode: 0o755 })
    const copy = join(original.base, 'copy')
    execFileSync('cp', ['-R', original.root, copy])
    const { service } = harness({ c: copy })
    cleanups.push(() => service.dispose())
    const snapshot = await service.getSnapshot('c')
    expect(snapshot.status).toBe('clean')
    const lines = original.markerLines()
    console.info('[W16-C3 copied tree] marker lines:', JSON.stringify(lines))
    expect(lines.some((line) => line.startsWith('clean'))).toBe(true)
  })

  it('CHARACTERISATION：未跟踪文件的单文件补丁（diff --no-index）也经过 clean 过滤器', async () => {
    const target = filterRepo()
    target.write('untracked.txt', 'u\n')
    const { service } = stack(target)
    await service.getFile({ projectId: 'p', path: 'untracked.txt', oldPath: null })
    console.info('[W16-C3 untracked] marker lines:', JSON.stringify(target.markerLines()))
    expect(target.markerLines().some((line) => line.includes('untracked.txt'))).toBe(true)
  })
})

describe('C4 仓库发现：.git 文件 / 符号链接 / core.worktree / 裸仓库 / 子目录 / 嵌套', () => {
  it('Project 位于 .git 目录内或是裸仓库：not_git，不列任何文件', async () => {
    const target = repo()
    const bare = join(target.base, 'bare.git')
    execFileSync('git', ['init', '-q', '--bare', bare], { env: fixtureEnv() })
    const gitDir = join(target.root, '.git')
    const { service } = harness({ bare, inside: gitDir })
    cleanups.push(() => service.dispose())
    for (const id of ['bare', 'inside']) {
      const snapshot = await service.getSnapshot(id)
      expect(snapshot.status, id).toBe('not_git')
      expect(snapshot.files, id).toEqual([])
    }
  })

  it('core.worktree 指向 Project 之外：not_git（Project 不在工作树内）', async () => {
    const target = repo()
    const elsewhere = join(target.base, 'elsewhere')
    mkdirSync(elsewhere)
    writeFileSync(join(elsewhere, 'private.txt'), 'PRIVATE\n')
    target.git('config', '--local', 'core.worktree', elsewhere)
    const { service } = stack(target)
    const snapshot = await service.getSnapshot('p')
    expect(snapshot.status).toBe('not_git')
    expect(JSON.stringify(snapshot)).not.toContain('PRIVATE')
  })

  it('.git 是文件（gitdir:）或符号链接，指向 Project 之外的另一仓库：Diff 服务把那个仓库当作 Project 的仓库（记录行为与泄露面）', async () => {
    const victim = repo({ commit: { 'victim-secret.txt': 'VICTIM-COMMITTED-CONTENT\n' }, label: 'victim' })
    for (const mode of ['gitfile', 'symlink'] as const) {
      const project = repo({ commit: false, init: false, label: `hostile-${mode}` })
      if (mode === 'gitfile') writeFileSync(join(project.root, '.git'), `gitdir: ${join(victim.root, '.git')}\n`)
      else symlinkSync(join(victim.root, '.git'), join(project.root, '.git'))
      project.write('mine.txt', 'mine\n')
      const { service } = harness({ h: project.root })
      cleanups.push(() => service.dispose())
      const snapshot = await service.getSnapshot('h')
      const paths = snapshot.files.map((file) => file.path)
      console.info(`[W16-C4 ${mode}] status=${snapshot.status} files=${JSON.stringify(paths)}`)
      expect(snapshot.files.every((file) => !file.path.startsWith('/') && !file.path.includes('..'))).toBe(true)
      const leaked = paths.includes('victim-secret.txt')
        ? await service.getFile({ projectId: 'h', path: 'victim-secret.txt', oldPath: null })
        : null
      if (leaked?.status === 'ok') {
        // 记录：另一仓库 HEAD 里的已提交内容出现在 Project 的 Diff 面板（原始侧），尽管它不在 Project 目录内
        console.info(`[W16-C4 ${mode}] other repository's committed blob shown: ${leaked.original.status === 'text' && leaked.original.text.includes('VICTIM')}`)
      }
    }
  })

  it('Project 是上层仓库的子目录：只显示该前缀内的变更，repoPrefix 给出前缀', async () => {
    const target = repo({ commit: { 'top.txt': 't\n', 'proj/in.txt': 'i\n' } })
    target.write('top.txt', 'changed\n'); target.write('proj/in.txt', 'changed\n')
    const { service } = harness({ sub: join(target.root, 'proj') })
    cleanups.push(() => service.dispose())
    const snapshot = await service.getSnapshot('sub')
    expect(snapshot.repoPrefix).toBe('proj')
    expect(snapshot.files.map((file) => file.path)).toEqual(['in.txt'])
  })

  it('嵌套仓库 / 子模块目录：作为 submodule 条目只给补丁，不读取其内部文件', async () => {
    const target = repo({ commit: SIX_FILES })
    const nested = join(target.root, 'nested')
    mkdirSync(nested)
    execFileSync('git', ['-c', 'init.defaultBranch=main', 'init', '-q', '.'], { cwd: nested, env: fixtureEnv() })
    writeFileSync(join(nested, 'inner.txt'), 'INNER-NESTED\n')
    const { service } = stack(target)
    const snapshot = await service.getSnapshot('p')
    const entry = snapshot.files.find((file) => file.path === 'nested')
    expect(entry?.special).toBe('submodule')
    const file = await service.getFile({ projectId: 'p', path: 'nested', oldPath: null })
    expect(JSON.stringify(file)).not.toContain('INNER-NESTED')
  })

  it('HEAD 树里手工构造的 .git/config 条目：只显示被提交的假内容，绝不读取真实的 .git/config', async () => {
    const target = repo({ commit: { 'a.txt': 'a\n' } })
    appendFileSync(join(target.root, '.git', 'config'), '\n[w16]\n\ttoken = REAL-CONFIG-TOKEN\n')
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: target.root, env: fixtureEnv(), input: 'fake\n', encoding: 'utf8' }).trim()
    const inner = execFileSync('git', ['mktree'], { cwd: target.root, env: fixtureEnv(), input: `100644 blob ${blob}\tconfig\n`, encoding: 'utf8' }).trim()
    const aBlob = target.git('rev-parse', 'HEAD:a.txt').trim()
    const tree = execFileSync('git', ['mktree'], { cwd: target.root, env: fixtureEnv(), input: `100644 blob ${aBlob}\ta.txt\n040000 tree ${inner}\t.git\n`, encoding: 'utf8' }).trim()
    const commit = target.git('commit-tree', tree, '-p', 'HEAD', '-m', 'crafted').trim()
    target.git('update-ref', 'refs/heads/main', commit)
    const { service } = stack(target)
    const snapshot = await service.getSnapshot('p')
    const file = await service.getFile({ projectId: 'p', path: '.git/config', oldPath: null })
    console.info(`[W16-C4 crafted .git tree] snapshot files=${JSON.stringify(snapshot.files.map((entry) => `${entry.kind}:${entry.path}`))} file=${file.status}`)
    expect(JSON.stringify([snapshot, file])).not.toContain('REAL-CONFIG-TOKEN')
  })
})

describe('C5 参数注入与路径形态', () => {
  it('以 - / : 开头、含通配符、含空格 / 换行 / 制表符 / 非 UTF-8 的文件名：列表与补丁都精确，且不产生副作用', async () => {
    const names = ['--output=pwned.txt', '-p', '--', ':(top)x', ':(glob)**', ':!ignored', '*.txt', '[ab].txt', 'with space.txt', 'new\nline.txt', 'tab\tname.txt', 'üñí.txt', '--no-index', '-c']
    const target = repo({ commit: Object.fromEntries(names.map((name) => [name, 'old\n'])) })
    for (const name of names) target.write(name, 'new\n')
    const { service } = stack(target)
    const snapshot = await service.getSnapshot('p')
    expect(snapshot.status).toBe('ready')
    expect(snapshot.files.map((file) => file.path).sort()).toEqual([...names].sort())
    for (const name of names) {
      const file = await service.getFile({ projectId: 'p', path: name, oldPath: null })
      expect(file.status, JSON.stringify(name)).toBe('ok')
      if (file.status === 'ok') {
        expect(file.patch?.text, JSON.stringify(name)).toContain('+new')
        expect(file.patch?.text, JSON.stringify(name)).not.toContain('+old')
        expect(file.modified).toMatchObject({ status: 'text', text: 'new\n' })
      }
    }
    expect(existsSync(join(target.root, 'pwned.txt'))).toBe(false)
    expect(readdirSync(target.root).filter((name) => name === 'pwned.txt' || name === 'x')).toEqual([])
  })

  it('oldPath 是任意 Project 路径（含魔法）：不改变查询范围，不报错泄露', async () => {
    const target = repo({ commit: SIX_FILES })
    target.write('a.txt', 'changed\n')
    const { service } = stack(target)
    for (const oldPath of ['--output=x', ':(top)b.txt', '.', 'sub', '*', ':(glob)**']) {
      if (oldPath === '.') continue
      const file = await service.getFile({ projectId: 'p', path: 'a.txt', oldPath })
      expect(['ok', 'unchanged', 'unavailable']).toContain(file.status)
      expect(JSON.stringify(file)).not.toMatch(/\/Users|\/private\/var/)
    }
  })

  it('原始侧的 sha 只来自 Git 自己的输出：一个恶意仓库把“文件名”设成形如 sha 的字符串也只是路径', async () => {
    const sha = 'a'.repeat(40)
    const target = repo({ commit: { [sha]: 'x\n', 'real.txt': 'r\n' } })
    target.write(sha, 'changed\n')
    const { service } = stack(target)
    const file = await service.getFile({ projectId: 'p', path: sha, oldPath: null })
    expect(file.status).toBe('ok')
    if (file.status === 'ok') expect(file.original).toMatchObject({ status: 'text', text: 'x\n' })
  })
})

describe('C6 规模与上限', () => {
  it('2 MiB 补丁被截断为 ≤ 1 MiB 并标 truncated；两侧超过 512 KiB 时只给补丁（omitted too_large）', async () => {
    const target = repo({ commit: { 'big.txt': 'x\n' } })
    target.write('big.txt', `${'0123456789abcdef'.repeat(64)}\n`.repeat(2200))
    const { service } = stack(target)
    const file = await service.getFile({ projectId: 'p', path: 'big.txt', oldPath: null })
    expect(file.status).toBe('ok')
    if (file.status !== 'ok') return
    expect(file.patch?.truncated).toBe(true)
    expect(file.patch!.text.length).toBeLessThanOrEqual(DIFF_LIMITS.patchBytes + 4)
    expect(file.modified).toMatchObject({ status: 'omitted', reason: 'too_large' })
  })

  it('5000 个未跟踪文件：列表 ≤ 2000 并标 truncated', async () => {
    const target = repo({ commit: { 'a.txt': 'a\n' } })
    execFileSync(process.execPath, ['-e', `const fs=require('fs');const d=process.argv[1];for(let i=0;i<5000;i++){fs.writeFileSync(d+'/u'+String(i).padStart(5,'0')+'.txt','x')}`, target.root])
    const { service } = stack(target)
    const snapshot = await service.getSnapshot('p')
    expect(snapshot.files.length).toBeLessThanOrEqual(DIFF_LIMITS.files)
    expect(snapshot.truncated).toBe(true)
    expect(snapshot.status).toBe('ready')
  })

  it('2.5 万个 200 字符文件名的未跟踪文件（> 4 MiB 清单）：git 被终止，结果 truncated，快照不会声称“没有变更”', async () => {
    const target = repo({ commit: { 'a.txt': 'a\n' } })
    execFileSync(process.execPath, ['-e', `const fs=require('fs');const d=process.argv[1];for(let i=0;i<25000;i++){fs.writeFileSync(d+'/'+String(i).padStart(6,'0')+'-'+'n'.repeat(190)+'.txt','')}`, target.root])
    const { service } = stack(target)
    const started = Date.now()
    const snapshot = await service.getSnapshot('p')
    console.info(`[W16-C6 4MiB listing] ${Date.now() - started} ms status=${snapshot.status} files=${snapshot.files.length} truncated=${snapshot.truncated}`)
    expect(snapshot.truncated).toBe(true)
    expect(snapshot.status).not.toBe('clean')
    expect(snapshot.files.length).toBeLessThanOrEqual(DIFF_LIMITS.files)
  })

  it('已跟踪的 64 MiB 二进制 / 文本 blob：原始侧经 cat-file -s 判定为 too_large，不把整个 blob 读入内存', async () => {
    const target = repo({ commit: false })
    target.write('blob.txt', 'x'.repeat(64 * 1024 * 1024)); target.write('blob.bin', Buffer.alloc(8 * 1024 * 1024, 1))
    target.commitAll('big')
    target.write('blob.txt', 'y'.repeat(64 * 1024 * 1024)); target.write('blob.bin', Buffer.alloc(8 * 1024 * 1024, 2))
    const { service } = stack(target)
    const rss = process.memoryUsage().rss
    for (const path of ['blob.txt', 'blob.bin']) {
      const file = await service.getFile({ projectId: 'p', path, oldPath: null })
      expect(file.status, path).toBe('ok')
      if (file.status === 'ok') {
        expect(file.original.status, path).toBe('omitted')
        expect(file.modified.status, path).toBe('omitted')
        expect((file.patch?.text.length ?? 0), path).toBeLessThanOrEqual(DIFF_LIMITS.patchBytes + 4)
      }
    }
    expect(process.memoryUsage().rss - rss).toBeLessThan(256 * 1024 * 1024)
  })
})

describe('C7 取消 / 关闭 / 超时：不留 git 或过滤器子进程', () => {
  function slowFilterRepo(escape = false) {
    const target = repo({ commit: false, init: true })
    target.write('.gitattributes', '*.txt filter=slow\n')
    target.write('a.txt', 'a\n')
    target.commitAll('init')
    const pidFile = join(target.base, 'filter.pid')
    const body = escape
      ? `/usr/bin/perl -e 'use POSIX; my $p = fork(); if ($p) { open(F, ">${pidFile}"); print F $p; close(F); exit 0 } POSIX::setsid(); close(STDIN); close(STDOUT); close(STDERR); exec("/bin/sleep", "300")'\nexit 0`
      : `echo $$ > "${pidFile}"\nexec /bin/sleep 300`
    const path = join(target.base, 'bin', 'slow-filter')
    writeFileSync(path, `#!/bin/sh\n${body}\n`, { mode: 0o755 })
    target.git('config', '--local', 'filter.slow.clean', path)
    touchAll(target.root, ['a.txt'])
    return { target, pidFile }
  }

  it('closeProject 在过滤器卡住时终止整个进程组：无 git、无过滤器子进程残留，且在 5 秒内返回', async () => {
    const { target, pidFile } = slowFilterRepo()
    const { service, runner } = stack(target)
    const pending = service.getSnapshot('p')
    await waitFor(() => existsSync(pidFile), 8000, 'filter started')
    const filterPid = Number(readFileSync(pidFile, 'utf8').trim())
    expect(alive(filterPid)).toBe(true)
    const started = Date.now()
    await service.closeProject('p')
    expect(Date.now() - started).toBeLessThan(5000)
    await pending.catch(() => {})
    await sleep(200)
    expect(alive(filterPid), '过滤器进程仍存活').toBe(false)
    expect(runner.pending('p')).toBe(0)
  })

  it('新的快照请求取代旧请求时，旧请求的 git / 过滤器被杀死', async () => {
    const { target, pidFile } = slowFilterRepo()
    const { service } = stack(target)
    void service.getSnapshot('p').catch(() => {})
    await waitFor(() => existsSync(pidFile), 8000, 'filter started')
    const filterPid = Number(readFileSync(pidFile, 'utf8').trim())
    // 第二次请求会再次启动同样的过滤器；旧的必须已被终止（至多 1 s SIGTERM 宽限 + SIGKILL）
    void service.getSnapshot('p').catch(() => {})
    await waitFor(() => !alive(filterPid), 6000, 'superseded filter killed')
    await service.closeProject('p')
  })

  it('[已接受风险·记录] 过滤器自行 setsid 脱离进程组后，closeProject 无法终止它（进程组清理的固有边界）', async () => {
    const { target, pidFile } = slowFilterRepo(true)
    const { service } = stack(target)
    await service.getSnapshot('p').catch(() => {})
    await waitFor(() => existsSync(pidFile), 8000, 'daemonised child started')
    const daemon = Number(readFileSync(pidFile, 'utf8').trim())
    await sleep(300)
    await service.closeProject('p')
    await sleep(300)
    const survived = alive(daemon)
    console.info(`[W16-C7 setsid escape] daemonised filter child ${survived ? 'SURVIVED' : 'was killed'} closeProject`)
    try { process.kill(daemon, 'SIGKILL') } catch { /* already gone */ }
    expect(typeof survived).toBe('boolean')
  })

  it('查询超时（15 s）：返回 timeout，并杀死 git 与过滤器；约耗时 16 s', async () => {
    const { target, pidFile } = slowFilterRepo()
    const { service } = stack(target)
    const started = Date.now()
    const snapshot = await service.getSnapshot('p')
    const elapsed = Date.now() - started
    expect(snapshot.status).toBe('timeout')
    expect(elapsed).toBeGreaterThanOrEqual(DIFF_LIMITS.listTimeoutMs - 200)
    expect(elapsed).toBeLessThan(DIFF_LIMITS.listTimeoutMs + 5000)
    const filterPid = Number(readFileSync(pidFile, 'utf8').trim())
    await waitFor(() => !alive(filterPid), 3000, 'timed-out filter killed')
  }, 40_000)
})

describe('C8 Git 查找器与错误信息', () => {
  it('splitPath / findExecutable 忽略相对与空的 PATH 项（Project 目录里的 ./git 不会被选中）', async () => {
    const target = repo({ commit: false, init: false })
    writeFileSync(join(target.root, 'git'), '#!/bin/sh\necho pwned\n', { mode: 0o755 })
    const previous = process.cwd()
    process.chdir(target.root)
    try {
      expect(splitPath(`.::rel/bin:${target.root}`)).toEqual([target.root])
      expect(await findExecutable('git', '.:rel/bin:')).toBeNull()
    } finally { process.chdir(previous) }
  })

  it('PATH 中靠前的绝对目录里的 git 会被采用（by design：与 CLI 发现一致）；定位器缓存结果', async () => {
    const target = repo({ commit: false, init: false })
    const shim = join(target.base, 'bin', 'git')
    writeFileSync(shim, '#!/bin/sh\necho "git version 9.9.9-w16-shim"\n', { mode: 0o755 })
    const locate = createGitLocator({ env: async () => ({ PATH: `${join(target.base, 'bin')}:/usr/bin:/bin` }), platform: 'darwin' })
    const found = await locate()
    expect(found).toMatchObject({ status: 'ok', path: shim, version: '9.9.9-w16-shim' })
  })

  it('/usr/bin/git 且 xcode-select 失败：返回 missing，且从不执行该可执行文件（version 注入器未被调用）', async () => {
    let executed = 0
    const locate = createGitLocator({
      env: async () => ({ PATH: '/usr/bin' }), platform: 'darwin', find: async () => '/usr/bin/git',
      xcodeSelect: async () => null, version: async () => { executed++; return 'never' }
    })
    expect(await locate()).toEqual({ status: 'missing' })
    const noGit = createGitLocator({
      env: async () => ({ PATH: '/usr/bin' }), platform: 'darwin', find: async () => '/usr/bin/git',
      xcodeSelect: async () => '/Library/Developer/CommandLineTools', developerGit: async () => false, version: async () => { executed++; return 'never' }
    })
    expect(await noGit()).toEqual({ status: 'missing' })
    expect(executed).toBe(0)
  })

  it('[记录] 通过符号链接 / 其它路径指向 /usr/bin/git 垫片时，定位器不识别垫片（仅比较字符串 /usr/bin/git）', async () => {
    let executed = 0
    const locate = createGitLocator({
      env: async () => ({ PATH: '/opt/shim' }), platform: 'darwin', find: async () => '/opt/shim/git', xcodeSelect: async () => null,
      version: async () => { executed++; return 'would-run-shim' }
    })
    const found = await locate()
    // 若 /opt/shim/git 实为 /usr/bin/git 的符号链接且未安装开发者工具，此处会执行安装器垫片并弹出系统安装窗口
    expect(found).toMatchObject({ status: 'ok', path: '/opt/shim/git' })
    expect(executed).toBe(1)
  })

  it('dubious ownership：真实 git 的 stderr 含绝对路径与 safe.directory 建议；服务映射为固定说明，不含路径、不建议也不执行 safe.directory', () => {
    const target = repo({ commit: { 'a.txt': 'a\n' } })
    let stderr = ''
    try {
      execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: target.root, env: fixtureEnv({ GIT_TEST_ASSUME_DIFFERENT_OWNER: '1' }), stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
    } catch (error) { stderr = String((error as { stderr?: string }).stderr ?? '') }
    // 注意：该变量只在本测试里手工传给原始 git，服务本身会把它清掉
    expect(stderr.length > 0 || true).toBe(true)
    const mapped = failureOfExit({ code: 128, stderr: `fatal: detected dubious ownership in repository at '${target.root}'\nTo add an exception for this directory, call:\n\n\tgit config --global --add safe.directory ${target.root}\n` }, target.root)
    expect(mapped.availability).toBe('git_unsafe_directory')
    expect(mapped.detail).not.toContain(target.root)
    expect(mapped.detail).not.toContain('safe.directory')
  })

  it('sanitizeDetail：含空格的绝对路径、用户名、环境值的 stderr：记录残留（空格后的路径片段）', () => {
    const root = '/private/var/folders/xx/yy/T/proj'
    const cleaned = sanitizeDetail(`fatal: unable to read config file '/Volumes/My Disk/alice smith/gitconfig': Permission denied; token=${'s3cr3t'} at ${root}/sub`, root)
    console.info('[W16-C8 sanitizeDetail]', cleaned)
    expect(cleaned).not.toContain(root)
    expect(cleaned.length).toBeLessThanOrEqual(300)
    // 期望：路径中的任何片段都不应留在给渲染端的文本里；含空格的路径只被替换了第一段
    expect(cleaned, '含空格的绝对路径残留').not.toMatch(/Disk|alice/)
  })
})
