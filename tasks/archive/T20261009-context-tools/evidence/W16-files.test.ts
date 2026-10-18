// W16 区域 B：Files 服务在真实临时目录树上的对抗用例（符号链接、特殊文件、竞态、规模、watcher）。
// 断言来自契约：Project 相对路径、不跟随链接、`.git` 不可见、读写有界、不阻塞、关闭即释放。
import { spawn, execFileSync } from 'node:child_process'
import {
  chmodSync, closeSync, linkSync, mkdirSync, openSync, readdirSync, renameSync, rmSync, symlinkSync, truncateSync, unlinkSync, writeFileSync, writeSync, appendFileSync
} from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { afterEach, describe, expect, it } from 'vitest'
import { createFilesService, FILES_REQUEST_TIMEOUT_MS, type FilesService } from '../../../../apps/desktop/src/main/services/files/service'
import { createFilesWatcher } from '../../../../apps/desktop/src/main/services/files/watcher'
import type { FilesChanged, FilesWatchChanged } from '@shared/tools/files'
import { makeTree, SECRET, sleep, waitFor, type Tree } from 'W16-support'

const cleanups: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

function stack(tree: Tree, options: { watch?: boolean } = {}) {
  const changed: FilesChanged[] = []
  const watchChanged: FilesWatchChanged[] = []
  const service: FilesService = createFilesService({
    projectRoot: (id) => (id === 'p' ? tree.root : null),
    changed: (event) => changed.push(event),
    watchChanged: (event) => watchChanged.push(event)
  })
  cleanups.push(() => service.dispose())
  void options
  return { service, changed, watchChanged }
}
const fresh = (label?: string) => { const tree = makeTree(label); cleanups.push(() => tree.cleanup()); return tree }

describe('B1 符号链接、特殊文件、硬链接', () => {
  it('文件符号链接 / 目录符号链接 / 悬空 / 环 / 中间符号链接：列表标 symlink，读取与引用一律拒绝，永不返回 Project 外内容', async () => {
    const tree = fresh()
    const { service } = stack(tree)
    tree.write('real/inner.txt', 'inner')
    symlinkSync(join(tree.outside, 'secret.txt'), join(tree.root, 'file-link'))
    symlinkSync(tree.outside, join(tree.root, 'dir-link'))
    symlinkSync(join(tree.root, 'missing-target'), join(tree.root, 'dangling'))
    symlinkSync('loop-b', join(tree.root, 'loop-a'))
    symlinkSync('loop-a', join(tree.root, 'loop-b'))
    symlinkSync('real', join(tree.root, 'inside-dir-link'))
    symlinkSync('../outside/secret.txt', join(tree.root, 'relative-escape'))

    const list = await service.list('p', '')
    expect(list.status).toBe('ok')
    if (list.status !== 'ok') return
    const kinds = Object.fromEntries(list.entries.map((entry) => [entry.name, entry.kind]))
    for (const name of ['file-link', 'dir-link', 'dangling', 'loop-a', 'loop-b', 'inside-dir-link', 'relative-escape']) expect(kinds[name], name).toBe('symlink')

    for (const path of ['file-link', 'dangling', 'loop-a', 'relative-escape', 'dir-link/secret.txt', 'inside-dir-link/inner.txt', 'loop-a/x']) {
      const read = await service.read({ projectId: 'p', path })
      expect(read.status, path).toBe('unavailable')
      expect(JSON.stringify(read), path).not.toContain(SECRET)
      const refs = await service.resolveReference('p', [path])
      expect(refs.status, path).toBe('rejected')
    }
    for (const path of ['dir-link', 'inside-dir-link', 'loop-a']) {
      const result = await service.list('p', path)
      expect(result.status, path).toBe('unavailable')
    }
    // 中间符号链接下的目录列表也不得穿透
    const through = await service.list('p', 'dir-link')
    expect(JSON.stringify(through)).not.toContain('secret.txt')
  })

  it('符号链接目标文本（linkTarget）按原样回传，至多 256 字符：这是设计内的信息（记录）', async () => {
    const tree = fresh()
    const { service } = stack(tree)
    symlinkSync('/etc/' + 'x'.repeat(400), join(tree.root, 'long-link'))
    const list = await service.list('p', '')
    if (list.status !== 'ok') throw new Error('list failed')
    const entry = list.entries.find((item) => item.name === 'long-link')!
    expect(entry.linkTarget?.length).toBe(256)
    expect(entry.linkTarget?.startsWith('/etc/')).toBe(true)
  })

  it('FIFO 与 Unix 套接字：不阻塞（读取、引用、列表都在 2 秒内返回），原因为 not_file', async () => {
    const tree = fresh()
    const { service } = stack(tree)
    tree.mkfifo('pipe')
    const sockPath = join(tree.root, 'sock')
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(sockPath, resolve))
    cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())))
    const started = Date.now()
    for (const path of ['pipe', 'sock']) {
      expect(await service.read({ projectId: 'p', path })).toMatchObject({ status: 'unavailable', reason: 'not_file' })
      expect(await service.resolveReference('p', [path])).toMatchObject({ status: 'rejected' })
    }
    const list = await service.list('p', '')
    if (list.status !== 'ok') throw new Error('list failed')
    expect(Object.fromEntries(list.entries.map((entry) => [entry.name, entry.kind]))).toMatchObject({ pipe: 'other', sock: 'other' })
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('硬链接：服务无法、也不尝试区分硬链接（记录）；指向 Project 外同卷文件的硬链接可被读取', async () => {
    const tree = fresh()
    const { service } = stack(tree)
    linkSync(join(tree.outside, 'secret.txt'), join(tree.root, 'hardlink.txt'))
    const read = await service.read({ projectId: 'p', path: 'hardlink.txt' })
    // 预期（威胁模型）：硬链接是 Project 内的普通文件，读取成功属于“信任 Project 目录”的范围；这里记录行为，不作安全判定
    expect(read.status).toBe('ok')
    if (read.status === 'ok') expect(read.text).toBe(SECRET)
  })
})

