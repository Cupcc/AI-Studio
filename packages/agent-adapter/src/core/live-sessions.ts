import type { SessionController } from './session-controller.js';

/**
 * Tracks a provider's live sessions so `AgentProvider.dispose()` / `releaseRuntimes()` can shut
 * them down (no orphan runtimes on app quit or Project close). Logical closure alone is not
 * cleanup proof: a session leaves the set only after its driver confirmed runtime release, so a
 * failed release stays retryable on the same handle.
 */
export class LiveSessions {
  private readonly sessions = new Map<SessionController, string | undefined>();

  get size(): number {
    return this.sessions.size;
  }

  add<T extends SessionController>(session: T, cwd?: string): T {
    this.sessions.set(session, cwd);
    // Whichever attempt first confirms the runtime's release (the background one after a
    // self-close, an explicit dispose() retry, or disposeAll) drops the session; failures keep it.
    void session.released.then(() => this.sessions.delete(session));
    return session;
  }

  list(): SessionController[] {
    return [...this.sessions.keys()];
  }

  /**
   * Disposes every live session (optionally only those started in `cwd`) in parallel; each stops its
   * turn and terminates its runtime. Rejects with an AggregateError listing every session whose
   * release is unconfirmed; those stay tracked and are retried by the next call.
   */
  async disposeAll(cwd?: string): Promise<void> {
    const targets = [...this.sessions].filter(([, path]) => cwd === undefined || cwd === path);
    const results = await Promise.allSettled(targets.map(async ([session]) => {
      await session.dispose();
      this.sessions.delete(session);
    }));
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (errors.length) throw new AggregateError(errors, 'Session runtime release failed');
  }
}
