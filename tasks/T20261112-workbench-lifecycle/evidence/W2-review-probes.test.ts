import { fileURLToPath } from 'node:url'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { CustomDraftEntry, WorkbenchChange } from '@shared/workbench/types'
import { openDatabase, type StudioDatabase } from '../../src/main/services/database/database'
import { migrations } from '../../src/main/services/database/migrations'
import { createProjectService } from '../../src/main/services/project/project-service'
import { WorkbenchService } from '../../src/main/services/workbench/workbench-service'

let directory: string, root: string, presetRoot: string, projectId: string, database: StudioDatabase, service: WorkbenchService
const changes: WorkbenchChange[] = []
function start() {
  database = openDatabase({ userDataDir: join(directory, 'data'), migrations })
  const projects = createProjectService(() => database.db)
  service = new WorkbenchService({ database: () => database.db, presetRoot, projectPath: id => {
    const project = projects.getProject(id); if (!project) throw new Error('Unknown Project'); return project.canonicalPath
  }, settleMs: 5, changed: change => changes.push(change) })
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wb-review-')); root = join(directory, 'project'); mkdirSync(root)
  presetRoot = join(directory, 'presets')
  cpSync(fileURLToPath(new URL('../../out/workbench-packages/', import.meta.url)), presetRoot, { recursive: true })
  start()
  const opened = createProjectService(() => database.db).openPath(root)
  if (!opened.ok) throw new Error('fixture'); projectId = opened.project.id; changes.length = 0
})
afterEach(() => { service.dispose(); database.close(); rmSync(directory, { recursive: true, force: true }) })
const ref = (d: CustomDraftEntry) => ({ projectId, viewId: d.viewId })
function bumpTemplate(version: string) {
  const path = join(presetRoot, 'product-selection', 'manifest.json')
  writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), version }, null, 2))
}

it('P1 nested savepoint: nav update failure rolls back instance insert and draft delete', async () => {
  const draft = service.createDraft({ projectId, source: 'template' })
  const snap = await service.getSnapshot(ref(draft))
  const db = database.db, prepare = db.prepare.bind(db)
  ;(db as any).prepare = (sql: string) => { if (sql.startsWith('UPDATE workbench_navigation SET view_id')) throw new Error('boom'); return prepare(sql) }
  expect(() => service.applyDraft({ ref: ref(draft), expectedPackageRevision: snap.page!.packageRevision })).toThrow('boom')
  ;(db as any).prepare = prepare
  expect(db.prepare('SELECT COUNT(*) c FROM workbench_instances').get()!.c).toBe(0)
  expect(db.prepare('SELECT COUNT(*) c FROM workbench_drafts').get()!.c).toBe(1)
  expect(db.isTransaction).toBe(false)
  // retry works
  const inst = service.applyDraft({ ref: ref(draft), expectedPackageRevision: snap.page!.packageRevision })
  expect(service.list(projectId).some(e => e.viewId === inst.viewId)).toBe(true)
})

it('P2 deleteInstance rollback: agent_runs delete failure keeps instance, drafts, nav', async () => {
  const added = service.addTemplate({ projectId, templateId: 'product-selection' })
  const edit = service.createDraft({ projectId, source: 'ai', instanceId: added.id })
  service.setVisible({ ref: { projectId, viewId: added.viewId }, visible: false })
  const db = database.db, prepare = db.prepare.bind(db)
  ;(db as any).prepare = (sql: string) => { if (sql.startsWith('DELETE FROM workbench_agent_runs')) throw new Error('boom'); return prepare(sql) }
  await expect(service.deleteInstance({ projectId, viewId: added.viewId })).rejects.toThrow('boom')
  ;(db as any).prepare = prepare
  expect(service.listRemoved(projectId).map(e => e.viewId)).toEqual([added.viewId])
  expect(service.list(projectId).some(e => e.viewId === edit.viewId)).toBe(true)
  expect(db.isTransaction).toBe(false)
})