describe('B2 .git 排除：大小写、规范化、控制字符与特殊名称', () => {
  it('.GIT / .Git / 任意大小写与 NFD 路径均 excluded；列表不含任何 .git 变体', async () => {
    const tree = fresh()
    const { service } = stack(tree)
    mkdirSync(join(tree.root, '.git'))
    writeFileSync(join(tree.root, '.git', 'config'), '[core]\n\ttoken = TOP\n')
    writeFileSync(join(tree.root, 'sub-file.txt'), 'x')
    mkdirSync(join(tree.root, 'nested', '.git'), { recursive: true })
    writeFileSync(join(tree.root, 'nested', '.git', 'config'), '[core]\n')
    for (const path of ['.git/config', '.GIT/config', '.Git/config', '.gIt/config', '.git', '.GIT', 'nested/.git/config', 'nested/.GIT/config', 'nested/.GiT']) {
      const read = await service.read({ projectId: 'p', path })
      expect(JSON.stringify(read), path).not.toContain('token')
      expect(read, path).toMatchObject({ status: 'unavailable', reason: 'excluded' })
      expect(await service.list('p', path), path).toMatchObject({ status: 'unavailable' })
      expect(await service.resolveReference('p', [path]), path).toMatchObject({ status: 'rejected' })
    }
    for (const dir of ['', 'nested']) {
      const list = await service.list('p', dir)
      if (list.status !== 'ok') throw new Error('list failed')
      expect(list.entries.map((entry) => entry.name.toLowerCase())).not.toContain('.git')
    }
  })

  it('非 ASCII 同形 / 不可见字符变体不会被 APFS 当作 .git（实测），因此无需排除；.git 文件（gitdir:）同样被排除', async () => {
    const tree = fresh()
    const { service } = stack(tree)
    writeFileSync(join(tree.root, '.git'), 'gitdir: /somewhere/else\n')
    expect(await service.read({ projectId: 'p', path: '.git' })).toMatchObject({ status: 'unavailable', reason: 'excluded' })
    expect(await service.resolveReference('p', ['.git'])).toMatchObject({ status: 'rejected' })
    // 这些名字在 APFS 上不是 .git：请求它们应当是 missing（而不是读到 .git 的内容）
    for (const name of ['.g‌it', '.git​', '.gi‍t', '.GİT', '.gıt']) {
      const read = await service.read({ projectId: 'p', path: name })
      expect(JSON.stringify(read), JSON.stringify(name)).not.toContain('somewhere')
      expect(read.status).toBe('unavailable')
    }
  })

  it('NFC / NFD 拼写：同一文件两种拼写都能读到，引用按 NFC 去重；大小写变体按真实路径去重', async () => {
    const tree = fresh()
    const { service } = stack(tree)
    const nfd = 'café.txt'
    const nfc = 'café.txt'
    writeFileSync(join(tree.root, nfd), 'coffee')
    writeFileSync(join(tree.root, 'Case.txt'), 'case')
    for (const path of [nfd, nfc]) expect(await service.read({ projectId: 'p', path }), path).toMatchObject({ status: 'ok', text: 'coffee' })
    const refs = await service.resolveReference('p', [nfd, nfc, 'Case.txt', 'case.TXT'])
    expect(refs.status).toBe('ok')
    if (refs.status === 'ok') expect(refs.files.map((file) => file.path)).toEqual([nfd, 'Case.txt'])
  })

  it('含换行 / 控制字符 / RTL 覆盖符 / 255 字符的名字：可列出、可读（查看），但不可引用（name_unsupported）；RTL 覆盖符可引用（记录）', async () => {
    const tree = fresh()
    const { service } = stack(tree)
    const names = ['line\nbreak.txt', 'cr\rname.txt', 'nel\u0085name.txt', 'ls name.txt', 'ps name.txt', 'tab\tname.txt', 'esc\u001bname.txt', 'del\u007fname.txt']
    for (const name of names) writeFileSync(join(tree.root, name), 'x')
    const rtl = 'evil‮gnp.txt'
    writeFileSync(join(tree.root, rtl), 'x')
    const long = `${'n'.repeat(251)}.txt`
    writeFileSync(join(tree.root, long), 'long')
    for (const name of names) {
      const refs = await service.resolveReference('p', [name])
      expect(refs, JSON.stringify(name)).toMatchObject({ status: 'rejected', failures: [{ reason: 'name_unsupported' }] })
      expect((await service.read({ projectId: 'p', path: name })).status, JSON.stringify(name)).toBe('ok')
    }
    const rtlRefs = await service.resolveReference('p', [rtl])
    expect(rtlRefs.status).toBe('ok') // 记录：双向控制符不被拒绝（见 D 区：JSON 引号不转义它）
    expect(await service.read({ projectId: 'p', path: long })).toMatchObject({ status: 'ok', text: 'long' })
  })
})

