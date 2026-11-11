import type { DatabaseSync } from 'node:sqlite'
import { PRESET_WORKBENCHES, isPresetWorkbenchId, presetWorkbench } from '@shared/workbench/presets'
import { workbenchTarget, type DraftWorkbenchRef, type InstanceWorkbenchRef, type JsonValue, type CustomDraftEntry, type CustomInstanceEntry, type CustomWorkbenchEntry, type CustomWorkbenchRef, type WorkbenchCatalog, type WorkbenchChange, type WorkbenchContext, type WorkbenchDraft, type WorkbenchEntry, type WorkbenchInstance, type WorkbenchPageSnapshot, type WorkbenchRef, type WorkbenchSnapshot, type WorkbenchTarget } from '@shared/workbench/types'
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
    return value.kind === 'draft' ? draftEntry(value.draft) : instanceEntry(value.instance)
  }
  private entry(ref: WorkbenchRef): WorkbenchEntry {
    return isPresetWorkbenchId(ref.viewId) ? presetWorkbench(ref.viewId) : this.customEntry(workbenchTarget(ref.projectId, ref.viewId))
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
    if (catalog) this.options.changed({ kind: 'catalog', projectId: target.projectId })
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
  list(projectId: string): WorkbenchCatalog {
    this.open(projectId)
    const custom = this.packages.list(projectId)
    return [...PRESET_WORKBENCHES, ...custom.instances.map(instanceEntry), ...custom.drafts.map(draftEntry)]
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
    return draftEntry(this.packages.createDraft(request.projectId, request.source, request.instanceId))
  }
  applyDraft(request: { ref: DraftWorkbenchRef; expectedPackageRevision: string }): CustomInstanceEntry {
    this.open(request.ref.projectId)
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