it('P3 upgrade preview reuses a stale template draft after the App template changed', async () => {
  bumpTemplate('0.0.1')
  const added = service.addTemplate({ projectId, templateId: 'product-selection' })
  bumpTemplate('0.0.2')
  const first = service.createDraft({ projectId, source: 'template', instanceId: added.id, templateId: 'product-selection' })
  expect((await service.getSnapshot(ref(first))).page!.manifest.version).toBe('0.0.2')
  bumpTemplate('0.0.3') // app updated while upgrade draft left unapplied
  const second = service.createDraft({ projectId, source: 'template', instanceId: added.id, templateId: 'product-selection' })
  const version = (await service.getSnapshot(ref(second))).page!.manifest.version
  console.log('P3 reused:', second.id === first.id, 'version shown as "新版":', version)
})

it('P4 legacy retargeted draft (old applyDraft) stays listed and is reused by upgrade preview', async () => {
  bumpTemplate('0.0.1')
  // old flow: template draft -> apply -> draft retargeted to instance with base = applied revision
  const legacy = service.createDraft({ projectId, source: 'template', templateId: 'product-selection' })
  const snap = await service.getSnapshot(ref(legacy))
  const db = database.db
  // emulate the old applyDraft: insert instance from the draft package and retarget the draft
  const added = service.addTemplate({ projectId, templateId: 'product-selection' })
  db.prepare('UPDATE workbench_drafts SET target_instance_id=?,base_package_revision=? WHERE id=?').run(added.id, added.packageRevision, legacy.id)
  expect(snap.page!.packageRevision).toBe(added.packageRevision)
  bumpTemplate('0.0.2')
  console.log('P4 list after migration still shows legacy draft:', service.list(projectId).filter(e => e.kind === 'draft').map(e => e.title))
  const upgrade = service.createDraft({ projectId, source: 'template', instanceId: added.id, templateId: 'product-selection' })
  console.log('P4 upgrade reused legacy draft:', upgrade.id === legacy.id, 'preview version:', (await service.getSnapshot(ref(upgrade))).page!.manifest.version)
})

it('P5 applying an edit draft of a removed instance', async () => {
  const draft = service.createDraft({ projectId, source: 'template' })
  const s = await service.getSnapshot(ref(draft))
  const inst = service.applyDraft({ ref: ref(draft), expectedPackageRevision: s.page!.packageRevision })
  const edit = service.createDraft({ projectId, source: 'ai', instanceId: inst.id })
  service.setVisible({ ref: { projectId, viewId: inst.viewId }, visible: false })
  const e = await service.getSnapshot(ref(edit))
  const applied = service.applyDraft({ ref: ref(edit), expectedPackageRevision: e.page!.packageRevision })
  console.log('P5 applied to hidden instance; listed?', service.list(projectId).some(x => x.viewId === applied.viewId), 'removed?', service.listRemoved(projectId).some(x => x.viewId === applied.viewId))
})

it('P6 events after delete: snapshot events for deleted views', async () => {
  const added = service.addTemplate({ projectId, templateId: 'product-selection' })
  await service.getSnapshot({ projectId, viewId: added.viewId })
  service.setVisible({ ref: { projectId, viewId: added.viewId }, visible: false })
  changes.length = 0
  await service.deleteInstance({ projectId, viewId: added.viewId })
  console.log('P6 events:', JSON.stringify(changes.map(c => c.kind)))
})

it('P7 numbering vs renamed instances and drafts', async () => {
  const a = service.addTemplate({ projectId, templateId: 'product-selection' })
  service.rename({ ref: { projectId, viewId: a.viewId }, title: '选品工作台 2' })
  const b = service.addTemplate({ projectId, templateId: 'product-selection' })
  const c = service.addTemplate({ projectId, templateId: 'product-selection' })
  console.log('P7 titles:', service.list(projectId).filter(e => e.kind === 'instance').map(e => e.title))
  expect(new Set([b.title, c.title]).size).toBe(2)
})