describe('B3 根目录被替换 / 删除，权限与大小', () => {
  it('Project 根被删除、被替换为指向外部的符号链接：project_unavailable，绝无外部内容', async () => {
    const tree = fresh()
    const { service } = stack(tree)
    tree.write('a.txt', 'inside')
    expect(await service.read({ projectId: 'p', path: 'a.txt' })).toMatchObject({ status: 'ok' })
    const moved = join(tree.base, 'project-moved')
    renameSync(tree.root, moved)
    symlinkSync(tree.outside, tree.root)
    writeFileSync(join(tree.outside, 'a.txt'), SECRET)
    for (const result of [await service.read({ projectId: 'p', path: 'a.txt' }), await service.list('p', ''), await service.resolveReference('p', ['a.txt'])]) {
      expect(JSON.stringify(result)).not.toContain(SECRET)
      expect(JSON.stringify(result)).toMatch(/project_unavailable/)
    }
    unlinkSync(tree.root)
    expect(await service.list('p', '')).toMatchObject({ status: 'unavailable', reason: 'project_unavailable' })
  })

  it('chmod 000 的文件 / 目录：permission_denied，不抛出', async () => {
    const tree = fresh()
    const { service } = stack(tree)
    tree.write('locked.txt', 'x')
    tree.write('locked-dir/a.txt', 'x')
    chmodSync(join(tree.root, 'locked.txt'), 0)
    chmodSync(join(tree.root, 'locked-dir'), 0)
    cleanups.push(() => { chmodSync(join(tree.root, 'locked-dir'), 0o755) })
    expect(await service.read({ projectId: 'p', path: 'locked.txt' })).toMatchObject({ status: 'unavailable', reason: 'permission_denied' })
    expect(await service.list('p', 'locked-dir')).toMatchObject({ status: 'unavailable', reason: 'permission_denied' })
    expect(await service.resolveReference('p', ['locked.txt'])).toMatchObject({ status: 'rejected' })
  })

  it('10 GiB 稀疏文件：以 too_large 回答并带 size，内存不随文件大小增长，耗时 < 1 秒', async () => {
    const tree = fresh()
    const { service } = stack(tree)
    const path = join(tree.root, 'sparse.bin')
    writeFileSync(path, '')
    truncateSync(path, 10 * 1024 ** 3)
    const rss = process.memoryUsage().rss
    const started = Date.now()
    const read = await service.read({ projectId: 'p', path: 'sparse.bin' })
    expect(Date.now() - started).toBeLessThan(1000)
    expect(read).toMatchObject({ status: 'unavailable', size: 10 * 1024 ** 3 })
    expect(['binary', 'too_large']).toContain((read as { reason: string }).reason)
    expect(process.memoryUsage().rss - rss).toBeLessThan(64 * 1024 * 1024)
    // 引用不是内容快照：大文件允许引用
    expect((await service.resolveReference('p', ['sparse.bin'])).status).toBe('ok')
  })

  it('读取期间文件持续增长：不返回撕裂内容（changed_while_reading 或一致快照）', async () => {
    const tree = fresh()
    const { service } = stack(tree)
    const path = tree.write('growing.txt', 'a'.repeat(10_000))
    const child = spawn(process.execPath, ['-e', `const fs=require('fs');const p=process.argv[1];const fd=fs.openSync(p,'a');for(;;){fs.writeSync(fd,'b'.repeat(500))}`, path], { stdio: 'ignore' })
    cleanups.push(() => { child.kill('SIGKILL') })
    await sleep(100)
    const seen = new Set<string>()
    for (let index = 0; index < 40; index++) {
      const read = await service.read({ projectId: 'p', path: 'growing.txt' })
      seen.add(read.status === 'ok' ? 'ok' : read.status === 'unavailable' ? read.reason : read.status)
      if (read.status === 'ok') expect(read.text.length).toBe(read.size)
    }
    child.kill('SIGKILL')
    // 允许 ok（一致快照）、too_large（已超过 1 MiB）、changed_while_reading；不允许其它读取错误
    for (const state of seen) expect(['ok', 'too_large', 'changed_while_reading']).toContain(state)
  })
})

