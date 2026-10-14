import { randomUUID } from 'node:crypto';
import { adapterError, AdapterError, type AdapterErrorInfo, toAdapterError } from '../errors.js';
import type { AdapterEvent, AdapterEventListener, AdapterEventPayloads, AdapterEventType } from '../events.js';
import type { AgentSession, ProviderCapabilities, Unsubscribe } from '../provider.js';
import type {
  ApprovalRequest,
  CleanupReport,
  InputRequest,
  InputResolution,
  InputResponse,
  ItemDeltaChannel,
  ItemSnapshot,
  ItemStatus,
  ModelInfo,
  NativeTurnEnd,
  ProviderId,
  QuestionRequest,
  RecoveryReport,
  ReplyWithTextResult,
  RuntimeExitInfo,
  SessionCloseReason,
  SessionRuntimeState,
  StopPhase,
  StopRecoveryReason,
  StopResult,
  StopSummary,
  TurnOutcome,
  TurnSnapshot,
  UserInput,
} from '../types.js';
import { acceptsFreeTextAnswer } from '../types.js';
import { deferred, type Deferred, monotonicMs, withTimeout } from './async.js';
import { EventStream } from './emitter.js';
import { type AdapterTimeouts, resolveTimeouts } from './timeouts.js';
import { TurnGuard, type TurnRecord } from './turn-guard.js';

// ---------------------------------------------------------------------------
// Driver contract (implemented by each provider)
// ---------------------------------------------------------------------------

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** What a driver supplies for a Needs Input request; the controller adds ids and timestamps. */
export type InputRequestInit = DistributiveOmit<ApprovalRequest | QuestionRequest, 'requestId' | 'turnId' | 'createdAt'>;

export interface PendingInputRecord {
  readonly request: InputRequest;
  /** Whatever the driver needs to answer natively (JSON-RPC request, SDK callback, ...). */
  readonly nativeRef: unknown;
}

export interface TurnContext {
  readonly turnId: string;
  /** Aborted when the turn reaches its terminal state. */
  readonly signal: AbortSignal;
}

export interface StopContext {
  readonly turnId: string;
  readonly nativeTurnId: string | undefined;
  readonly requestedAt: number;
  /** Aborted when the current phase's bounded wait expires. */
  readonly signal: AbortSignal;
  /** Requests cancelled by this Stop. `interruptTurn` releases them natively in protocol order. */
  readonly cancelledInputs: readonly PendingInputRecord[];
  readonly nativeEnd: NativeTurnEnd | undefined;
  readonly runtimeExited: boolean;
  /** Set for `recoverRuntime`: why the normal path could not finish. */
  readonly recoveryReason?: StopRecoveryReason;
}

/**
 * Provider-specific half of a session. The controller owns turn state, Stop sequencing, input
 * bookkeeping and event emission; a driver only talks to its CLI and reports through the sink.
 */
export interface SessionDriver {
  /** Submits input natively. Resolve when the CLI accepted it; rejection fails the turn. */
  startTurn(turn: TurnContext, input: UserInput): Promise<void>;
  /** Adds input to the running turn. Only used when `capabilities.inputWhileRunning === 'steer'`. */
  steerTurn?(turn: TurnContext, input: UserInput): Promise<void>;
  /**
   * Stop phase 1: request the native interrupt (and release `cancelledInputs`). Resolve on
   * acknowledgement; the terminal state is reported through `sink.nativeTurnEnded`.
   */
  interruptTurn(stop: StopContext): Promise<void>;
  /**
   * Stop phase 2 (after the native terminal state): terminate this turn's processes and prove
   * they exited at system level. Return `unsupported` / `failed` to trigger recovery.
   */
  cleanupAfterInterrupt?(stop: StopContext): Promise<CleanupReport>;
  /**
   * Stop fallback: terminate this session's isolated runtime, confirm exit, start a new runtime
   * and resume the same native id (report it via `sink.nativeSessionId`). Never re-run the
   * cancelled input. Reject with `resume_failed` or `stop_cleanup_failed` when it cannot.
   */
  recoverRuntime?(stop: StopContext): Promise<RecoveryReport>;
  respondToInput(record: PendingInputRecord, response: InputResponse): Promise<void>;
  /**
   * Composer reply that is not an answer (I-Q2): decline every listed request natively with `text`
   * as the explanation and make sure the agent receives `text` and continues the current turn
   * (Claude: `canUseTool` deny message; Codex: decline, then deliver the text — W2 verifies how).
   */
  declineInputsWithText(records: readonly PendingInputRecord[], text: string): Promise<void>;
  /** Releases a request cancelled outside Stop (turn ended, runtime exited, disposed). Best effort. */
  cancelInput?(record: PendingInputRecord, reason: CancelReason): Promise<void> | void;
  setModel(model: string | null): Promise<void>;
  listModels(): Promise<ModelInfo[]>;
  /**
   * Terminates the runtime and resolves only once its exit is confirmed; rejects when it is not.
   * Must coalesce pending calls, treat a settled success as a no-op, and retry on the same exact
   * runtime handle after a rejection (never by pid, never by starting another runtime).
   */
  dispose(): Promise<void>;
}

type CancelReason = Extract<InputResolution, { status: 'cancelled' }>['reason'];

