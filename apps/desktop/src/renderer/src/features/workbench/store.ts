import { create } from 'zustand'
import type { WorkbenchCatalog, WorkbenchRef, WorkbenchSnapshot } from '@shared/workbench/types'
import { describeWorkbenchError, workbenchApi } from './api'

export const workbenchKey = ({ projectId, viewId }: WorkbenchRef): string => `${projectId}:${viewId}`
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
  zoom: Record<string, number>
  loadCatalog(projectId: string): Promise<void>
  loadSnapshot(ref: WorkbenchRef): Promise<void>
  acceptSnapshot(snapshot: WorkbenchSnapshot): void
  setZoom(ref: WorkbenchRef, value: number): void
  close(projectId: string): void
}>()((set, get) => ({
  catalogs: {}, snapshots: {}, errors: {}, snapshotErrors: {}, loading: {}, zoom: {},
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
  setZoom(ref, value) {
    set(s => ({ zoom: { ...s.zoom, [workbenchKey(ref)]: Math.max(.5, Math.min(2, value)) } }))
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
      loading: keepOther(s.loading), zoom: keepOther(s.zoom)
    }))
  }
}))

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