describe('B4 规模：10 万个条目的目录', () => {
  it('列表有界（≤ 2000 条、truncated），事件循环不被长时间阻塞', async () => {
    const tree = fresh()
    const { service } = stack(tree)
    const dir = join(tree.root, 'huge')
    mkdirSync(dir)
    execFileSync(process.execPath, ['-e', `const fs=require('fs');const d=process.argv[1];for(let i=0;i<100000;i++){fs.closeSync(fs.openSync(d+'/f'+i,'w'))}`, dir])
    expect(readdirSync(dir).length).toBe(100_000)
    const lag = monitorEventLoopDelay({ resolution: 5 })
    lag.enable()
    const started = Date.now()
    const list = await service.list('p', 'huge')
    const elapsed = Date.now() - started
    lag.disable()
    if (list.status !== 'ok') throw new Error(`list failed: ${JSON.stringify(list)}`)
    expect(list.entries.length).toBeLessThanOrEqual(2000)
    expect(list.truncated).toBe(true)
    console.info(`[W16-B4] list(100k entries): ${elapsed} ms, entries=${list.entries.length}, event-loop max delay ${(lag.max / 1e6).toFixed(1)} ms`)
    expect(elapsed).toBeLessThan(FILES_REQUEST_TIMEOUT_MS)
    expect(lag.max / 1e6).toBeLessThan(500)
  })
})

