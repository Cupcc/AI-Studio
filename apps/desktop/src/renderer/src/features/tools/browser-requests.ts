import { create } from 'zustand'
import { showTool } from './show-tool'

/** A navigation asked for from outside the Browser panel (a Terminal link); the panel performs it once it is ready. */
interface BrowserRequests {
  pending: Record<string, { url: string; nonce: number }>
  request(projectId: string, url: string): void
  take(projectId: string, nonce: number): void
}
let nonce = 0
export const useBrowserRequests = create<BrowserRequests>((set) => ({
  pending: {},
  request: (projectId, url) => set(state => ({ pending: { ...state.pending, [projectId]: { url, nonce: ++nonce } } })),
  take: (projectId, taken) => set(state => {
    if (state.pending[projectId]?.nonce !== taken) return state
    const pending = { ...state.pending }; delete pending[projectId]
    return { pending }
  })
}))

/** Opens a URL in the Project's Browser tool (user action only). */
export function openInBrowserTool(projectId: string, url: string): void {
  useBrowserRequests.getState().request(projectId, url)
  showTool(projectId, 'browser')
}
