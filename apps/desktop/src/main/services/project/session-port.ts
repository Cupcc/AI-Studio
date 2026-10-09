// Main-process seam to the session module for the quit flow
// (specs/session/spec.md §4.2 `activeTurnCountAll` / `stopAllTurns`; S-Q6).
// The session module registers its implementation with
// `projectShellFor(core).setSessionPort(port)`; until then the stub reports
// no active sessions.
import type { BlockingSessionCounts, QuitRequest, StopProjectResult } from '@shared/project/types'

export interface MainSessionPort {
  /** Capture the initial default CLI at Project creation, before the open reply. */
  initializeProject?(projectId: string): Promise<void>
  getBlockingSessionCounts(projectId: string): BlockingSessionCounts | Promise<BlockingSessionCounts>
  stopProjectTurns(projectId: string): Promise<StopProjectResult>
  /** Running (including stopping) and Needs Input sessions across all Projects. */
  activeTurnCountAll(): QuitRequest | Promise<QuitRequest>
  /** Stops every current turn; resolves when cleanup finished or gave up. */
  stopAllTurns(): Promise<void>
}

export const stubMainSessionPort: MainSessionPort = {
  getBlockingSessionCounts: () => ({ running: 0, needsInput: 0 }),
  stopProjectTurns: async () => ({ stopped: [], failed: [] }),
  activeTurnCountAll: () => ({ sessions: 0, projects: 0 }),
  stopAllTurns: async () => {}
}
