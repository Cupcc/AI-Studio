import { adapterError } from '../errors.js';
import type { SessionOptionsBase, Unsubscribe } from '../provider.js';
import type { CleanupReport, InputResponse, ModelInfo, RecoveryReport, UserInput } from '../types.js';
import type { PendingInputRecord, SessionDriver, SessionSink, StopContext, TurnContext } from '../core/session-controller.js';
import { RuntimeSlot } from '../core/runtime-slot.js';
import type { RuntimeHandle, RuntimeSpawnOptions } from '../core/runtime-process.js';
import type { ProcessLister } from '../core/process-probe.js';
import type { IncomingRequest, JsonRpcNotification } from '../core/json-rpc.js';
import { resolveTimeouts } from '../core/timeouts.js';
import { withTimeout } from '../core/async.js';
import { CodexConnection } from './connection.js';
import { codexError, turnError } from './errors.js';
import { answerRequest, mapItem, mapRequest, nativeInput, type NativeInputRef } from './mapping.js';
import { CodexProcessTracker } from './process-tracker.js';
import type { ThreadStartParams } from './protocol/v2/ThreadStartParams.js';
import type { TurnStartParams } from './protocol/v2/TurnStartParams.js';
import type { Turn } from './protocol/v2/Turn.js';
import type { ThreadItem } from './protocol/v2/ThreadItem.js';
import type { ErrorNotification } from './protocol/v2/ErrorNotification.js';

export interface CodexProviderOptions {
  /** Native configuration overrides. Omitted by default; never edits CLI configuration files. */
  config?: ThreadStartParams['config'];
  baseInstructions?: string;
  developerInstructions?: string;
  effort?: TurnStartParams['effort'];
  collaborationMode?: TurnStartParams['collaborationMode'];
}
export interface DriverDependencies {
  runtimeFactory(options: RuntimeSpawnOptions): Promise<RuntimeHandle>;
  processLister: ProcessLister;
}

export class CodexDriver implements SessionDriver {
  private readonly timeouts;
  private readonly slot: RuntimeSlot;
  private connection: CodexConnection | undefined;
  private tracker: CodexProcessTracker | undefined;
  private readonly listeners: Unsubscribe[] = [];
  private threadId: string | undefined;
  private desiredModel: string | undefined;
  private pendingTurn: string | undefined;
  private nativeTurn: string | undefined;
  private actualModel: string | undefined;
  private readonly turnModels = new Map<string, string>();
  private readonly deferredNotifications: JsonRpcNotification[] = [];
  private operationSignal: AbortSignal | undefined;
  private disposed = false;
  private disposal: Promise<void> | undefined;
  private retiring = false;

  constructor(
    private readonly sink: SessionSink,
    private readonly options: SessionOptionsBase,
    private readonly extras: CodexProviderOptions,
    executable: string,
    private readonly dependencies: DriverDependencies,
  ) {
    this.timeouts = resolveTimeouts(options.timeouts);
    this.desiredModel = options.overrides?.model;
    this.slot = new RuntimeSlot(async (generation) => {
      this.operationSignal?.throwIfAborted();
      if (this.disposed) throw adapterError('disposed', 'Codex Session is disposed');
      const runtime = await dependencies.runtimeFactory({ command: executable, args: ['app-server', '--listen', 'stdio://'],
        cwd: options.cwd, env: options.environment.env, label: 'codex app-server', generation, lister: dependencies.processLister });
      if (this.operationSignal?.aborted || this.disposed) {
        await runtime.terminate({ graceMs: this.timeouts.terminateGraceMs, killWaitMs: this.timeouts.killWaitMs });
        throw adapterError('disposed', 'Runtime startup was cancelled');
      }
      return runtime;
    }, { graceMs: this.timeouts.terminateGraceMs, killWaitMs: this.timeouts.killWaitMs });
  }