/** Channel through which a driver reports native activity. Safe to call at any time. */
export interface SessionSink {
  readonly sessionId: string;
  readonly currentTurnId: string | undefined;
  readonly state: SessionRuntimeState;
  /** Report the native conversation id. It may arrive asynchronously; it can never change later. */
  nativeSessionId(id: string): void;
  bindNativeTurnId(turnId: string, nativeTurnId: string): void;
  turnIdForNative(nativeTurnId: string): string | undefined;
  itemStarted(turnId: string, item: ItemSnapshot): void;
  itemDelta(turnId: string, itemId: string, channel: ItemDeltaChannel, delta: string): void;
  itemUpdated(turnId: string, item: ItemSnapshot): void;
  itemCompleted(turnId: string, item: ItemSnapshot): void;
  /**
   * Registers a Needs Input request. Returns the adapter request id, or `undefined` when the
   * request is not accepted (turn finished, stopping, closed) — the driver must then release
   * the native request itself (e.g. answer decline / cancel).
   */
  inputRequested(turnId: string, request: InputRequestInit, nativeRef: unknown): string | undefined;
  /** The CLI resolved a request on its own (e.g. Codex `serverRequest/resolved`). */
  inputResolvedNatively(requestId: string): void;
  findInputByNativeRef(predicate: (nativeRef: unknown) => boolean): PendingInputRecord | undefined;
  /** Native terminal state. A `failed` end with code `resume_failed` also closes the session. */
  nativeTurnEnded(turnId: string, end: NativeTurnEnd): void;
  modelChanged(model: string | null): void;
  /** Conversation title reported by the CLI (optional capability). */
  nativeTitle(title: string): void;
  runtimeStarted(info: { generation: number; pid?: number }): void;
  runtimeExited(info: RuntimeExitInfo): void;
  /** Session-level error that does not end the session. */
  error(error: AdapterErrorInfo): void;
  /** Unrecoverable error: fails the active turn and closes the session. */
  fatal(error: AdapterErrorInfo): void;
  diagnostic(entry: AdapterEventPayloads['diagnostic']): void;
}

export interface SessionControllerOptions {
  providerId: ProviderId;
  capabilities: ProviderCapabilities;
  timeouts?: Partial<AdapterTimeouts>;
  /** For resumed sessions: the only native id this session may bind to (04 §4 rule 7). */
  expectedNativeSessionId?: string;
  /** Model the session was created with (`undefined` = CLI default). */
  initialModel?: string;
  sessionId?: string;
  /** Epoch clock (tests). */
  now?: () => number;
  /** Monotonic clock for durations (tests). */
  monotonic?: () => number;
  onListenerError?: (error: unknown) => void;
}

interface PendingEntry {
  request: InputRequest;
  nativeRef: unknown;
  answering: boolean;
}

interface ActiveTurn {
  record: TurnRecord;
  abort: AbortController;
  startPromise: Promise<void>;
  nativeEnd: Deferred<void>;
  openItems: Map<string, ItemSnapshot>;
  text: Map<string, string>;
  runtimeExited: boolean;
  stop?: { requestedAt: number; promise: Promise<StopResult>; cancelled: PendingInputRecord[] };
}

const MAX_BUFFERED_EVENTS = 2000;

/**
 * Provider-agnostic implementation of {@link AgentSession}. Encodes the turn and Stop rules
 * (FR-STATE-001..003, 04 §4 rules 1–7, 06 §5) once for all providers.
 */
export class SessionController implements AgentSession {
  readonly providerId: ProviderId;
  readonly sessionId: string;
  readonly capabilities: ProviderCapabilities;
  readonly sink: SessionSink;

  private readonly driver: SessionDriver;
  private readonly timeouts: AdapterTimeouts;
  private readonly guard = new TurnGuard();
  private readonly events: EventStream<AdapterEvent>;
  private buffered: AdapterEvent[] | undefined = [];
  private seq = 0;
  private native: string | undefined;
  private readonly expectedNative: string | undefined;
  private modelValue: string | undefined;
  private active: ActiveTurn | undefined;
  private readonly pending = new Map<string, PendingEntry>();
  private runtimeGeneration = 0;
  private fatalError: AdapterError | undefined;
  private closeError: AdapterErrorInfo | undefined;
  private title: string | undefined;
  private readonly closedSignal = deferred<SessionCloseReason>();
  private readonly releasedSignal = deferred<void>();
  private disposing: Promise<void> | undefined;
  private driverDisposal: Promise<void> | undefined;
  private readonly now: () => number;
  private readonly monotonic: () => number;

  constructor(options: SessionControllerOptions, createDriver: (sink: SessionSink) => SessionDriver) {
    this.providerId = options.providerId;
    this.capabilities = options.capabilities;
    this.sessionId = options.sessionId ?? randomUUID();
    this.timeouts = resolveTimeouts(options.timeouts);
    this.expectedNative = options.expectedNativeSessionId;
    this.modelValue = options.initialModel;
    this.now = options.now ?? Date.now;
    this.monotonic = options.monotonic ?? monotonicMs;
    this.events = new EventStream<AdapterEvent>(
      options.onListenerError ? { onListenerError: options.onListenerError } : {},
    );
    this.sink = this.createSink();
    this.driver = createDriver(this.sink);
  }

  // -------------------------------------------------------------------------
  // AgentSession
  // -------------------------------------------------------------------------

  get nativeSessionId(): string | undefined {
    return this.native;
  }

  get state(): SessionRuntimeState {
    return this.guard.state;
  }

  get activeTurn(): TurnSnapshot | undefined {
    const record = this.active?.record;
    if (!record) return undefined;
    const snapshot: TurnSnapshot = {
      turnId: record.turnId,
      startedAt: record.startedAt,
      stopRequested: record.stopRequestedAt !== undefined,
    };
    if (record.nativeTurnId) snapshot.nativeTurnId = record.nativeTurnId;
    return snapshot;
  }

  get pendingInputs(): readonly InputRequest[] {
    return [...this.pending.values()].map((entry) => entry.request);
  }

