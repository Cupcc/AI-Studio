import type { QuitRequest } from '@shared/project/types'
import type { MainSessionPort } from './session-port'
import { stubMainToolPort, type MainToolPort } from './tool-port'
import { boundedCleanup } from './close-flow'

export const STOP_ALL_TIMEOUT_MS = 10_000

export interface QuitFlowDeps {
  getPort(): MainSessionPort
  getTools?(): MainToolPort
  quit(): void
  askRenderer(request: QuitRequest): boolean
  askNative(request: QuitRequest): Promise<boolean>
  flushState?(): Promise<void>
  stopTimeoutMs?: number
  onError?(error: unknown): void
}

export interface QuitFlow {
  onBeforeQuit(event: { preventDefault(): void }): void
  confirm(): Promise<void>
  cancel(): void
  readonly state: 'idle' | 'checking' | 'asking' | 'stopping' | 'approved'
  readonly cleanupPending: boolean
}

export function createQuitFlow(deps: QuitFlowDeps): QuitFlow {
  let state: QuitFlow['state'] = 'idle'
  let pending: QuitRequest | null = null
  let cleanup: Promise<void> | null = null
  let nativePromptPending = false
  const tools = () => deps.getTools?.() ?? stubMainToolPort
  const approve = async () => {
    await deps.flushState?.()
    state = 'approved'
    deps.quit()
  }
  const counts = (request: QuitRequest): QuitRequest => {
    const terminals = tools().activeTerminals()
    const sessions = deps.getPort().activeSessions?.() ?? []
    const resources = [...sessions, ...terminals]
    return { ...request,
      projects: resources.length ? new Set(resources.map(item => item.projectId)).size : request.projects,
      ...(terminals.length ? { terminals: terminals.length } : {}), ...(resources.length ? { resources } : {})
    }
  }
  const ask = async (request: QuitRequest) => {
    pending = request
    state = 'asking'
    if (deps.askRenderer(request)) return
    // Repeated Cmd-Q must not stack native prompts or release their Browser
    // overlay while another confirmation is still open.
    if (nativePromptPending) return
    nativePromptPending = true
    try {
      const accepted = await deps.askNative(request).catch(() => false)
      if (state !== 'asking' || pending !== request) return
      if (accepted) await flow.confirm()
      else flow.cancel()
    } finally {
      nativePromptPending = false
      if (state === 'asking' && pending && pending !== request) void ask(pending)
    }
  }
  const fail = async (error: unknown) => {
    deps.onError?.(error)
    const reason = error instanceof Error ? error.message : String(error)
    pending = { ...(pending ?? { sessions: 0, projects: 0 }), failures: [reason] }
    state = 'asking'
    // Retain diagnostics; don't automatically accept a second native dialog.
    deps.askRenderer(pending)
  }
  const startCleanup = (operation: () => Promise<void>) => {
    if (!cleanup) {
      const running = operation().finally(() => {
        if (cleanup === running) cleanup = null
        if (state === 'idle') deps.getPort().cancelQuit?.()
      })
      cleanup = running
    }
    return cleanup
  }
  const releaseResources = async () => {
    await deps.getPort().stopAllTurns()
    await tools().closeAll()
    await deps.getPort().releaseAllRuntimes?.()
    const remaining = counts(await deps.getPort().activeTurnCountAll())
    if (remaining.sessions || remaining.terminals) throw new Error('仍有对话或终端未停止')
  }
  const flow: QuitFlow = {
    get state() { return state },
    get cleanupPending() { return cleanup !== null },
    onBeforeQuit(event) {
      if (state === 'approved') return
      if (state !== 'idle') {
        event.preventDefault()
        if (state === 'asking' && pending && !deps.askRenderer(pending)) void ask(pending)
        return
      }
      let request: QuitRequest | Promise<QuitRequest>
      try { request = deps.getPort().activeTurnCountAll() }
      catch (error) { event.preventDefault(); void fail(error); return }
      if (!(request instanceof Promise)) {
        try { request = counts(request) }
        catch (error) { event.preventDefault(); void fail(error); return }
        if (!request.sessions && !request.terminals && !deps.flushState && !deps.getTools) {
          state = 'approved'; return
        }
      }
      event.preventDefault()
      state = 'checking'
      void Promise.resolve(request).then(async initial => {
        const current = counts(initial)
        if (current.sessions || current.terminals) await ask(current)
        else {
          await boundedCleanup(startCleanup(releaseResources), deps.stopTimeoutMs ?? STOP_ALL_TIMEOUT_MS)
          await approve()
        }
      }).catch(fail)
    },
    async confirm() {
      if (state !== 'asking') return
      state = 'stopping'
      try {
        await boundedCleanup(startCleanup(releaseResources), deps.stopTimeoutMs ?? STOP_ALL_TIMEOUT_MS)
        await approve()
      } catch (error) { await fail(error) }
    },
    cancel() {
      if (state === 'asking') {
        state = 'idle'; pending = null
        if (!cleanup) deps.getPort().cancelQuit?.()
      }
    }
  }
  return flow
}
