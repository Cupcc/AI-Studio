import { create } from 'zustand'
import type { TurnDiffRef } from '@shared/tools/turn-diff'

/** User selection only; native events never open a tool or change its scope. */
export const useTurnDiff = create<{
  sources: Record<string, TurnDiffRef>
  select(ref: TurnDiffRef): void
  clear(projectId: string): void
}>(set => ({
  sources: {},
  select: ref => set(state => ({ sources: { ...state.sources, [ref.projectId]: ref } })),
  clear: projectId => set(state => {
    const sources = { ...state.sources }
    delete sources[projectId]
    return { sources }
  })
}))