  get model(): string | undefined {
    return this.modelValue;
  }

  /** Resolves with the close reason once the session is closed (used for shutdown tracking). */
  get closed(): Promise<SessionCloseReason> {
    return this.closedSignal.promise;
  }

  /**
   * Resolves once the driver confirmed that its runtime is released, whichever attempt succeeded
   * first (background release after a self-close, or an explicit `dispose()` retry). Never rejects;
   * it stays pending while release is unconfirmed or the session is still live.
   */
  get released(): Promise<void> {
    return this.releasedSignal.promise;
  }

  /** Events emitted before the first subscription are buffered and replayed to it. */
  subscribe(listener: AdapterEventListener): Unsubscribe {
    const unsubscribe = this.events.subscribe(listener);
    const buffered = this.buffered;
    if (buffered) {
      this.buffered = undefined;
      for (const event of buffered) this.events.emit(event);
    }
    return unsubscribe;
  }

  async sendUserInput(input: UserInput): Promise<{ turnId: string }> {
    validateUserInput(input);
    if (this.guard.state === 'running' && this.active && this.capabilities.inputWhileRunning === 'steer' && this.driver.steerTurn) {
      const turn = this.active;
      await this.driver.steerTurn({ turnId: turn.record.turnId, signal: turn.abort.signal }, input);
      return { turnId: turn.record.turnId };
    }
    this.guard.assertCanSubmit();

    const turnId = randomUUID();
    const record = this.guard.beginTurn(turnId, this.now(), this.monotonic());
    const turn: ActiveTurn = {
      record,
      abort: new AbortController(),
      startPromise: Promise.resolve(),
      nativeEnd: deferred<void>(),
      openItems: new Map(),
      text: new Map(),
      runtimeExited: false,
    };
    this.active = turn;
    this.emit('session.state', { state: 'running', previous: 'idle' });
    this.emit('turn.started', { turnId, startedAt: record.startedAt });

    let start: Promise<void>;
    try {
      start = Promise.resolve(this.driver.startTurn({ turnId, signal: turn.abort.signal }, input));
    } catch (error) {
      start = Promise.reject(error);
    }
    turn.startPromise = start.then(
      () => undefined,
      (error: unknown) => {
        this.onStartFailed(turn, toAdapterError(error, 'provider_error'));
      },
    );
    return { turnId };
  }

  async respondToInput(requestId: string, response: InputResponse): Promise<void> {
    if (this.guard.state === 'closed') throw adapterError('invalid_state', 'The session is closed');
    const entry = this.pending.get(requestId);
    if (!entry) throw adapterError('invalid_argument', `Request ${requestId} is not pending`);
    if (entry.answering) throw adapterError('invalid_state', `Request ${requestId} is already being answered`);
    validateInputResponse(entry.request, response);
    await this.answer(requestId, entry, response, false);
  }

  async replyWithText(text: string): Promise<ReplyWithTextResult> {
    if (this.guard.state === 'closed') throw adapterError('invalid_state', 'The session is closed');
    if (typeof text !== 'string' || text.trim() === '') throw adapterError('invalid_argument', 'Reply text is empty');
    const turn = this.active;
    const entries = turn
      ? [...this.pending.entries()].filter(([, entry]) => !entry.answering && entry.request.turnId === turn.record.turnId)
      : [];
    if (!turn || this.guard.state !== 'running' || entries.length === 0) {
      throw adapterError('invalid_state', 'No pending input request to reply to');
    }

    const [only] = entries;
    if (entries.length === 1 && only && acceptsFreeTextAnswer(only[1].request)) {
      const [requestId, entry] = only;
      const question = (entry.request as QuestionRequest).questions[0]!;
      await this.answer(requestId, entry, { kind: 'answers', answers: { [question.id]: { text } } }, true);
      return { disposition: 'answered', requestIds: [requestId] };
    }

    for (const [, entry] of entries) entry.answering = true;
    try {
      await this.driver.declineInputsWithText(
        entries.map(([, entry]) => ({ request: entry.request, nativeRef: entry.nativeRef })),
        text,
      );
    } catch (error) {
      for (const [requestId, entry] of entries) {
        if (this.pending.get(requestId) === entry) entry.answering = false;
      }
      throw toAdapterError(error, 'provider_error');
    }
    for (const [requestId, entry] of entries) {
      if (this.pending.get(requestId) !== entry) continue;
      this.pending.delete(requestId);
      this.emit('input.resolved', {
        turnId: entry.request.turnId,
        requestId,
        resolution: { status: 'declined_with_text', text },
      });
    }
    return { disposition: 'declined', requestIds: entries.map(([requestId]) => requestId) };
  }

  private async answer(requestId: string, entry: PendingEntry, response: InputResponse, viaText: boolean): Promise<void> {
    entry.answering = true;
    try {
      await this.driver.respondToInput({ request: entry.request, nativeRef: entry.nativeRef }, response);
    } catch (error) {
      if (this.pending.get(requestId) === entry) entry.answering = false;
      throw toAdapterError(error, 'provider_error');
    }
    if (this.pending.get(requestId) !== entry) return;
    this.pending.delete(requestId);
    const resolution: InputResolution = { status: 'answered', response: redactSecretAnswers(entry.request, response) };
    if (viaText) resolution.viaText = true;
    this.emit('input.resolved', { turnId: entry.request.turnId, requestId, resolution });
  }

