// Example feature store: loads app info over IPC and tracks window focus.
import { create } from 'zustand'
import type { AppInfo } from '@shared/ipc/app'
import { studio } from '../../lib/studio'

export interface AppInfoState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  info: AppInfo | null
  error: string | null
  windowFocused: boolean
  load(): Promise<void>
  /** Subscribes to main-process focus events; returns the unsubscribe function. */
  watchWindowFocus(): () => void
}

export const useAppInfoStore = create<AppInfoState>()((set) => ({
  status: 'idle',
  info: null,
  error: null,
  windowFocused: true,
  load: async () => {
    set({ status: 'loading', error: null })
    try {
      const info = await studio().app.getInfo()
      set({ status: 'ready', info })
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : String(error) })
    }
  },
  watchWindowFocus: () =>
    studio().app.onWindowFocusChanged(({ focused }) => set({ windowFocused: focused }))
}))
