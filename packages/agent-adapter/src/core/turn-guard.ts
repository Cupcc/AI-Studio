import { adapterError } from '../errors.js';
import type { NativeTurnEnd, SessionRuntimeState } from '../types.js';

export interface TurnRecord {
  readonly turnId: string;
  nativeTurnId?: string;
  /** Epoch ms. */
  readonly startedAt: number;
  /** Monotonic ms for duration. */
  readonly startedMono: number;
  stopRequestedAt?: number;
  nativeEnd?: NativeTurnEnd;
  nativeEndAt?: number;
  finishedAt?: number;
}

export type TurnClass = 'current' | 'finished' | 'unknown';

const FINISHED_TURN_MEMORY = 64;

/**
 * Synchronous turn / Stop state machine for one session.
 *
 * idle --begin--> running --stop--> stopping --finish--> idle
 * running --finish--> idle;   any --close--> closed (terminal)
 *
 * It records stop intent before any interrupt is sent, refuses submissions while a turn
 * runs or stops, accepts one native terminal state per turn, and classifies events for
 * finished turns as late so they can never resurrect a turn.
 */
export class TurnGuard {
  private stateValue: SessionRuntimeState = 'idle';
  private currentTurn: TurnRecord | undefined;
  private readonly finished = new Map<string, TurnRecord>();
  private readonly nativeToTurn = new Map<string, string>();

  get state(): SessionRuntimeState {
    return this.stateValue;
  }

  get current(): TurnRecord | undefined {
    return this.currentTurn;
  }

  /** Throws `invalid_state` unless a new turn may start. */
  assertCanSubmit(): void {
    switch (this.stateValue) {
      case 'idle':
        return;
      case 'running':
        throw adapterError('invalid_state', 'A turn is already running');
      case 'stopping':
        throw adapterError('invalid_state', 'The session is stopping; submissions are paused');
      case 'closed':
        throw adapterError('invalid_state', 'The session is closed');
    }
  }

  beginTurn(turnId: string, startedAt: number, startedMono: number): TurnRecord {
    this.assertCanSubmit();
    const record: TurnRecord = { turnId, startedAt, startedMono };
    this.currentTurn = record;
    this.stateValue = 'running';
    return record;
  }

  bindNativeTurnId(turnId: string, nativeTurnId: string): boolean {
    const record = this.lookup(turnId);
    if (!record) return false;
    if (record.nativeTurnId && record.nativeTurnId !== nativeTurnId) return false;
    record.nativeTurnId = nativeTurnId;
    this.nativeToTurn.set(nativeTurnId, turnId);
    return true;
  }

  turnIdForNative(nativeTurnId: string): string | undefined {
    return this.nativeToTurn.get(nativeTurnId);
  }

  classify(turnId: string): TurnClass {
    if (this.currentTurn?.turnId === turnId) return 'current';
    if (this.finished.has(turnId)) return 'finished';
    return 'unknown';
  }

  /** Records stop intent. Returns what happened so the caller can stay idempotent. */
  requestStop(now: number): 'requested' | 'already_stopping' | 'no_active_turn' {
    if (this.stateValue === 'stopping') return 'already_stopping';
    if (this.stateValue !== 'running' || !this.currentTurn) return 'no_active_turn';
    this.currentTurn.stopRequestedAt = now;
    this.stateValue = 'stopping';
    return 'requested';
  }

  /** Accepts the first native terminal state of the current turn; later ones are duplicates or late. */
  recordNativeEnd(turnId: string, end: NativeTurnEnd, now: number): 'accepted' | 'duplicate' | 'late' | 'unknown' {
    const cls = this.classify(turnId);
    if (cls === 'finished') return 'late';
    if (cls === 'unknown') return 'unknown';
    const record = this.currentTurn as TurnRecord;
    if (record.nativeEnd) return 'duplicate';
    record.nativeEnd = end;
    record.nativeEndAt = now;
    return 'accepted';
  }

  /** Ends the current turn. The session returns to idle unless it was closed meanwhile. */
  finish(turnId: string, now: number): TurnRecord {
    const record = this.currentTurn;
    if (!record || record.turnId !== turnId) {
      throw adapterError('invalid_state', `Turn ${turnId} is not the current turn`);
    }
    record.finishedAt = now;
    this.currentTurn = undefined;
    this.finished.set(turnId, record);
    if (this.finished.size > FINISHED_TURN_MEMORY) {
      const oldest = this.finished.keys().next().value;
      if (oldest !== undefined) {
        const old = this.finished.get(oldest);
        this.finished.delete(oldest);
        if (old?.nativeTurnId) this.nativeToTurn.delete(old.nativeTurnId);
      }
    }
    if (this.stateValue !== 'closed') this.stateValue = 'idle';
    return record;
  }

  /** Terminal. A still-current turn must be finished by the caller to emit its terminal event. */
  close(): SessionRuntimeState {
    const previous = this.stateValue;
    this.stateValue = 'closed';
    return previous;
  }

  private lookup(turnId: string): TurnRecord | undefined {
    if (this.currentTurn?.turnId === turnId) return this.currentTurn;
    return this.finished.get(turnId);
  }
}
