import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listProjectFiles, projectRipgrep, ripgrepPath, RIPGREP_COMMON_ARGS } from './file-index'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readImageFile } from './image'
import { copyEntries, copyName, createEntry, moveEntries, nameProblem, renameEntry, trashEntries } from './operations'
import { createFilesService } from './service'
import { renameExclusive } from './rename-exclusive'
import { createFixture, type Fixture } from './test-support'

const copying = vi.hoisted(() => ({ before: undefined as (() => void) | undefined }))
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>()
  return { ...actual, cp: async (...args: Parameters<typeof actual.cp>) => { copying.before?.(); return actual.cp(...args) } }
})

const fixtures: Fixture[] = []
const fixture = () => { const created = createFixture(); fixtures.push(created); return created }
afterEach(() => { copying.before = undefined; for (const item of fixtures.splice(0)) item.cleanup() })

describe('file names (TOOLS-Q11)', () => {
  it.each(['', '.', '..', 'a/b', 'a\0b', 'line\nbreak', 'tab\there', '.git', '.GIT', '   ', 'x'.repeat(256)])('refuses %j', name => {
    expect(nameProblem(name)).not.toBeNull()
  })
  it.each(['index.ts', '.env', 'with space', '中文.md', 'a'.repeat(255)])('accepts %j', name => {
    expect(nameProblem(name)).toBeNull()
  })
  it('names copies like VS Code', () => {
    expect(copyName('index.ts', 1)).toBe('index copy.ts')
    expect(copyName('index.ts', 3)).toBe('index copy 3.ts')
    expect(copyName('.env', 1)).toBe('.env copy')
    expect(copyName('src', 2)).toBe('src copy 2')
  })
})

