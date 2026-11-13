import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openDatabase, type StudioDatabase } from '../database/database'
import { migrations } from '../database/migrations'
import { createProjectService } from '../project/project-service'
import { PackageRuntime } from './package-runtime'
import type { WorkbenchDraft, WorkbenchTarget } from '@shared/workbench/types'

let dir: string, root: string, projectId: string, otherId: string, database: StudioDatabase, service: PackageRuntime
const changed = vi.fn()
function start() {
  database = openDatabase({ userDataDir: join(dir, 'data'), migrations })
  const projects = createProjectService(() => database.db)
  service = new PackageRuntime({ database: () => database.db, presetRoot: fileURLToPath(new URL('../../../../out/workbench-packages/', import.meta.url)), projectPath: id => {
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
  return service.applyDraft(projectId, draft.id, service.getSnapshot(target(draft)).packageRevision).instance
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
  expect(snapshot).toMatchObject({ target: target(draft), state: {}, stateRevision: 0, manifest: { sdkVersion: 1 } })
  expect(readFileSync(join(root, '.ai-studio/.gitignore'), 'utf8')).toBe('existing-policy\n')
  expect(readFileSync(join(root, '.ai-studio/workbench/sdk/GUIDE.md'), 'utf8')).toContain('updateState')
  const response = await service.handleRequest(new Request(snapshot.pageUrl))
  const html = await response.text()
  expect(response.status).toBe(200)
  expect(html.indexOf('__studio_sdk.js')).toBeLessThan(html.indexOf('window.workbench.subscribe'))
  expect(response.headers.get('Content-Type')).toContain('text/html')
})
it('copies preview state on first add, closes the draft while keeping its files, and restores after reopen', () => {
  const draft = service.createDraft(projectId, 'template')
  service.updateState(target(draft), { count: 9 }, 0)
  const preview = service.getSnapshot(target(draft))
  const applied = service.applyDraft(projectId, draft.id, preview.packageRevision)
  expect(applied.created).toBe(true)
  const selected: WorkbenchTarget = { projectId, kind: 'instance', id: applied.instance.id }
  expect(service.getSnapshot(selected)).toMatchObject({ state: { count: 9 }, stateRevision: 0 })
  expect(service.list(projectId).drafts).toEqual([])
  expect(() => service.applyDraft(projectId, draft.id, preview.packageRevision)).toThrow('工作台草稿')
  expect(existsSync(join(root, draft.directory, 'manifest.json'))).toBe(true)
  service.updateState(selected, { count: 3, note: 'saved' }, 0)
  service.dispose(); database.close(); start()
  expect(service.list(projectId).instances).toHaveLength(1)
  expect(service.getSnapshot(selected)).toMatchObject({ state: { count: 3, note: 'saved' }, stateRevision: 1 })
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
it('reopens one edit draft per instance and source, and replaces a draft made stale by another applied version', () => {
  const { instance, selected } = install()
  const one = service.createDraft(projectId, 'ai', instance.id)
  expect(service.createDraft(projectId, 'ai', instance.id)).toEqual(one)
  expect(service.list(projectId).drafts).toEqual([one])
  alter(one, { version: '1.1.0' }); applyPreviewed(one)
  expect(service.list(projectId).drafts).toEqual([])
  const next = service.createDraft(projectId, 'ai', instance.id)
  expect(next.id).not.toBe(one.id)
  service.updateState(selected, { count: 1 }, 0)
  expect(() => service.updateState(selected, { count: 2 }, 0)).toThrow('内容已变化')
  expect(service.getSnapshot(selected)).toMatchObject({ manifest: { version: '1.1.0' }, state: { count: 1 } })
  const selection = service.installTemplate(projectId, 'product-selection')
  const edit = service.createDraft(projectId, 'ai', selection.id), upgrade = service.createDraft(projectId, 'template', selection.id, 'product-selection')
  expect(upgrade.id).not.toBe(edit.id)
  alter(upgrade, { version: '9.0.0' }); applyPreviewed(upgrade)
  expect(() => applyPreviewed(edit)).toThrow('已应用其他版本')
  const fresh = service.createDraft(projectId, 'ai', selection.id)
  expect(fresh.id).not.toBe(edit.id)
  expect(service.getSnapshot(target(fresh)).manifest.version).toBe('9.0.0')
})
it('installs an App template as a ready instance without a draft and deletes an instance with the drafts that target it', () => {
  const selection = service.installTemplate(projectId, 'product-selection')
  const selected: WorkbenchTarget = { projectId, kind: 'instance', id: selection.id }
  expect(service.list(projectId)).toMatchObject({ instances: [{ id: selection.id, pluginId: 'product-selection', title: '选品工作台' }], drafts: [] })
  expect(service.getSnapshot(selected)).toMatchObject({ state: {}, stateRevision: 0, manifest: { pluginId: 'product-selection' } })
  expect(service.installTemplate(projectId, 'product-selection').id).not.toBe(selection.id)
  service.updateState(selected, { brief: 'keep until deleted' }, 0)
  const edit = service.createDraft(projectId, 'ai', selection.id), unrelated = service.createDraft(projectId, 'ai')
  expect(service.deleteInstance(projectId, selection.id)).toEqual([edit.id])
  expect(() => service.getSnapshot(selected)).toThrow('当前 Project')
  expect(service.list(projectId).drafts).toEqual([unrelated])
  expect(existsSync(join(root, edit.directory, 'manifest.json'))).toBe(true)
  expect(existsSync(join(root, '.ai-studio/workbench/packages', selection.packageRevision, 'manifest.json'))).toBe(true)
  expect(() => service.deleteInstance(otherId, service.list(projectId).instances[0]!.id)).toThrow('当前 Project')
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
  const { instance } = install(), created = service.createDraft(projectId, 'ai', instance.id)
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
  const { instance } = service.applyDraft(projectId, created.id, reviewed.packageRevision)
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

it('reopens an edited template upgrade draft while the App template version is unchanged, and replaces it after an App update', () => {
  const selection = service.installTemplate(projectId, 'product-selection')
  const upgrade = service.createDraft(projectId, 'template', selection.id, 'product-selection')
  const templateVersion = service.getSnapshot(target(upgrade)).manifest.version
  expect(service.createDraft(projectId, 'template', selection.id, 'product-selection')).toEqual(upgrade)
  alter(upgrade, { title: 'Customised in the draft conversation' })
  expect(service.createDraft(projectId, 'template', selection.id, 'product-selection')).toEqual(upgrade)
  alter(upgrade, { version: '0.0.1' }) // an older template copy left unapplied across an App update
  const fresh = service.createDraft(projectId, 'template', selection.id, 'product-selection')
  expect(fresh.id).not.toBe(upgrade.id)
  expect(service.getSnapshot(target(fresh)).manifest.version).toBe(templateVersion)
  expect(service.list(projectId).drafts.map(item => item.id)).toEqual([fresh.id])
  expect(existsSync(join(root, upgrade.directory, 'manifest.json'))).toBe(true)
})
it('closes legacy drafts once when their files equal their base revision and keeps those with unapplied changes', () => {
  const unchanged = install(), changed = install(), moved = install()
  const legacy = service.createDraft(projectId, 'ai', unchanged.instance.id), edited = service.createDraft(projectId, 'ai', changed.instance.id)
  const superseded = service.createDraft(projectId, 'template', moved.instance.id) // a later version was applied after it
  const later = service.createDraft(projectId, 'ai', moved.instance.id); alter(later, { version: '4.0.0' }); applyPreviewed(later)
  const fresh = service.createDraft(projectId, 'ai', moved.instance.id)
  alter(edited, { version: '3.0.0' })
  database.db.prepare('UPDATE workbench_drafts SET legacy_applied=1 WHERE id IN (?,?,?)').run(legacy.id, edited.id, superseded.id)
  expect(service.closeLegacyDrafts(otherId)).toEqual([])
  expect(service.closeLegacyDrafts(projectId).sort()).toEqual([legacy.id, superseded.id].sort())
  expect(service.list(projectId).drafts.map(item => item.id).sort()).toEqual([edited.id, fresh.id].sort())
  expect(database.db.prepare('SELECT COUNT(*) AS count FROM workbench_drafts WHERE legacy_applied=1').get()?.count).toBe(0)
  expect(existsSync(join(root, legacy.directory, 'manifest.json'))).toBe(true)
  expect(service.closeLegacyDrafts(projectId)).toEqual([])
})

it('flags the drafts that target an instance when migrating an existing database', () => {
  const data = join(dir, 'legacy-data'), before = migrations.filter(migration => migration.id < '2026111201')
  const old = openDatabase({ userDataDir: data, migrations: before }), projects = createProjectService(() => old.db)
  const opened = projects.openPath(root)
  if (!opened.ok) throw new Error('fixture Project failed')
  const project = opened.project.id, insertDraft = old.db.prepare('INSERT INTO workbench_drafts(id,project_id,source,target_instance_id,base_package_revision,directory,title,created_at) VALUES (?,?,?,?,?,?,?,?)')
  old.db.prepare('INSERT INTO workbench_instances(id,project_id,plugin_id,package_revision,title,created_at) VALUES (?,?,?,?,?,?)').run('i', project, 'p', 'r2', 'x', 1)
  insertDraft.run('applied', project, 'template', 'i', 'r2', 'd/applied', 'x', 0)
  insertDraft.run('stale', project, 'ai', 'i', 'r1', 'd/stale', 'x', 2)
  insertDraft.run('new', project, 'ai', null, null, 'd/new', 'x', 3)
  old.close()
  const upgraded = openDatabase({ userDataDir: data, migrations })
  expect(upgraded.db.prepare('SELECT id, legacy_applied AS flag FROM workbench_drafts ORDER BY id').all()).toEqual([{ id: 'applied', flag: 1 }, { id: 'new', flag: 0 }, { id: 'stale', flag: 1 }])
  upgraded.close()
})