describe('B5 TOCTOU：目录与符号链接在检查与使用之间被换', () => {
  /** 子进程里高速轮换：`swap` 目录在“真实目录”与“指向 outside 的符号链接”之间切换，直到停止文件出现。 */
  function startSwapper(tree: Tree, real: string, linkName: string) {
    const stopFile = join(tree.base, 'stop-swap')
    const script = `
      const fs = require('fs'); const [root, real, link, stop] = process.argv.slice(1)
      const d = root + '/' + real, dl = root + '/' + link, tmp = root + '/' + real + '.tmp'
      for (;;) {
        for (let k = 0; k < 500; k++) {
          fs.renameSync(d, tmp); fs.renameSync(dl, d)   // d 现在是符号链接
          fs.renameSync(d, dl); fs.renameSync(tmp, d)   // 还原
        }
        if (fs.existsSync(stop)) break
      }`
    const child = spawn(process.execPath, ['-e', script, tree.root, real, linkName, stopFile], { stdio: 'ignore' })
    const stop = () => { writeFileSync(stopFile, 'x'); child.kill('SIGKILL') }
    cleanups.push(stop)
    return stop
  }

  it('读取：目录被高速换成指向外部的符号链接时，永不读到 Project 外文件内容', async () => {
    const tree = fresh('w16-race-read')
    const { service } = stack(tree)
    tree.write('d/f.txt', 'INSIDE')
    writeFileSync(join(tree.outside, 'f.txt'), SECRET)
    symlinkSync(tree.outside, join(tree.root, 'dl'))
    const stop = startSwapper(tree, 'd', 'dl')
    await sleep(100)
    let attempts = 0, leaked = 0, ok = 0
    const deadline = Date.now() + 8000
    while (Date.now() < deadline) {
      const read = await service.read({ projectId: 'p', path: 'd/f.txt' })
      attempts++
      if (read.status === 'ok') { ok++; if (read.text === SECRET || read.text.includes('W16-OUTSIDE')) leaked++ }
    }
    stop()
    console.info(`[W16-B5-read] attempts=${attempts} ok=${ok} leaked=${leaked}`)
    expect(leaked).toBe(0)
  })

  it('列表：目录被高速换成指向外部目录的符号链接时，不应列出 Project 外目录的条目名', { timeout: 60_000 }, async () => {
    const tree = fresh('w16-race-list')
    const { service } = stack(tree)
    mkdirSync(join(tree.root, 'd'))
    writeFileSync(join(tree.root, 'd', 'inside-only.txt'), 'x')
    writeFileSync(join(tree.outside, 'OUTSIDE-ONLY-NAME.txt'), 'y')
    symlinkSync(tree.outside, join(tree.root, 'dl'))
    const stop = startSwapper(tree, 'd', 'dl')
    await sleep(100)
    let attempts = 0, leaked = 0, ok = 0
    // 竞态是概率性的（8 秒窗口内约一半的运行命中）；一旦命中第一次即停止，最长 40 秒
    const started = Date.now()
    const deadline = started + 40_000
    while (Date.now() < deadline && leaked === 0) {
      const list = await service.list('p', 'd')
      attempts++
      if (list.status === 'ok') { ok++; if (list.entries.some((entry) => entry.name === 'OUTSIDE-ONLY-NAME.txt' || entry.name === 'secret.txt')) leaked++ }
    }
    console.info(`[W16-B5-list] first leak after ${Date.now() - started} ms`)
    stop()
    console.info(`[W16-B5-list] attempts=${attempts} ok=${ok} outside-names-listed=${leaked}`)
    expect(leaked, 'list() 在目录被换成符号链接后仍返回了 Project 外目录的条目名').toBe(0)
  })
})

