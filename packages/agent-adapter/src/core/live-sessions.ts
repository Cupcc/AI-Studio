import type { SessionController } from './session-controller.js';

/**
 * Tracks a provider's live sessions so `AgentProvider.dispose()` can shut all of them down
 * (no orphan runtimes on app quit). Closed sessions drop out automatically.
 */
export class LiveSessions {
  private readonly sessions = new Set<SessionController>();

  get size(): number {
    return this.sessions.size;
  }

  add<T extends SessionController>(session: T): T {
    this.sessions.add(session);
    void session.closed.then(() => this.sessions.delete(session));
    return session;
  }

  list(): SessionController[] {
    return [...this.sessions];
  }

  /** Disposes every live session in parallel; each stops its turn and terminates its runtime. */
  async disposeAll(): Promise<void> {
    await Promise.allSettled([...this.sessions].map((session) => session.dispose()));
    this.sessions.clear();
  }
}
