import { randomUUID } from 'node:crypto';
import { adapterError, type AdapterErrorInfo } from '../errors.js';
import { buildAvailabilityReport, ok } from '../availability.js';
import { LiveSessions } from '../core/live-sessions.js';
import {
  SessionController,
  type PendingInputRecord,
  type SessionDriver,
  type SessionSink,
  type StopContext,
  type TurnContext,
} from '../core/session-controller.js';
import type {
  AgentProvider,
  AgentSession,
  AvailabilityOptions,
  AvailabilityReport,
  CreateSessionOptions,
  ProviderCapabilities,
  ResumeSessionOptions,
} from '../provider.js';
import type { CleanupReport, InputResponse, ModelInfo, RecoveryReport, UserInput } from '../types.js';

export interface ScriptedDriverBehavior {
  /** Runs inside `startTurn`; default accepts the input and does nothing else. */
  onStartTurn?: (turn: TurnContext, input: UserInput, sink: SessionSink) => void | Promise<void>;
  /** When set, the driver implements `steerTurn` (input while running). */
  onSteer?: (turn: TurnContext, input: UserInput, sink: SessionSink) => void | Promise<void>;
  /** Runs inside `interruptTurn`; default acknowledges and reports a native `interrupted` end. */
  onInterrupt?: (stop: StopContext, sink: SessionSink) => void | Promise<void>;
  /** When set, the driver implements `cleanupAfterInterrupt`. */
  cleanup?: (stop: StopContext) => CleanupReport | Promise<CleanupReport>;
  /** When set, the driver implements `recoverRuntime`. */
  recover?: (stop: StopContext, sink: SessionSink) => RecoveryReport | Promise<RecoveryReport>;
  onRespond?: (record: PendingInputRecord, response: InputResponse) => void | Promise<void>;
  onDeclineWithText?: (records: readonly PendingInputRecord[], text: string) => void | Promise<void>;
  onSetModel?: (model: string | null) => void | Promise<void>;
  models?: ModelInfo[];
}

export interface DriverCall {
  method: string;
  args: unknown[];
}

/** Configurable {@link SessionDriver} for controller and session-manager tests. */
export class ScriptedDriver implements SessionDriver {
  readonly calls: DriverCall[] = [];
  disposed = false;

  constructor(
    readonly sink: SessionSink,
    public behavior: ScriptedDriverBehavior = {},
  ) {}

  async startTurn(turn: TurnContext, input: UserInput): Promise<void> {
    this.calls.push({ method: 'startTurn', args: [turn.turnId, input] });
    await this.behavior.onStartTurn?.(turn, input, this.sink);
  }

  get steerTurn(): ((turn: TurnContext, input: UserInput) => Promise<void>) | undefined {
    const onSteer = this.behavior.onSteer;
    if (!onSteer) return undefined;
    return async (turn, input) => {
      this.calls.push({ method: 'steerTurn', args: [turn.turnId, input] });
      await onSteer(turn, input, this.sink);
    };
  }

  async interruptTurn(stop: StopContext): Promise<void> {
    this.calls.push({ method: 'interruptTurn', args: [stop.turnId, stop.cancelledInputs.map((r) => r.request.requestId)] });
    if (this.behavior.onInterrupt) {
      await this.behavior.onInterrupt(stop, this.sink);
      return;
    }
    queueMicrotask(() => this.sink.nativeTurnEnded(stop.turnId, { status: 'interrupted' }));
  }

  get cleanupAfterInterrupt(): ((stop: StopContext) => Promise<CleanupReport>) | undefined {
    const cleanup = this.behavior.cleanup;
    if (!cleanup) return undefined;
    return async (stop) => {
      this.calls.push({ method: 'cleanupAfterInterrupt', args: [stop.turnId] });
      return cleanup(stop);
    };
  }

  get recoverRuntime(): ((stop: StopContext) => Promise<RecoveryReport>) | undefined {
    const recover = this.behavior.recover;
    if (!recover) return undefined;
    return async (stop) => {
      this.calls.push({ method: 'recoverRuntime', args: [stop.turnId, stop.recoveryReason] });
      return recover(stop, this.sink);
    };
  }

  async respondToInput(record: PendingInputRecord, response: InputResponse): Promise<void> {
    this.calls.push({ method: 'respondToInput', args: [record.request.requestId, response] });
    await this.behavior.onRespond?.(record, response);
  }

  async declineInputsWithText(records: readonly PendingInputRecord[], text: string): Promise<void> {
    this.calls.push({ method: 'declineInputsWithText', args: [records.map((r) => r.request.requestId), text] });
    await this.behavior.onDeclineWithText?.(records, text);
  }

  cancelInput(record: PendingInputRecord, reason: string): void {
    this.calls.push({ method: 'cancelInput', args: [record.request.requestId, reason] });
  }

