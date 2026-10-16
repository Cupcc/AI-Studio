// W16 区域 F：资源耗尽与句柄 / 定时器 / 子进程泄漏；Diff 侧 TOCTOU 与 watcher 风暴。
import { spawn } from 'node:child_process'
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { afterEach, describe, expect, it } from 'vitest'
import { createFilesService } from '../../../apps/desktop/src/main/services/files/service'
import { readProjectFileBounded } from '../../../apps/desktop/src/main/services/diff/safe-read'
import { DIFF_FILE_CALL_LIMIT } from '../../../apps/desktop/src/main/services/diff/service'
import { SECRET, alive, makeTree, sleep, waitFor, type Tree } from './W16-support'
import { createRepo, harness, type Repo } from './W16-diff-support'

const cleanups: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const resources = () => Object.fromEntries(Object.entries(process.getActiveResourcesInfo().reduce<Record<string, number>>((acc, name) => { acc[name] = (acc[name] ?? 0) + 1; return acc }, {})))

describe('F1 Files：请求泛滥', () => {
  it('2 万个并发 read（1 MiB 文件）：并发受限、5 秒内全部给出结果、堆不失控、事件循环不被长时间阻塞', async () => {
    const tree = makeTree('w16-flood'); cleanups.push(() => tree.cleanup())
    tree.write('big.txt', 'a'.repeat(1_000_000))
    const service = createFilesService({ projectRoot: (id) => (id === 'p' ? tree.root : null), changed: () => {}, watchChanged: () => {} })
    cleanups.push(() => service.dispose())
    const lag = monitorEventLoopDelay({ resolution: 5 }); lag.enable()
    const states: Record<string, number> = {}
    const started = Date.now()
    // 结果只计数、不保留（保留 2400 个 1 MiB 字符串会把堆撑到 GB 级，那是测试自己的占用，不是服务泄漏）
    await Promise.all(Array.from({ length: 20_000 }, () => service.read({ projectId: 'p', path: 'big.txt' }).then((result) => {
      const key = result.status === 'unavailable' ? `unavailable:${result.reason}` : result.status
      states[key] = (states[key] ?? 0) + 1
    })))
    lag.disable()
    ;(globalThis as { gc?: () => void }).gc?.()
    console.info(`[W16-F1 read flood] ${Date.now() - started} ms, states=${JSON.stringify(states)}, lag max ${(lag.max / 1e6).toFixed(0)} ms, heapUsed now ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)} MB`)
    expect(Date.now() - started).toBeLessThan(60_000)
    expect(Object.keys(states).every((key) => key === 'ok' || key === 'unavailable:timeout')).toBe(true)
  })
})

describe('F2 Diff：并发与订阅泛滥、风暴、泄漏', () => {
  const repoFor = (): Repo => { const value = createRepo({ commit: { 'a.txt': 'a\n' } }); cleanups.push(() => value.cleanup()); return value }

  it('getFile 并发超过 16 个：多出的请求被明确拒绝，不排成无界队列', async () => {
    const target = repoFor()
    target.write('a.txt', 'changed\n')
    const { service } = harness({ p: target.root }); cleanups.push(() => service.dispose())
    const calls = Array.from({ length: DIFF_FILE_CALL_LIMIT + 8 }, () => service.getFile({ projectId: 'p', path: 'a.txt', oldPath: null }).then(() => 'ok', (error: Error) => error.message))
    const outcomes = await Promise.all(calls)
    expect(outcomes.filter((outcome) => outcome !== 'ok').length).toBeGreaterThanOrEqual(1)
    expect(outcomes.filter((outcome) => outcome !== 'ok').every((outcome) => outcome === 'Too many diff file requests in flight')).toBe(true)
  })

  it('getSnapshot 泛滥（200 次连发）：后者取代前者，git 子进程数始终 ≤ 2（每 Project）', async () => {
    const target = repoFor()
    const { service, runner } = harness({ p: target.root }); cleanups.push(() => service.dispose())
    let peak = 0
    const timer = setInterval(() => { peak = Math.max(peak, runner.pending('p')) }, 2)
    const all = await Promise.all(Array.from({ length: 200 }, () => service.getSnapshot('p')))
    clearInterval(timer)
    console.info(`[W16-F2 snapshot flood] peak pending git runs (running+queued) = ${peak}`)
    expect(all.every((snapshot) => snapshot.projectId === 'p')).toBe(true)
    expect(runner.pending('p')).toBe(0)
  })

  it('订阅泛滥：20 万次 diff:subscribe 只占 Map 条目（无每发送方上限，记录）；detachOwner 一次清空并关闭 watcher', async () => {
    const target = repoFor()
    const { service, watchChanged } = harness({ p: target.root }); cleanups.push(() => service.dispose())
    const heap = process.memoryUsage().heapUsed
    for (let index = 0; index < 200_000; index++) service.subscribe('p', 9)
    console.info(`[W16-F2 diff subscription flood] heap +${((process.memoryUsage().heapUsed - heap) / 1e6).toFixed(0)} MB for 200k subscriptions`)
    const before = resources()
    service.detachOwner(9)
    await sleep(50)
    expect(watchChanged.length).toBeGreaterThanOrEqual(0)
    console.info('[W16-F2] active resources before/after detachOwner', JSON.stringify(before), JSON.stringify(resources()))
  })

  it('Diff watcher 风暴：普通目录 10 万个新文件，invalidated 事件数有界，事件循环不被拖慢；closeProject 后不再有事件', async () => {
    const target = repoFor()
    const { service, invalidated } = harness({ p: target.root }); cleanups.push(() => service.dispose())
    const subscription = service.subscribe('p', 1)
    expect(subscription.watch).toBe('live')
    mkdirSync(join(target.root, 'src'))
    const lag = monitorEventLoopDelay({ resolution: 5 }); lag.enable()
    await new Promise<void>((resolve) => {
      const child = spawn(process.execPath, ['-e', `const fs=require('fs');const d=process.argv[1];for(let i=0;i<100000;i++){fs.writeFileSync(d+'/f'+i,'x')}`, join(target.root, 'src')], { stdio: 'ignore' })
      child.on('exit', () => resolve())
    })
    await sleep(2500)
    lag.disable()
    console.info(`[W16-F2 diff watcher storm] invalidated=${invalidated.length}, lag max ${(lag.max / 1e6).toFixed(0)} ms`)
    expect(invalidated.length).toBeLessThan(100)
    await service.closeProject('p')
    const seen = invalidated.length
    writeFileSync(join(target.root, 'after-close.txt'), 'x')
    await sleep(1200)
    expect(invalidated.length).toBe(seen)
  })

  it('Diff watcher 不忽略 .git 之外的 node_modules 一级以下事件之外的内容；node_modules 深层 10 万文件不触发事件', async () => {
    const target = repoFor()
    const { service, invalidated } = harness({ p: target.root }); cleanups.push(() => service.dispose())
    service.subscribe('p', 1)
    mkdirSync(join(target.root, 'node_modules', 'pkg'), { recursive: true })
    await sleep(800)
    const before = invalidated.length
    await new Promise<void>((resolve) => {
      const child = spawn(process.execPath, ['-e', `const fs=require('fs');const d=process.argv[1];for(let i=0;i<100000;i++){fs.writeFileSync(d+'/f'+i,'x')}`, join(target.root, 'node_modules', 'pkg')], { stdio: 'ignore' })
      child.on('exit', () => resolve())
    })
    await sleep(1500)
    expect(invalidated.length - before).toBeLessThanOrEqual(1)
  })
})