  stop(): Promise<StopResult> {
    const turn = this.active;
    if (this.guard.state === 'closed' || !turn) return Promise.resolve({ status: 'not_running' });
    if (turn.stop) return turn.stop.promise;
    const outcome = this.guard.requestStop(this.now());
    if (outcome !== 'requested') return Promise.resolve({ status: 'not_running' });

    const requestedAt = turn.record.stopRequestedAt as number;
    const cancelled: PendingInputRecord[] = [];
    for (const [requestId, entry] of this.pending) {
      if (entry.request.turnId !== turn.record.turnId) continue;
      this.pending.delete(requestId);
      cancelled.push({ request: entry.request, nativeRef: entry.nativeRef });
    }
    const stop = { requestedAt, cancelled, promise: Promise.resolve<StopResult>({ status: 'not_running' }) };
    turn.stop = stop;
    this.emit('session.state', { state: 'stopping', previous: 'running' });
    this.emit('stop.updated', { turnId: turn.record.turnId, phase: 'requested' });
    for (const record of cancelled) {
      this.emit('input.resolved', {
        turnId: turn.record.turnId,
        requestId: record.request.requestId,
        resolution: { status: 'cancelled', reason: 'turn_stopping' },
      });
    }
    stop.promise = this.runStop(turn);
    return stop.promise;
  }

  async setModel(model: string | null): Promise<void> {
    if (this.guard.state === 'closed') throw adapterError('invalid_state', 'The session is closed');
    if (model !== null && (typeof model !== 'string' || model.trim() === '')) {
      throw adapterError('invalid_argument', 'Model must be a non-empty string or null');
    }
    await this.driver.setModel(model);
    this.modelValue = model ?? undefined;
    this.emit('model.changed', { model });
  }

  listModels(): Promise<ModelInfo[]> {
    if (this.guard.state === 'closed') return Promise.reject(adapterError('invalid_state', 'The session is closed'));
    return this.driver.listModels();
  }

  /**
   * Closes the session and verifies that its runtime was released. Pending calls share one attempt
   * and a settled success is a no-op. Unconfirmed cleanup rejects and keeps the exact driver
   * handle, so calling `dispose()` again retries it even when `state` is already `closed`.
   */
  dispose(): Promise<void> {
    if (!this.disposing) {
      // Run synchronously (state closes at once) but publish the shared promise first, so a
      // listener that calls dispose() while events are emitted joins this attempt.
      const attempt = deferred<void>();
      const pending = attempt.promise;
      this.disposing = pending;
      this.runDispose().then(attempt.resolve, attempt.reject);
      void pending.catch(() => {
        if (this.disposing === pending) this.disposing = undefined;
      });
    }
    return this.disposing;
  }

  // -------------------------------------------------------------------------
  // Stop flow (04 §4 rules 1–7; 06 §5)
  // -------------------------------------------------------------------------

