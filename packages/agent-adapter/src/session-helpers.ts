import type { AgentProvider, AgentSession, SessionOptionsBase } from './provider.js';

/**
 * Returns a usable session for the next send (FR-STATE-003; S-Q2 retry, confirmed 2026-10-09):
 * reuse a live session; otherwise resume the persisted native id (rejects with `resume_failed`,
 * never creates a new conversation); only without any native id create a new one.
 * The caller then re-sends the user message itself; nothing is re-run automatically.
 */
export async function ensureSession(
  provider: AgentProvider,
  current: AgentSession | undefined,
  options: SessionOptionsBase & { nativeSessionId?: string },
): Promise<{ session: AgentSession; action: 'reused' | 'resumed' | 'created' }> {
  if (current && current.state !== 'closed') return { session: current, action: 'reused' };
  const { nativeSessionId, ...base } = options;
  if (current) await current.dispose();
  if (nativeSessionId) {
    return { session: await provider.resumeSession({ ...base, nativeSessionId }), action: 'resumed' };
  }
  return { session: await provider.createSession(base), action: 'created' };
}
