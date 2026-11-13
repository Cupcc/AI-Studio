import { fileURLToPath } from 'node:url'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CustomDraftEntry, WorkbenchChange } from '@shared/workbench/types'
import type { SessionSummary } from '@shared/session/types'
import { openDatabase, type StudioDatabase } from '../../src/main/services/database/database'
import { migrations } from '../../src/main/services/database/migrations'
import { createProjectService } from '../../src/main/services/project/project-service'
import { WorkbenchService } from '../../src/main/services/workbench/workbench-service'

let directory: string, root: string, presetRoot: string, projectId: string, database: StudioDatabase, service: WorkbenchService
const changes: WorkbenchChange[] = []
const OLD = migrations.filter(m => m.id < '2026111201')
function start(migs = migrations) {
  database = openDatabase({ userDataDir: join(directory, 'data'), migrations: migs })
  const projects = createProjectService(() => database.db)
  service = new WorkbenchService({ database: () => database.db, presetRoot, projectPath: id => {
    const project = projects.getProject(id); if (!project) throw new Error('Unknown Project'); return project.canonicalPath
  }, settleMs: 5, changed: change => changes.push(change) })
}
function restart(migs = migrations) { service.dispose(); database.close(); start(migs) }
function setup(migs = migrations) {
  directory = mkdtempSync(join(tmpdir(), 'wb-review2-')); root = join(directory, 'project'); mkdirSync(root)
  presetRoot = join(directory, 'presets')
  cpSync(fileURLToPath(new URL('../../out/workbench-packages/', import.meta.url)), presetRoot, { recursive: true })
  start(migs)
  const opened = createProjectService(() => database.db).openPath(root)
  if (!opened.ok) throw new Error('fixture'); projectId = opened.project.id; changes.length = 0
}
afterEach(() => { service.dispose(); database.close(); rmSync(directory, { recursive: true, force: true }) })
const ref = (d: CustomDraftEntry) => ({ projectId, viewId: d.viewId })
function bumpTemplate(version: string) {
  const path = join(presetRoot, 'product-selection', 'manifest.json')
  writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), version }, null, 2))
}
function alter(d: CustomDraftEntry, update: Record<string, unknown>) {
  const path = join(root, d.directory, 'manifest.json')
  writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), ...update }))
}

it('P3 (re) stale template upgrade draft is replaced after the App template changed', async () => {
  setup()
  bumpTemplate('0.0.1'); const added = service.addTemplate({ projectId, templateId: 'product-selection' })
  bumpTemplate('0.0.2'); const first = service.createDraft({ projectId, source: 'template', instanceId: added.id, templateId: 'product-selection' })
  bumpTemplate('0.0.3'); const second = service.createDraft({ projectId, source: 'template', instanceId: added.id, templateId: 'product-selection' })
  const version = (await service.getSnapshot(ref(second))).page!.manifest.version
  const drafts = service.list(projectId).filter(e => e.kind === 'draft').map(e => e.viewId)
  console.log('P3r reused:', second.id === first.id, 'preview version:', version, 'drafts listed:', drafts.length, 'old listed:', drafts.includes(first.viewId))
  expect(version).toBe('0.0.3')
})

it('P4 (re) real migration: old-flow add + old-flow upgrade, unchanged and changed legacy edits', async () => {
  setup(OLD)
  // instance I currently at template revision (old flow: added at 1.1.0 by draft A, then upgraded by draft U)
  const added = service.addTemplate({ projectId, templateId: 'product-selection' })
  const A = service.createDraft({ projectId, source: 'template', templateId: 'product-selection' }); alter(A, { version: '1.1.0' })
  const aRev = (await service.getSnapshot(ref(A))).page!.packageRevision
  database.db.prepare('UPDATE workbench_drafts SET target_instance_id=?,base_package_revision=? WHERE id=?').run(added.id, aRev, A.id) // old add, superseded
  const U = service.createDraft({ projectId, source: 'template', instanceId: added.id, templateId: 'product-selection' }) // old upgrade draft, applied: files == instance, base == instance
  // a note instance with an unchanged legacy edit draft and a changed one
  const T = service.createDraft({ projectId, source: 'template' }); const tPrev = await service.getSnapshot(ref(T))
  const note = service.applyDraft({ ref: ref(T), expectedPackageRevision: tPrev.page!.packageRevision })
  const unchanged = service.createDraft({ projectId, source: 'ai', instanceId: note.id })
  database.db.prepare('DELETE FROM workbench_drafts WHERE id=?').run(unchanged.id) // force separate drafts (reuse would return same)
  const unchanged2 = service.createDraft({ projectId, source: 'ai', instanceId: note.id })
  const changed = service.createDraft({ projectId, source: 'template', instanceId: note.id }); alter(changed, { version: '9.9.9' })
  const before = service.list(projectId).filter(e => e.kind === 'draft').map(e => `${e.title}:${e.viewId.slice(16, 20)}`)
  restart() // new migrations
  const flags = database.db.prepare('SELECT id, legacy_applied f FROM workbench_drafts').all()
  restart()
  const after = service.list(projectId).filter(e => e.kind === 'draft').map(e => e.viewId)
  console.log('P4r before:', before.length, 'flags after migrate:', JSON.stringify(flags.map(r => [String(r.id).slice(0, 4), r.f])))
  console.log('P4r A(old add, superseded) listed:', after.includes(A.viewId), '| U(old upgrade, applied) listed:', after.includes(U.viewId), '| unchanged edit listed:', after.includes(unchanged2.viewId), '| changed edit listed:', after.includes(changed.viewId))
  const aSnap = await service.getSnapshot(ref(A))
  let applyError = ''
  try { service.applyDraft({ ref: ref(A), expectedPackageRevision: aSnap.page!.packageRevision }) } catch (e) { applyError = (e as Error).message }
  console.log('P4r applying leftover A:', applyError || 'ok')
  const orphanNav = database.db.prepare("SELECT COUNT(*) c FROM workbench_navigation WHERE view_id LIKE 'workbench-draft:%' AND substr(view_id,17) NOT IN (SELECT id FROM workbench_drafts)").get()!.c
  console.log('P4r orphan draft nav rows:', orphanNav)
})

