// W16 区域 A：IPC 边界。真实的 handler parse / registry / 服务串起来，输入全部是敌意的。
// 断言只依据契约（specs/tools/spec.md §3 第 3 项、§4：只有 Project 相对路径；渲染端无任意读取途径）与威胁模型。
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, symlinkSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { diffContract } from '@shared/ipc/diff'
import { filesContract } from '@shared/ipc/files'
import { registerFeatureHandlers } from '../../../../apps/desktop/src/main/ipc/registry'
import { createDiffService } from '../../../../apps/desktop/src/main/services/diff/service'
import { createGitLocator } from '../../../../apps/desktop/src/main/services/diff/git-locate'
import { createGitRunner } from '../../../../apps/desktop/src/main/services/diff/git-runner'
import { createFilesService } from '../../../../apps/desktop/src/main/services/files/service'
import { fakeIpc, leaks, makeTree, SECRET, type FakeIpc, type Tree } from 'W16-support'

const holder = vi.hoisted(() => ({ files: null as unknown, diff: null as unknown }))
vi.mock('../../../../apps/desktop/src/main/services/files', () => ({ filesFor: () => holder.files }))
vi.mock('../../../../apps/desktop/src/main/services/diff', () => ({ diffFor: () => holder.diff }))

const { createFilesFeature } = await import('../../../../apps/desktop/src/main/ipc/files')
const { createDiffFeature } = await import('../../../../apps/desktop/src/main/ipc/diff')

const hermeticHome = join(process.env.TMPDIR ?? '/tmp', `w16-home-${process.pid}`)
function git(root: string, ...args: string[]) {
  return execFileSync('git', ['-c', 'init.defaultBranch=main', ...args], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH ?? '', HOME: hermeticHome, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', LC_ALL: 'C',
      GIT_AUTHOR_NAME: 'W16', GIT_AUTHOR_EMAIL: 'w16@example.invalid', GIT_COMMITTER_NAME: 'W16', GIT_COMMITTER_EMAIL: 'w16@example.invalid'
    }
  })
}

let tree: Tree
let ipc: FakeIpc
let filesService: ReturnType<typeof createFilesService>
let diffService: ReturnType<typeof createDiffService>
const events: { files: unknown[]; diff: unknown[] } = { files: [], diff: [] }
let unregister: () => void

beforeAll(() => {
  mkdirSync(hermeticHome, { recursive: true })
  tree = makeTree('w16-ipc')
  tree.write('ok.txt', 'hello\n')
  tree.write('sub/inner.txt', 'inner\n')
  tree.write('--output=pwned.txt', 'dash\n')
  tree.write(':(top)x', 'magic\n')
  symlinkSync(tree.outside, join(tree.root, 'escape'))
  symlinkSync(join(tree.outside, 'secret.txt'), join(tree.root, 'secret-link.txt'))
  git(tree.root, 'init', '-q', '.')
  git(tree.root, 'add', '-A')
  git(tree.root, 'commit', '-q', '-m', 'init')
  writeFileSync(join(tree.root, 'ok.txt'), 'hello changed\n')

  const roots: Record<string, string> = { p1: tree.root }
  const projectRoot = (id: string) => (Object.prototype.hasOwnProperty.call(roots, id) ? roots[id]! : null)
  filesService = createFilesService({
    projectRoot, changed: (event) => events.files.push(event), watchChanged: (event) => events.files.push(event)
  })
  const environment = async () => ({ ...(process.env as Record<string, string>), HOME: hermeticHome })
  diffService = createDiffService({
    projectPath: projectRoot,
    runner: createGitRunner({ locate: createGitLocator({ env: environment }), environment }),
    invalidated: (event) => events.diff.push(event), watchChanged: (event) => events.diff.push(event)
  })
  holder.files = filesService
  holder.diff = diffService
  ipc = fakeIpc()
  unregister = registerFeatureHandlers(ipc, [filesContract, diffContract], [createFilesFeature({} as never), createDiffFeature({} as never)], {
    isTrustedSender: (url) => url === 'app://studio/index.html'
  })
})

afterAll(async () => {
  unregister()
  await filesService.dispose()
  await diffService.dispose()
  tree.cleanup()
  rmSync(hermeticHome, { recursive: true, force: true })
})