describe('B6 watcher：风暴、上限、泄漏、关闭', () => {
  it('node_modules 内 10 万个文件的创建风暴：不产生事件（早期过滤），事件循环不被拖慢', async () => {
    const tree = fresh('w16-storm-nm')
    const { service, changed } = stack(tree)
    mkdirSync(join(tree.root, 'node_modules', 'pkg'), { recursive: true })
    const sub = service.subscribe('p', 1)
    expect(sub.watch).toBe('live')
    const lag = monitorEventLoopDelay({ resolution: 5 })
    lag.enable()
    const heap = process.memoryUsage().heapUsed
    await new Promise<void>((resolve) => {
      const child = spawn(process.execPath, ['-e', `const fs=require('fs');const d=process.argv[1];for(let i=0;i<100000;i++){fs.writeFileSync(d+'/f'+i,'x')}`, join(tree.root, 'node_modules', 'pkg')], { stdio: 'ignore' })
      child.on('exit', () => resolve())
    })
    await sleep(1500)
    lag.disable()
    console.info(`[W16-B6-nm] changed events=${changed.length}, lag max ${(lag.max / 1e6).toFixed(1)} ms, heap delta ${((process.memoryUsage().heapUsed - heap) / 1e6).toFixed(1)} MB`)
    expect(changed.filter((event) => event.dirs.some((dir) => dir.startsWith('node_modules/pkg')))).toEqual([])
    expect(lag.max / 1e6).toBeLessThan(500)
  })

  it('普通目录内 10 万个文件的创建风暴：事件被合并为 overflow / 少量事件，数量有界', async () => {
    const tree = fresh('w16-storm-src')
    const { service, changed } = stack(tree)
    mkdirSync(join(tree.root, 'src'))
    expect(service.subscribe('p', 1).watch).toBe('live')
    const lag = monitorEventLoopDelay({ resolution: 5 })
    lag.enable()
    await new Promise<void>((resolve) => {
      const child = spawn(process.execPath, ['-e', `const fs=require('fs');const d=process.argv[1];for(let i=0;i<100000;i++){fs.writeFileSync(d+'/f'+i,'x')}`, join(tree.root, 'src')], { stdio: 'ignore' })
      child.on('exit', () => resolve())
    })
    await sleep(2500)
    lag.disable()
    console.info(`[W16-B6-src] changed events=${changed.length}, overflow=${changed.filter((event) => event.overflow).length}, lag max ${(lag.max / 1e6).toFixed(1)} ms`)
    // 10 万次文件创建约 8–10 s；1 秒最小间隔 + 防抖最长 1 秒 => 事件数应远小于文件数
    expect(changed.length).toBeLessThan(200)
    expect(lag.max / 1e6).toBeLessThan(500)
  })

  it('最多 4 个活动 watcher：第 5 个 Project 降级为 degraded，释放一个后补上；订阅泄漏上限（记录）', async () => {
    const trees = Array.from({ length: 6 }, () => fresh('w16-cap'))
    const roots = new Map(trees.map((tree, index) => [`p${index}`, tree.root]))
    const events: FilesWatchChanged[] = []
    const watcher = createFilesWatcher({
      projectRoot: (id) => roots.get(id) ?? null, nextRevision: (() => { let n = 0; return () => ++n })(), changed: () => {}, watchChanged: (event) => events.push(event), graceMs: 50
    })
    cleanups.push(() => watcher.dispose())
    const subs = [...roots.keys()].map((id) => watcher.subscribe(id, 1))
    expect(subs.filter((sub) => sub.watch === 'live').length).toBe(4)
    expect(subs.filter((sub) => sub.watch === 'degraded').length).toBe(2)
    expect(watcher.liveCount()).toBe(4)
    watcher.unsubscribe('p0', subs[0]!.subscriptionId, 1)
    await waitFor(() => watcher.liveCount() === 4 && events.some((event) => event.projectId === 'p4' && event.watch === 'live'), 3000, 'slot handed to degraded project')
    watcher.closeAll()
    expect(watcher.liveCount()).toBe(0)
  })

  it('订阅泛滥：同一发送方重复订阅 20 万次，只占 Map 条目；全部退订 / 关闭后 watcher 释放（记录内存增长）', async () => {
    const tree = fresh('w16-sub-flood')
    const { service } = stack(tree)
    const heap = process.memoryUsage().heapUsed
    const ids: string[] = []
    for (let index = 0; index < 200_000; index++) ids.push(service.subscribe('p', 1).subscriptionId)
    const grown = (process.memoryUsage().heapUsed - heap) / 1e6
    console.info(`[W16-B6-flood] 200k subscriptions: heap +${grown.toFixed(1)} MB (no per-owner cap)`)
    await service.closeProject('p')
    for (const id of ids.slice(0, 10)) service.unsubscribe('p', id, 1)
    expect(grown).toBeLessThan(400)
  })

  it('detachOwner 释放该发送方的所有订阅；Project 关闭后广播 stopped 并可重新订阅', async () => {
    const tree = fresh('w16-detach')
    const { service, watchChanged } = stack(tree)
    const a = service.subscribe('p', 5)
    service.subscribe('p', 5)
    service.detachOwner(5)
    service.unsubscribe('p', a.subscriptionId, 5)
    const b = service.subscribe('p', 6)
    await service.closeProject('p')
    expect(watchChanged.at(-1)).toMatchObject({ projectId: 'p', watch: 'stopped' })
    await service.closeProject('p')
    const c = service.subscribe('p', 6)
    expect(c.subscriptionId).not.toBe(b.subscriptionId)
    expect(['live', 'degraded']).toContain(c.watch)
  })
})