  private async runStop(turn: ActiveTurn): Promise<StopResult> {
    const turnId = turn.record.turnId;
    const t = this.timeouts;
    let recoveryReason: StopRecoveryReason | undefined;
    let cleanupReport: CleanupReport | undefined;
    let recovery: RecoveryReport | undefined;
    let failure: AdapterError | undefined;
    const phase = (p: StopPhase, detail?: string) =>
      this.emit('stop.updated', { turnId, phase: p, ...(detail === undefined ? {} : { detail }) });

    // Phase 1: interrupt (stop intent is already recorded and submissions are paused).
    if (!turn.record.nativeEnd && !turn.runtimeExited && !this.fatalError) {
      phase('interrupting');
      try {
        await withTimeout(() => turn.startPromise, t.interruptMs, 'Turn submission before interrupt');
        if (!turn.record.nativeEnd && !turn.runtimeExited) {
          await withTimeout((signal) => this.driver.interruptTurn(this.stopContext(turn, signal)), t.interruptMs, 'Interrupt');
        }
      } catch (error) {
        if (!turn.record.nativeEnd && !turn.runtimeExited) {
          recoveryReason = 'interrupt_failed';
          this.diagnostic('warning', `Interrupt failed: ${toAdapterError(error).message}`);
        }
      }
    }

    // Phase 2: wait for the native terminal state.
    if (!recoveryReason && !turn.record.nativeEnd && !turn.runtimeExited && !this.fatalError) {
      phase('awaiting_terminal');
      try {
        await withTimeout(() => turn.nativeEnd.promise, t.terminalMs, 'Native terminal state');
      } catch {
        if (!turn.record.nativeEnd) recoveryReason = 'terminal_timeout';
      }
    }
    if (!recoveryReason && turn.runtimeExited) recoveryReason = 'runtime_exited';

    const completedNatively = turn.record.nativeEnd?.status === 'completed' && !turn.runtimeExited;

    // Phase 3: clean up this turn's processes and obtain exit evidence (not for a turn that completed).
    if (!recoveryReason && !completedNatively && !this.fatalError && this.driver.cleanupAfterInterrupt) {
      phase('cleaning_up');
      try {
        cleanupReport = await withTimeout(
          (signal) => (this.driver.cleanupAfterInterrupt as NonNullable<SessionDriver['cleanupAfterInterrupt']>)(this.stopContext(turn, signal)),
          t.cleanupMs,
          'Stop cleanup',
        );
        if (cleanupReport.status === 'failed') recoveryReason = 'cleanup_failed';
        else if (cleanupReport.status === 'unsupported') recoveryReason = 'cleanup_unsupported';
      } catch (error) {
        const adapterErr = toAdapterError(error);
        recoveryReason = adapterErr.code === 'timeout' ? 'cleanup_timeout' : 'cleanup_failed';
        cleanupReport = { status: 'failed', scope: 'none', error: adapterErr.info };
      }
    }

    // Phase 4: fallback — restart the isolated runtime and resume the same native id.
    let runtimeGone = false;
    if (recoveryReason && !this.fatalError && this.active === turn) {
      if (this.capabilities.runtimeRecovery && this.driver.recoverRuntime) {
        phase('recovering', recoveryReason);
        try {
          const reason = recoveryReason;
          recovery = await withTimeout(
            (signal) => (this.driver.recoverRuntime as NonNullable<SessionDriver['recoverRuntime']>)(this.stopContext(turn, signal, reason)),
            t.recoveryMs,
            'Runtime recovery',
          );
        } catch (error) {
          const adapterErr = toAdapterError(error, 'stop_cleanup_failed');
          failure =
            adapterErr.code === 'resume_failed' || adapterErr.code === 'stop_cleanup_failed'
              ? adapterErr
              : adapterError('stop_cleanup_failed', `Runtime recovery failed: ${adapterErr.message}`, {
                  native: adapterErr.native ?? { source: 'adapter:recovery', message: adapterErr.message },
                });
        }
      } else if (recoveryReason === 'runtime_exited') {
        runtimeGone = true;
      } else {
        failure = adapterError(
          'stop_cleanup_failed',
          `Stop could not confirm cleanup (${recoveryReason}) and runtime recovery is unavailable`,
        );
      }
    }
    if (this.fatalError) failure ??= this.fatalError;

    // Another path (dispose timeout, native id mismatch) may already have finalized the turn.
    if (this.active !== turn) {
      const error = failure?.info ?? this.closeError;
      return { status: error ? 'failed' : 'stopped', turnId, ...(error ? { error } : {}) };
    }

    const nativeEnd = turn.record.nativeEnd;
    const outcome: TurnOutcome = completedNatively && !failure ? 'completed' : 'interrupted';
    const summary: StopSummary = {
      requestedAt: turn.stop?.requestedAt ?? this.now(),
      completedAt: this.now(),
      cleanup: failure
        ? 'failed'
        : recovery
          ? 'runtime_restarted'
          : cleanupReport?.status === 'confirmed'
            ? 'confirmed'
            : 'not_required',
    };
    if (cleanupReport) summary.cleanupReport = cleanupReport;
    if (recoveryReason) summary.recoveryReason = recoveryReason;
    if (recovery) summary.recovery = recovery;
    if (nativeEnd?.error) summary.nativeDiagnostic = nativeEnd.error.native ?? { source: 'native', message: nativeEnd.error.message };

    phase(failure ? 'failed' : 'completed', failure?.message);
    const closeReason: SessionCloseReason | undefined = failure
      ? this.fatalError
        ? 'fatal_error'
        : 'stop_failed'
      : runtimeGone
        ? 'runtime_exited'
        : undefined;
    const previous = closeReason ? this.guard.close() : undefined;
    this.finalizeTurn(turn, { outcome, stop: summary });
    if (closeReason) {
      if (failure && !this.fatalError) this.emit('session.error', { error: failure.info });
      this.completeClose(closeReason, previous as SessionRuntimeState, failure?.info);
    }

    const result: StopResult = {
      status: failure ? 'failed' : outcome === 'completed' ? 'already_completed' : 'stopped',
      turnId,
      summary,
    };
    if (failure) result.error = failure.info;
    return result;
  }

  private stopContext(turn: ActiveTurn, signal: AbortSignal, recoveryReason?: StopRecoveryReason): StopContext {
    return {
      turnId: turn.record.turnId,
      nativeTurnId: turn.record.nativeTurnId,
      requestedAt: turn.stop?.requestedAt ?? this.now(),
      signal,
      cancelledInputs: turn.stop?.cancelled ?? [],
      nativeEnd: turn.record.nativeEnd,
      runtimeExited: turn.runtimeExited,
      ...(recoveryReason ? { recoveryReason } : {}),
    };
  }

  // -------------------------------------------------------------------------
  // Turn completion
  // -------------------------------------------------------------------------

  private onStartFailed(turn: ActiveTurn, error: AdapterError): void {
    if (this.active !== turn || turn.record.nativeEnd) return;
    this.handleNativeEnd(turn.record.turnId, { status: 'failed', error: error.info });
  }

  private handleNativeEnd(turnId: string, end: NativeTurnEnd): void {
    const verdict = this.guard.recordNativeEnd(turnId, end, this.now());
    if (verdict !== 'accepted') {
      this.diagnostic('late_event', `Native terminal state for ${verdict} turn ${turnId} ignored`);
      return;
    }
    const turn = this.active as ActiveTurn;
    turn.nativeEnd.resolve();
    if (turn.stop) return; // The Stop flow correlates and finalizes.
    const outcome = end.status;
    const payload: { outcome: TurnOutcome; error?: AdapterErrorInfo; nativeDurationMs?: number } = { outcome };
    if (outcome === 'failed') payload.error = end.error ?? { code: 'provider_error', message: 'The turn failed' };
    if (end.nativeDurationMs !== undefined) payload.nativeDurationMs = end.nativeDurationMs;
    if (payload.error?.code === 'resume_failed') {
      // Lazily detected resume failure (e.g. Claude): the session is unusable; never continue in a new conversation.
      const previous = this.guard.close();
      this.finalizeTurn(turn, payload);
      this.completeClose('resume_failed', previous, payload.error);
      return;
    }
    this.finalizeTurn(turn, payload);
  }

