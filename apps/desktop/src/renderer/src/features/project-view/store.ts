import { create } from 'zustand'
import type { ViewState } from '@shared/project-view/types'
import { projectViewApi } from './api'
const key = (projectId: string, viewId: string) => `${projectId}:${viewId}`
const loads = new Map<string, Promise<void>>()
const epochs = new Map<string, number>()
const closed = new Set<string>()
export const useProjectViews = create<{
  states: Record<string, ViewState>; zoom: Record<string, number>
  accept(state: ViewState): void
  load(projectId: string, viewId: string): Promise<void>
  setZoom(projectId: string, viewId: string, value: number): void
  close(projectId: string): void
}>()((set, get) => ({
  states: {}, zoom: {},
  accept(state) {
    if (closed.has(state.projectId)) return
    const id = key(state.projectId, state.viewId)
    if ((get().states[id]?.revision ?? -1) >= state.revision) return
    set(s => ({ states: { ...s.states, [id]: state } }))
  },
  async load(projectId, viewId) {
    const id = key(projectId, viewId)
    closed.delete(projectId)
    const epoch = epochs.get(projectId) ?? 0
    if (loads.has(id)) return loads.get(id)
    const task = projectViewApi().getSnapshot({ projectId, viewId }).then(state => {
      if ((epochs.get(projectId) ?? 0) === epoch) get().accept(state)
    }).catch(() => {
      if ((epochs.get(projectId) ?? 0) !== epoch) return
      if (get().states[id]) return
      set(s => ({ states: { ...s.states, [id]: { projectId, viewId, revision: 0, status: 'error', snapshot: null, error: '无法读取 View，请检查项目目录。' } } }))
    }).finally(() => { if (loads.get(id) === task) loads.delete(id) })
    loads.set(id, task)
    return task
  },
  setZoom(projectId, viewId, value) { set(s => ({ zoom: { ...s.zoom, [key(projectId, viewId)]: Math.max(.5, Math.min(2, value)) } })) },
  close(projectId) {
    closed.add(projectId)
    epochs.set(projectId, (epochs.get(projectId) ?? 0) + 1)
    for (const id of loads.keys()) if (id.startsWith(projectId + ':')) loads.delete(id)
    set(s => ({
      states: Object.fromEntries(Object.entries(s.states).filter(([, state]) => state.projectId !== projectId)),
      zoom: Object.fromEntries(Object.entries(s.zoom).filter(([id]) => !id.startsWith(projectId + ':')))
    }))
  }
}))
export function watchProjectViews(): () => void {
  const api = projectViewApi()
  const accept = (state: ViewState) => useProjectViews.getState().accept(state)
  const off = [api.onSnapshotChanged(accept), api.onError(accept)]
  return () => off.forEach(fn => fn())
}
