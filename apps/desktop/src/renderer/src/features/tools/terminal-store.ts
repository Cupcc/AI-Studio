import { create } from 'zustand'
import type { TerminalCloseResult, TerminalSummary } from '@shared/tools/terminal'
import { terminalApi } from './api'

interface ProjectTerminals {
  terminals: TerminalSummary[]
  /** Split groups (VS Code): the terminals of one group are shown side by side. Every terminal is in exactly one group. */
  groups: string[][]
  activeId: string | null
  loaded: boolean
  loading: boolean
  pending: boolean
  error: string | null
}
interface TerminalStore {
  projects: Record<string, ProjectTerminals>
  open(projectId: string): Promise<void>
  /** `cwd`: Project-relative directory (Files "在集成终端中打开"). */
  create(projectId: string, cwd?: string): Promise<void>
  rename(terminal: TerminalSummary, title: string): Promise<void>
  clear(terminal: TerminalSummary): Promise<void>
  select(projectId: string, terminalId: string): void
  /** ⌘\: a new terminal next to the active one, in the same group. */
  split(projectId: string): Promise<void>
  close(terminal: TerminalSummary, confirmed: boolean): Promise<TerminalCloseResult | null>
  accept(projectId: string, terminals: TerminalSummary[]): void
  forget(projectId: string): void
}
const empty = (): ProjectTerminals => ({ terminals: [], groups: [], activeId: null, loaded: false, loading: false, pending: false, error: null })
const loads = new Map<string, Promise<void>>()
const epochs = new Map<string, number>()
const versions = new Map<string, number>()
const closed = new Set<string>()
/** A directory requested before the panel ever loaded: the first terminal starts there instead of the root. */
const firstCwd = new Map<string, string>()
/** The terminal a pending split was started from: the new terminal joins its group. */
const splitAnchors = new Map<string, string>()

/** Keeps the groups in step with the terminal list: gone ones leave, new ones get their own group (or the split's). */
export function regroup(groups: readonly string[][], ids: readonly string[], anchor?: string): { groups: string[][]; usedAnchor: boolean } {
  const present = new Set(ids)
  const next = groups.map(group => group.filter(id => present.has(id))).filter(group => group.length)
  const placed = new Set(next.flat())
  let usedAnchor = false
  for (const id of ids) {
    if (placed.has(id)) continue
    const host = anchor ? next.find(group => group.includes(anchor)) : undefined
    if (host && !usedAnchor) { host.splice(host.indexOf(anchor!) + 1, 0, id); usedAnchor = true }
    else next.push([id])
    placed.add(id)
  }
  return { groups: next, usedAnchor }
}
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
            const cwd = firstCwd.get(projectId)
            firstCwd.delete(projectId)
            const terminal = await terminalApi().create({ projectId, cols: 80, rows: 24, ...(cwd ? { cwd } : {}) })
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
    async create(projectId, cwd) {
      const project = get().projects[projectId]
      // Before the first load, the panel's own first-open creation takes the directory.
      if (cwd !== undefined && !project?.loaded) { if (cwd) firstCwd.set(projectId, cwd); return get().open(projectId) }
      if (project?.pending || project?.loading) return
      const epoch = currentEpoch(projectId), version = versions.get(projectId) ?? 0
      patch(projectId, { pending: true, error: null })
      try {
        const terminal = await terminalApi().create({ projectId, cols: 80, rows: 24, ...(cwd ? { cwd } : {}) })
        if (currentEpoch(projectId) === epoch) acceptCreated(projectId, terminal, version)
      } catch (error) {
        if (currentEpoch(projectId) === epoch) patch(projectId, { error: String(error) })
      } finally {
        if (currentEpoch(projectId) === epoch) patch(projectId, { pending: false })
      }
    },
    async rename(terminal, title) {
      const { projectId, terminalId, generation } = terminal
      try {
        const renamed = await terminalApi().rename({ projectId, terminalId, generation, title })
        const current = get().projects[projectId]
        if (current) patch(projectId, { terminals: current.terminals.map(t => t.terminalId === terminalId && t.generation === generation ? renamed : t) })
      } catch (error) { patch(projectId, { error: String(error) }) }
    },
    async clear(terminal) {
      const { projectId, terminalId, generation } = terminal
      try { await terminalApi().clear({ projectId, terminalId, generation }) } catch (error) { patch(projectId, { error: String(error) }) }
    },
    async split(projectId) {
      const anchor = get().projects[projectId]?.activeId
      if (!anchor) return get().create(projectId)
      splitAnchors.set(projectId, anchor)
      await get().create(projectId)
      splitAnchors.delete(projectId)
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
      const { groups, usedAnchor } = regroup(current.groups, terminals.map(t => t.terminalId), splitAnchors.get(projectId))
      if (usedAnchor) splitAnchors.delete(projectId)
      // Closing a split terminal moves focus to its neighbour in the same group, as in VS Code.
      const lostGroup = current.activeId && !terminals.some(t => t.terminalId === current.activeId) ? current.groups.find(group => group.includes(current.activeId!)) : undefined
      const neighbour = lostGroup?.find(id => id !== current.activeId && terminals.some(t => t.terminalId === id))
      const activeId = terminals.some(t => t.terminalId === current.activeId) ? current.activeId : neighbour ?? groups.flat().at(-1) ?? null
      patch(projectId, { terminals, groups, activeId })
    },
    forget(projectId) {
      closed.add(projectId); bump(epochs, projectId); bump(versions, projectId); loads.delete(projectId); firstCwd.delete(projectId); splitAnchors.delete(projectId)
      set(s => { const projects = { ...s.projects }; delete projects[projectId]; return { projects } })
    }
  }
})

export function watchTerminals(): () => void {
  return terminalApi().onChanged(event => useTerminals.getState().accept(event.projectId, event.terminals))
}