  async setModel(model: string | null): Promise<void> {
    this.calls.push({ method: 'setModel', args: [model] });
    await this.behavior.onSetModel?.(model);
  }

  async listModels(): Promise<ModelInfo[]> {
    this.calls.push({ method: 'listModels', args: [] });
    return this.behavior.models ?? [];
  }

  async dispose(): Promise<void> {
    this.calls.push({ method: 'dispose', args: [] });
    this.disposed = true;
  }

  callsTo(method: string): DriverCall[] {
    return this.calls.filter((call) => call.method === method);
  }
}

export interface FakeSessionRecord {
  controller: SessionController;
  driver: ScriptedDriver;
  options: CreateSessionOptions | ResumeSessionOptions;
}

/**
 * In-memory {@link AgentProvider} built on the real {@link SessionController}, so consumers
 * (e.g. the session manager) can be tested against the adapter contract without CLIs.
 */
export class FakeProvider implements AgentProvider {
  readonly displayName: string;
  capabilities: ProviderCapabilities;
  availability: Omit<AvailabilityReport, 'providerId' | 'checkedAt' | 'status' | 'reason'>;
  behavior: ScriptedDriverBehavior;
  models: ModelInfo[];
  /** Native ids that `resumeSession` accepts; created sessions are added automatically. */
  readonly knownNativeIds = new Set<string>();
  readonly sessions: FakeSessionRecord[] = [];
  resumeFailure: AdapterErrorInfo | undefined;
  private readonly live = new LiveSessions();

  constructor(
    readonly id: string = 'fake',
    options: {
      displayName?: string;
      capabilities?: Partial<ProviderCapabilities>;
      behavior?: ScriptedDriverBehavior;
      models?: ModelInfo[];
    } = {},
  ) {
    this.displayName = options.displayName ?? 'Fake CLI';
    this.capabilities = {
      nativeSessionIdTiming: 'on_create',
      inputWhileRunning: 'none',
      questionRequests: true,
      freeTextAnswers: { questions: true, approvals: false },
      nativeTitle: false,
      runtimeRecovery: false,
      ...options.capabilities,
    };
    this.behavior = options.behavior ?? {};
    this.models = options.models ?? [{ id: 'fake-model', displayName: 'Fake Model', isDefault: true }];
    this.availability = {
      executable: ok({ path: '/usr/local/bin/fake', source: 'path' }),
      version: ok({ version: '1.0.0', raw: 'fake 1.0.0', compatibility: 'tested' }),
      login: ok({ state: 'logged_in' }),
      models: ok({ models: this.models }),
    };
  }

  async checkAvailability(_options: AvailabilityOptions): Promise<AvailabilityReport> {
    return buildAvailabilityReport(this.id, this.availability);
  }

  async listModels(): Promise<ModelInfo[]> {
    return [...this.models];
  }

  async createSession(options: CreateSessionOptions): Promise<AgentSession> {
    const record = this.build(options);
    if (this.capabilities.nativeSessionIdTiming === 'on_create') {
      const nativeId = randomUUID();
      this.knownNativeIds.add(nativeId);
      record.controller.sink.nativeSessionId(nativeId);
    }
    return record.controller;
  }

  async resumeSession(options: ResumeSessionOptions): Promise<AgentSession> {
    if (this.resumeFailure) throw adapterError(this.resumeFailure.code, this.resumeFailure.message);
    if (!this.knownNativeIds.has(options.nativeSessionId)) {
      throw adapterError('resume_failed', `No native session ${options.nativeSessionId}`);
    }
    const record = this.build(options, options.nativeSessionId);
    record.controller.sink.nativeSessionId(options.nativeSessionId);
    return record.controller;
  }

  /** Shutdown: disposes every live session (see `AgentProvider.dispose`). */
  async dispose(): Promise<void> {
    await this.releaseRuntimes();
  }

  releaseRuntimes(cwd?: string): Promise<void> { return this.live.disposeAll(cwd); }

  private build(options: CreateSessionOptions | ResumeSessionOptions, expectedNativeSessionId?: string): FakeSessionRecord {
    let driver!: ScriptedDriver;
    const controller = new SessionController(
      {
        providerId: this.id,
        capabilities: this.capabilities,
        ...(options.timeouts ? { timeouts: options.timeouts } : {}),
        ...(expectedNativeSessionId ? { expectedNativeSessionId } : {}),
        ...(options.overrides?.model ? { initialModel: options.overrides.model } : {}),
      },
      (sink) => {
        driver = new ScriptedDriver(sink, { models: this.models, ...this.behavior });
        return driver;
      },
    );
    const record = { controller, driver, options };
    this.sessions.push(record);
    this.live.add(controller, options.cwd);
    return record;
  }
}