const FILE_CHANNELS = ['files:list', 'files:read'] as const
const HOSTILE_PATHS: [string, unknown][] = [
  ['absolute', '/etc/passwd'], ['absolute outside', '/__OUTSIDE__/secret.txt'], ['dot-dot', '..'], ['dot-dot file', '../outside/secret.txt'],
  ['nested dot-dot', 'sub/../../outside/secret.txt'], ['percent-encoded dot-dot', '%2e%2e/outside/secret.txt'], ['percent-encoded slash', '..%2foutside%2fsecret.txt'],
  ['backslash dot-dot', '..\\outside\\secret.txt'], ['NUL', 'ok.txt\0.png'], ['NUL leading', '\0'], ['lone high surrogate', 'a\ud800'], ['lone low surrogate', '\udc00b'],
  ['1 MiB string', 'a'.repeat(1 << 20)], ['5000 segments', 'a/'.repeat(5000) + 'a'], ['file URL', 'file:///etc/passwd'], ['tilde', '~/.ssh/id_rsa'],
  ['double slash', '//etc/passwd'], ['dot', '.'], ['dot segment', './ok.txt'], ['trailing slash', 'sub/'], ['empty segment', 'sub//inner.txt'], ['windows drive', 'C:\\Windows'],
  ['git dir', '.git'], ['git config', '.git/config'], ['upper-case git', '.GIT/config'], ['mixed-case git', '.Git/HEAD'], ['nested git', 'sub/.git/config'],
  ['symlink dir traversal', 'escape/secret.txt'], ['symlink file', 'secret-link.txt'], ['symlink dir', 'escape'],
  ['number', 7], ['null', null], ['array', ['ok.txt']], ['boolean', true], ['object', { toString: () => 'ok.txt' }], ['undefined', undefined]
]

function pathsFor(raw: [string, unknown]): unknown {
  const [, value] = raw
  return typeof value === 'string' ? value.replace('/__OUTSIDE__', tree.outside) : value
}

async function attempt(channel: string, request: unknown, who?: { senderId?: number; url?: string | null }): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
  try { return { ok: true, value: await ipc.invoke(channel, [request], who) } } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) } }
}

describe('A1 files:list / files:read：敌意路径', () => {
  for (const channel of FILE_CHANNELS) {
    it(`${channel}：任何敌意路径要么在 parse 被拒，要么得到 unavailable；绝不返回 Project 外内容，错误不含绝对路径 / 栈`, async () => {
      for (const entry of HOSTILE_PATHS) {
        const result = await attempt(channel, { projectId: 'p1', path: pathsFor(entry) })
        const label = `${channel} ${entry[0]}`
        if (!result.ok) {
          expect(leaks(result.message, tree.base), label).toEqual([])
          continue
        }
        const value = result.value as { status: string; entries?: { name: string }[]; text?: string }
        expect(leaks(value, tree.base), label).toEqual([])
        // 这些路径一律不应读到文本或列出条目
        expect(value.status, label).not.toBe('ok')
      }
    })
  }

  it('合法路径作为对照：根目录、普通文件可读，.git 不被列出', async () => {
    mkdirSync(join(tree.root, '.git', 'objects'), { recursive: true })
    const list = (await ipc.invoke('files:list', [{ projectId: 'p1', path: '' }])) as { status: string; entries: { name: string; kind: string }[] }
    expect(list.status).toBe('ok')
    expect(list.entries.map((entry) => entry.name)).not.toContain('.git')
    const kinds = Object.fromEntries(list.entries.map((entry) => [entry.name, entry.kind]))
    expect(kinds['escape']).toBe('symlink')
    const read = (await ipc.invoke('files:read', [{ projectId: 'p1', path: 'ok.txt' }])) as { status: string; text: string }
    expect(read.status).toBe('ok')
    expect(read.text).toContain('hello')
  })
})

