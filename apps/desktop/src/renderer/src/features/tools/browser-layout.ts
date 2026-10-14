import type { BrowserBounds, BrowserRef, BrowserState } from '@shared/tools/browser'
import { browserApi } from './api'

interface LayoutRequest {
  ref: BrowserRef
  bounds?: BrowserBounds
  visible: boolean
  accepted?(state: BrowserState): void
  failed?(error: unknown): void
}
interface LayoutQueue { desired: LayoutRequest | null; running: boolean }
const layouts = new Map<string, LayoutQueue>()

/** One in-flight command and one latest layout per Project, including across UI remounts. */
export function scheduleBrowserLayout(request: LayoutRequest): void {
  const key = request.ref.projectId
  let queue = layouts.get(key)
  if (!queue) { queue = { desired: null, running: false }; layouts.set(key, queue) }
  queue.desired = request
  if (queue.running) return
  queue.running = true
  void (async () => {
    while (queue.desired) {
      const current = queue.desired; queue.desired = null
      try {
        if (current.bounds) await browserApi().setBounds({ ...current.ref, bounds: current.bounds })
        // A newer layout can arrive during IPC. Apply it before deciding whether to show the page.
        if (queue.desired) continue
        const state = await browserApi().setVisible({ ...current.ref, visible: current.visible })
        if (!queue.desired) current.accepted?.(state)
      } catch (error) { if (!queue.desired) current.failed?.(error) }
    }
    layouts.delete(key)
  })()
}
