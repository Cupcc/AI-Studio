import { create } from 'zustand'
import type { WorkbenchCatalog } from '@shared/workbench/types'
import { describeWorkbenchError, workbenchApi } from './api'

const loads = new Map<string, { promise: Promise<void>; dirty: boolean }>()
const generations = new Map<string, number>()
const closed = new Set<string>()
export const useWorkbenches = create<{
  catalogs: Record<string, WorkbenchCatalog>
  errors: Record<string, string | null>
  load(projectId: string): Promise<void>
  close(projectId: string): void
}>()((set) => ({
  catalogs: {}, errors: {},
  load(projectId) {
    closed.delete(projectId)
    const existing = loads.get(projectId)
    if (existing) { existing.dirty = true; return existing.promise }
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
    })().finally(() => { if (loads.get(projectId) === task) loads.delete(projectId) })
    loads.set(projectId, task)
    return task.promise
  },
  close(projectId) {
    closed.add(projectId)
    generations.set(projectId, (generations.get(projectId) ?? 0) + 1)
    loads.delete(projectId)
    set(s => ({
      catalogs: Object.fromEntries(Object.entries(s.catalogs).filter(([id]) => id !== projectId)),
      errors: Object.fromEntries(Object.entries(s.errors).filter(([id]) => id !== projectId))
    }))
  }
}))

export function watchWorkbenches(): () => void {
  return workbenchApi().onChanged(({ projectId }) => {
    if (!closed.has(projectId)) void useWorkbenches.getState().load(projectId)
  })
}
