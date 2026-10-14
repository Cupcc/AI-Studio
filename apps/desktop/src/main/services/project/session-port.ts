// Main-process seam to the session module for the quit flow
// (specs/session/spec.md §4.2 `activeTurnCountAll` / `stopAllTurns`; S-Q6).
// The session module registers its implementation with
// `projectShellFor(core).setSessionPort(port)`; until then the stub reports
// no active sessions.
import type { BlockingSessionCounts, ClosingResource, QuitRequest, StopProjectResult } from '@shared/project/types'

export interface MainSessionPort {
  /** Capture the initial default CLI at Project creation, before the open reply. */
  initializeProject?(projectId: string): Promise<void>
  getBlockingSessionCounts(projectId: string): BlockingSessionCounts | Promise<BlockingSessionCounts>
  stopProjectTurns(projectId: string): Promise<StopProjectResult>
  /** Release idle Runtime handles after the Project Tab has passed Stop checks. */
  projectClosed?(projectId: string): Promise<void>
  projectCloseCancelled?(projectId: string): void
  /** Running (including stopping) and Needs Input sessions across all Projects. */
  activeTurnCountAll(): QuitRequest | Promise<QuitRequest>
  activeSessions?(projectId?: string): ClosingResource[]
  /** Stops every current turn; resolves when cleanup finished or gave up. */
  stopAllTurns(): Promise<void>
  /** Reversible quit preparation; reject until all idle/retired handles are released. */
  releaseAllRuntimes?(): Promise<void>
  /** A failed/cancelled application quit must allow retained Projects to accept work. */
  cancelQuit?(): void
}

export const stubMainSessionPort: MainSessionPort = {
  getBlockingSessionCounts: () => ({ running: 0, needsInput: 0 }),
  stopProjectTurns: async () => ({ stopped: [], failed: [] }),
  activeTurnCountAll: () => ({ sessions: 0, projects: 0 }),
  stopAllTurns: async () => {}
}
