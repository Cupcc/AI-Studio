import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { openDatabase, type StudioDatabase } from '../../../apps/desktop/src/main/services/database/database'
import { migrations } from '../../../apps/desktop/src/main/services/database/migrations'
import { createProjectService } from '../../../apps/desktop/src/main/services/project/project-service'
import { WorkbenchService } from '../../../apps/desktop/src/main/services/workbench/workbench-service'
import { WebRuntime } from '../../../apps/desktop/src/main/services/workbench/web-runtime'
let root: string, path: string, db: StudioDatabase, service: WorkbenchService, projectId: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'studio-review-management-')); path = join(root, 'project'); mkdirSync(path)
  db = openDatabase({ userDataDir: join(root, 'data'), migrations })
  const result = createProjectService(() => db.db).openPath(path)
  if (!result.ok) throw new Error('Cannot open fixture')
  projectId = result.project.id
  service = new WorkbenchService({ database: () => db.db, projectPath: id => { if (id !== projectId) throw new Error('Wrong project'); return path }, changed() {} })
})
afterEach(() => { service.dispose(); db.close(); rmSync(root, { recursive: true, force: true }) })
it('appends an installed instance after preexisting unmodified drafts', async () => {
  const a = service.createDraft({ projectId, source: 'template' }), b = service.createDraft({ projectId, source: 'template' })
  const before = service.list(projectId).map(entry => entry.viewId)
  const ref = { projectId, viewId: a.viewId }
  const snapshot = await service.getSnapshot(ref)
  const installed = service.applyDraft({ ref, expectedPackageRevision: snapshot.page!.packageRevision })
  const actual = service.list(projectId).map(entry => entry.viewId)
  expect(actual, `existing order ${JSON.stringify(before)}, actual ${JSON.stringify(actual)}`).toEqual([...before, installed.viewId])
  expect(actual.indexOf(b.viewId)).toBe(before.indexOf(b.viewId))
})
it('upgrades pre-navigation database while keeping installed content and default catalog', async () => {
  const dir = join(root, 'legacy')
  let legacy = openDatabase({ userDataDir: dir, migrations: migrations.filter(m => m.id !== '2026111102_workbench_navigation') })
  const result = createProjectService(() => legacy.db).openPath(path)
  if (!result.ok) throw new Error('Legacy fixture')
  const id = result.project.id
  const runtime = new WebRuntime({ database: () => legacy.db, projectPath: () => path, changed() {} })
  const a = runtime.createDraft(id, 'template')
  const snapshot = runtime.getSnapshot({ projectId: id, kind: 'draft', id: a.id })
  const instance = runtime.applyDraft(id, a.id, snapshot.packageRevision)
  runtime.updateState({ projectId: id, kind: 'instance', id: instance.id }, { saved: 'before upgrade' }, 0)
  legacy.close()
  legacy = openDatabase({ userDataDir: dir, migrations })
  const host = new WorkbenchService({ database: () => legacy.db, projectPath: () => path, changed() {} })
  try {
    expect(host.list(id)).toHaveLength(7)
    expect(await host.getSnapshot({ projectId: id, viewId: `workbench:${instance.id}` })).toMatchObject({ page: { state: { saved: 'before upgrade' }, stateRevision: 1 } })
    expect(legacy.db.prepare('SELECT COUNT(*) AS count FROM workbench_navigation').get()?.count).toBe(0)
    host.rename({ ref: { projectId: id, viewId: 'overview' }, title: 'After upgrade' })
    expect(host.list(id)[0]?.title).toBe('After upgrade')
  } finally { host.dispose(); legacy.close() }
})
it('rolls back a partial order update when persistence rejects one row', () => {
  service.rename({ ref: { projectId, viewId: 'overview' }, title: 'Overview alias' })
  const before = service.list(projectId).map(entry => entry.viewId)
  db.db.exec("CREATE TRIGGER reject_order BEFORE UPDATE OF position ON workbench_navigation WHEN NEW.view_id='architecture' BEGIN SELECT RAISE(ABORT,'review injected write failure'); END")
  expect(() => service.move({ ref: { projectId, viewId: 'business-flow' }, before: 'overview' })).toThrow('review injected write failure')
  expect(service.list(projectId).map(entry => entry.viewId)).toEqual(before)
})