describe('create, rename, move, copy and trash inside the Project', () => {
  it('atomically refuses competing external moves for files, folders and dangling symlinks', async () => {
    const { root, write } = fixture()
    const exists = (path: string) => { try { lstatSync(path); return true } catch { return false } }
    for (const kind of ['file', 'directory', 'symlink']) {
      const a = join(root, `${kind}-a`), b = join(root, `${kind}-b`), destination = join(root, `${kind}-dest`)
      if (kind === 'file') { write(`${kind}-a`, 'a'); write(`${kind}-b`, 'b') }
      else if (kind === 'directory') { mkdirSync(a); mkdirSync(b) }
      else { symlinkSync('missing-a', a); symlinkSync('missing-b', b) }
      // Direct helper calls intentionally bypass the application queue, as two independent processes do.
      const results = await Promise.allSettled([renameExclusive(a, destination), renameExclusive(b, destination)])
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
      const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult
      expect(rejected.reason).toMatchObject({ code: 'EEXIST' })
      expect(Number(exists(a)) + Number(exists(b))).toBe(1)
      if (kind === 'file') expect(['a', 'b']).toContain(readFileSync(destination, 'utf8'))
    }
  })
  it('creates files and folders, including missing folders on the way, and never overwrites', async () => {
    const { root, write } = fixture()
    write('src/existing.ts', 'keep')
    expect(await createEntry(root, 'src', 'new.ts', 'file')).toEqual({ status: 'ok', paths: ['src/new.ts'] })
    expect(readFileSync(join(root, 'src/new.ts'), 'utf8')).toBe('')
    expect(await createEntry(root, '', 'docs', 'directory')).toEqual({ status: 'ok', paths: ['docs'] })
    expect(await createEntry(root, 'src', 'a/b/c.ts', 'file')).toEqual({ status: 'ok', paths: ['src/a/b/c.ts'] })
    expect(await createEntry(root, 'src', 'existing.ts', 'file')).toMatchObject({ status: 'failed', reason: 'exists' })
    expect(readFileSync(join(root, 'src/existing.ts'), 'utf8')).toBe('keep')
    expect(await createEntry(root, 'src', 'a//x', 'file')).toMatchObject({ status: 'failed', reason: 'invalid_name' })
    expect(await createEntry(root, '', '.git', 'directory')).toMatchObject({ status: 'failed', reason: 'excluded' })
    expect(await createEntry(root, 'src/existing.ts', 'x', 'file')).toMatchObject({ status: 'failed', reason: 'not_directory' })
  })

  it('never creates through or into a symbolic link that leaves the Project', async () => {
    const { root, outside } = fixture()
    symlinkSync(outside, join(root, 'escape'))
    expect(await createEntry(root, 'escape', 'planted.txt', 'file')).toMatchObject({ status: 'failed', reason: 'symlink_refused' })
    expect(await createEntry(root, '', 'escape/planted.txt', 'file')).toMatchObject({ status: 'failed', reason: 'symlink_refused' })
    expect(existsSync(join(outside, 'planted.txt'))).toBe(false)
    symlinkSync(join(outside, 'secret.txt'), join(root, 'link.txt'))
    expect(await createEntry(root, '', 'link.txt', 'file')).toMatchObject({ status: 'failed', reason: 'exists' })
  })

  it('renames in place, allows a letter-case change and refuses existing names, .git and the root', async () => {
    const { root, write } = fixture()
    write('a.txt', 'a'); write('b.txt', 'b')
    expect(await renameEntry(root, 'a.txt', 'c.txt')).toEqual({ status: 'ok', paths: ['c.txt'] })
    expect(await renameEntry(root, 'c.txt', 'b.txt')).toMatchObject({ status: 'failed', reason: 'exists', path: 'b.txt' })
    expect(readFileSync(join(root, 'b.txt'), 'utf8')).toBe('b')
    expect(await renameEntry(root, 'c.txt', 'C.txt')).toEqual({ status: 'ok', paths: ['C.txt'] })
    expect(await renameEntry(root, 'C.txt', '.git')).toMatchObject({ status: 'failed', reason: 'excluded' })
    expect(await renameEntry(root, '', 'x')).toMatchObject({ status: 'failed', reason: 'root' })
    expect(await renameEntry(root, 'missing.txt', 'x')).toMatchObject({ status: 'failed', reason: 'missing' })
  })

  it('renames and moves a symbolic link itself, never its target', async () => {
    const { root, outside } = fixture()
    mkdirSync(join(root, 'dest'))
    symlinkSync(join(outside, 'secret.txt'), join(root, 'link'))
    expect(await renameEntry(root, 'link', 'renamed')).toEqual({ status: 'ok', paths: ['renamed'] })
    expect(await moveEntries(root, ['renamed'], 'dest')).toEqual({ status: 'ok', paths: ['dest/renamed'] })
    expect(lstatSync(join(root, 'dest/renamed')).isSymbolicLink()).toBe(true)
    expect(readFileSync(join(outside, 'secret.txt'), 'utf8')).toBe('TOP SECRET')
  })

  it('moves into folders, skips entries already there, refuses into-itself and existing destinations', async () => {
    const { root, write } = fixture()
    write('a.txt'); write('dir/inner/x.txt'); write('target/a2.txt'); write('target/same.txt'); write('same.txt', 'outer')
    expect(await moveEntries(root, ['a.txt', 'dir'], 'target')).toEqual({ status: 'ok', paths: ['target/a.txt', 'target/dir'] })
    expect(existsSync(join(root, 'target/dir/inner/x.txt'))).toBe(true)
    expect(await moveEntries(root, ['target/a2.txt'], 'target')).toEqual({ status: 'ok', paths: ['target/a2.txt'] })
    expect(await moveEntries(root, ['target'], 'target/dir/inner')).toMatchObject({ status: 'failed', reason: 'into_itself' })
    expect(await moveEntries(root, ['same.txt'], 'target')).toMatchObject({ status: 'failed', reason: 'exists', done: [] })
    expect(readFileSync(join(root, 'target/same.txt'), 'utf8')).toBe('x')
    expect(await moveEntries(root, ['.git'], 'target')).toMatchObject({ status: 'failed', reason: 'excluded' })
  })

  it('copies files and folders, naming copies next to the original, and refuses copying a folder into itself', async () => {
    const { root, outside, write } = fixture()
    write('src/index.ts', 'code'); write('other/keep.txt')
    symlinkSync(join(outside, 'secret.txt'), join(root, 'src/link'))
    expect(await copyEntries(root, ['src/index.ts'], 'src')).toEqual({ status: 'ok', paths: ['src/index copy.ts'] })
    expect(await copyEntries(root, ['src/index.ts'], 'src')).toEqual({ status: 'ok', paths: ['src/index copy 2.ts'] })
    expect(await copyEntries(root, ['src/index.ts'], 'other')).toEqual({ status: 'ok', paths: ['other/index.ts'] })
    expect(await copyEntries(root, ['src'], 'other')).toEqual({ status: 'ok', paths: ['other/src'] })
    // Links inside a copied folder stay links (the outside target is never read into the Project).
    expect(readlinkSync(join(root, 'other/src/link'))).toBe(join(outside, 'secret.txt'))
    expect(await copyEntries(root, ['src'], 'src')).toMatchObject({ status: 'failed', reason: 'into_itself' })
    expect(readFileSync(join(root, 'src/index copy.ts'), 'utf8')).toBe('code')
  })

  it('does not merge a directory another process creates during copy, and cleans its staging folder', async () => {
    const { root, write } = fixture()
    write('source/code.ts', 'code'); mkdirSync(join(root, 'target'))
    copying.before = () => { write('target/source/keep.txt', 'external'); copying.before = undefined }
    expect(await copyEntries(root, ['source'], 'target')).toMatchObject({ status: 'failed', reason: 'exists', done: [] })
    expect(readFileSync(join(root, 'target/source/keep.txt'), 'utf8')).toBe('external')
    expect(existsSync(join(root, 'target/source/code.ts'))).toBe(false)
    expect(readFileSync(join(root, 'source/code.ts'), 'utf8')).toBe('code')
    await expect((await import('node:fs/promises')).readdir(join(root, 'target'))).resolves.toEqual(['source'])
  })

  it('moves entries to the Trash through the system call only', async () => {
    const { root, write } = fixture()
    write('a.txt'); write('b/c.txt')
    const trash = vi.fn(async (absolute: string) => { renameSync(absolute, `${absolute}.trashed`) })
    expect(await trashEntries(root, ['a.txt', 'b'], trash)).toEqual({ status: 'ok', paths: ['a.txt', 'b'] })
    expect(trash).toHaveBeenCalledWith(join(root, 'a.txt'))
    expect(await trashEntries(root, ['', 'x'], trash)).toMatchObject({ status: 'failed', reason: 'root' })
    expect(await trashEntries(root, ['.git/config'], trash)).toMatchObject({ status: 'failed', reason: 'excluded' })
    expect(trash).toHaveBeenCalledTimes(2)
  })
})

