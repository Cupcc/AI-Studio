import { create } from 'zustand'

// What the user opened or closed in a conversation. Kept for the window's lifetime so a turn stays as
// the user left it across tab switches; never saved, a reopened app starts from the defaults.

interface DisclosureStore {
  open: Record<string, boolean>
  set(key: string, open: boolean): void
}

export const useDisclosure = create<DisclosureStore>()((set) => ({
  open: {},
  set: (key, open) => set((state) => ({ open: { ...state.open, [key]: open } }))
}))

/** `fallback` applies until the user toggles this key; after that their choice wins. */
export function useOpen(key: string, fallback: boolean): [boolean, () => void] {
  const open = useDisclosure((state) => state.open[key]) ?? fallback
  return [open, () => useDisclosure.getState().set(key, !open)]
}
