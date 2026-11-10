import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openDatabase, type StudioDatabase } from '../database/database'
import { migrations } from '../database/migrations'
import { createProjectService } from '../project/project-service'
import { WorkbenchService } from './workbench-service'
import type { WorkbenchDraft, WorkbenchTarget } from '@shared/workbench/types'

let dir: string, root: string, projectId: string, otherId: string, database: StudioDatabase, service: WorkbenchService
const changed = vi.fn()
function start() {
  database = openDatabase({ userDataDir: join(dir, 'data'), migrations })
  const projects = createProjectService(() => database.db)
  service = new WorkbenchService({ database: () => database.db, projectPath: id => {
    const project = projects.getProject(id)
    if (!project) throw new Error('Unknown Project')
    return project.canonicalPath
  }, changed })
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'studio-workbench-')); root = join(dir, 'project'); mkdirSync(root); mkdirSync(join(dir, 'other'))
  start()
  const projects = createProjectService(() => database.db)
  const opened = projects.openPath(root), other = projects.openPath(join(dir, 'other'))
  if (!opened.ok || !other.ok) throw new Error('fixture Project failed')
  projectId = opened.project.id; otherId = other.project.id
  changed.mockClear()
})
afterEach(() => { service.dispose(); database.close(); rmSync(dir, { recursive: true, force: true }) })
function target(draft: WorkbenchDraft): WorkbenchTarget { return { projectId, kind: 'draft', id: draft.id } }
function alter(draft: WorkbenchDraft, update: Record<string, unknown>) {
  const path = join(root, draft.directory, 'manifest.json')
  writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), ...update }))
}
function applyPreviewed(draft: WorkbenchDraft) {
  return service.applyDraft(projectId, draft.id, service.getSnapshot(target(draft)).packageRevision)
}
function install() {
  const created = service.createDraft(projectId, 'template')
  const instance = applyPreviewed(created)
  const selected: WorkbenchTarget = { projectId, kind: 'instance', id: instance.id }
  return { created, instance, selected }
}
it('creates versioned developer resources and an isolated runnable draft without changing Git ignore policy', async () => {
  mkdirSync(join(root, '.ai-studio')); writeFileSync(join(root, '.ai-studio/.gitignore'), 'existing-policy\n')
  const draft = service.createDraft(projectId, 'ai')
  const snapshot = service.getSnapshot(target(draft))
  expect(service.list(projectId)).toEqual({ instances: [], drafts: [draft] })
  expect(snapshot).toMatchObject({ target: target(draft), state: {}, stateRevision: 0, enabled: true, manifest: { sdkVersion: 1 } })
  expect(readFileSync(join(root, '.ai-studio/.gitignore'), 'utf8')).toBe('existing-policy\n')
  expect(readFileSync(join(root, '.ai-studio/workbench/sdk/GUIDE.md'), 'utf8')).toContain('updateState')
  const response = await service.handleRequest(new Request(snapshot.pageUrl))
  const html = await response.text()
  expect(response.status).toBe(200)
  expect(html.indexOf('__studio_sdk.js')).toBeLessThan(html.indexOf('window.workbench.subscribe'))
  expect(response.headers.get('Content-Type')).toContain('text/html')
})
it('copies preview state on first add, keeps it isolated afterwards, applies idempotently and restores after reopen', () => {
  const draft = service.createDraft(projectId, 'template')
  service.updateState(target(draft), { count: 9 }, 0)
  const instance = applyPreviewed(draft)
  const selected: WorkbenchTarget = { projectId, kind: 'instance', id: instance.id }
  expect(service.getSnapshot(selected)).toMatchObject({ state: { count: 9 }, stateRevision: 0 })
  expect(applyPreviewed(draft).id).toBe(instance.id)
  service.updateState(selected, { count: 3, note: 'saved' }, 0)
  service.dispose(); database.close(); start()
  expect(service.list(projectId).instances).toHaveLength(1)
  expect(service.getSnapshot(selected)).toMatchObject({ state: { count: 3, note: 'saved' }, stateRevision: 1 })
  expect(service.getSnapshot(target(draft)).state).toEqual({ count: 9 })
})
it('edits a copy, preserves current instance state and leaves another instance untouched', async () => {
  const { instance, selected } = install()
  const other = install()
  service.updateState(selected, { count: 4 }, 0)
  const edited = service.createDraft(projectId, 'ai', instance.id)
  const oldUrl = service.getSnapshot(selected).pageUrl
  alter(edited, { version: '1.1.0', title: '新版笔记' })
  writeFileSync(join(root, edited.directory, 'index.html'), '<html><head></head><body>新版页面</body></html>')
  service.updateState(target(edited), { count: 200 }, 0)
  expect(await (await service.handleRequest(new Request(oldUrl))).text()).toContain('随手记')
  service.updateState(selected, { count: 5 }, 1)
  applyPreviewed(edited)
  expect(service.getSnapshot(selected)).toMatchObject({ manifest: { title: '新版笔记' }, state: { count: 5 }, stateRevision: 2 })
  expect(service.getSnapshot(other.selected)).toMatchObject({ manifest: { title: '随手记' }, state: {} })
  expect((await service.handleRequest(new Request(oldUrl))).status).toBe(409)
})
it('rejects stale state and stale editing drafts without losing the accepted version', () => {
  const { instance, selected } = install()
  const one = service.createDraft(projectId, 'ai', instance.id), two = service.createDraft(projectId, 'ai', instance.id)
  alter(one, { version: '1.1.0' }); applyPreviewed(one)
  alter(two, { version: '1.2.0' })
  expect(() => applyPreviewed(two)).toThrow('已应用其他版本')
  service.updateState(selected, { count: 1 }, 0)
  expect(() => service.updateState(selected, { count: 2 }, 0)).toThrow('内容已变化')
  expect(service.getSnapshot(selected)).toMatchObject({ manifest: { version: '1.1.0' }, state: { count: 1 } })
})
it('returns actionable manifest, missing entry and missing dependency errors and recovers after repair', () => {
  const draft = service.createDraft(projectId, 'template')
  const file = join(root, draft.directory, 'manifest.json'), good = readFileSync(file, 'utf8')
  writeFileSync(file, '{')
  expect(() => service.getSnapshot(target(draft))).toThrow('不是有效 JSON')
  expect(() => service.applyDraft(projectId, draft.id, '0'.repeat(64))).toThrow('不是有效 JSON')
  writeFileSync(file, good); alter(draft, { sdkVersion: 99 })
  expect(() => service.getSnapshot(target(draft))).toThrow('SDK 版本')
  writeFileSync(file, good); alter(draft, { entry: 'missing.html' })
  expect(() => service.getSnapshot(target(draft))).toThrow('找不到入口')
  writeFileSync(file, good); writeFileSync(join(root, draft.directory, 'index.html'), '<script src="page.js"></script>')
  expect(() => service.getSnapshot(target(draft))).toThrow('包内资源不存在')
  writeFileSync(join(root, draft.directory, 'page.js'), 'document.body.dataset.ready="yes"')
  expect(service.getSnapshot(target(draft)).manifest.entry).toBe('index.html')
  expect(service.list(projectId).instances).toHaveLength(0)
})
it('rejects package path escapes, symlinks and unsupported capabilities', () => {
  const draft = service.createDraft(projectId, 'template')
  alter(draft, { entry: '../outside.html' })
  expect(() => service.getSnapshot(target(draft))).toThrow('包内')
  alter(draft, { entry: 'index.html', capabilities: ['arbitrary.host'] })
  expect(() => service.getSnapshot(target(draft))).toThrow('不支持能力')
  alter(draft, { capabilities: ['state.read'] }); symlinkSync('/etc/hosts', join(root, draft.directory, 'outside'))
  expect(() => service.getSnapshot(target(draft))).toThrow('符号链接')
})
it('stops new page requests and writes while disabled, retaining state for re-enable', async () => {
  const { instance, selected } = install()
  service.updateState(selected, { note: 'keep' }, 0)
  service.setEnabled(projectId, instance.id, false)
  const disabled = service.getSnapshot(selected)
  expect(disabled).toMatchObject({ enabled: false, state: { note: 'keep' } })
  expect((await service.handleRequest(new Request(disabled.pageUrl))).status).toBe(403)
  expect(() => service.updateState(selected, {}, 1)).toThrow('停用')
  service.setEnabled(projectId, instance.id, true)
  expect(service.getSnapshot(selected)).toMatchObject({ enabled: true, state: { note: 'keep' } })
})
it('binds every read and write to the owning Project and enforces declared state write capability', () => {
  const { selected } = install()
  expect(() => service.getSnapshot({ ...selected, projectId: otherId })).toThrow('当前 Project')
  expect(() => service.updateState({ ...selected, projectId: otherId }, {}, 0)).toThrow('当前 Project')
  const draft = service.createDraft(projectId, 'template')
  alter(draft, { capabilities: ['state.read'] })
  expect(() => service.updateState(target(draft), {}, 0)).toThrow('state.write')
  expect(() => service.updateState(target(draft), { invalid: Infinity }, 0)).toThrow()
})
it('detects externally modified installed packages instead of silently serving an unreviewed version', () => {
  const { instance, selected } = install()
  writeFileSync(join(root, '.ai-studio/workbench/packages', instance.packageRevision, 'index.html'), '<p>unreviewed</p>')
  expect(() => service.getSnapshot(selected)).toThrow('被外部修改')
})
it('provides authoring context without requiring a valid draft and separates ordinary instance use', () => {
  const { created, instance } = install()
  writeFileSync(join(root, created.directory, 'manifest.json'), '{')
  const authoring = service.buildContext(projectId, `workbench-draft:${created.id}`)
  expect(authoring.paths).toContain(created.directory)
  expect(authoring.text).toContain('刷新预览')
  const usage = service.buildContext(projectId, `workbench:${instance.id}`)
  expect(usage.paths).toEqual([])
  expect(usage.text).toContain('不是页面结构编辑')
})
it('refuses unpreviewed changed files on both first add and update, then applies only after a fresh preview', () => {
  const created = service.createDraft(projectId, 'template')
  const firstPreview = service.getSnapshot(target(created))
  alter(created, { version: '1.1.0', title: 'Changed before add' })
  expect(() => service.applyDraft(projectId, created.id, firstPreview.packageRevision)).toThrow('刷新预览')
  expect(service.list(projectId).instances).toEqual([])
  const reviewed = service.getSnapshot(target(created))
  const instance = service.applyDraft(projectId, created.id, reviewed.packageRevision)
  const selected: WorkbenchTarget = { projectId, kind: 'instance', id: instance.id }
  service.updateState(selected, { note: 'preserved' }, 0)
  const edit = service.createDraft(projectId, 'ai', instance.id)
  const editPreview = service.getSnapshot(target(edit))
  alter(edit, { version: '1.2.0', title: 'Changed after preview' })
  expect(() => service.applyDraft(projectId, edit.id, editPreview.packageRevision)).toThrow('刷新预览')
  expect(service.getSnapshot(selected)).toMatchObject({ packageRevision: reviewed.packageRevision, manifest: { title: 'Changed before add' }, state: { note: 'preserved' } })
  const latest = service.getSnapshot(target(edit))
  service.applyDraft(projectId, edit.id, latest.packageRevision)
  expect(service.getSnapshot(selected)).toMatchObject({ packageRevision: latest.packageRevision, manifest: { title: 'Changed after preview' }, state: { note: 'preserved' } })
})