describe('Quick Open index and image preview', () => {
  it('refuses a root replaced by a symbolic link, including after validation but before the child opens cwd', async () => {
    const { root, outside, write } = fixture()
    write('safe.txt', 'safe')
    const rg = await ripgrepPath()
    const launch = await projectRipgrep(root, rg, ['--files', ...RIPGREP_COMMON_ARGS])
    expect(launch).not.toBeNull()
    renameSync(root, `${root}-original`); symlinkSync(outside, root)
    expect(await listProjectFiles(root, { rg })).toEqual({ status: 'unavailable', reason: 'project_unavailable' })
    await expect(promisify(execFile)(launch!.command, launch!.args)).rejects.toMatchObject({ code: 126, stdout: '' })
    expect(await launch!.current()).toBe(false)
  })
  it('does not spawn an index after its Project has already been closed', async () => {
    const { root } = fixture()
    const controller = new AbortController()
    controller.abort()
    expect(await listProjectFiles(root, { rg: '/not-an-executable', signal: controller.signal })).toEqual({ status: 'unavailable', reason: 'project_closing' })
  })
  it('lists files with ripgrep, honouring .gitignore and skipping .git, without the user ripgrep config', async () => {
    const { root, write } = fixture()
    write('.gitignore', 'dist/\n*.log\n'); write('src/a.ts'); write('.env'); write('dist/out.js'); write('debug.log'); write('.git/config')
    write('with space/名字.md')
    const result = await listProjectFiles(root, { rg: await ripgrepPath() })
    expect(result.status).toBe('ok')
    expect(result.status === 'ok' && [...result.paths].sort()).toEqual(['.env', '.gitignore', 'src/a.ts', 'with space/名字.md'])
    const capped = await listProjectFiles(root, { rg: await ripgrepPath(), maxEntries: 2 })
    expect(capped).toMatchObject({ status: 'ok', truncated: true })
    expect(capped.status === 'ok' && capped.paths.length).toBe(2)
  })

  it('reads a bounded image and refuses other types, links and oversize files', async () => {
    const { root, outside, write } = fixture()
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
    write('logo.png', png); write('notes.txt', 'x')
    symlinkSync(join(outside, 'secret.txt'), join(root, 'leak.png'))
    expect(await readImageFile(root, 'logo.png')).toEqual({ status: 'ok', mime: 'image/png', size: png.length, base64: png.toString('base64') })
    expect(await readImageFile(root, 'notes.txt')).toMatchObject({ status: 'unavailable', reason: 'not_image' })
    expect(await readImageFile(root, 'leak.png')).toMatchObject({ status: 'unavailable', reason: 'symlink_refused' })
    expect(await readImageFile(root, 'logo.png', 4)).toMatchObject({ status: 'unavailable', reason: 'too_large', size: png.length })
  })
})

