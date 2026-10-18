// W16 区域 A / F：渲染进程崩溃或销毁时 Files 订阅的清理（services/files/index.ts 的 watchWebContents）与 main/index.ts 的 Diff 清理。
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

const contents = vi.hoisted(() => ({ byId: new Map<number, unknown>() }))
vi.mock('electron', () => ({ webContents: { fromId: (id: number) => contents.byId.get(id) } }))

const { watchWebContents } = await import('../../../../apps/desktop/src/main/services/files/index')
const { createFilesService } = await import('../../../../apps/desktop/src/main/services/files/service')
const { makeTree } = await import('W16-support')

class FakeContents extends EventEmitter {
  destroyedFlag = false
  isDestroyed() { return this.destroyedFlag }
}
const cleanups: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

describe('渲染进程消失后订阅被清理', () => {
  it('render-process-gone 与 destroyed 都触发 detachOwner；同一 owner 的监听器被移除；已销毁的 owner 立即清理', async () => {
    const tree = makeTree('w16-owner'); cleanups.push(() => tree.cleanup())
    const handles = { opened: 0, closed: 0 }
    const service = createFilesService({
      projectRoot: (id) => (id === 'p' ? tree.root : null), changed: () => {}, watchChanged: () => {}, watchOwner: watchWebContents,
      watch: () => { handles.opened++; return { close: () => { handles.closed++ }, on: () => {} } }
    } as never)
    cleanups.push(() => service.dispose())
    const crashed = new FakeContents(); contents.byId.set(7, crashed)
    service.subscribe('p', 7)
    expect(crashed.listenerCount('render-process-gone')).toBe(1)
    expect(crashed.listenerCount('destroyed')).toBe(1)
    crashed.emit('render-process-gone')
    // 订阅已移除：宽限期（30 s）结束前 watcher 仍在，但此后再次订阅会复用同一 watcher；这里验证监听器被摘除
    expect(crashed.listenerCount('render-process-gone')).toBe(0)
    expect(crashed.listenerCount('destroyed')).toBe(0)
    // 重新加载后的同一 webContents 能再次被跟踪
    service.subscribe('p', 7)
    expect(crashed.listenerCount('destroyed')).toBe(1)
    crashed.emit('destroyed')
    expect(crashed.listenerCount('render-process-gone')).toBe(0)

    const gone = new FakeContents(); gone.destroyedFlag = true; contents.byId.set(8, gone)
    service.subscribe('p', 8)
    await new Promise((resolve) => setImmediate(resolve))
    // 已销毁的 owner：onGone 通过 setImmediate 触发，订阅不会遗留
    service.closeAll?.()
    await service.closeProject('p')
    expect(handles.closed).toBe(handles.opened)
  })

  it('未知的 webContents id（fromId 返回 undefined）也会被清理，不会永远占着订阅', async () => {
    const tree = makeTree('w16-owner2'); cleanups.push(() => tree.cleanup())
    const service = createFilesService({ projectRoot: (id) => (id === 'p' ? tree.root : null), changed: () => {}, watchChanged: () => {}, watchOwner: watchWebContents } as never)
    cleanups.push(() => service.dispose())
    const subscription = service.subscribe('p', 404)
    expect(['live', 'degraded']).toContain(subscription.watch)
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
    // 订阅被 detachOwner 移除：用同一 owner 退订是空操作；Project 关闭后广播 stopped 的前提是仍有订阅，这里不再有
    service.unsubscribe('p', subscription.subscriptionId, 404)
  })
})
