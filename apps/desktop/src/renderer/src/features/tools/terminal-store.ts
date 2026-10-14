import { create } from 'zustand'
import type { TerminalCloseResult, TerminalSummary } from '@shared/tools/terminal'
import { terminalApi } from './api'

interface ProjectTerminals {
  terminals: TerminalSummary[]
  activeId: string | null
  loaded: boolean
  loading: boolean
  pending: boolean
  error: string | null
}
interface TerminalStore {
  projects: Record<string, ProjectTerminals>
  open(projectId: string): Promise<void>
  create(projectId: string): Promise<void>
  select(projectId: string, terminalId: string): void
  close(terminal: TerminalSummary, confirmed: boolean): Promise<TerminalCloseResult | null>
  accept(projectId: string, terminals: TerminalSummary[]): void
  forget(projectId: string): void
}
const empty = (): ProjectTerminals => ({ terminals: [], activeId: null, loaded: false, loading: false, pending: false, error: null })
const loads = new Map<string, Promise<void>>()
const epochs = new Map<string, number>()
const versions = new Map<string, number>()
const closed = new Set<string>()
const currentEpoch = (projectId: string) => epochs.get(projectId) ?? 0
const bump = (map: Map<string, number>, id: string) => map.set(id, (map.get(id) ?? 0) + 1)

export const useTerminals = create<TerminalStore>((set, get) => {
  const patch = (id: string, update: Partial<ProjectTerminals>) => set(s => ({ projects: { ...s.projects, [id]: { ...(s.projects[id] ?? empty()), ...update } } }))
  const acceptCreated = (id: string, terminal: TerminalSummary, version: number) => {
    const current = get().projects[id] ?? empty()
    // The changed event may already contain a newer state or have removed the new tab.
    if ((versions.get(id) ?? 0) > version) {
      if (current.terminals.some(t => t.terminalId === terminal.terminalId)) patch(id, { activeId: terminal.terminalId })
      return
    }
    get().accept(id, [...current.terminals.filter(t => t.terminalId !== terminal.terminalId), terminal])
    patch(id, { activeId: terminal.terminalId })
  }
  return {
    projects: {},
    async open(projectId) {
      closed.delete(projectId)
      if (get().projects[projectId]?.loaded) return
      const existing = loads.get(projectId)
      if (existing) return existing
      const epoch = currentEpoch(projectId), version = versions.get(projectId) ?? 0
      patch(projectId, { loading: true, error: null })
      const promise = (async () => {
        try {
          const terminals = await terminalApi().list({ projectId })
          if (currentEpoch(projectId) !== epoch) return
          if ((versions.get(projectId) ?? 0) === version) get().accept(projectId, terminals)
          // Only the first user open creates a tab. A deliberately empty list stays empty on remount.
          patch(projectId, { loaded: true })
          if (!get().projects[projectId]!.terminals.length) {
            const before = versions.get(projectId) ?? 0
            const terminal = await terminalApi().create({ projectId, cols: 80, rows: 24 })
            if (currentEpoch(projectId) === epoch) acceptCreated(projectId, terminal, before)
          }
        } catch (error) {
          if (currentEpoch(projectId) === epoch) patch(projectId, { error: String(error) })
        } finally {
          if (currentEpoch(projectId) === epoch) patch(projectId, { loading: false })
        }
      })()
      loads.set(projectId, promise)
      await promise
      if (loads.get(projectId) === promise) loads.delete(projectId)
    },
    async create(projectId) {
      const project = get().projects[projectId]
      if (project?.pending || project?.loading) return
      const epoch = currentEpoch(projectId), version = versions.get(projectId) ?? 0
      patch(projectId, { pending: true, error: null })
      try {
        const terminal = await terminalApi().create({ projectId, cols: 80, rows: 24 })
        if (currentEpoch(projectId) === epoch) acceptCreated(projectId, terminal, version)
      } catch (error) {
        if (currentEpoch(projectId) === epoch) patch(projectId, { error: String(error) })
      } finally {
        if (currentEpoch(projectId) === epoch) patch(projectId, { pending: false })
      }
    },
    select: (projectId, terminalId) => {
      if (get().projects[projectId]?.terminals.some(t => t.terminalId === terminalId)) patch(projectId, { activeId: terminalId })
    },
    async close(terminal, confirmed) {
      const { projectId } = terminal, project = get().projects[projectId]
      if (project?.pending || project?.loading) return null
      const epoch = currentEpoch(projectId)
      patch(projectId, { pending: true, error: null })
      try {
        const result = await terminalApi().close({ projectId, terminalId: terminal.terminalId, generation: terminal.generation, confirmed })
        if (currentEpoch(projectId) !== epoch) return null
        if (result.status === 'closed') get().accept(projectId, get().projects[projectId]!.terminals.filter(t => t.terminalId !== terminal.terminalId))
        else if (result.status === 'failed') patch(projectId, { error: result.error })
        return result
      } catch (error) {
        if (currentEpoch(projectId) === epoch) patch(projectId, { error: String(error) })
        return null
      } finally {
        if (currentEpoch(projectId) === epoch) patch(projectId, { pending: false })
      }
    },
    accept(projectId, terminals) {
      if (closed.has(projectId)) return
      bump(versions, projectId)
      const current = get().projects[projectId] ?? empty()
      const activeId = terminals.some(t => t.terminalId === current.activeId) ? current.activeId : terminals.at(-1)?.terminalId ?? null
      patch(projectId, { terminals, activeId })
    },
    forget(projectId) {
      closed.add(projectId); bump(epochs, projectId); bump(versions, projectId); loads.delete(projectId)
      set(s => { const projects = { ...s.projects }; delete projects[projectId]; return { projects } })
    }
  }
})

export function watchTerminals(): () => void {
  return terminalApi().onChanged(event => useTerminals.getState().accept(event.projectId, event.terminals))
}