  async initialize(resumeId?: string): Promise<void> {
    try {
      await withTimeout(async (signal) => {
        this.operationSignal = signal;
        const runtime = await this.slot.start();
        await this.attach(runtime, signal);
        await this.openThread(resumeId, signal);
      }, this.timeouts.startupMs, 'Codex startup');
    } catch (error) {
      await this.dispose();
      if (resumeId) throw adapterError('resume_failed', `Cannot resume the requested Codex thread: ${codexError(error, 'thread/resume').message}`,
        { cause: error, native: codexError(error, 'thread/resume').native });
      throw codexError(error, 'startup');
    } finally { this.operationSignal = undefined; }
  }

  private async attach(runtime: RuntimeHandle, signal: AbortSignal): Promise<void> {
    this.retiring = false;
    const connection = new CodexConnection(runtime, this.timeouts.requestMs, (message) => {
      this.sink.diagnostic({ kind: 'protocol', message });
      this.sink.fatal(adapterError('protocol_error', message).info);
    });
    this.connection = connection;
    this.listeners.push(runtime.onExit((exit) => this.sink.runtimeExited(exit)));
    this.listeners.push(connection.peer.onNotification((notification) => {
      if (this.connection !== connection || this.retiring || this.disposed) return;
      try { this.notification(notification); } catch (error) { this.sink.fatal(codexError(error, notification.method, 'protocol_error').info); }
    }));
    this.listeners.push(connection.peer.onRequest((request) => {
      try { this.request(request); } catch (error) {
        if (!request.responded) request.respondError({ code: -32602, message: 'Malformed or unsupported server request' });
        this.sink.diagnostic({ kind: 'protocol', message: codexError(error, request.method).message });
      }
    }));
    this.listeners.push(connection.peer.onClose(({ error }) => {
      if (this.retiring || this.disposed || !runtime.running) return;
      // stdio can close just before the child 'exit' event. Let the Runtime
      // report the crash (with exit status) before declaring a transport fault.
      void runtime.waitForExit(100).catch(() => {
        if (this.connection === connection && !this.retiring && !this.disposed) this.sink.fatal(error.info);
      });
    }));
    this.sink.runtimeStarted({ generation: runtime.generation, ...(runtime.pid !== undefined ? { pid: runtime.pid } : {}) });
    await connection.initialize(signal);
  }

  private threadParams(): ThreadStartParams {
    const overrides = this.options.overrides;
    return { cwd: this.options.cwd,
      ...(this.desiredModel !== undefined ? { model: this.desiredModel } : {}),
      ...(overrides?.approvalPolicy !== undefined ? { approvalPolicy: overrides.approvalPolicy as ThreadStartParams['approvalPolicy'] } : {}),
      ...(overrides?.sandboxMode !== undefined ? { sandbox: overrides.sandboxMode as ThreadStartParams['sandbox'] } : {}),
      ...(this.extras.config !== undefined ? { config: this.extras.config } : {}),
      ...(this.extras.baseInstructions !== undefined ? { baseInstructions: this.extras.baseInstructions } : {}),
      ...(this.extras.developerInstructions !== undefined ? { developerInstructions: this.extras.developerInstructions } : {}),
    };
  }

  private async openThread(resumeId: string | undefined, signal: AbortSignal): Promise<void> {
    const connection = this.requireConnection();
    const params = this.threadParams();
    // Deliberately no path/history fallback: those would override threadId.
    const response = resumeId
      ? await connection.request('thread/resume', { ...params, threadId: resumeId, excludeTurns: true }, signal)
      : await connection.request('thread/start', params, signal);
    const id = response?.thread?.id;
    if (typeof id !== 'string' || !id) throw adapterError('protocol_error', 'Codex omitted the thread id');
    if (resumeId && id !== resumeId) throw adapterError('resume_failed', 'Codex resumed a different thread');
    signal.throwIfAborted();
    this.threadId = id;
    this.actualModel = response.model;
    this.sink.nativeSessionId(id);
    this.tracker = new CodexProcessTracker(connection, connection.runtime, id, this.dependencies.processLister);
  }

