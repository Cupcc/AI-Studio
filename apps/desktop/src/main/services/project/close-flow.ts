import type { CloseProjectResult } from '@shared/project/types'
import type { MainSessionPort } from './session-port'

/** Stop stays in main. Re-query after confirmation; never close on failure (PROJ-Q6). */
export async function closeProjectWithSessions(
  port: MainSessionPort, projectId: string, confirmed: boolean, timeoutMs = 10_000
): Promise<CloseProjectResult> {
  const counts = await port.getBlockingSessionCounts(projectId)
  if (counts.running + counts.needsInput === 0) return { status: 'closed' }
  if (!confirmed) return { status: 'confirmation_required', counts }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      port.stopProjectTurns(projectId),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('停止超时')), timeoutMs) })
    ])
    if (result.failed.length) return { status: 'failed', failed: result.failed }
    const remaining = await port.getBlockingSessionCounts(projectId)
    if (remaining.running + remaining.needsInput > 0) {
      return { status: 'failed', failed: [{ sessionId: '', reason: '仍有对话未停止' }] }
    }
    return { status: 'closed' }
  } catch (error) {
    return { status: 'failed', failed: [{ sessionId: '', reason: error instanceof Error ? error.message : String(error) }] }
  } finally { clearTimeout(timer) }
}