describe('Files service file management', () => {
  it('serializes competing renames and moves without overwriting either source', async () => {
    const { root, write } = fixture()
    const service = createFilesService({ projectRoot: () => root, changed: vi.fn(), watchChanged: vi.fn() })
    write('a.txt', 'a'); write('b.txt', 'b')
    const renamed = await Promise.all([service.rename('p', 'a.txt', 'same.txt'), service.rename('p', 'b.txt', 'same.txt')])
    expect(renamed).toEqual([{ status: 'ok', paths: ['same.txt'] }, { status: 'failed', reason: 'exists', path: 'same.txt', done: [] }])
    expect(readFileSync(join(root, 'same.txt'), 'utf8')).toBe('a')
    expect(readFileSync(join(root, 'b.txt'), 'utf8')).toBe('b')
    write('first/a.txt', 'first'); write('second/a.txt', 'second'); mkdirSync(join(root, 'target'))
    const moved = await Promise.all([service.move('p', ['first/a.txt'], 'target'), service.move('p', ['second/a.txt'], 'target')])
    expect(moved.map(result => result.status)).toEqual(['ok', 'failed'])
    expect(moved[1]).toMatchObject({ reason: 'exists' })
    expect(readFileSync(join(root, 'target/a.txt'), 'utf8')).toBe('first')
    expect(readFileSync(join(root, 'second/a.txt'), 'utf8')).toBe('second')
    await service.dispose()
  })

  it('waits for the active mutation on close and refuses an old queued request', async () => {
    const { root, write } = fixture()
    write('keep.txt', 'keep'); write('trash.txt', 'trash')
    let release!: () => void
    let started!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    const entered = new Promise<void>(resolve => { started = resolve })
    const service = createFilesService({ projectRoot: () => root, changed: vi.fn(), watchChanged: vi.fn(), system: {
      trash: async () => { started(); await pending }, reveal: vi.fn(), openPath: vi.fn(async () => ''), openExternal: vi.fn(async () => {}),
      editors: () => ({ vscode: false, cursor: false }), ripgrep: ripgrepPath
    } })
    const active = service.trash('p', ['trash.txt'])
    await entered
    const queued = service.rename('p', 'keep.txt', 'changed.txt')
    let closed = false
    const closing = service.closeProject('p').then(() => { closed = true })
    await Promise.resolve()
    expect(closed).toBe(false)
    release()
    await active; await closing
    expect(await queued).toMatchObject({ status: 'failed', reason: 'project_closing' })
    expect(readFileSync(join(root, 'keep.txt'), 'utf8')).toBe('keep')
    await service.dispose()
  })

  it('cancels an index waiting for the bundled binary when its Project closes', async () => {
    const { root } = fixture()
    let release!: (path: string) => void
    const binary = new Promise<string>(resolve => { release = resolve })
    const service = createFilesService({ projectRoot: () => root, changed: vi.fn(), watchChanged: vi.fn(), system: {
      trash: vi.fn(async () => {}), reveal: vi.fn(), openPath: vi.fn(async () => ''), openExternal: vi.fn(async () => {}),
      editors: () => ({ vscode: false, cursor: false }), ripgrep: () => binary
    } })
    const indexing = service.index('p')
    await service.closeProject('p')
    release('/not-an-executable')
    expect(await indexing).toEqual({ status: 'unavailable', reason: 'project_closing' })
    await service.dispose()
  })
  it('announces the affected folders, opens VS Code by URL with a line, and rejects a closing Project', async () => {
    const { root, write } = fixture()
    write('src/a.ts')
    const changed = vi.fn()
    let closing = false
    const system = {
      trash: vi.fn(async () => {}), reveal: vi.fn(), openPath: vi.fn(async () => ''), openExternal: vi.fn(async () => {}),
      editors: () => ({ vscode: true, cursor: false }), ripgrep: ripgrepPath
    }
    const service = createFilesService({ projectRoot: () => root, canOperate: () => !closing, changed, watchChanged: vi.fn(), system, watch: () => ({ close() {}, on() { return this } }) as never })
    expect(await service.create('p', 'src', 'b.ts', 'file')).toEqual({ status: 'ok', paths: ['src/b.ts'] })
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: 'p', dirs: ['src'], overflow: false }))
    expect(await service.open({ projectId: 'p', path: 'src/a.ts', target: 'vscode', line: 12 })).toEqual({ status: 'ok' })
    expect(system.openExternal).toHaveBeenCalledWith(`vscode://file${join(root, 'src/a.ts').split('/').map(encodeURIComponent).join('/')}:12:1`)
    expect(await service.open({ projectId: 'p', path: 'src/a.ts', target: 'cursor' })).toEqual({ status: 'failed', reason: 'app_missing' })
    expect(await service.open({ projectId: 'p', path: 'src', target: 'finder' })).toEqual({ status: 'ok' })
    expect(system.reveal).toHaveBeenCalledWith(join(root, 'src'))
    expect(await service.resolveDirectory('p', 'src')).toBe(join(root, 'src'))
    await expect(service.resolveDirectory('p', 'src/a.ts')).rejects.toThrow('not_directory')
    closing = true
    expect(await service.rename('p', 'src/a.ts', 'z.ts')).toMatchObject({ status: 'failed', reason: 'project_closing' })
    expect(existsSync(join(root, 'src/a.ts'))).toBe(true)
    writeFileSync(join(root, 'unused'), '')
    await service.dispose()
  })
})
