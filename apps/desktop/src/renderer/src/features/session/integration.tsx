import type { RendererSessionPort } from '../project/integration'
import { registerShellIntegration } from '../project/integration'
import { CliMenu, NewChatBadge } from '../chat/CliMenu'
import { sessionApi } from './api'
import { flushSessionDrafts, useSessions, watchSessionEvents } from './store'
import { SessionHistory } from './SessionHistory'
import { Conversation, ConversationHeader } from './Conversation'
import './session.css'

export interface SessionRendererPort extends RendererSessionPort { flush(): Promise<void>; dispose(): void }
export function createRendererSessionPort(): SessionRendererPort {
  const viewing = new Map<string, string | null>()
  let foreground = document.hasFocus(), scheduled = false, disposed = false
  function sync() {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      if (disposed) return
      const selected = [...viewing].find(([, sessionId]) => sessionId !== null)
      void sessionApi().updateViewing({ projectId: selected?.[0] ?? null, sessionId: selected?.[1] ?? null, foreground }).catch((error) => console.error('[session] viewing update failed', error))
    })
  }
  return {
    getProjectAttention: (projectId) => useSessions.getState().projectStates[projectId]?.attention ?? null,
    subscribeAttention: (listener) => useSessions.subscribe(listener),
    onProjectOpened: (projectId) => useSessions.getState().loadProject(projectId),
    onProjectClosed: (projectId) => { viewing.delete(projectId); useSessions.getState().closeProject(projectId); sync() },
    sessionExists: (projectId, sessionId) => useSessions.getState().summaries[sessionId]?.projectId === projectId,
    setViewing: (projectId, sessionId) => { viewing.set(projectId, sessionId); sync() },
    setWindowForeground: (value) => { foreground = value; sync() },
    userOpenedSession: (projectId, sessionId) => {
      // Project's per-Project loop finishes before these microtasks run. Viewing
      // reaches main before opened, and foreground changes never call opened.
      sync()
      queueMicrotask(() => { if (!disposed) useSessions.getState().userOpened(projectId, sessionId) })
    },
    startNewChat: (projectId) => useSessions.getState().startDraft(projectId),
    flush: flushSessionDrafts,
    dispose: () => { disposed = true; viewing.clear() }
  }
}

/** Install once before Project shell bootstrap; returns an application disposer. */
export function installSessionIntegration(): () => void {
  const session = createRendererSessionPort()
  const unwatch = watchSessionEvents()
  const unregister = registerShellIntegration({ session, SessionHistory, Conversation, ConversationHeader, CliMenu, NewChatBadge })
  return () => { unwatch(); unregister(); session.dispose() }
}