  private finalizeTurn(
    turn: ActiveTurn,
    payload: { outcome: TurnOutcome; error?: AdapterErrorInfo; stop?: StopSummary; nativeDurationMs?: number },
  ): void {
    const turnId = turn.record.turnId;
    const endReason: CancelReason = turn.runtimeExited ? 'runtime_exited' : 'turn_ended';
    for (const [requestId, entry] of this.pending) {
      if (entry.request.turnId !== turnId) continue;
      this.pending.delete(requestId);
      this.releaseInput(entry, endReason);
      this.emit('input.resolved', { turnId, requestId, resolution: { status: 'cancelled', reason: endReason } });
    }
    const itemStatus: ItemStatus =
      payload.outcome === 'completed' ? 'completed' : payload.outcome === 'failed' ? 'failed' : 'interrupted';
    for (const item of turn.openItems.values()) {
      const closed: ItemSnapshot = { ...item, status: itemStatus };
      const text = turn.text.get(item.itemId);
      if (closed.text === undefined && text !== undefined) closed.text = text;
      this.emit('item.completed', { turnId, item: closed });
    }
    turn.openItems.clear();
    turn.text.clear();

    const previous = this.guard.state;
    const completedAt = this.now();
    const record = this.guard.finish(turnId, completedAt);
    this.active = undefined;
    turn.abort.abort();

    const event: AdapterEventPayloads['turn.completed'] = {
      turnId,
      outcome: payload.outcome,
      startedAt: record.startedAt,
      completedAt,
      durationMs: Math.max(0, Math.round(this.monotonic() - record.startedMono)),
      stopRequested: record.stopRequestedAt !== undefined,
    };
    if (record.nativeTurnId) event.nativeTurnId = record.nativeTurnId;
    const nativeDuration = payload.nativeDurationMs ?? record.nativeEnd?.nativeDurationMs;
    if (nativeDuration !== undefined) event.nativeDurationMs = nativeDuration;
    if (record.nativeEnd?.model) event.model = record.nativeEnd.model;
    if (payload.stop) event.stop = payload.stop;
    if (payload.outcome === 'failed' && payload.error) event.error = payload.error;
    this.emit('turn.completed', event);
    if (this.guard.state !== previous && this.guard.state === 'idle') {
      this.emit('session.state', { state: 'idle', previous });
    }
  }

  // -------------------------------------------------------------------------
  // Close / dispose
  // -------------------------------------------------------------------------

  /** Fails the active turn (if any) with `error` and closes the session. */
  private failAndClose(reason: SessionCloseReason, error: AdapterErrorInfo, turnError: AdapterErrorInfo = error): void {
    if (this.guard.state === 'closed') return;
    const previous = this.guard.close();
    const turn = this.active;
    if (turn) {
      if (turn.stop) {
        // A user Stop is in flight: the turn ends as interrupted, never as an error.
        turn.nativeEnd.resolve();
        this.finalizeTurn(turn, {
          outcome: 'interrupted',
          stop: {
            requestedAt: turn.stop.requestedAt,
            completedAt: this.now(),
            cleanup: turn.runtimeExited ? 'not_required' : 'failed',
          },
        });
      } else {
        this.finalizeTurn(turn, { outcome: 'failed', error: turnError });
      }
    }
    this.completeClose(reason, previous, error);
  }

  private completeClose(reason: SessionCloseReason, previous: SessionRuntimeState, error?: AdapterErrorInfo): void {
    if (error) this.closeError = error;
    const cancelReason: CancelReason = reason === 'disposed' ? 'disposed' : 'runtime_exited';
    for (const [requestId, entry] of this.pending) {
      this.pending.delete(requestId);
      this.releaseInput(entry, cancelReason);
      this.emit('input.resolved', { turnId: entry.request.turnId, requestId, resolution: { status: 'cancelled', reason: cancelReason } });
    }
    if (previous !== 'closed') this.emit('session.state', { state: 'closed', previous });
    this.emit('session.closed', { reason, ...(error ? { error } : {}) });
    this.closedSignal.resolve(reason);
    // Logical closure is not exit evidence. Keep the driver available for explicit retries.
    if (reason !== 'disposed') void this.disposeDriver().catch(() => {});
  }

  private async runDispose(): Promise<void> {
    if (this.active && this.guard.state !== 'closed') {
      try {
        await withTimeout(() => this.stop(), this.timeouts.disposeMs, 'Stop during dispose');
      } catch {
        // Fall through: the runtime is terminated below regardless.
      }
    }
    let previous: SessionRuntimeState | undefined;
    if (this.guard.state !== 'closed') {
      previous = this.guard.close();
      const turn = this.active;
      if (turn) {
        turn.nativeEnd.resolve();
        this.finalizeTurn(turn, {
          outcome: 'interrupted',
          stop: { requestedAt: turn.stop?.requestedAt ?? this.now(), completedAt: this.now(), cleanup: 'failed' },
        });
      }
    }
    try {
      await this.disposeDriver();
    } finally {
      // Events follow the runtime's exit (runtime.exited, then session.state / session.closed). A
      // release that stays unconfirmed still closes the session before the rejection is reported.
      if (previous !== undefined) this.completeClose('disposed', previous);
    }
    this.flushToNowhere();
    this.events.dispose();
  }

  private disposeDriver(): Promise<void> {
    if (!this.driverDisposal) {
      // Cache the actual operation, not its bounded observer: timeout must not start a
      // second cleanup while the first one is still running.
      const pending = (async () => this.driver.dispose())();
      this.driverDisposal = pending;
      void pending.then(() => this.releasedSignal.resolve(), (error: unknown) => {
        if (this.driverDisposal === pending) this.driverDisposal = undefined;
        this.diagnostic('warning', `Driver dispose failed: ${toAdapterError(error).message}`);
      });
    }
    return withTimeout(() => this.driverDisposal!, this.timeouts.disposeMs, 'Driver dispose');
  }