it('P5 (re) applying an edit to a removed instance brings it back', async () => {
  setup()
  const d = service.createDraft({ projectId, source: 'template' }); const s = await service.getSnapshot(ref(d))
  const inst = service.applyDraft({ ref: ref(d), expectedPackageRevision: s.page!.packageRevision })
  const edit = service.createDraft({ projectId, source: 'ai', instanceId: inst.id })
  service.setVisible({ ref: { projectId, viewId: inst.viewId }, visible: false })
  const e = await service.getSnapshot(ref(edit))
  service.applyDraft({ ref: ref(edit), expectedPackageRevision: e.page!.packageRevision })
  console.log('P5r listed last:', service.list(projectId).at(-1)?.viewId === inst.viewId, 'removed:', service.listRemoved(projectId).length)
})

it('F3 (re) delete stops sessions started from the instance edit drafts', async () => {
  setup()
  const added = service.addTemplate({ projectId, templateId: 'product-selection' })
  const edit = service.createDraft({ projectId, source: 'ai', instanceId: added.id }), other = service.createDraft({ projectId, source: 'ai' })
  const s = (id: string, originViewId: string, activity: SessionSummary['activity']) => ({ id, projectId, originViewId, activity }) as SessionSummary
  const sessions = [s('inst', added.viewId, 'running'), s('draft', edit.viewId, 'needs_input'), s('otherDraft', other.viewId, 'running')]
  const stop = vi.fn(async () => {})
  service.setAgentPort({ list: () => sessions, stop, create: vi.fn(), getConversation: vi.fn(), rename: vi.fn() } as never)
  service.setVisible({ ref: { projectId, viewId: added.viewId }, visible: false })
  await service.deleteInstance({ projectId, viewId: added.viewId })
  console.log('F3r stopped:', JSON.stringify(stop.mock.calls.map(c => c[0]).sort()))
})

it('R1 upgrade draft edited in its design conversation is replaced on the next upgrade preview', async () => {
  setup()
  bumpTemplate('0.0.1'); const added = service.addTemplate({ projectId, templateId: 'product-selection' })
  bumpTemplate('0.0.2') // upgrade available
  const upgrade = service.createDraft({ projectId, source: 'template', instanceId: added.id, templateId: 'product-selection' })
  writeFileSync(join(root, upgrade.directory, 'index.html'), readFileSync(join(root, upgrade.directory, 'index.html'), 'utf8') + '\n<!-- AI customisation -->')
  const again = service.createDraft({ projectId, source: 'template', instanceId: added.id, templateId: 'product-selection' })
  console.log('R1 same draft reopened:', again.id === upgrade.id, '| edited draft still listed:', service.list(projectId).some(e => e.viewId === upgrade.viewId))
})

it('R2 legacy flagged draft when the Project folder check fails keeps flag and retries', async () => {
  setup()
  const d = service.createDraft({ projectId, source: 'template' }); const s = await service.getSnapshot(ref(d))
  const inst = service.applyDraft({ ref: ref(d), expectedPackageRevision: s.page!.packageRevision })
  const legacy = service.createDraft({ projectId, source: 'ai', instanceId: inst.id })
  database.db.prepare('UPDATE workbench_drafts SET legacy_applied=1').run()
  const db = database.db, prepare = db.prepare.bind(db); let fail = true
  ;(db as any).prepare = (sql: string) => { if (fail && sql.startsWith('DELETE FROM workbench_drafts WHERE id=?')) throw new Error('boom'); return prepare(sql) }
  service.close(projectId)
  const listed1 = service.list(projectId).some(e => e.viewId === legacy.viewId)
  fail = false; (db as any).prepare = prepare
  const flag1 = db.prepare('SELECT legacy_applied f FROM workbench_drafts WHERE id=?').get(legacy.id)?.f
  service.close(projectId)
  const listed2 = service.list(projectId).some(e => e.viewId === legacy.viewId)
  console.log('R2 after failed check listed:', listed1, 'flag kept:', flag1, '| after retry listed:', listed2)
})
