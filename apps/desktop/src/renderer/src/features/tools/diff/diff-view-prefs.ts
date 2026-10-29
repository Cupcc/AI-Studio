import { create } from 'zustand'

/** Diff view preferences (DEC-25), shared by every Project for this app run, like VS Code's diff editor toggles. */
interface DiffViewPrefs {
  /** Files grouped under their folders (VS Code's "View as Tree") instead of one flat list. */
  tree: boolean
  sideBySide: boolean
  hideUnchanged: boolean
  /** A move request for the open diff: next / previous change. */
  navigate: { direction: 'next' | 'previous'; nonce: number } | null
  set(patch: Partial<Pick<DiffViewPrefs, 'tree' | 'sideBySide' | 'hideUnchanged'>>): void
  go(direction: 'next' | 'previous'): void
}
let nonce = 0
export const useDiffViewPrefs = create<DiffViewPrefs>((set) => ({
  tree: false, sideBySide: true, hideUnchanged: true, navigate: null,
  set: (patch) => set(patch),
  go: (direction) => set({ navigate: { direction, nonce: ++nonce } })
}))
