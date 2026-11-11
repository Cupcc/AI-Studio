import { fileURLToPath } from 'node:url'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { PRESET_WORKBENCHES } from '@shared/workbench/presets'
import type { DraftWorkbenchRef, InstanceWorkbenchRef, CustomDraftEntry, WorkbenchChange } from '@shared/workbench/types'
import { openDatabase, type StudioDatabase } from '../database/database'
import { migrations } from '../database/migrations'
import { createProjectService } from '../project/project-service'
import { WorkbenchService } from './workbench-service'

let directory: string, root: string, projectId: string, otherId: string, database: StudioDatabase, service: WorkbenchService
const changes: WorkbenchChange[] = []
function start() {
  database = openDatabase({ userDataDir: join(directory, 'data'), migrations })
  const projects = createProjectService(() => database.db)
  service = new WorkbenchService({ database: () => database.db, presetRoot: fileURLToPath(new URL('../../../../out/workbench-packages/', import.meta.url)), projectPath: id => {
    const project = projects.getProject(id)
    if (!project) throw new Error('Unknown Project')
    return project.canonicalPath
  }, settleMs: 5, changed: change => changes.push(change) })
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'workbench-host-')); root = join(directory, 'project')
  mkdirSync(root); mkdirSync(join(directory, 'other')); start()
  const projects = createProjectService(() => database.db)
  const opened = projects.openPath(root), other = projects.openPath(join(directory, 'other'))
  if (!opened.ok || !other.ok) throw new Error('fixture failed')
  projectId = opened.project.id; otherId = other.project.id; changes.length = 0
})
afterEach(() => { service.dispose(); database.close(); rmSync(directory, { recursive: true, force: true }) })
const presetRef = () => ({ projectId, viewId: 'architecture' } as const)
const draftRef = (draft: CustomDraftEntry): DraftWorkbenchRef => ({ projectId: draft.projectId, viewId: draft.viewId })
function writeKnowledge(summary: string) {
  const folder = join(root, '.ai-studio/knowledge'); mkdirSync(folder, { recursive: true })
  const path = join(folder, 'architecture.json')
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, viewId: 'architecture', data: { summary } }))
  return path
}
function latestKnowledge() {
  const change = changes.findLast(change => change.kind === 'snapshot' && change.snapshot.ref.projectId === projectId && change.snapshot.ref.viewId === 'architecture')
  return change?.kind === 'snapshot' ? change.snapshot.page?.resources?.knowledge : undefined
}
async function install() {
  const draft = service.createDraft({ projectId, source: 'template' })
  const snapshot = await service.getSnapshot(draftRef(draft))
  if (!snapshot.page) throw new Error('fixture package failed')
  const instance = service.applyDraft({ ref: draftRef(draft), expectedPackageRevision: snapshot.page.packageRevision })
  const ref: InstanceWorkbenchRef = { projectId, viewId: instance.viewId }
  return { draft, instance, ref }
}
it('lists presets and custom pages in one catalog with explicit management and stable identities', async () => {
  expect(service.list(projectId)).toEqual(PRESET_WORKBENCHES)
  expect((await service.getSnapshot(presetRef())).page?.resources?.knowledge?.status).toBe('empty')
  service.buildContext(presetRef())
  expect(existsSync(join(root, '.ai-studio'))).toBe(false)
  const { draft, instance } = await install()
  const catalog = service.list(projectId)
  expect(catalog).toHaveLength(7)
  expect(catalog.slice(0, 5)).toEqual(PRESET_WORKBENCHES)
  expect(catalog.find(entry => entry.viewId === instance.viewId)).toMatchObject({ kind: 'instance', origin: 'custom', editable: true, canDisable: true })
  expect(catalog.find(entry => entry.viewId === draft.viewId)).toMatchObject({ kind: 'draft', origin: 'custom', canDisable: false })
  expect(database.db.prepare('SELECT COUNT(*) AS count FROM workbench_instances').get()?.count).toBe(1)
})
it('publishes last-good Knowledge resources through the same host event and reuses the observed revision on reads', async () => {
  const file = writeKnowledge('First architecture')
  const first = await service.getSnapshot(presetRef())
  expect(first).toMatchObject({ status: 'ready', page: { resources: { knowledge: { status: 'ready', snapshot: { knowledge: { data: { summary: 'First architecture' } } } } } } })
  expect(changes.some(change => change.kind === 'snapshot' && change.snapshot === first)).toBe(true)
  writeFileSync(file, '{')
  const bad = await service.getSnapshot(presetRef())
  expect(bad.page?.resources?.knowledge?.status).toBe('error'); expect(bad.page?.resources?.knowledge?.snapshot).toBe(first.page?.resources?.knowledge?.snapshot)
  expect(bad.revision).toBeGreaterThan(first.revision)
  expect(changes.filter(change => change.kind === 'catalog')).toEqual([])
  writeKnowledge('Recovered architecture')
  const recovered = await service.getSnapshot(presetRef())
  expect(recovered).toMatchObject({ status: 'ready', page: { resources: { knowledge: { status: 'ready', snapshot: { knowledge: { data: { summary: 'Recovered architecture' } } } } } } })
  expect(recovered.page?.resources?.knowledge).toBe(latestKnowledge())
})
it('watches external files, releases Project resources, rejects late reads and reloads on reopen', async () => {
  await service.getSnapshot(presetRef())
  writeKnowledge('Written by CLI')
  await expect.poll(() => latestKnowledge()?.snapshot?.knowledge?.data.summary).toBe('Written by CLI')
  const pending = service.getSnapshot(presetRef())
  service.close(projectId)
  await expect(pending).rejects.toThrow('closed')
  const count = changes.length
  writeKnowledge('Written while closed')
  await new Promise(resolve => setTimeout(resolve, 35))
  expect(changes).toHaveLength(count)
  expect(await service.getSnapshot(presetRef())).toMatchObject({ page: { resources: { knowledge: { snapshot: { knowledge: { data: { summary: 'Written while closed' } } } } } } })
  expect(await service.getSnapshot({ projectId: otherId, viewId: 'architecture' })).toMatchObject({ status: 'ready', page: { resources: { knowledge: { status: 'empty', snapshot: { knowledge: null } } } } })
})
it('uses one host for package draft isolation, CAS, instance edits, project boundaries and restart recovery', async () => {
  const { draft, instance, ref } = await install()
  service.updateState({ ref, state: { note: 'saved' }, expectedRevision: 0 })
  expect(() => service.updateState({ ref, state: {}, expectedRevision: 0 })).toThrow('内容已变化')
  expect(() => service.updateState({ ref: { ...ref, projectId: otherId }, state: {}, expectedRevision: 1 })).toThrow('当前 Project')
  const edit = service.createDraft({ projectId, source: 'ai', instanceId: instance.id })
  service.updateState({ ref: draftRef(edit), state: { note: 'preview only' }, expectedRevision: 0 })
  const manifestPath = join(root, edit.directory, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, title: 'Revised notebook', version: '1.1.0' }))
  const preview = await service.getSnapshot(draftRef(edit))
  if (!preview.page) throw new Error('fixture package failed')
  service.updateState({ ref, state: { note: 'live state' }, expectedRevision: 1 })
  service.applyDraft({ ref: draftRef(edit), expectedPackageRevision: preview.page.packageRevision })
  expect(await service.getSnapshot(ref)).toMatchObject({ page: { state: { note: 'live state' }, stateRevision: 2, manifest: { title: 'Revised notebook' } } })
  expect(await service.getSnapshot(draftRef(draft))).toMatchObject({ page: { state: {} } })
  service.dispose(); database.close(); start()
  expect(await service.getSnapshot(ref)).toMatchObject({ page: { state: { note: 'live state' }, stateRevision: 2 } })
  expect(service.list(projectId).filter(entry => entry.kind === 'instance')).toHaveLength(6)
})
it('returns package diagnostics in the common snapshot, requires a fresh preview and preserves disabled content', async () => {
  const draft = service.createDraft({ projectId, source: 'template' })
  const first = await service.getSnapshot(draftRef(draft))
  if (!first.page) throw new Error('fixture package failed')
  writeFileSync(join(root, draft.directory, 'index.html'), '<html><body>Changed page</body></html>')
  expect(() => service.applyDraft({ ref: draftRef(draft), expectedPackageRevision: first.page!.packageRevision })).toThrow('刷新预览')
  writeFileSync(join(root, draft.directory, 'manifest.json'), '{')
  expect(await service.getSnapshot(draftRef(draft))).toMatchObject({ status: 'error', page: null, error: expect.stringContaining('不是有效 JSON') })
  const { ref } = await install()
  service.updateState({ ref, state: { count: 8 }, expectedRevision: 0 })
  service.setEnabled({ ref, enabled: false })
  const disabled = await service.getSnapshot(ref)
  expect(disabled).toMatchObject({ status: 'disabled', page: { state: { count: 8 }, enabled: false } })
  if (!disabled.page) throw new Error('fixture package failed')
  expect((await service.handleRequest(new Request(disabled.page.pageUrl))).status).toBe(403)
  expect(() => service.updateState({ ref, state: {}, expectedRevision: 1 })).toThrow('停用')
  service.setEnabled({ ref, enabled: true })
  expect(await service.getSnapshot(ref)).toMatchObject({ status: 'ready', page: { state: { count: 8 } } })
})
it('provides all contexts through one entry and initializes preset helpers only at the attached-send boundary', async () => {
  const context = service.buildContext(presetRef())
  expect(context).toMatchObject({ originViewId: 'architecture', text: expect.stringContaining('Current Workbench: Architecture') })
  expect(existsSync(join(root, '.ai-studio'))).toBe(false)
  service.buildContext(presetRef(), true)
  expect(readFileSync(join(root, '.ai-studio/.gitignore'), 'utf8')).toBe('*\n')
  expect(existsSync(join(root, '.ai-studio/knowledge/architecture.json'))).toBe(false)
  const { draft, ref } = await install()
  writeFileSync(join(root, draft.directory, 'manifest.json'), '{')
  expect(service.buildContext(draftRef(draft))).toMatchObject({ paths: expect.arrayContaining([draft.directory]), text: expect.stringContaining('刷新预览') })
  expect(service.buildContext(ref)).toMatchObject({ paths: [], text: expect.stringContaining('不是页面结构编辑') })
})
it('serves every preset as the same ordinary manifest, HTML, script, stylesheet and injected SDK package', async () => {
  for (const entry of PRESET_WORKBENCHES) {
    const snapshot = await service.getSnapshot({ projectId, viewId: entry.viewId })
    expect(snapshot).not.toHaveProperty('runtime')
    expect(snapshot).toMatchObject({ status: 'ready', page: { manifest: { pluginId: entry.pluginId, title: entry.title, entry: 'index.html', knowledgeViewId: entry.viewId }, state: {}, stateRevision: 0 } })
    if (!snapshot.page) throw new Error('fixture package failed')
    const response = await service.handleRequest(new Request(snapshot.page.pageUrl))
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(html).toContain('__studio_sdk.js')
    expect(html).toContain('page.js')
    const base = snapshot.page.pageUrl.slice(0, snapshot.page.pageUrl.lastIndexOf('/') + 1)
    for (const asset of ['manifest.json', 'page.js', 'renderer.js', 'style.css', '__studio_sdk.js']) {
      const result = await service.handleRequest(new Request(base + asset))
      expect(result.status, asset).toBe(200)
    }
  }
  expect(existsSync(join(root, '.ai-studio'))).toBe(false)
  expect(database.db.prepare('SELECT COUNT(*) AS count FROM workbench_instances').get()?.count).toBe(0)
})
it('loads a copied preset as an ordinary custom draft and instance with identical resources, hash and context rules', async () => {
  const file = writeKnowledge('Shared source')
  const original = await service.getSnapshot(presetRef())
  const draft = service.createDraft({ projectId, source: 'template' })
  cpSync(fileURLToPath(new URL('../../../../out/workbench-packages/architecture/', import.meta.url)), join(root, draft.directory), { recursive: true })
  const preview = await service.getSnapshot(draftRef(draft))
  expect(preview.page?.packageRevision).toBe(original.page?.packageRevision)
  expect(preview.page?.resources?.knowledge?.snapshot).toBe(original.page?.resources?.knowledge?.snapshot)
  if (!preview.page) throw new Error('fixture package failed')
  expect(service.buildContext(draftRef(draft)).paths).toContain(draft.directory)
  const instance = service.applyDraft({ ref: draftRef(draft), expectedPackageRevision: preview.page.packageRevision })
  const ref: InstanceWorkbenchRef = { projectId, viewId: instance.viewId }
  const live = await service.getSnapshot(ref)
  expect(service.buildContext(ref)).toMatchObject({ originViewId: instance.viewId, paths: expect.arrayContaining(['.ai-studio/knowledge/architecture.json']) })
  expect(existsSync(join(root, '.ai-studio/schema'))).toBe(false)
  expect(() => service.updateState({ ref, state: {}, expectedRevision: 0 })).toThrow('state.write')
  const pageUrl = live.page?.pageUrl
  writeKnowledge('Updated external Knowledge')
  const latest = () => {
    const change = changes.findLast(change => change.kind === 'snapshot' && change.snapshot.ref.viewId === ref.viewId)
    return change?.kind === 'snapshot' ? change.snapshot : undefined
  }
  await expect.poll(() => latest()?.page?.resources?.knowledge?.snapshot?.knowledge?.data.summary).toBe('Updated external Knowledge')
  expect(latest()?.page?.pageUrl).toBe(pageUrl)
  writeFileSync(file, '{')
  await expect.poll(() => latest()?.page?.resources?.knowledge?.status).toBe('error')
  expect(latest()).toMatchObject({ status: 'ready', error: null, page: { resources: { knowledge: { status: 'error', snapshot: { knowledge: { data: { summary: 'Updated external Knowledge' } } } } } } })
  expect(latest()?.page?.pageUrl).toBe(pageUrl)
  writeKnowledge('Recovered external Knowledge')
  await expect.poll(() => latest()?.page?.resources?.knowledge?.snapshot?.knowledge?.data.summary).toBe('Recovered external Knowledge')
  service.buildContext(ref, true)
  expect(existsSync(join(root, '.ai-studio/schema/knowledge.schema.json'))).toBe(true)
})
it('does not let an older asynchronous resource read replace a newer package observation', async () => {
  writeKnowledge('Architecture source')
  const draft = service.createDraft({ projectId, source: 'template' })
  cpSync(fileURLToPath(new URL('../../../../out/workbench-packages/architecture/', import.meta.url)), join(root, draft.directory), { recursive: true })
  const older = service.getSnapshot(draftRef(draft))
  const path = join(root, draft.directory, 'manifest.json')
  writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), title: 'Newer package observation' }))
  const newer = service.getSnapshot(draftRef(draft))
  const [one, two] = await Promise.all([older, newer])
  expect(one.page?.manifest.title).toBe('Newer package observation')
  expect(one).toBe(two)
  expect(one.page?.resources?.knowledge?.snapshot?.knowledge?.data.summary).toBe('Architecture source')
})
