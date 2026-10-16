// W16 区域 C / F：Diff 的失败详情不泄露路径；查询期间文件变化；Project 目录消失；git 缺失时的降级。
import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createGitLocator } from '../../../apps/desktop/src/main/services/diff/git-locate'
import { createGitRunner } from '../../../apps/desktop/src/main/services/diff/git-runner'
import { createDiffService } from '../../../apps/desktop/src/main/services/diff/service'
import { leaks, sleep } from './W16-support'
import { createRepo, fixtureEnv, harness, type Repo } from './W16-diff-support'

const cleanups: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const repo = (options?: Parameters<typeof createRepo>[0]): Repo => { const value = createRepo(options); cleanups.push(() => value.cleanup()); return value }
function stack(target: Repo) { const value = harness({ p: target.root }); cleanups.push(() => value.service.dispose()); return value }

describe('C9 失败详情（snapshot.detail / 错误）不含绝对路径、用户名、环境值', () => {
  const breakers: [string, (target: Repo) => void][] = [
    ['坏配置行', (target) => appendFileSync(join(target.root, '.git', 'config'), '\n[broken\n')],
    ['repositoryformatversion=99', (target) => target.git('config', '--local', 'core.repositoryformatversion', '99')],
    ['损坏的 HEAD', (target) => writeFileSync(join(target.root, '.git', 'HEAD'), 'garbage\n')],
    ['损坏的 index', (target) => writeFileSync(join(target.root, '.git', 'index'), 'not an index')],
    ['未知扩展', (target) => { target.git('config', '--local', 'core.repositoryformatversion', '1'); target.git('config', '--local', 'extensions.w16unknown', 'true') }],
    ['include.path 指向目录', (target) => target.git('config', '--local', 'include.path', target.base)]
  ]
  it.each(breakers)('%s：渲染端收到的快照 JSON 不含临时目录、用户主目录、栈', async (_name, breakIt) => {
    const target = repo({ commit: { 'a.txt': 'a\n' } })
    breakIt(target)
    const { service } = stack(target)
    const snapshot = await service.getSnapshot('p')
    const file = await service.getFile({ projectId: 'p', path: 'a.txt', oldPath: null }).catch((error: Error) => ({ error: error.message }))
    console.info(`[W16-C9 ${_name}] status=${snapshot.status} detail=${JSON.stringify(snapshot.detail)}`)
    for (const value of [snapshot, file]) expect(leaks(value, target.base)).toEqual([])
    expect(JSON.stringify(snapshot)).not.toContain(process.env.USER ?? '\u0000')
    expect(snapshot.detail === null || snapshot.detail.length <= 300).toBe(true)
  })

  it('git 可执行文件消失（定位器缓存了旧路径）：降级为 git_missing，不抛出，不泄露路径', async () => {
    const target = repo({ commit: { 'a.txt': 'a\n' } })
    const fake = join(target.base, 'bin', 'git')
    writeFileSync(fake, '#!/bin/sh\necho "git version 1.0.0"\n', { mode: 0o755 })
    const environment = async () => fixtureEnv({ PATH: `${join(target.base, 'bin')}:/usr/bin:/bin` })
    const locate = createGitLocator({ env: environment })
    const runner = createGitRunner({ locate, environment })
    const service = createDiffService({ projectPath: () => target.root, runner, invalidated: () => {}, watchChanged: () => {} })
    cleanups.push(() => service.dispose())
    expect((await locate()).status).toBe('ok')
    rmSync(fake)
    const snapshot = await service.getSnapshot('p')
    expect(['git_missing', 'ready', 'clean']).toContain(snapshot.status)
    expect(leaks(snapshot, target.base)).toEqual([])
  })
})

