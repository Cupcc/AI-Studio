import type { WorkbenchRef, WorkbenchSnapshot } from '@shared/workbench/types'
import { useProjectShell } from '../project/store'
import { openWorkbenchDraft } from './actions'
import { describeWorkbenchError, workbenchApi } from './api'
import { appendWorkbenchDraft } from './conversation'
import { initialHost, useWorkbenches, workbenchGeneration, workbenchKey, type HostPatch, type WorkbenchHost } from './store'

export type HostStatus = { kind: 'ready' | 'loading' | 'waiting' | 'error' | 'disabled'; text: string; visible: boolean }

/** Derived view of one workbench, shared by the header and the page body. */
export function deriveHost(snapshot: WorkbenchSnapshot | undefined, loading: boolean, readError: string | null, host: WorkbenchHost) {
  const page = snapshot?.page ?? null
  const pageReady = host.pageStatus.kind === 'ready' && host.connectedRevision === page?.packageRevision
  const pageError = host.pageStatus.kind === 'error' && host.connectedRevision === page?.packageRevision ? host.pageStatus.message : null
  const error = host.actionError || snapshot?.error || null
  const status: HostStatus = page?.enabled === false ? { kind: 'disabled', text: '已停用', visible: true }
    : loading ? { kind: 'loading', text: '正在检查包…', visible: true }
    : error || readError ? { kind: 'error', text: '无法预览工作台', visible: false }
    : pageError ? { kind: 'error', text: '页面未正常运行', visible: false }
    : !page ? { kind: 'waiting', text: '等待页面文件', visible: true }
    : host.saveFailed ? { kind: 'error', text: host.saveStatus, visible: true }
    : !pageReady ? { kind: 'loading', text: '正在加载页面…', visible: true }
    : { kind: 'ready', text: `运行正常 · ${host.saveStatus}`, visible: false }
  return { snapshot, page, loading, host, pageReady, pageError, error, status }
}
export type HostView = ReturnType<typeof deriveHost>

export function useWorkbenchHost(ref: WorkbenchRef): HostView {
  const key = workbenchKey(ref)
  const snapshot = useWorkbenches(s => s.snapshots[key]), loading = useWorkbenches(s => !!s.loading[key])
  const readError = useWorkbenches(s => s.snapshotErrors[key] ?? null), host = useWorkbenches(s => s.hosts[key])
  return deriveHost(snapshot, loading, readError, host ?? initialHost)
}

function currentHost(ref: WorkbenchRef): HostView {
  const state = useWorkbenches.getState(), key = workbenchKey(ref)
  return deriveHost(state.snapshots[key], !!state.loading[key], state.snapshotErrors[key] ?? null, state.hosts[key] ?? initialHost)
}

function liveness(ref: WorkbenchRef) {
  const generation = workbenchGeneration(ref.projectId)
  const live = () => workbenchGeneration(ref.projectId) === generation
  return { live, update: (patch: HostPatch) => { if (live()) useWorkbenches.getState().updateHost(ref, patch) } }
}

async function run(ref: WorkbenchRef, task: (live: () => boolean) => Promise<unknown>): Promise<void> {
  const { live, update } = liveness(ref)
  update({ pending: true, actionError: null })
  try { await task(live) } catch (error) { update({ actionError: describeWorkbenchError(error) }) } finally { update({ pending: false }) }
}

/** A newly mounted or re-shown page has not connected yet and reads the saved state again. */
export function resetPage(ref: WorkbenchRef): void {
  useWorkbenches.getState().updateHost(ref, { pageStatus: { kind: 'loading' }, connectedRevision: null, saveStatus: '已读取保存状态', saveFailed: false })
}

export async function refreshWorkbench(ref: WorkbenchRef): Promise<void> {
  const { update } = liveness(ref)
  update({ actionError: null, pageStatus: { kind: 'loading' }, connectedRevision: null })
  await useWorkbenches.getState().loadSnapshot(ref)
  update(host => ({ reload: host.reload + 1, saveStatus: '已读取保存状态', saveFailed: false }))
}

export function applyWorkbenchDraft(ref: WorkbenchRef): Promise<void> | undefined {
  const { snapshot, page, pageReady } = currentHost(ref), entry = snapshot?.entry
  if (!page || !pageReady || entry?.kind !== 'draft') return
  return run(ref, async live => {
    const instance = await workbenchApi().applyDraft({ ref: { projectId: ref.projectId, viewId: entry.viewId }, expectedPackageRevision: page.packageRevision })
    // The draft closes on apply, so hand the view over before the refreshed list drops it.
    if (live()) useProjectShell.getState().enterView(ref.projectId, instance.viewId)
    await useWorkbenches.getState().loadCatalog(ref.projectId)
  })
}

export function editWorkbench(ref: WorkbenchRef): Promise<void> | undefined {
  const entry = currentHost(ref).snapshot?.entry
  if (entry?.origin !== 'custom' || entry.kind !== 'instance') return
  return run(ref, () => openWorkbenchDraft(ref.projectId, 'ai', entry.id))
}

export function upgradeWorkbench(ref: WorkbenchRef): Promise<void> | undefined {
  const entry = currentHost(ref).snapshot?.entry
  if (entry?.origin !== 'custom' || entry.kind !== 'instance') return
  return run(ref, () => openWorkbenchDraft(ref.projectId, 'template', entry.id, 'product-selection'))
}

export function toggleWorkbench(ref: WorkbenchRef): Promise<void> | undefined {
  const { snapshot, page } = currentHost(ref), entry = snapshot?.entry
  if (!page || entry?.origin !== 'custom' || entry.kind !== 'instance') return
  return run(ref, async () => {
    await workbenchApi().setEnabled({ ref: { projectId: ref.projectId, viewId: entry.viewId }, enabled: !page.enabled })
    await refreshWorkbench(ref)
  })
}

export async function explainWorkbenchError(ref: WorkbenchRef): Promise<void> {
  const { error, pageError } = currentHost(ref), { live, update } = liveness(ref)
  try { await appendWorkbenchDraft(ref, `工作台预览失败，请检查开发说明和草稿文件并修复：\n${error || pageError || ''}`, live) }
  catch (failure) { update({ actionError: describeWorkbenchError(failure) }) }
}
