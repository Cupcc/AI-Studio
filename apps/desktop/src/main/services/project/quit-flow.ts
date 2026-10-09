// ⌘Q confirmation (PROJ-Q7 / S-Q6 recommendation): when sessions are still
// Running or waiting for input, quitting asks first, then stops every current
// turn before exiting. Closing the window does not quit on macOS, so it never
// asks. Electron-free so it can be unit tested.
import type { QuitRequest } from '@shared/project/types'
import type { MainSessionPort } from './session-port'

export const STOP_ALL_TIMEOUT_MS = 10_000

export interface QuitFlowDeps {
  getPort(): MainSessionPort
  /** Calls app.quit(); before-quit runs again and is then allowed. */
  quit(): void
  /** Shows the renderer dialog; returns false when there is no window to ask in. */
  askRenderer(request: QuitRequest): boolean
  /** Fallback when no window is open. */
  askNative(request: QuitRequest): Promise<boolean>
  stopTimeoutMs?: number
  onError?(error: unknown): void
}

export interface QuitFlow {
  /** Attach to app `before-quit`. */
  onBeforeQuit(event: { preventDefault(): void }): void
  /** Renderer confirmed: stop all turns, then quit. */
  confirm(): Promise<void>
  cancel(): void
  readonly state: 'idle' | 'checking' | 'asking' | 'stopping' | 'approved'
}

export function createQuitFlow(deps: QuitFlowDeps): QuitFlow {
  let state: QuitFlow['state'] = 'idle'
  let pending: QuitRequest | null = null

  const approve = () => {
    state = 'approved'
    deps.quit()
  }

  const ask = async (request: QuitRequest) => {
    pending = request
    state = 'asking'
    if (deps.askRenderer(request)) return
    const ok = await deps.askNative(request).catch(() => false)
    if (ok) await flow.confirm()
    else flow.cancel()
  }

  const flow: QuitFlow = {
    get state() {
      return state
    },
    onBeforeQuit(event) {
      if (state === 'approved') return
      if (state !== 'idle') {
        event.preventDefault()
        // Asked again (e.g. the dialog was missed): show it again.
        if (state === 'asking' && pending) deps.askRenderer(pending)
        return
      }
      let counts: QuitRequest | Promise<QuitRequest>
      try {
        counts = deps.getPort().activeTurnCountAll()
      } catch (error) {
        deps.onError?.(error)
        counts = { sessions: 0, projects: 0 }
      }
      if (!(counts instanceof Promise) && counts.sessions <= 0) {
        // Nothing to stop: let this quit proceed untouched.
        state = 'approved'
        return
      }
      event.preventDefault()
      state = 'checking'
      void Promise.resolve(counts)
        .catch((error: unknown) => {
          deps.onError?.(error)
          return { sessions: 0, projects: 0 }
        })
        .then((request) => {
          if (request.sessions <= 0) approve()
          else return ask(request)
        })
    },
    async confirm() {
      if (state !== 'asking') return
      state = 'stopping'
      const timeout = new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, deps.stopTimeoutMs ?? STOP_ALL_TIMEOUT_MS)
        timer.unref?.()
      })
      try {
        await Promise.race([deps.getPort().stopAllTurns(), timeout])
      } catch (error) {
        deps.onError?.(error)
      }
      approve()
    },
    cancel() {
      if (state === 'asking') {
        state = 'idle'
        pending = null
      }
    }
  }
  return flow
}