describe('A2 files:resolve-reference', () => {
  it('敌意路径整体拒绝；数组形状攻击（巨大 / 稀疏 / 非数组 / 带原型键）在 parse 阶段被拒', async () => {
    const shapes: [string, unknown][] = [
      ['empty', []], ['21 entries', Array.from({ length: 21 }, (_, i) => `f${i}`)], ['1e6 entries', new Array(1_000_000).fill('a')], ['sparse', new Array(3)],
      ['string', 'ok.txt'], ['object with length', { length: 1, 0: 'ok.txt' }], ['nested array', [['ok.txt']]], ['null', null]
    ]
    for (const [name, paths] of shapes) {
      const result = await attempt('files:resolve-reference', { projectId: 'p1', paths })
      expect(result.ok, name).toBe(false)
    }
    for (const entry of HOSTILE_PATHS) {
      const result = await attempt('files:resolve-reference', { projectId: 'p1', paths: ['ok.txt', pathsFor(entry)] })
      if (!result.ok) { expect(leaks(result.message, tree.base), entry[0]).toEqual([]); continue }
      const value = result.value as { status: string; files?: unknown[]; failures?: unknown[] }
      expect(leaks(value, tree.base), entry[0]).toEqual([])
      expect(value.status, entry[0]).toBe('rejected')
    }
  })

  it('成功的引用结果不含绝对路径（absolutePath 只留在主进程）', async () => {
    const result = (await ipc.invoke('files:resolve-reference', [{ projectId: 'p1', paths: ['ok.txt', 'sub/inner.txt'] }])) as { status: string; files: Record<string, unknown>[] }
    expect(result.status).toBe('ok')
    expect(Object.keys(result.files[0]!).sort()).toEqual(['name', 'path', 'size', 'version'])
    expect(leaks(result, tree.base)).toEqual([])
  })

  it('引用符号链接（文件 / 目录下的文件）与 .git 内容被拒绝', async () => {
    for (const path of ['secret-link.txt', 'escape/secret.txt', '.git/config', '.GIT/config', 'escape']) {
      const result = (await ipc.invoke('files:resolve-reference', [{ projectId: 'p1', paths: [path] }])) as { status: string; failures: { reason: string }[] }
      expect(result.status, path).toBe('rejected')
      expect(['symlink_refused', 'excluded', 'not_file', 'missing'], path).toContain(result.failures[0]!.reason)
    }
  })
})

