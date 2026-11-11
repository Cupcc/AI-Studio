import type { DatabaseSync } from 'node:sqlite'
import { PRESET_WORKBENCHES, isPresetWorkbenchId, presetWorkbench } from '@shared/workbench/presets'
import { workbenchTarget, type DraftWorkbenchRef, type InstanceWorkbenchRef, type JsonValue, type CustomDraftEntry, type CustomInstanceEntry, type CustomWorkbenchEntry, type CustomWorkbenchRef, type WorkbenchCatalog, type WorkbenchChange, type WorkbenchContext, type WorkbenchDraft, type WorkbenchEntry, type WorkbenchInstance, type WorkbenchId, type WorkbenchPageSnapshot, type WorkbenchRef, type WorkbenchSnapshot, type WorkbenchTarget } from '@shared/workbench/types'
import type { ViewState } from '@shared/project-view/types'
import { KnowledgeResources } from './knowledge-resources'
import { PackageRuntime } from './package-runtime'

export interface WorkbenchOptions {
  database(): DatabaseSync
  projectPath(projectId: string): string
  presetRoot: string
  changed(change: WorkbenchChange): void
  settleMs?: number
}
function draftEntry(draft: WorkbenchDraft): CustomDraftEntry {
  return { ...draft, viewId: `workbench-draft:${draft.id}`, origin: 'custom', kind: 'draft', icon: 'pencil', editable: true, canDisable: false }
}
function instanceEntry(instance: WorkbenchInstance): CustomInstanceEntry {
  return { ...instance, viewId: `workbench:${instance.id}`, origin: 'custom', kind: 'instance', icon: 'preview', editable: true, canDisable: true }
}

/** Every source resolves to an ordinary package; Knowledge is a declared page resource. */
export class WorkbenchService {
  private readonly knowledge: KnowledgeResources
  private readonly packages: PackageRuntime
  private readonly projects = new Set<string>()
  private readonly snapshots = new Map<string, WorkbenchSnapshot>()
  private readonly knowledgeStates = new Map<string, ViewState>()
  private revision = 0

