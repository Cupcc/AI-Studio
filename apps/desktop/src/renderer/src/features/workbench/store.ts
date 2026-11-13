import { create } from 'zustand'
import type { WorkbenchCatalog, WorkbenchRef, WorkbenchSnapshot } from '@shared/workbench/types'
import { describeWorkbenchError, workbenchApi } from './api'

export const workbenchKey = ({ projectId, viewId }: WorkbenchRef): string => `${projectId}:${viewId}`
export type PageStatus = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string }
/** Host chrome state shared by the workbench column header and the page body of one workbench view. */
export interface WorkbenchHost {
  pageStatus: PageStatus
  /** Package revision whose page reported `pageStatus`; older revisions never count as connected. */
  connectedRevision: string | null
  saveStatus: string
  saveFailed: boolean
  actionError: string | null
  pending: boolean
  /** Bumped by a refresh to remount the page iframe. */
  reload: number
}
export type HostPatch = Partial<WorkbenchHost> | ((host: WorkbenchHost) => Partial<WorkbenchHost>)
export const initialHost: WorkbenchHost = { pageStatus: { kind: 'loading' }, connectedRevision: null, saveStatus: '已读取保存状态', saveFailed: false, actionError: null, pending: false, reload: 0 }
const catalogLoads = new Map<string, { promise: Promise<void>; dirty: boolean }>()
const snapshotLoads = new Map<string, Promise<void>>()
const generations = new Map<string, number>()
const closed = new Set<string>()

export const useWorkbenches = create<{
  catalogs: Record<string, WorkbenchCatalog>
  snapshots: Record<string, WorkbenchSnapshot>
  errors: Record<string, string | null>
  snapshotErrors: Record<string, string | null>
  loading: Record<string, boolean>
  hosts: Record<string, WorkbenchHost>
  loadCatalog(projectId: string): Promise<void>
  loadSnapshot(ref: WorkbenchRef): Promise<void>
  acceptSnapshot(snapshot: WorkbenchSnapshot): void
  updateHost(ref: WorkbenchRef, patch: HostPatch): void
  close(projectId: string): void
}>()((set, get) => ({
  catalogs: {}, snapshots: {}, errors: {}, snapshotErrors: {}, loading: {}, hosts: {},
  loadCatalog(projectId) {
    closed.delete(projectId)
    const existing = catalogLoads.get(projectId)
    if (existing) return existing.promise
    const generation = generations.get(projectId) ?? 0
    const task = { promise: Promise.resolve(), dirty: false }
    task.promise = (async () => {
      do {
        task.dirty = false
        try {
          const catalog = await workbenchApi().list({ projectId })
          if ((generations.get(projectId) ?? 0) !== generation) return
          if (!task.dirty) set(s => ({ catalogs: { ...s.catalogs, [projectId]: catalog }, errors: { ...s.errors, [projectId]: null } }))
        } catch (error) {
          if ((generations.get(projectId) ?? 0) !== generation) return
          if (!task.dirty) set(s => ({ errors: { ...s.errors, [projectId]: describeWorkbenchError(error) } }))
        }
      } while (task.dirty)
    })().finally(() => { if (catalogLoads.get(projectId) === task) catalogLoads.delete(projectId) })
    catalogLoads.set(projectId, task)
    return task.promise
  },
  loadSnapshot(ref) {
    const { projectId } = ref, key = workbenchKey(ref)
    closed.delete(projectId)
    const existing = snapshotLoads.get(key)
    if (existing) return existing
    const generation = generations.get(projectId) ?? 0
    set(s => ({ loading: { ...s.loading, [key]: true }, snapshotErrors: { ...s.snapshotErrors, [key]: null } }))
    const task = workbenchApi().getSnapshot(ref).then(snapshot => {
      if ((generations.get(projectId) ?? 0) === generation) get().acceptSnapshot(snapshot)
    }).catch(error => {
      if ((generations.get(projectId) ?? 0) === generation) set(s => ({ snapshotErrors: { ...s.snapshotErrors, [key]: describeWorkbenchError(error) } }))
    }).finally(() => {
      if ((generations.get(projectId) ?? 0) === generation) set(s => ({ loading: { ...s.loading, [key]: false } }))
      if (snapshotLoads.get(key) === task) snapshotLoads.delete(key)
    })
    snapshotLoads.set(key, task)
    return task
  },
  acceptSnapshot(snapshot) {
    if (closed.has(snapshot.ref.projectId)) return
    const key = workbenchKey(snapshot.ref)
    if ((get().snapshots[key]?.revision ?? -1) >= snapshot.revision) return
    set(s => ({ snapshots: { ...s.snapshots, [key]: snapshot }, snapshotErrors: { ...s.snapshotErrors, [key]: null } }))
  },
  updateHost(ref, patch) {
    if (closed.has(ref.projectId)) return
    const key = workbenchKey(ref)
    set(s => {
      const host = s.hosts[key] ?? initialHost
      return { hosts: { ...s.hosts, [key]: { ...host, ...(typeof patch === 'function' ? patch(host) : patch) } } }
    })
  },
  close(projectId) {
    closed.add(projectId)
    generations.set(projectId, (generations.get(projectId) ?? 0) + 1)
    catalogLoads.delete(projectId)
    const owned = (key: string) => key.startsWith(`${projectId}:`)
    for (const key of snapshotLoads.keys()) if (owned(key)) snapshotLoads.delete(key)
    const keepOther = <T,>(values: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(values).filter(([key]) => !owned(key)))
    set(s => ({
      catalogs: Object.fromEntries(Object.entries(s.catalogs).filter(([id]) => id !== projectId)),
      errors: Object.fromEntries(Object.entries(s.errors).filter(([id]) => id !== projectId)),
      snapshots: keepOther(s.snapshots), snapshotErrors: keepOther(s.snapshotErrors),
      loading: keepOther(s.loading), hosts: keepOther(s.hosts)
    }))
  }
}))

/** Changes when the Project closes, so late host actions can drop their results. */
export const workbenchGeneration = (projectId: string): number => generations.get(projectId) ?? 0

export function watchWorkbenches(): () => void {
  return workbenchApi().onChanged(change => {
    if (change.kind === 'snapshot') useWorkbenches.getState().acceptSnapshot(change.snapshot)
    else if (!closed.has(change.projectId)) {
      const pending = catalogLoads.get(change.projectId)
      if (pending) pending.dirty = true
      else void useWorkbenches.getState().loadCatalog(change.projectId)
    }
  })
}
