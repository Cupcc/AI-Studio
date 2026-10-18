// W16 共享辅助：临时目录固件、假 ipcMain、进程存活探测。仅被 W16-*.test.ts 引用，不含被测逻辑。
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { MainIpc } from '../../../../apps/desktop/src/main/ipc/registry'

export interface Tree {
  /** 规范化后的临时基目录（含 project / outside 两个兄弟目录） */
  base: string
  /** Project 根（规范路径，与 Project.canonicalPath 同形） */
  root: string
  /** Project 之外的兄弟目录；其中的 secret.txt 绝不允许被读到 */
  outside: string
  write(relative: string, content?: string | Buffer): string
  mkfifo(relative: string): string
  cleanup(): void
}

export const SECRET = 'W16-OUTSIDE-SECRET-DO-NOT-READ'

export function makeTree(label = 'w16'): Tree {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), `${label}-`)))
  const root = join(base, 'project')
  const outside = join(base, 'outside')
  mkdirSync(root)
  mkdirSync(outside)
  writeFileSync(join(outside, 'secret.txt'), SECRET)
  return {
    base, root, outside,
    write(relative, content = 'x') {
      const path = join(root, relative)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, content)
      return path
    },
    mkfifo(relative) {
      const path = join(root, relative)
      mkdirSync(dirname(path), { recursive: true })
      execFileSync('mkfifo', [path])
      return path
    },
    cleanup: () => rmSync(base, { recursive: true, force: true })
  }
}

export interface FakeIpc extends MainIpc {
  channels(): string[]
  /** 模拟渲染进程发起 invoke；`args` 原样作为 ipcRenderer.invoke 的参数。 */
  invoke(channel: string, args?: unknown[], who?: { senderId?: number; url?: string | null }): Promise<unknown>
}

export function fakeIpc(): FakeIpc {
  const handlers = new Map<string, (event: { sender: { id: number }; senderFrame?: { url: string } | null }, ...args: unknown[]) => unknown>()
  return {
    handle: (channel, listener) => { handlers.set(channel, listener as never) },
    removeHandler: (channel) => { handlers.delete(channel) },
    channels: () => [...handlers.keys()],
    async invoke(channel, args = [], who = {}) {
      const listener = handlers.get(channel)
      if (!listener) throw new Error(`no handler ${channel}`)
      const frame = who.url === null ? null : { url: who.url ?? 'app://studio/index.html' }
      return listener({ sender: { id: who.senderId ?? 1 }, senderFrame: frame }, ...args)
    }
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function waitFor(condition: () => boolean, timeoutMs = 8000, label = 'condition'): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`waitFor timed out: ${label}`)
    await sleep(20)
  }
}

/** 进程（负 pid 为整个进程组）是否仍有成员存活。 */
export function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM' }
}

/** 渲染进程可见内容里不允许出现的东西：临时基目录、用户主目录、栈帧。 */
export function leaks(value: unknown, base: string): string[] {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value)
  const found: string[] = []
  if (text.includes(base)) found.push('base-path')
  if (/\/Users\/[^/\s"]+/.test(text)) found.push('home-path')
  if (/\bat [^\n]+\(.*:\d+:\d+\)/.test(text) || /\n\s+at /.test(text)) found.push('stack')
  if (text.includes(SECRET)) found.push('SECRET')
  return found
}