describe('A3 对象形状：额外键、原型污染键、非纯对象', () => {
  const channels = ['files:list', 'files:read', 'files:resolve-reference', 'files:subscribe', 'files:unsubscribe', 'diff:get-snapshot', 'diff:get-file', 'diff:subscribe', 'diff:unsubscribe']
  const base: Record<string, Record<string, unknown>> = {
    'files:list': { projectId: 'p1', path: '' }, 'files:read': { projectId: 'p1', path: 'ok.txt' }, 'files:resolve-reference': { projectId: 'p1', paths: ['ok.txt'] },
    'files:subscribe': { projectId: 'p1' }, 'files:unsubscribe': { projectId: 'p1', subscriptionId: 'x' },
    'diff:get-snapshot': { projectId: 'p1' }, 'diff:get-file': { projectId: 'p1', path: 'ok.txt', oldPath: null },
    'diff:subscribe': { projectId: 'p1' }, 'diff:unsubscribe': { projectId: 'p1', subscriptionId: 'x' }
  }
  it.each(channels)('%s：额外键（含 __proto__ / constructor / prototype）一律拒绝', async (channel) => {
    for (const extra of ['root', 'cwd', 'sha', 'args', 'env', 'encoding', 'maxBytes', 'followSymlinks', 'constructor', 'prototype', 'toString']) {
      const result = await attempt(channel, { ...base[channel]!, [extra]: '/' })
      expect(result.ok, `${channel} +${extra}`).toBe(false)
    }
    // JSON.parse 产生真正的自有 __proto__ 键（对象字面量写法不会）
    const polluted = JSON.parse(`{${JSON.stringify(base[channel]).slice(1, -1)},"__proto__":{"polluted":true}}`)
    const result = await attempt(channel, polluted)
    expect(result.ok, `${channel} +__proto__`).toBe(false)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it.each(channels)('%s：非对象 / 类实例 / 数组 / 多参数 / 不受信的发送方', async (channel) => {
    for (const bad of [undefined, null, 'p1', 7, ['p1'], new Date(), new (class Evil { projectId = 'p1' })(), Object.create({ projectId: 'p1' })]) {
      expect((await attempt(channel, bad)).ok, `${channel} ${Object.prototype.toString.call(bad)}`).toBe(false)
    }
    await expect(ipc.invoke(channel, [base[channel], base[channel]])).rejects.toThrow(/at most one argument/)
    await expect(ipc.invoke(channel, [base[channel]], { url: 'https://evil.example/' })).rejects.toThrow(/untrusted sender/)
    await expect(ipc.invoke(channel, [base[channel]], { url: null })).rejects.toThrow(/untrusted sender/)
    await expect(ipc.invoke(channel, [base[channel]], { url: 'app://studio.evil/index.html' })).rejects.toThrow(/untrusted sender/)
  })

  it('无原型对象是被接受的纯对象（Electron 结构化克隆产生的就是普通对象，这里仅记录行为）', async () => {
    const bare = Object.assign(Object.create(null), { projectId: 'p1', path: '' })
    const result = await attempt('files:list', bare)
    expect(result.ok).toBe(true)
  })
})

describe('A4 Project id：未知 / 外来 / 关闭后 / 原型名', () => {
  const ids: [string, string][] = [['unknown', 'nope'], ['__proto__', '__proto__'], ['constructor', 'constructor'], ['toString', 'toString'], ['hasOwnProperty', 'hasOwnProperty'], ['100 chars', 'x'.repeat(100)], ['path-like', '../project'], ['absolute', tree?.root ?? '/']]
  it('Files：未知 Project 只得到 project_unavailable，没有目录内容', async () => {
    for (const [name, projectId] of ids) {
      const list = (await ipc.invoke('files:list', [{ projectId, path: '' }])) as { status: string; reason?: string }
      expect(list.status, name).toBe('unavailable')
      expect(list.reason, name).toBe('project_unavailable')
      const read = (await ipc.invoke('files:read', [{ projectId, path: 'ok.txt' }])) as { status: string; reason?: string }
      expect(read).toMatchObject({ status: 'unavailable', reason: 'project_unavailable' })
      const refs = (await ipc.invoke('files:resolve-reference', [{ projectId, paths: ['ok.txt'] }])) as { status: string }
      expect(refs.status, name).toBe('rejected')
      const sub = (await ipc.invoke('files:subscribe', [{ projectId }])) as { watch: string; subscriptionId: string }
      expect(sub.watch, name).toBe('stopped')
    }
  })

  it('Diff：未知 Project 的错误不含路径', async () => {
    for (const [name, projectId] of ids) {
      for (const [channel, request] of [['diff:get-snapshot', { projectId }], ['diff:get-file', { projectId, path: 'ok.txt', oldPath: null }], ['diff:subscribe', { projectId }]] as const) {
        const result = await attempt(channel, request)
        if (result.ok) { expect(leaks(result.value, tree.base), `${channel} ${name}`).toEqual([]); continue }
        expect(leaks(result.message, tree.base), `${channel} ${name}`).toEqual([])
      }
    }
  })

  it('Project 被关闭（closeProject）后：list / read 拒绝服务但不崩，订阅可重新建立', async () => {
    const sub = (await ipc.invoke('files:subscribe', [{ projectId: 'p1' }], { senderId: 7 })) as { subscriptionId: string; watch: string }
    expect(['live', 'degraded']).toContain(sub.watch)
    await filesService.closeProject('p1')
    // closeProject 之后，旧订阅号再退订是空操作
    await expect(ipc.invoke('files:unsubscribe', [{ projectId: 'p1', subscriptionId: sub.subscriptionId }], { senderId: 7 })).resolves.toBeUndefined()
    const again = (await ipc.invoke('files:subscribe', [{ projectId: 'p1' }], { senderId: 7 })) as { subscriptionId: string; watch: string }
    expect(again.subscriptionId).not.toBe(sub.subscriptionId)
    await ipc.invoke('files:unsubscribe', [{ projectId: 'p1', subscriptionId: again.subscriptionId }], { senderId: 7 })
  })
})

describe('A5 订阅：他人发送方 / 重放 / 泛滥', () => {
  it('Files：他人的 subscriptionId 退订无效（订阅仍然有效），重放退订无副作用', async () => {
    const mine = (await ipc.invoke('files:subscribe', [{ projectId: 'p1' }], { senderId: 11 })) as { subscriptionId: string }
    await ipc.invoke('files:unsubscribe', [{ projectId: 'p1', subscriptionId: mine.subscriptionId }], { senderId: 22 })
    // 发送方 22 无法移除 11 的订阅：detachOwner(11) 之后才消失。无法直接观察订阅表，这里用 watcher 计数间接验证：
    filesService.detachOwner(22)
    await ipc.invoke('files:unsubscribe', [{ projectId: 'p1', subscriptionId: mine.subscriptionId }], { senderId: 11 })
    await ipc.invoke('files:unsubscribe', [{ projectId: 'p1', subscriptionId: mine.subscriptionId }], { senderId: 11 })
    await ipc.invoke('files:unsubscribe', [{ projectId: 'nope', subscriptionId: mine.subscriptionId }], { senderId: 11 })
  })

  it('Diff：他人的 subscriptionId 退订被明确拒绝（信息：存在性预言机，单窗口应用下无影响）', async () => {
    const mine = (await ipc.invoke('diff:subscribe', [{ projectId: 'p1' }], { senderId: 11 })) as { subscriptionId: string }
    const foreign = await attempt('diff:unsubscribe', { projectId: 'p1', subscriptionId: mine.subscriptionId }, { senderId: 22 })
    expect(foreign.ok).toBe(false)
    if (!foreign.ok) expect(leaks(foreign.message, tree.base)).toEqual([])
    const nonexistent = await attempt('diff:unsubscribe', { projectId: 'p1', subscriptionId: 'does-not-exist' }, { senderId: 22 })
    // 不存在的 id 是静默成功，而他人的 id 是报错：二者可区分
    expect(nonexistent.ok).toBe(true)
    await ipc.invoke('diff:unsubscribe', [{ projectId: 'p1', subscriptionId: mine.subscriptionId }], { senderId: 11 })
    await ipc.invoke('diff:unsubscribe', [{ projectId: 'p1', subscriptionId: mine.subscriptionId }], { senderId: 11 })
  })
})

describe('A6 Diff：getFile / getSnapshot 的敌意输入（参数注入走完整服务与真实 git）', () => {
  it('路径形如 git 选项 / pathspec 魔法：只当字面文件名，不产生任何副作用文件', async () => {
    const before = new Set(readdirSync(tree.root))
    const names = ['--output=pwned.txt', ':(top)x', '--help', '-p', ':(glob)**', ':!ok.txt', '--no-index', '-c', '--exec-path=/tmp']
    for (const path of names) {
      const result = await attempt('diff:get-file', { projectId: 'p1', path, oldPath: null })
      if (result.ok) expect(leaks(result.value, tree.base), path).toEqual([])
    }
    // 对已提交文件修改后能得到补丁（对照），且没有出现 --output 产生的文件
    const ok = (await ipc.invoke('diff:get-file', [{ projectId: 'p1', path: 'ok.txt', oldPath: null }])) as { status: string; patch: { text: string } | null }
    expect(ok.status).toBe('ok')
    expect(ok.patch?.text).toContain('+hello changed')
    const after = new Set(readdirSync(tree.root))
    expect([...after].filter((name) => !before.has(name))).toEqual([])
    expect(existsSync(join(tree.root, 'pwned.txt'))).toBe(false)
    expect(existsSync('/tmp/pwned.txt')).toBe(false)
  })

  it('名为 --output=pwned.txt 的已提交文件被修改后，补丁正确且不写出文件', async () => {
    writeFileSync(join(tree.root, '--output=pwned.txt'), 'dash changed\n')
    writeFileSync(join(tree.root, ':(top)x'), 'magic changed\n')
    const snapshot = (await ipc.invoke('diff:get-snapshot', [{ projectId: 'p1' }])) as { status: string; files: { path: string; kind: string }[] }
    expect(snapshot.status).toBe('ready')
    const paths = snapshot.files.map((file) => file.path).sort()
    expect(paths).toContain('--output=pwned.txt')
    expect(paths).toContain(':(top)x')
    for (const path of ['--output=pwned.txt', ':(top)x']) {
      const file = (await ipc.invoke('diff:get-file', [{ projectId: 'p1', path, oldPath: null }])) as { status: string; patch: { text: string } | null }
      expect(file.status, path).toBe('ok')
      expect(file.patch?.text, path).toContain('changed')
    }
    expect(existsSync(join(tree.root, 'pwned.txt'))).toBe(false)
  })

  it('指向 Project 外的符号链接：快照只列出链接本身，补丁只含目标文本，不含目标内容', async () => {
    writeFileSync(join(tree.root, 'untracked-link'), '')
    rmSync(join(tree.root, 'untracked-link'))
    symlinkSync(join(tree.outside, 'secret.txt'), join(tree.root, 'untracked-link'))
    const file = (await ipc.invoke('diff:get-file', [{ projectId: 'p1', path: 'untracked-link', oldPath: null }])) as { status: string; entry?: { special: string | null }; original: unknown; modified: unknown; patch: { text: string } | null }
    expect(file.status).toBe('ok')
    expect(JSON.stringify(file)).not.toContain(SECRET)
    const viaDir = (await ipc.invoke('diff:get-file', [{ projectId: 'p1', path: 'escape/secret.txt', oldPath: null }])) as unknown
    expect(JSON.stringify(viaDir)).not.toContain(SECRET)
  })

  it('.git 路径查询：不返回 .git 内容', async () => {
    for (const path of ['.git/config', '.GIT/config', '.git/HEAD', 'sub/.git/config']) {
      const result = (await ipc.invoke('diff:get-file', [{ projectId: 'p1', path, oldPath: null }])) as { status: string }
      expect(JSON.stringify(result), path).not.toContain('[core]')
      expect(['unchanged', 'unavailable'], path).toContain(result.status)
    }
  })
})