  private flushToNowhere(): void {
    // Never-subscribed sessions drop their buffer on dispose.
    this.buffered = undefined;
  }

  private releaseInput(entry: PendingEntry, reason: CancelReason): void {
    if (!this.driver.cancelInput) return;
    try {
      const result = this.driver.cancelInput({ request: entry.request, nativeRef: entry.nativeRef }, reason);
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch((error: unknown) =>
          this.diagnostic('warning', `Releasing request ${entry.request.requestId} failed: ${toAdapterError(error).message}`),
        );
      }
    } catch (error) {
      this.diagnostic('warning', `Releasing request ${entry.request.requestId} failed: ${toAdapterError(error).message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Sink
  // -------------------------------------------------------------------------

  private createSink(): SessionSink {
    const self = this;
    return {
      get sessionId() {
        return self.sessionId;
      },
      get currentTurnId() {
        return self.active?.record.turnId;
      },
      get state() {
        return self.guard.state;
      },
      nativeSessionId: (id) => this.onNativeSessionId(id),
      bindNativeTurnId: (turnId, nativeTurnId) => {
        if (!this.guard.bindNativeTurnId(turnId, nativeTurnId)) {
          this.diagnostic('warning', `Cannot bind native turn ${nativeTurnId} to turn ${turnId}`);
        }
      },
      turnIdForNative: (nativeTurnId) => this.guard.turnIdForNative(nativeTurnId),
      itemStarted: (turnId, item) => {
        const turn = this.turnFor(turnId, 'item.started');
        if (!turn) return;
        if (item.status === 'in_progress') turn.openItems.set(item.itemId, item);
        this.emit('item.started', { turnId, item });
      },
      itemDelta: (turnId, itemId, channel, delta) => {
        const turn = this.turnFor(turnId, 'item.delta');
        if (!turn) return;
        if (channel !== 'output') turn.text.set(itemId, (turn.text.get(itemId) ?? '') + delta);
        this.emit('item.delta', { turnId, itemId, channel, delta });
      },
      itemUpdated: (turnId, item) => {
        const turn = this.turnFor(turnId, 'item.updated');
        if (!turn) return;
        if (turn.openItems.has(item.itemId)) turn.openItems.set(item.itemId, item);
        this.emit('item.updated', { turnId, item });
      },
      itemCompleted: (turnId, item) => {
        const turn = this.turnFor(turnId, 'item.completed');
        if (!turn) return;
        const completed: ItemSnapshot = { ...item };
        const text = turn.text.get(item.itemId);
        if (completed.text === undefined && text !== undefined) completed.text = text;
        turn.openItems.delete(item.itemId);
        turn.text.delete(item.itemId);
        this.emit('item.completed', { turnId, item: completed });
      },
      inputRequested: (turnId, init, nativeRef) => this.onInputRequested(turnId, init, nativeRef),
      inputResolvedNatively: (requestId) => {
        const entry = this.pending.get(requestId);
        if (!entry) return;
        this.pending.delete(requestId);
        this.emit('input.resolved', {
          turnId: entry.request.turnId,
          requestId,
          resolution: { status: 'cancelled', reason: 'native_resolved' },
        });
      },
      findInputByNativeRef: (predicate) => {
        for (const entry of this.pending.values()) {
          if (predicate(entry.nativeRef)) return { request: entry.request, nativeRef: entry.nativeRef };
        }
        return undefined;
      },
      nativeTurnEnded: (turnId, end) => this.handleNativeEnd(turnId, end),
      modelChanged: (model) => {
        this.modelValue = model ?? undefined;
        this.emit('model.changed', { model });
      },
      nativeTitle: (title) => {
        const trimmed = typeof title === 'string' ? title.trim() : '';
        if (trimmed === '' || trimmed === this.title) return;
        this.title = trimmed;
        this.emit('session.title', { title: trimmed });
      },
      runtimeStarted: (info) => {
        this.runtimeGeneration = Math.max(this.runtimeGeneration, info.generation);
        this.emit('runtime.started', info);
      },
      runtimeExited: (info) => this.onRuntimeExited(info),
      error: (error) => this.emit('session.error', { error }),
      fatal: (error) => this.onFatal(error),
      diagnostic: (entry) => this.emit('diagnostic', entry),
    };
  }

  private turnFor(turnId: string, what: string): ActiveTurn | undefined {
    const cls = this.guard.classify(turnId);
    if (cls === 'current' && this.active) return this.active;
    this.diagnostic(cls === 'finished' ? 'late_event' : 'unhandled_native', `${what} for ${cls} turn ${turnId} dropped`);
    return undefined;
  }

  private onNativeSessionId(id: string): void {
    const expected = this.native ?? this.expectedNative;
    if (expected === undefined) {
      this.native = id;
      this.emit('session.native_id', { nativeSessionId: id });
      return;
    }
    if (id === expected) {
      if (this.native === undefined) {
        this.native = id;
        this.emit('session.native_id', { nativeSessionId: id });
      }
      return;
    }
    // A different native id means a new conversation was created: never accept it silently.
    const error = adapterError(
      'resume_failed',
      `Native session id changed from ${expected} to ${id}; refusing to continue in a different conversation`,
      { native: { source: 'adapter:native-id', detail: { expected, received: id } } },
    );
    this.emit('session.error', { error: error.info });
    this.failAndClose('resume_failed', error.info);
  }

  private onInputRequested(turnId: string, init: InputRequestInit, nativeRef: unknown): string | undefined {
    const turn = this.active;
    if (
      !turn ||
      turn.record.turnId !== turnId ||
      turn.stop ||
      turn.record.nativeEnd ||
      this.guard.state !== 'running'
    ) {
      this.diagnostic('late_event', `Input request (${init.nativeType}) for turn ${turnId} not accepted in state ${this.guard.state}`);
      return undefined;
    }
    const requestId = randomUUID();
    const request = { ...init, requestId, turnId, createdAt: this.now() } as InputRequest;
    this.pending.set(requestId, { request, nativeRef, answering: false });
    this.emit('input.requested', { turnId, request });
    return requestId;
  }

  private onRuntimeExited(info: RuntimeExitInfo): void {
    if (info.generation < this.runtimeGeneration) {
      this.diagnostic('late_event', `Exit of superseded runtime generation ${info.generation} ignored`);
      return;
    }
    const turn = this.active;
    this.emit('runtime.exited', { ...info, duringTurn: turn !== undefined });
    if (info.expected || this.guard.state === 'closed') return;
    const native = {
      source: 'runtime:exit',
      code: info.code ?? info.signal ?? 'unknown',
      message: `Runtime exited unexpectedly (code ${String(info.code)}, signal ${String(info.signal)})`,
      ...(info.stderrTail ? { detail: { stderrTail: info.stderrTail } } : {}),
    };
    const error: AdapterErrorInfo = { code: 'runtime_crashed', message: native.message, native };
    if (turn?.stop) {
      // The Stop flow treats a runtime exit as the terminal state and decides about recovery.
      turn.runtimeExited = true;
      this.guard.recordNativeEnd(turn.record.turnId, { status: 'interrupted', error }, this.now());
      turn.nativeEnd.resolve();
      return;
    }
    if (turn) turn.runtimeExited = true;
    this.failAndClose('runtime_exited', error);
  }

  private onFatal(error: AdapterErrorInfo): void {
    if (this.guard.state === 'closed' || this.fatalError) return;
    this.emit('session.error', { error });
    const turn = this.active;
    if (turn?.stop) {
      // Let the Stop flow finish (as interrupted) and close with this error.
      this.fatalError = new AdapterError(error);
      turn.nativeEnd.resolve();
      return;
    }
    this.failAndClose('fatal_error', error);
  }

  // -------------------------------------------------------------------------
  // Emission
  // -------------------------------------------------------------------------

  private emit<K extends AdapterEventType>(type: K, payload: AdapterEventPayloads[K]): void {
    const event = {
      ...payload,
      type,
      seq: ++this.seq,
      at: this.now(),
      providerId: this.providerId,
      sessionId: this.sessionId,
    } as unknown as AdapterEvent;
    if (this.buffered) {
      this.buffered.push(event);
      if (this.buffered.length > MAX_BUFFERED_EVENTS) this.buffered.shift();
      return;
    }
    this.events.emit(event);
  }

  private diagnostic(kind: AdapterEventPayloads['diagnostic']['kind'], message: string): void {
    this.emit('diagnostic', { kind, message });
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateUserInput(input: UserInput): void {
  if (!input || typeof input.text !== 'string') throw adapterError('invalid_argument', 'Input text must be a string');
  const hasAttachments = Array.isArray(input.attachments) && input.attachments.length > 0;
  if (input.text.trim() === '' && !hasAttachments) throw adapterError('invalid_argument', 'Input is empty');
}

export function validateInputResponse(request: InputRequest, response: InputResponse): void {
  if (request.kind === 'approval') {
    if (response.kind !== 'approval') throw adapterError('invalid_argument', 'Approval requests take an approval response');
    if (!request.options.some((option) => option.id === response.optionId)) {
      throw adapterError('invalid_argument', `Unknown option ${response.optionId}`);
    }
    if (response.message !== undefined && !request.allowsMessage) {
      throw adapterError('invalid_argument', 'This request does not accept a message');
    }
    return;
  }
  if (response.kind !== 'answers') throw adapterError('invalid_argument', 'Question requests take an answers response');
  for (const question of request.questions) {
    const answer = response.answers[question.id];
    if (!answer) throw adapterError('invalid_argument', `Missing answer for question ${question.id}`);
    const optionIds = answer.optionIds ?? [];
    for (const optionId of optionIds) {
      if (!question.options.some((option) => option.id === optionId)) {
        throw adapterError('invalid_argument', `Unknown option ${optionId} for question ${question.id}`);
      }
    }
    if (!question.multiSelect && optionIds.length > 1) {
      throw adapterError('invalid_argument', `Question ${question.id} accepts a single option`);
    }
    if (answer.text !== undefined && !question.allowFreeText) {
      throw adapterError('invalid_argument', `Question ${question.id} does not accept free text`);
    }
    if (optionIds.length === 0 && (answer.text === undefined || answer.text.trim() === '')) {
      throw adapterError('invalid_argument', `Empty answer for question ${question.id}`);
    }
  }
  for (const questionId of Object.keys(response.answers)) {
    if (!request.questions.some((question) => question.id === questionId)) {
      throw adapterError('invalid_argument', `Unknown question ${questionId}`);
    }
  }
}

function redactSecretAnswers(request: InputRequest, response: InputResponse): InputResponse {
  if (request.kind !== 'question' || response.kind !== 'answers') return response;
  const secret = new Set(request.questions.filter((q) => q.secret).map((q) => q.id));
  if (secret.size === 0) return response;
  const answers: Record<string, { optionIds?: readonly string[]; text?: string }> = {};
  for (const [id, answer] of Object.entries(response.answers)) {
    answers[id] = secret.has(id) && answer.text !== undefined ? { ...answer, text: '[secret]' } : answer;
  }
  return { kind: 'answers', answers };
}
