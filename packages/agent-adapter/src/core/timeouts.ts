/**
 * Bounded waits used by the core. Values are initial engineering defaults, not product
 * requirements; hosts may override them per session.
 */
export interface AdapterTimeouts {
  /** Runtime spawn + protocol handshake + native session create/resume. */
  startupMs: number;
  /** Default timeout for a request to the CLI. */
  requestMs: number;
  /** Stop: native interrupt request acknowledgement. */
  interruptMs: number;
  /** Stop: wait for the native terminal state after interrupt. */
  terminalMs: number;
  /** Stop: native cleanup including system-level exit verification. */
  cleanupMs: number;
  /** Stop fallback: terminate isolated runtime, confirm exit, restart and resume. */
  recoveryMs: number;
  /** Runtime termination: grace period after SIGTERM before SIGKILL. */
  terminateGraceMs: number;
  /** Runtime termination: wait after SIGKILL for exit and descendant verification. */
  killWaitMs: number;
  /** dispose(): upper bound for the graceful stop of an active turn. */
  disposeMs: number;
}

export const DEFAULT_TIMEOUTS: Readonly<AdapterTimeouts> = Object.freeze({
  startupMs: 30_000,
  requestMs: 60_000,
  interruptMs: 10_000,
  terminalMs: 15_000,
  cleanupMs: 10_000,
  recoveryMs: 60_000,
  terminateGraceMs: 2_000,
  killWaitMs: 3_000,
  disposeMs: 20_000,
});

export function resolveTimeouts(overrides?: Partial<AdapterTimeouts>): AdapterTimeouts {
  const merged = { ...DEFAULT_TIMEOUTS };
  if (overrides) {
    for (const [key, value] of Object.entries(overrides) as Array<[keyof AdapterTimeouts, number | undefined]>) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) merged[key] = value;
    }
  }
  return merged;
}