  async startTurn(turn: TurnContext, input: UserInput): Promise<void> {
    const content = nativeInput(input);
    const connection = this.requireConnection();
    this.pendingTurn = turn.turnId;
    this.nativeTurn = undefined;
    this.deferredNotifications.length = 0;
    try {
      await this.tracker!.begin(turn.turnId, turn.signal);
      const mode = this.extras.collaborationMode;
      const model = this.desiredModel;
      if (model) this.actualModel = model;
      this.turnModels.clear();
      if (this.actualModel) this.turnModels.set(turn.turnId, this.actualModel);
      const response = await connection.request('turn/start', { threadId: this.requireThread(), input: content,
        ...(model !== undefined ? { model } : {}), ...(this.extras.effort ? { effort: this.extras.effort } : {}),
        ...(mode ? { collaborationMode: model ? { ...mode, settings: { ...mode.settings, model } } : mode } : {}),
      }, turn.signal);
      this.bindTurn(turn.turnId, response.turn.id);
      if (response.turn.status !== 'inProgress') this.end(turn.turnId, response.turn);
    } catch (error) {
      throw codexError(error, 'turn/start');
    } finally {
      if (this.pendingTurn === turn.turnId) this.pendingTurn = undefined;
    }
  }

  async interruptTurn(stop: StopContext): Promise<void> {
    // Capture OS identities before interruption can remove/reparent tool roots.
    await this.tracker?.capture(stop.signal).catch(() => {});
    stop.signal.throwIfAborted();
    const nativeId = stop.nativeTurnId ?? this.nativeTurn;
    if (!nativeId) throw adapterError('protocol_error', 'Cannot interrupt without a native turn id');
    const interruption = this.requireConnection().request('turn/interrupt', { threadId: this.requireThread(), turnId: nativeId }, stop.signal);
    // Queue interrupt before declining; otherwise decline can let the agent
    // finish or start another command before cancellation reaches the server.
    for (const record of stop.cancelledInputs) this.decline(record.nativeRef as NativeInputRef);
    await interruption;
  }

  cleanupAfterInterrupt(stop: StopContext): Promise<CleanupReport> {
    return this.tracker!.cleanup(stop.turnId, this.timeouts.cleanupMs, stop.signal);
  }

  async recoverRuntime(stop: StopContext): Promise<RecoveryReport> {
    const threadId = this.requireThread();
    this.operationSignal = stop.signal;
    this.detach();
    try {
      const replacement = await this.slot.replace();
      stop.signal.throwIfAborted();
      await this.attach(replacement.runtime, stop.signal);
      try { await this.openThread(threadId, stop.signal); }
      catch (error) { throw adapterError('resume_failed', `Failed to resume original Codex thread: ${codexError(error, 'thread/resume').message}`, { cause: error, native: codexError(error, 'thread/resume').native }); }
      return { status: 'resumed', mayHaveStoppedEarlierBackgroundCommands: true,
        verifiedExited: replacement.previous?.descendants.map(({ pid, command }) => ({ pid, command })),
        detail: 'Old isolated Runtime exit confirmed before resuming the original thread; no input replayed' };
    } catch (error) {
      this.detach();
      await this.slot.shutdown();
      throw error;
    } finally { this.operationSignal = undefined; }
  }

  async respondToInput(record: PendingInputRecord, response: InputResponse): Promise<void> {
    const ref = record.nativeRef as NativeInputRef;
    ref.request.respond(answerRequest(ref, response));
  }