  constructor(private readonly options: WorkbenchOptions) {
    this.knowledge = new KnowledgeResources({ projectPath: options.projectPath, settleMs: options.settleMs, changed: state => this.knowledgeChanged(state) })
    this.packages = new PackageRuntime({ database: options.database, projectPath: options.projectPath, presetRoot: options.presetRoot, changed: (target, catalog, page) => this.packageChanged(target, catalog, page) })
  }
  private key(ref: WorkbenchRef): string { return `${ref.projectId}\0${ref.viewId}` }
  private titled<T extends WorkbenchEntry>(projectId: string, entry: T): T {
    const row = this.options.database().prepare('SELECT title FROM workbench_navigation WHERE project_id=? AND view_id=?').get(projectId, entry.viewId)
    return row && typeof row.title === 'string' ? { ...entry, title: row.title } : entry
  }
  private knowledgeKey(projectId: string, viewId: string): string { return `${projectId}\0${viewId}` }
  private remember(snapshot: WorkbenchSnapshot, publish: boolean): WorkbenchSnapshot {
    this.snapshots.set(this.key(snapshot.ref), snapshot)
    if (publish) this.options.changed({ kind: 'snapshot', snapshot })
    return snapshot
  }
  private knowledgeChanged(state: ViewState): void {
    if (!this.projects.has(state.projectId)) return
    this.knowledgeStates.set(this.knowledgeKey(state.projectId, state.viewId), state)
    for (const current of this.snapshots.values()) {
      if (current.ref.projectId !== state.projectId || !current.page || current.page.manifest.knowledgeViewId !== state.viewId) continue
      const page = { ...current.page, resources: { ...current.page.resources, knowledge: state } }
      this.remember({ ...current, page, revision: ++this.revision }, true)
    }
  }
  private customEntry(target: WorkbenchTarget): CustomWorkbenchEntry {
    const value = this.packages.describe(target)
    return this.titled(target.projectId, value.kind === 'draft' ? draftEntry(value.draft) : instanceEntry(value.instance))
  }
  private entry(ref: WorkbenchRef): WorkbenchEntry {
    return isPresetWorkbenchId(ref.viewId) ? this.titled(ref.projectId, presetWorkbench(ref.viewId)) : this.customEntry(workbenchTarget(ref.projectId, ref.viewId))
  }
  private packageSnapshot(ref: WorkbenchRef, page?: WorkbenchPageSnapshot): WorkbenchSnapshot {
    const entry = this.entry(ref), revision = ++this.revision
    try {
      const current = page ?? this.packages.getSnapshot(workbenchTarget(ref.projectId, ref.viewId))
      const knowledgeViewId = current.manifest.knowledgeViewId
      const knowledge = knowledgeViewId ? this.knowledgeStates.get(this.knowledgeKey(ref.projectId, knowledgeViewId)) : undefined
      const enriched = knowledge ? { ...current, resources: { ...current.resources, knowledge } } : current
      return { ref, entry, revision, status: current.enabled ? 'ready' : 'disabled', error: null, page: enriched }
    } catch (error) {
      return { ref, entry, revision, status: 'error', error: error instanceof Error ? error.message : '工作台加载失败', page: null }
    }
  }
  private packageChanged(target: WorkbenchTarget, catalog: boolean, page?: WorkbenchPageSnapshot): void {
    if (!this.projects.has(target.projectId)) return
    if (catalog) { this.seedNavigation(target.projectId); this.options.changed({ kind: 'catalog', projectId: target.projectId }) }
    const viewId = target.kind === 'draft' ? `workbench-draft:${target.id}` as const : `workbench:${target.id}` as const
    this.remember(this.packageSnapshot({ projectId: target.projectId, viewId }, page), true)
  }
  open(projectId: string): void {
    if (this.projects.has(projectId)) return
    this.options.projectPath(projectId)
    this.projects.add(projectId)
    try { this.knowledge.open(projectId) }
    catch (error) { this.projects.delete(projectId); throw error }
  }
  private entries(projectId: string): WorkbenchEntry[] {
    this.open(projectId)
    const custom = this.packages.list(projectId)
    return [
      ...PRESET_WORKBENCHES,
      ...custom.instances.map(instanceEntry),
      ...custom.drafts.map(draftEntry)
    ]
  }
  private navigation(projectId: string) {
    return new Map(this.options.database().prepare('SELECT * FROM workbench_navigation WHERE project_id=?').all(projectId).map(row => {
      if (typeof row.view_id !== 'string' || typeof row.position !== 'number' || (row.hidden !== 0 && row.hidden !== 1) || (row.title !== null && typeof row.title !== 'string')) throw new Error('工作台导航记录损坏')
      return [row.view_id, { position: row.position, hidden: row.hidden === 1, title: row.title }] as const
    }))
  }
  private catalog(projectId: string, hidden: boolean): WorkbenchCatalog {
    const entries = this.entries(projectId), preferences = this.navigation(projectId)
    const end = Math.max(-1, ...[...preferences.values()].map(item => item.position)) + 1
    return entries.map((entry, index) => {
      const preference = preferences.get(entry.viewId)
      return { entry: preference?.title ? { ...entry, title: preference.title } : entry, hidden: preference?.hidden ?? false, position: preference?.position ?? end + index }
    }).filter(item => item.hidden === hidden).sort((a, b) => a.position - b.position).map(item => item.entry)
  }
  list(projectId: string): WorkbenchCatalog { return this.catalog(projectId, false) }
  listRemoved(projectId: string): WorkbenchCatalog { return this.catalog(projectId, true) }
  private seedNavigation(projectId: string): void {
    const entries = this.entries(projectId), preferences = this.navigation(projectId)
    let position = Math.max(-1, ...[...preferences.values()].map(item => item.position)) + 1
    const insert = this.options.database().prepare('INSERT OR IGNORE INTO workbench_navigation(project_id,view_id,position) VALUES (?,?,?)')
    for (const entry of entries) if (!preferences.has(entry.viewId)) insert.run(projectId, entry.viewId, position++)
  }
  private requireEntry(ref: WorkbenchRef): WorkbenchEntry {
    const entry = this.entries(ref.projectId).find(entry => entry.viewId === ref.viewId)
    if (!entry) throw new Error('找不到当前 Project 的工作台，请刷新列表')
    return entry
  }
  private catalogChanged(projectId: string): WorkbenchCatalog {
    this.options.changed({ kind: 'catalog', projectId })
    return this.list(projectId)
  }
  rename({ ref, title }: { ref: WorkbenchRef; title: string }): WorkbenchCatalog {
    this.requireEntry(ref)
    const name = title.trim()
    if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('名称须为 1–100 个字符，不能包含换行或控制字符')
    this.seedNavigation(ref.projectId)
    this.options.database().prepare('UPDATE workbench_navigation SET title=? WHERE project_id=? AND view_id=?').run(name, ref.projectId, ref.viewId)
    const snapshot = this.snapshots.get(this.key(ref))
    if (snapshot) {
      this.remember({ ...snapshot, entry: this.titled(ref.projectId, snapshot.entry), revision: ++this.revision }, true)
    }
    return this.catalogChanged(ref.projectId)
  }
  setVisible({ ref, visible }: { ref: WorkbenchRef; visible: boolean }): WorkbenchCatalog {
    if (this.requireEntry(ref).kind === 'draft') throw new Error('设计草稿请使用删除草稿')
    this.seedNavigation(ref.projectId)
    const preferences = this.navigation(ref.projectId), current = preferences.get(ref.viewId)!
    if (current.hidden === !visible) return this.list(ref.projectId)
    const position = visible ? Math.max(-1, ...[...preferences.values()].map(item => item.position)) + 1 : current.position
    this.options.database().prepare('UPDATE workbench_navigation SET hidden=?,position=? WHERE project_id=? AND view_id=?').run(visible ? 0 : 1, position, ref.projectId, ref.viewId)
    return this.catalogChanged(ref.projectId)
  }
  move({ ref, before }: { ref: WorkbenchRef; before: WorkbenchId | null }): WorkbenchCatalog {
    const catalog = this.list(ref.projectId), entry = catalog.find(entry => entry.viewId === ref.viewId)
    if (!entry || (before !== null && !catalog.some(entry => entry.viewId === before))) throw new Error('工作台列表已变化，请刷新后重试')
    if (before === ref.viewId) return catalog
    const ordered = catalog.filter(entry => entry.viewId !== ref.viewId)
    ordered.splice(before === null ? ordered.length : ordered.findIndex(entry => entry.viewId === before), 0, entry)
    const db = this.options.database()
    db.exec('SAVEPOINT workbench_move')
    try {
      this.seedNavigation(ref.projectId)
      const update = db.prepare('UPDATE workbench_navigation SET position=? WHERE project_id=? AND view_id=?')
      ordered.forEach((entry, index) => update.run(index, ref.projectId, entry.viewId))
      db.exec('RELEASE workbench_move')
    } catch (error) { db.exec('ROLLBACK TO workbench_move; RELEASE workbench_move'); throw error }
    return this.catalogChanged(ref.projectId)
  }
  deleteDraft(ref: DraftWorkbenchRef): WorkbenchCatalog {
    const target = workbenchTarget(ref.projectId, ref.viewId)
    this.packages.deleteDraft(ref.projectId, target.id)
    this.options.database().prepare('DELETE FROM workbench_navigation WHERE project_id=? AND view_id=?').run(ref.projectId, ref.viewId)
    this.snapshots.delete(this.key(ref))
    return this.catalogChanged(ref.projectId)
  }
  async getSnapshot(ref: WorkbenchRef): Promise<WorkbenchSnapshot> {
    this.open(ref.projectId)
    // Observe the package before waiting for resources, so an old completion cannot acquire a newer revision.
    const observed = this.remember(this.packageSnapshot(ref), false)
    const knowledgeViewId = observed.page?.manifest.knowledgeViewId
    if (!knowledgeViewId) return observed
    await this.knowledge.getSnapshot(ref.projectId, knowledgeViewId)
    const current = this.snapshots.get(this.key(ref))
    if (!current) throw new Error('Project closed during workbench read')
    return current
  }
  buildContext(ref: WorkbenchRef, initialize = false): WorkbenchContext {
    this.options.projectPath(ref.projectId)
    const target = workbenchTarget(ref.projectId, ref.viewId)
    if (target.kind === 'draft') return this.packages.buildContext(ref.projectId, ref.viewId)
    const page = this.packages.getSnapshot(target)
    if (page.manifest.knowledgeViewId) {
      const context = this.knowledge.buildContext(ref.projectId, page.manifest.knowledgeViewId, initialize)
      return { ...context, originViewId: ref.viewId, text: context.text.replace(/^Current Workbench:[^\n]+/, `Current Workbench: ${page.manifest.title}`) }
    }
    return this.packages.buildContext(ref.projectId, ref.viewId)
  }
  createDraft(request: { projectId: string; source: 'template' | 'ai'; instanceId?: string }): CustomDraftEntry {
    this.open(request.projectId)
    this.seedNavigation(request.projectId)
    return draftEntry(this.packages.createDraft(request.projectId, request.source, request.instanceId))
  }
  applyDraft(request: { ref: DraftWorkbenchRef; expectedPackageRevision: string }): CustomInstanceEntry {
    this.open(request.ref.projectId)
    this.seedNavigation(request.ref.projectId)
    const target = workbenchTarget(request.ref.projectId, request.ref.viewId)
    return instanceEntry(this.packages.applyDraft(target.projectId, target.id, request.expectedPackageRevision))
  }
  updateState(request: { ref: CustomWorkbenchRef; state: JsonValue; expectedRevision: number }): WorkbenchSnapshot {
    this.open(request.ref.projectId)
    this.packages.updateState(workbenchTarget(request.ref.projectId, request.ref.viewId), request.state, request.expectedRevision)
    const snapshot = this.snapshots.get(this.key(request.ref))
    if (!snapshot) throw new Error('工作台状态未发布')
    return snapshot
  }
  setEnabled(request: { ref: InstanceWorkbenchRef; enabled: boolean }): CustomInstanceEntry {
    this.open(request.ref.projectId)
    const target = workbenchTarget(request.ref.projectId, request.ref.viewId)
    return instanceEntry(this.packages.setEnabled(target.projectId, target.id, request.enabled))
  }
  refresh(projectId: string): Promise<void> { return this.knowledge.refresh(projectId) }
  refreshAll(): void { this.knowledge.refreshAll() }
  close(projectId: string): void {
    this.projects.delete(projectId)
    this.knowledge.close(projectId)
    for (const [key, snapshot] of this.snapshots) if (snapshot.ref.projectId === projectId) this.snapshots.delete(key)
    for (const [key, state] of this.knowledgeStates) if (state.projectId === projectId) this.knowledgeStates.delete(key)
  }
  handleRequest(request: Request): Promise<Response> { return this.packages.handleRequest(request) }
  dispose(): void {
    for (const projectId of this.projects) this.close(projectId)
    this.packages.dispose()
  }
}