describe('C10 查询期间的变化', () => {
  it('持续改写已跟踪文件（先截断再写入的非原子写者）：修改侧永远是完整的某一版本或被保留，补丁与修改侧不混版本', async () => {
    const target = repo({ commit: { 'w.txt': `${'0'.repeat(4000)}\n` } })
    const script = `const fs=require('fs');const p=process.argv[1];let i=0;for(;;){const c=(i++%2?'A':'B').repeat(4000)+'\\n';fs.writeFileSync(p,c)}`
    const child = spawn(process.execPath, ['-e', script, join(target.root, 'w.txt')], { stdio: 'ignore' })
    cleanups.push(() => { child.kill('SIGKILL') })
    await sleep(100)
    const { service } = stack(target)
    const outcomes: Record<string, number> = {}
    for (let index = 0; index < 25; index++) {
      const file = await service.getFile({ projectId: 'p', path: 'w.txt', oldPath: null })
      if (file.status !== 'ok') { const k = file.status === 'unavailable' ? `unavailable:${file.availability}` : file.status; outcomes[k] = (outcomes[k] ?? 0) + 1; continue }
      const text = file.modified.status === 'text' ? file.modified.text : null
      const key = text === null ? `omitted:${file.modified.status === 'omitted' ? file.modified.reason : file.modified.status}:settled=${file.settled}` : `text:settled=${file.settled}`
      outcomes[key] = (outcomes[key] ?? 0) + 1
      if (text !== null) expect(text === `${'A'.repeat(4000)}\n` || text === `${'B'.repeat(4000)}\n` || text === '' , `torn modified side: ${text.slice(0, 20)}…`).toBe(true)
    }
    child.kill('SIGKILL')
    console.info('[W16-C10 growing/rewritten file]', JSON.stringify(outcomes))
  })

  it('查询过程中 Project 目录被整个移走：返回 project_unavailable / 失败，不抛未处理异常，无残留 git', async () => {
    const target = repo({ commit: { 'a.txt': 'a\n' } })
    const { service, runner } = stack(target)
    const pending = service.getSnapshot('p')
    renameSync(target.root, `${target.root}-moved`)
    cleanups.push(() => { rmSync(`${target.root}-moved`, { recursive: true, force: true }) })
    const snapshot = await pending
    expect(['project_unavailable', 'failed', 'not_git', 'ready', 'clean']).toContain(snapshot.status)
    expect(leaks(snapshot, target.base)).toEqual([])
    const again = await service.getSnapshot('p')
    expect(['project_unavailable']).toContain(again.status)
    expect(runner.pending('p')).toBe(0)
    mkdirSync(target.root)
  })
})

describe('C11 真实子模块（gitlink）', () => {
  it('子模块只以 submodule 条目出现；子模块自己的恶意 config / 钩子在查询超级项目时不被执行；不读取子模块内部文件', async () => {
    const sub = repo({ commit: { 'inner.txt': 'INNER-SUBMODULE-CONTENT\n' }, label: 'subrepo' })
    const top = repo({ commit: { 'a.txt': 'a\n' } })
    top.git('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', sub.root, 'vendor/sub')
    top.git('commit', '-q', '-m', 'add submodule')
    // 子模块的 git 目录在 .git/modules/vendor/sub；写入恶意配置与钩子，再让子模块 HEAD 前进（超级项目看到的是修改过的 gitlink）
    const moduleDir = join(top.root, '.git', 'modules', 'vendor', 'sub')
    appendFileSync(join(moduleDir, 'config'), `\n[core]\n\tfsmonitor = ${top.script('sub-fsmonitor')}\n`)
    mkdirSync(join(moduleDir, 'hooks'), { recursive: true })
    writeFileSync(join(moduleDir, 'hooks', 'post-index-change'), `#!/bin/sh\necho "HOOK submodule" >> "${top.markers}"\n`, { mode: 0o755 })
    writeFileSync(join(top.root, 'vendor', 'sub', 'inner.txt'), 'CHANGED-INSIDE-SUBMODULE\n')
    top.write('a.txt', 'a changed\n')
    const { service } = stack(top)
    const snapshot = await service.getSnapshot('p')
    const entry = snapshot.files.find((file) => file.path === 'vendor/sub')
    console.info(`[W16-C11] status=${snapshot.status} files=${JSON.stringify(snapshot.files.map((file) => `${file.kind}:${file.path}:${file.special}`))}`)
    for (const file of snapshot.files) await service.getFile({ projectId: 'p', path: file.path, oldPath: file.oldPath })
    const sink = await service.getFile({ projectId: 'p', path: 'vendor/sub/inner.txt', oldPath: null })
    expect(JSON.stringify(sink)).not.toContain('CHANGED-INSIDE-SUBMODULE')
    if (entry) expect(entry.special).toBe('submodule')
    expect(top.markerLines(), '子模块内的配置 / 钩子被执行').toEqual([])
  })
})

describe('C12 [记录] 子模块内部的未提交修改对 Diff 不可见', () => {
  it('只修改子模块工作树内的文件：快照为 clean（--ignore-submodules=dirty），界面没有任何提示', async () => {
    const sub = repo({ commit: { 'inner.txt': 'inner\n' }, label: 'subrepo2' })
    const top = repo({ commit: { 'a.txt': 'a\n' } })
    top.git('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', sub.root, 'vendor/sub')
    top.git('commit', '-q', '-m', 'add submodule')
    writeFileSync(join(top.root, 'vendor', 'sub', 'inner.txt'), 'UNCOMMITTED-AGENT-EDIT\n')
    writeFileSync(join(top.root, 'vendor', 'sub', 'new-file.txt'), 'new\n')
    const { service } = stack(top)
    const snapshot = await service.getSnapshot('p')
    console.info(`[W16-C12] status=${snapshot.status} files=${JSON.stringify(snapshot.files.map((file) => file.path))}`)
    // 记录性断言：目前确为 clean。若将来改为提示“子模块内有未提交修改”，此用例应随之更新。
    expect(snapshot.status).toBe('clean')
  })
})
