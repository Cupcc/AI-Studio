import type { CloseProjectResult } from '@shared/project/types'
import type { MainSessionPort } from './session-port'
import { stubMainToolPort, type MainToolPort } from './tool-port'

export async function boundedCleanup<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('停止超时')), timeoutMs) })
    ])
  } finally { clearTimeout(timer) }
}

/** One confirmation covers Sessions and every unexited Shell, then checks ownership cleanup. */
export async function closeProjectWithSessions(
  port: MainSessionPort, projectId: string, confirmed: boolean, timeoutMs = 10_000,
  tools: MainToolPort = stubMainToolPort,
  onCleanupStarted?: (operation: Promise<CloseProjectResult>) => void
): Promise<CloseProjectResult> {
  let expired = false
  try {
    const counts = await port.getBlockingSessionCounts(projectId)
    const terminals = tools.activeTerminals(projectId)
    const resources = [...(port.activeSessions?.(projectId) ?? []), ...terminals]
    if (!confirmed && counts.running + counts.needsInput + terminals.length > 0) {
      return { status: 'confirmation_required', counts: {
        ...counts, ...(terminals.length ? { terminals: terminals.length } : {}), ...(resources.length ? { resources } : {})
      } }
    }
    const cleanup = (async (): Promise<CloseProjectResult> => {
      if (counts.running + counts.needsInput > 0) {
        const result = await port.stopProjectTurns(projectId)
        if (expired) return { status: 'failed', failed: [{ sessionId: '', reason: '停止超时' }] }
        if (result.failed.length) return { status: 'failed', failed: result.failed }
        const remaining = await port.getBlockingSessionCounts(projectId)
        if (remaining.running + remaining.needsInput > 0) throw new Error('仍有对话未停止')
      }
      // Tool failure must keep the Project accessible for diagnostics and retry.
      await tools.closeProject(projectId)
      if (expired) return { status: 'failed', failed: [{ sessionId: '', reason: '停止超时' }] }
      if (tools.activeTerminals(projectId).length) throw new Error('仍有终端未退出')
      await port.projectClosed?.(projectId)
      if (expired) {
        port.projectCloseCancelled?.(projectId)
        return { status: 'failed', failed: [{ sessionId: '', reason: '停止超时' }] }
      }
      return { status: 'closed' }
    })()
    onCleanupStarted?.(cleanup)
    return await boundedCleanup(cleanup, timeoutMs)
  } catch (error) {
    expired = true
    return { status: 'failed', failed: [{ sessionId: '', reason: error instanceof Error ? error.message : String(error) }] }
  }
}