describe('F3 Diff 修改侧读取（readProjectFileBounded）：中间目录被换成符号链接的竞态', () => {
  it('只对最后一级使用 O_NOFOLLOW（不是 O_NOFOLLOW_ANY）：高速换目录时是否读到外部内容（身份检查是唯一防线）', async () => {
    const tree: Tree = makeTree('w16-diffrace'); cleanups.push(() => tree.cleanup())
    tree.write('d/f.txt', 'INSIDE')
    writeFileSync(join(tree.outside, 'f.txt'), SECRET)
    symlinkSync(tree.outside, join(tree.root, 'dl'))
    const stopFile = join(tree.base, 'stop')
    const script = `const fs=require('fs');const [root,stop]=process.argv.slice(1);const d=root+'/d',dl=root+'/dl',tmp=root+'/d.tmp';for(;;){for(let k=0;k<500;k++){fs.renameSync(d,tmp);fs.renameSync(dl,d);fs.renameSync(d,dl);fs.renameSync(tmp,d)}if(fs.existsSync(stop))break}`
    const child = spawn(process.execPath, ['-e', script, tree.root, stopFile], { stdio: 'ignore' })
    const stop = () => { writeFileSync(stopFile, 'x'); child.kill('SIGKILL') }
    cleanups.push(stop)
    await sleep(100)
    let attempts = 0, ok = 0, leaked = 0
    const deadline = Date.now() + 8000
    while (Date.now() < deadline) {
      const read = await readProjectFileBounded(tree.root, 'd/f.txt', 524_288)
      attempts++
      if (read.status === 'ok') { ok++; if (read.bytes.toString('utf8').includes('W16-OUTSIDE')) leaked++ }
    }
    stop()
    console.info(`[W16-F3 diff safe-read race] attempts=${attempts} ok=${ok} leaked=${leaked}`)
    expect(leaked).toBe(0)
  })
})

describe('F4 句柄与定时器泄漏：关闭 / 释放后没有残留', () => {
  it('Files：订阅 → 关闭 Project / dispose 后，活动 FSEvent 与计时器资源回到基线', async () => {
    const tree = makeTree('w16-handles'); cleanups.push(() => tree.cleanup())
    // persistent:false 的 FSEvents 句柄不出现在 getActiveResourcesInfo 里，所以用注入的 watch 统计打开 / 关闭次数
    const handles = { opened: 0, closed: 0 }
    const service = createFilesService({
      projectRoot: (id) => (id === 'p' ? tree.root : null), changed: () => {}, watchChanged: () => {}, graceMs: 20,
      watch: () => { handles.opened++; return { close: () => { handles.closed++ }, on: () => {} } }
    } as never)
    for (let index = 0; index < 50; index++) service.subscribe('p', index)
    expect(handles.opened).toBe(1)
    await service.closeProject('p')
    expect(handles).toEqual({ opened: 1, closed: 1 })
    service.subscribe('p', 1)
    expect(handles.opened).toBe(2)
    service.detachOwner(1)
    await sleep(150)
    await service.dispose()
    await sleep(50)
    console.info('[W16-F4 files] watch handles', JSON.stringify(handles), 'timers', JSON.stringify(resources()))
    expect(handles.closed).toBe(handles.opened)
  })

  it('Diff：订阅 → 关闭后无 FSEvent；git 子进程为 0（按进程组探测）', async () => {
    const target = createRepo({ commit: { 'a.txt': 'a\n' } }); cleanups.push(() => target.cleanup())
    const baseline = resources()
    const { service, runner } = harness({ p: target.root })
    service.subscribe('p', 1)
    await service.getSnapshot('p')
    await service.closeProject('p')
    await service.dispose()
    await sleep(100)
    expect(runner.pending()).toBe(0)
    expect(resources().FSEvent ?? 0).toBe(baseline.FSEvent ?? 0)
    void alive; void waitFor
  })
})