  async declineInputsWithText(records: readonly PendingInputRecord[], text: string): Promise<void> {
    const refs = records.map((record) => record.nativeRef as NativeInputRef);
    const nativeId = refs[0]?.nativeTurnId;
    if (!nativeId || refs.some((ref) => ref.nativeTurnId !== nativeId || ref.request.responded)) {
      throw adapterError('invalid_state', 'The native requests are no longer pending in one turn');
    }
    // Deliver while callbacks still block the turn. An acknowledged steer means
    // the text was queued in this exact turn before its pending actions are denied.
    // Failure leaves the cards pending and never creates another turn.
    const result = await this.requireConnection().request('turn/steer', {
      threadId: this.requireThread(), expectedTurnId: nativeId, input: nativeInput({ text }),
    });
    if (result.turnId !== nativeId) throw adapterError('protocol_error', 'Steer returned a different turn id');
    for (const ref of refs) this.decline(ref);
  }

  cancelInput(record: PendingInputRecord): void { this.decline(record.nativeRef as NativeInputRef); }
  private decline(ref: NativeInputRef): void { if (!ref.request.responded && !this.connection?.peer.closed) ref.request.respond(ref.decline); }

  async setModel(model: string | null): Promise<void> {
    // Model is submitted with the next turn, even if the current turn is running.
    // Native null means "unchanged", so resolve the effective CLI default explicitly.
    if (model === null) {
      const response = await this.requireConnection().request('config/read', { cwd: this.options.cwd, includeLayers: false });
      model = response.config.model ?? (await this.listModels()).find((entry) => entry.isDefault)?.id ?? null;
      if (!model) throw adapterError('provider_error', 'The CLI default model could not be resolved');
    }
    this.desiredModel = model;
  }

  listModels(): Promise<ModelInfo[]> { return this.requireConnection().models(); }

  dispose(): Promise<void> {
    this.disposal ??= (async () => {
      this.disposed = true;
      this.detach();
      try {
        const report = await this.slot.shutdown();
        if (report && !report.confirmed) this.sink.error(adapterError('stop_cleanup_failed', 'Codex Runtime disposal could not confirm all processes exited').info);
      } catch (error) { this.sink.error(codexError(error, 'dispose', 'stop_cleanup_failed').info); }
    })();
    return this.disposal;
  }

  private detach(): void {
    this.retiring = true;
    this.tracker?.dispose();
    this.tracker = undefined;
    for (const unsubscribe of this.listeners.splice(0)) unsubscribe();
    this.connection?.peer.close();
    this.connection = undefined;
    this.deferredNotifications.length = 0;
    this.pendingTurn = undefined;
    this.nativeTurn = undefined;
  }

  private requireConnection(): CodexConnection {
    if (!this.connection || this.disposed) throw adapterError('invalid_state', 'Codex Runtime is not connected');
    return this.connection;
  }
  private requireThread(): string {
    if (!this.threadId) throw adapterError('invalid_state', 'Codex thread is not initialized');
    return this.threadId;
  }
  private bindTurn(turnId: string, nativeId: string): void {
    if (typeof nativeId !== 'string' || !nativeId) throw adapterError('protocol_error', 'Codex omitted the turn id');
    if (this.nativeTurn && this.nativeTurn !== nativeId) throw adapterError('protocol_error', 'Codex changed the active turn id');
    this.nativeTurn = nativeId;
    this.sink.bindNativeTurnId(turnId, nativeId);
    const buffered = this.deferredNotifications.splice(0);
    for (const notification of buffered) this.notification(notification);
  }

