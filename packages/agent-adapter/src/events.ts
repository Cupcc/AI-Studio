import type { AdapterErrorInfo, NativeDiagnostic } from './errors.js';
import type {
  InputRequest,
  InputResolution,
  ItemDeltaChannel,
  ItemSnapshot,
  ProviderId,
  RuntimeExitInfo,
  SessionCloseReason,
  SessionRuntimeState,
  StopPhase,
  StopSummary,
  TurnOutcome,
} from './types.js';

/**
 * Payloads of the unified event model, keyed by event type.
 * Every emitted event also carries the {@link EventEnvelope} fields.
 */
export interface AdapterEventPayloads {
  /** The native conversation id became known (Codex at thread start; Claude after init). Persist it. */
  'session.native_id': { nativeSessionId: string };
  /** Adapter-level session state changed. */
  'session.state': { state: SessionRuntimeState; previous: SessionRuntimeState };
  /** A session-level error not attributable to a turn outcome (e.g. Stop cleanup failure, resume mismatch). */
  'session.error': { error: AdapterErrorInfo };
  /** The session can no longer be used; resume through the provider to continue. */
  'session.closed': { reason: SessionCloseReason; error?: AdapterErrorInfo };
  /** Conversation title reported by the CLI (only when `capabilities.nativeTitle`). */
  'session.title': { title: string };

  /** Emitted synchronously when input is submitted, before the CLI acknowledges (FR-STATE-001). */
  'turn.started': { turnId: string; startedAt: number };
  /** Terminal state of a turn. Emitted exactly once per turn. */
  'turn.completed': {
    turnId: string;
    nativeTurnId?: string;
    /** Only `completed` is a successful terminal state (FR-STATE-004 input). */
    outcome: TurnOutcome;
    startedAt: number;
    completedAt: number;
    /** Wall-clock duration from submission to terminal state, for "Worked for …" (FR-STATE-007). */
    durationMs: number;
    nativeDurationMs?: number;
    /** Model that served the turn, when the provider can report it. */
    model?: string;
    stopRequested: boolean;
    /** Present when a Stop was requested for this turn. */
    stop?: StopSummary;
    /** Present only when `outcome === 'failed'`. A user Stop never produces an error here. */
    error?: AdapterErrorInfo;
  };

  'item.started': { turnId: string; item: ItemSnapshot };
  /** Incremental text. Accumulate per `itemId`; `item.completed` carries the authoritative full text. */
  'item.delta': { turnId: string; itemId: string; channel: ItemDeltaChannel; delta: string };
  'item.updated': { turnId: string; item: ItemSnapshot };
  'item.completed': { turnId: string; item: ItemSnapshot };

  /** The CLI waits for the user (FR-STATE-002). */
  'input.requested': { turnId: string; request: InputRequest };
  /** The request is no longer pending: answered by the user or cancelled. */
  'input.resolved': { turnId: string; requestId: string; resolution: InputResolution };

  /** Progress of a Stop request; diagnostic and for "stopping" affordances. */
  'stop.updated': { turnId: string; phase: StopPhase; detail?: string };

  /** The model for subsequent turns changed (FR-INPUT-002). `null` means the CLI default. */
  'model.changed': { model: string | null };

  'runtime.started': { generation: number; pid?: number };
  /** `duringTurn`: a turn was active (running or stopping) when the runtime exited. */
  'runtime.exited': RuntimeExitInfo & { duringTurn: boolean };

  /** Non-semantic information: late events, unknown native events, warnings. Not a state change. */
  diagnostic: {
    kind: 'late_event' | 'unhandled_native' | 'warning' | 'stderr' | 'protocol';
    message: string;
    native?: NativeDiagnostic;
  };
}

export type AdapterEventType = keyof AdapterEventPayloads;

export interface EventEnvelope {
  /** Monotonic per-session sequence number, starting at 1. */
  seq: number;
  /** Epoch milliseconds. */
  at: number;
  providerId: ProviderId;
  /** Adapter-local session id (not persisted, not the native id). */
  sessionId: string;
}

export type AdapterEvent = {
  [K in AdapterEventType]: EventEnvelope & { type: K } & AdapterEventPayloads[K];
}[AdapterEventType];

export type AdapterEventOf<K extends AdapterEventType> = Extract<AdapterEvent, { type: K }>;

export type AdapterEventListener = (event: AdapterEvent) => void;