  private notification(notification: JsonRpcNotification): void {
    const { method } = notification;
    const p = notification.params as Record<string, unknown> | undefined;
    if (!p || typeof p !== 'object') return;
    if (p.threadId !== undefined && p.threadId !== this.threadId) return;
    if (method === 'thread/name/updated' && typeof p.threadName === 'string') { this.sink.nativeTitle(p.threadName); return; }
    if (method === 'serverRequest/resolved') {
      const pending = this.sink.findInputByNativeRef((ref) => (ref as NativeInputRef).request.id === p.requestId);
      if (pending) this.sink.inputResolvedNatively(pending.request.requestId);
      return;
    }
    if (method === 'turn/started') {
      const id = (p.turn as Turn).id;
      const bound = this.sink.turnIdForNative(id);
      if (this.pendingTurn && (!bound || bound === this.pendingTurn)) this.bindTurn(this.pendingTurn, id);
      else this.sink.diagnostic({ kind: 'late_event', message: 'Ignored an unsolicited turn/started event' });
      return;
    }
    const nativeId = method === 'turn/completed' ? (p.turn as Turn | undefined)?.id : typeof p.turnId === 'string' ? p.turnId : undefined;
    if (!nativeId) return;
    const turnId = this.sink.turnIdForNative(nativeId);
    if (!turnId) {
      if (this.pendingTurn && this.deferredNotifications.length < 1000) this.deferredNotifications.push(notification);
      else this.sink.diagnostic({ kind: 'late_event', message: `Unbound Codex event: ${method}` });
      return;
    }
    if (method === 'turn/completed') { this.end(turnId, p.turn as Turn); return; }
    if (method === 'model/rerouted') {
      if (typeof p.toModel === 'string' && this.sink.currentTurnId === turnId) { this.turnModels.set(turnId, p.toModel); this.actualModel = p.toModel; }
      return;
    }
    if (method === 'error') {
      const error = p as unknown as ErrorNotification;
      if (error.willRetry) this.sink.diagnostic({ kind: 'warning', message: error.error.message });
      // This event may be retriable; the authoritative terminal is turn/completed.
      else this.sink.diagnostic({ kind: 'warning', message: error.error.message });
      return;
    }
    if (method === 'item/started' || method === 'item/completed') {
      const item = p.item as ThreadItem;
      if (!item || typeof item.id !== 'string' || typeof item.type !== 'string') throw adapterError('protocol_error', 'Malformed native item');
      if (item.type === 'commandExecution') this.tracker?.command(turnId, item);
      const mapped = mapItem(item, method === 'item/completed');
      if (mapped) (method === 'item/started' ? this.sink.itemStarted : this.sink.itemCompleted)(turnId, mapped);
      return;
    }
    const channels = { 'item/agentMessage/delta': 'text', 'item/reasoning/textDelta': 'reasoning',
      'item/reasoning/summaryTextDelta': 'reasoning', 'item/commandExecution/outputDelta': 'output', 'item/plan/delta': 'text' } as const;
    const channel = channels[method as keyof typeof channels];
    if (channel && typeof p.itemId === 'string' && typeof p.delta === 'string') this.sink.itemDelta(turnId, p.itemId, channel, p.delta);
  }

  private end(turnId: string, turn: Turn): void {
    if (!['completed', 'interrupted', 'failed'].includes(turn.status)) throw adapterError('protocol_error', 'Invalid terminal turn status');
    this.tracker?.ended(turnId);
    this.sink.nativeTurnEnded(turnId, { status: turn.status as 'completed' | 'interrupted' | 'failed',
      ...(turn.error || turn.status === 'failed' ? { error: turnError(turn.error) } : {}),
      ...(typeof turn.durationMs === 'number' ? { nativeDurationMs: turn.durationMs } : {}),
      ...(this.turnModels.get(turnId) ? { model: this.turnModels.get(turnId) } : {}),
    });
  }

  private request(request: IncomingRequest): void {
    const params = request.params as { threadId?: unknown; turnId?: unknown } | undefined;
    if (!params || params.threadId !== this.threadId || typeof params.turnId !== 'string') {
      request.respondError({ code: -32602, message: 'Request does not belong to the active Session' }); return;
    }
    const ref = mapRequest(request);
    if (!ref) {
      request.respondError({ code: -32601, message: `Unsupported server request: ${request.method}` });
      this.sink.diagnostic({ kind: 'unhandled_native', message: request.method }); return;
    }
    const turnId = this.sink.turnIdForNative(params.turnId);
    if (!turnId || !this.sink.inputRequested(turnId, ref.init, ref)) this.decline(ref);
  }
}
