import { claudeConnectionSettings } from './connection-options.js';
import { randomUUID } from 'node:crypto';
import type { EffortLevel, ModelInfo as SDKModelInfo, Options, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { deferred, withTimeout, type Deferred } from '../core/async.js';
import { attachedFileReference, readImageAttachment } from '../core/attachments.js';
import { AsyncQueue } from '../core/async-queue.js';
import { defaultProcessLister, identityOf, waitForExit, type ProcessInfo } from '../core/process-probe.js';
import { RuntimeProcess, type RuntimeHandle } from '../core/runtime-process.js';
import { RuntimeSlot } from '../core/runtime-slot.js';
import type { PendingInputRecord, SessionDriver, SessionSink, StopContext, TurnContext } from '../core/session-controller.js';
import { resolveTimeouts } from '../core/timeouts.js';
import { adapterError, toAdapterError } from '../errors.js';
import type { SessionOptionsBase } from '../provider.js';
import type { CleanupReport, InputResponse, ModelInfo, RecoveryReport, UserInput } from '../types.js';
import { ClaudeMessages, claudeError } from './messages.js';
import { ClaudePermissions } from './permissions.js';
import { SpawnBridge } from './spawn-bridge.js';
import type { ClaudeProviderDependencies, ClaudeProviderOptions, ClaudeQuery } from './types.js';

interface RuntimeState {
  generation: number;
  input: AsyncQueue<SDKUserMessage>;
  query?: ClaudeQuery;
  runtime?: RuntimeHandle;
  closing: boolean;
  initialized: boolean;
  resumed: boolean;
  currentTurn?: string;
  permissions: ClaudePermissions;
  turns: Map<string, ClaudeMessages>;
  sent: Map<string, string>;
  results: Set<string>;
  pump?: Promise<void>;
  /** `msg_lifecycle_v1` on system/init: the CLI reports queued / started / cancelled per input uuid. */
  lifecycle: boolean;
  /** Native uuid → adapter input id, from push until the CLI starts or cancels it. */
  queued: Map<string, string>;
  /** Native `queued` acknowledgements awaited by `queueInput`. */
  acks: Map<string, Deferred<void>>;
  /** Turns the CLI started from its queue that have not reported a result → their input ids. */
  queuedTurns: Map<string, string[]>;
  /** Settles on system/init, which carries the capabilities; the CLI sends it after reading its first input. */
  initReady: Deferred<void>;
  /** Tail of the writes to the CLI, so inputs reach it in call order (see `inOrder`). */
  submissions: Promise<void>;
  /** The turn a Stop interrupted: input the CLI starts while it is still current belongs to a new turn. */
  interrupted?: string;
}

/** Not part of the SDK's SDKMessage union in 0.3.293; observed on Claude Code 2.1.322 with `msg_lifecycle_v1`. */
interface CommandLifecycle { type: 'command_lifecycle'; command_uuid: string; state: 'queued' | 'started' | 'completed' | 'cancelled' }
const isLifecycle = (message: unknown): message is CommandLifecycle =>
  !!message && typeof message === 'object' && (message as { type?: unknown }).type === 'command_lifecycle'
  && typeof (message as { command_uuid?: unknown }).command_uuid === 'string';
interface TurnProcesses {
  baseline: Set<string>;
  observed: Map<string, ProcessInfo>;
  probeFailed: boolean;
  sample?: Promise<void>;
  timer?: ReturnType<typeof setInterval>;
  queuedAfterInterrupt?: boolean;
  /** Another native turn has started; new descendants are no longer attributable to this turn. */
  frozen?: boolean;
}
type ClaudeContent = SDKUserMessage['message']['content'];
type ContentBlockParam = Exclude<ClaudeContent, string>[number];
const processKey = (p: ProcessInfo) => `${p.pid}@${p.startedAt}`;
/** Used only when the model is absent from the native catalog; the CLI accepts any string without error. */
const SDK_EFFORT_LEVELS: readonly string[] = ['low', 'medium', 'high', 'xhigh', 'max'];
/** Same bound as the app's pasted attachments; Claude Code downsizes larger images itself (6.3 MB verified). */
export const CLAUDE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export class ClaudeDriver implements SessionDriver {
  private readonly timeouts;
  private readonly slot: RuntimeSlot;
  private state?: RuntimeState;
  private nativeId?: string;
  private model: string | undefined;
  private modelDirty = false;
  /** `undefined`: never selected; `null`: explicit reset to the model default. */
  private effort: string | null | undefined;
  private effortDirty = false;
  private catalog: SDKModelInfo[] = [];
  private closed = false;
  private disposal?: Promise<void>;
  private readonly processes = new Map<string, TurnProcesses>();

  constructor(private readonly sink: SessionSink, private readonly options: SessionOptionsBase,
    private readonly executable: string, private readonly extras: ClaudeProviderOptions,
    private readonly deps: Required<Pick<ClaudeProviderDependencies, 'query'>> & ClaudeProviderDependencies,
    nativeId?: string, private readonly probeOnly = false) {
    this.nativeId = nativeId;
    this.model = options.overrides?.model;
    this.timeouts = resolveTimeouts(options.timeouts);
    this.slot = new RuntimeSlot((generation) => this.spawn(generation), {
      graceMs: this.timeouts.terminateGraceMs, killWaitMs: this.timeouts.killWaitMs,
    });
  }

  async initialize(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw adapterError('invalid_state', 'Claude initialization was cancelled');
    try {
      await withTimeout(async (startupSignal) => {
        const abort = () => { if (this.state) { this.state.closing = true; this.state.query?.close(); } };
        startupSignal.addEventListener('abort', abort, { once: true });
        try {
          await this.slot.start();
          if (startupSignal.aborted) throw adapterError('timeout', 'Claude initialization was cancelled');
          this.catalog = await this.state!.query!.supportedModels(); // initialize handshake; sends no user prompt
          if (this.options.environment.connection) await this.state!.query!.applyFlagSettings(claudeConnectionSettings(this.options.environment.connection));
        } finally { startupSignal.removeEventListener('abort', abort); }
      }, this.timeouts.startupMs, 'Claude initialization', signal);
    } catch (error) {
      // An unconfirmed cleanup must not mask the startup cause; the exact handle stays retained
      // by the Provider and by this driver for the next dispose / releaseRuntimes call.
      await this.dispose().catch(() => {});
      throw toAdapterError(error, this.nativeId ? 'resume_failed' : 'spawn_failed');
    }
  }

  private async spawn(generation: number): Promise<RuntimeHandle> {
    if (this.closed) throw adapterError('disposed', 'Claude driver is closed');
    const state: RuntimeState = { generation, input: new AsyncQueue(), closing: false, initialized: false, resumed: this.nativeId !== undefined,
      permissions: new ClaudePermissions(this.sink), turns: new Map(), sent: new Map(), results: new Set(),
      lifecycle: false, queued: new Map(), acks: new Map(), queuedTurns: new Map(), initReady: deferred<void>(), submissions: Promise.resolve() };
    state.initReady.promise.catch(() => {});
    this.state = state;
    const ready = deferred<RuntimeHandle>();
    const sdkOptions: Options = {
      ...this.extras,
      cwd: this.options.cwd, env: { ...this.options.environment.env }, pathToClaudeCodeExecutable: this.executable,
      includePartialMessages: true,
      systemPrompt: this.extras.systemPrompt ?? { type: 'preset', preset: 'claude_code' },
      ...(this.nativeId ? { resume: this.nativeId } : {}),
      ...(this.model ? { model: this.model } : {}),
      ...(this.options.overrides?.permissionMode ? { permissionMode: this.options.overrides.permissionMode as Options['permissionMode'] } : {}),
      ...(this.probeOnly ? { persistSession: false } : {}),
      canUseTool: (name, input, context) => state.permissions.request(state.currentTurn, name, input, context),
      spawnClaudeCodeProcess: (spawn) => {
        const started = (this.deps.startRuntime ?? RuntimeProcess.start)({
          sessionId: this.sink.sessionId, command: spawn.command, args: spawn.args, cwd: spawn.cwd ?? this.options.cwd,
          env: spawn.env, generation, label: 'Claude Code', lister: this.deps.processLister,
          terminate: { graceMs: this.timeouts.terminateGraceMs, killWaitMs: this.timeouts.killWaitMs },
        }).then(async (runtime) => {
          state.runtime = runtime;
          runtime.onExit((info) => this.sink.runtimeExited({ ...info, expected: state.closing || this.closed }));
          this.sink.runtimeStarted({ generation, pid: runtime.pid });
          if (state.closing || this.closed) await runtime.terminate();
          ready.resolve(runtime);
          return runtime;
        }, (error: unknown) => { ready.reject(error); throw error; });
        const bridge = new SpawnBridge(started);
        const abort = () => bridge.kill('SIGTERM');
        spawn.signal.addEventListener('abort', abort, { once: true });
        if (spawn.signal.aborted) abort();
        void started.then((runtime) => runtime.exited.then(() => spawn.signal.removeEventListener('abort', abort)), () => {
          spawn.signal.removeEventListener('abort', abort);
        });
        return bridge;
      },
    };
    state.query = this.deps.query({ prompt: state.input, options: sdkOptions });
    state.pump = this.consume(state);
    return withTimeout(() => ready.promise, this.timeouts.startupMs, 'Claude process spawn');
  }

  async startTurn(turn: TurnContext, input: UserInput): Promise<void> {
    const state = this.current();
    await this.inOrder(state, () => this.submitTurn(state, turn, input));
  }

  private async submitTurn(state: RuntimeState, turn: TurnContext, input: UserInput): Promise<void> {
    const content = await claudeContent(input);
    if (this.modelDirty) {
      await state.query!.setModel(this.model);
      this.modelDirty = false;
    }
    if (this.effortDirty) {
      await state.query!.applyFlagSettings({ effortLevel: this.effort as EffortLevel | null });
      this.effortDirty = false;
    }
    const tracking: TurnProcesses = { baseline: new Set(), observed: new Map(), probeFailed: false };
    try { tracking.baseline = new Set((await state.runtime!.snapshotDescendants()).map(processKey)); }
    catch { tracking.probeFailed = true; }
    if (state !== this.state || state.closing || this.closed || turn.signal.aborted) {
      throw adapterError('invalid_state', 'The Claude turn was cancelled during submission');
    }
    this.processes.set(turn.turnId, tracking);
    tracking.timer = setInterval(() => { void this.sample(turn.turnId, state); }, 200);
    tracking.timer.unref();
    turn.signal.addEventListener('abort', () => {
      if (tracking.timer) clearInterval(tracking.timer);
      this.processes.delete(turn.turnId);
    }, { once: true });
    state.currentTurn = turn.turnId;
    state.turns.set(turn.turnId, new ClaudeMessages(this.sink, turn.turnId));
    const uuid = randomUUID();
    this.correlate(state, uuid, turn.turnId);
    state.input.push(this.userMessage(uuid, content));
  }

  /**
   * Hands input to Claude Code's own command queue. Resolves on the native `queued` lifecycle frame; the
   * CLI then folds it into the running turn after a tool round, or starts a later turn with it.
   */
  async queueInput(inputId: string, input: UserInput): Promise<void> {
    const state = this.current();
    const ack = await this.inOrder(state, async () => {
      // A runtime that is still starting has not sent system/init yet; its capabilities are unknown until then.
      await withTimeout(() => state.initReady.promise, this.timeouts.startupMs, 'Claude Code initialization');
      if (!state.lifecycle) {
        throw adapterError('unsupported', 'This Claude Code version does not report queued input lifecycle (msg_lifecycle_v1)');
      }
      const content = await claudeContent(input);
      if (state !== this.state || state.closing || this.closed) throw adapterError('invalid_state', 'The Claude runtime was replaced before the input was queued');
      const uuid = randomUUID();
      const written = deferred<void>();
      state.queued.set(uuid, inputId);
      state.acks.set(uuid, written);
      state.input.push(this.userMessage(uuid, content));
      return written;
    });
    // No timeout: once written the input may still run, so it stays tracked until started, cancelled or the runtime ends.
    await ack.promise;
  }

  /** Inputs reach the CLI in call order: reading attachments or applying model / effort must not let a later input overtake. */
  private inOrder<T>(state: RuntimeState, work: () => Promise<T>): Promise<T> {
    const run = state.submissions.then(work);
    state.submissions = run.then(() => undefined, () => undefined);
    return run;
  }

  private userMessage(uuid: string, content: ClaudeContent): SDKUserMessage {
    return { type: 'user', uuid: uuid as SDKUserMessage['uuid'], session_id: this.nativeId ?? '', parent_tool_use_id: null,
      origin: { kind: 'human' }, message: { role: 'user', content } };
  }

  private correlate(state: RuntimeState, uuid: string, turnId: string): void {
    state.sent.set(uuid, turnId);
    // Bound retained correlation keys while preserving recent-turn late-event routing.
    if (state.sent.size > 128) {
      const oldest = state.sent.keys().next().value!;
      const oldTurn = state.sent.get(oldest)!;
      state.sent.delete(oldest);
      if (![...state.sent.values()].includes(oldTurn)) state.turns.delete(oldTurn);
    }
  }

  private onLifecycle(state: RuntimeState, frame: CommandLifecycle): void {
    const uuid = frame.command_uuid;
    if (frame.state === 'queued' || frame.state === 'started') state.acks.get(uuid)?.resolve();
    if (frame.state !== 'started' && frame.state !== 'cancelled') return;
    const inputId = state.queued.get(uuid);
    if (inputId === undefined) return; // inputs submitted through startTurn, or uuids the CLI enqueued itself
    state.queued.delete(uuid);
    state.acks.delete(uuid);
    if (frame.state === 'cancelled') { this.sink.queuedInputCancelled(inputId, 'native_cancelled'); return; }
    // An interrupted turn takes no more input: anything started now opens the next turn, even before the stopped turn's result.
    const newTurn = state.currentTurn === undefined || state.currentTurn === state.interrupted;
    const turnId = this.sink.queuedInputStarted(inputId, newTurn);
    if (!turnId) return;
    this.correlate(state, uuid, turnId);
    if (!newTurn) return;
    for (const tracking of this.processes.values()) tracking.frozen = true;
    state.currentTurn = turnId;
    state.queuedTurns.set(turnId, [inputId]);
    state.turns.set(turnId, new ClaudeMessages(this.sink, turnId));
    const tracking: TurnProcesses = { baseline: new Set(), observed: new Map(), probeFailed: false };
    this.processes.set(turnId, tracking);
    void state.runtime!.snapshotDescendants().then((processes) => { tracking.baseline = new Set(processes.map(processKey)); },
      () => { tracking.probeFailed = true; }).then(() => {
      if (state !== this.state || this.closed || !this.processes.has(turnId) || state.currentTurn !== turnId) return;
      tracking.timer = setInterval(() => { void this.sample(turnId, state); }, 200);
      tracking.timer.unref();
    });
  }

  /** The runtime holding the native queue is gone: nothing it still held can run. */
  private abandonQueue(state: RuntimeState, reason: 'runtime_exited' | 'disposed'): void {
    for (const ack of state.acks.values()) ack.reject(adapterError('invalid_state', 'The Claude runtime ended before the input was queued'));
    state.acks.clear();
    const pending = [...state.queued.values(), ...[...state.queuedTurns.values()].flat()];
    state.queued.clear();
    state.queuedTurns.clear();
    for (const inputId of pending) this.sink.queuedInputCancelled(inputId, reason === 'disposed' ? 'disposed' : 'runtime_exited');
  }

  private async consume(state: RuntimeState): Promise<void> {
    try {
      await this.read(state);
    } finally {
      // Stream over: whatever this runtime still had queued will never start.
      state.initReady.reject(adapterError('invalid_state', 'The Claude runtime ended before it reported its capabilities'));
      if (state.queued.size || state.acks.size) this.abandonQueue(state, this.closed ? 'disposed' : 'runtime_exited');
    }
  }

  private async read(state: RuntimeState): Promise<void> {
    try {
      for await (const message of state.query!) {
        if (state !== this.state || state.closing || this.closed) continue;
        this.accept(state, message);
      }
      if (!state.closing && !this.closed && state === this.state) {
        // stdout can close one event-loop tick before the OS exit callback. Let
        // runtimeExited drive crash/Stop recovery instead of manufacturing a fatal error.
        if (state.runtime) {
          try { await state.runtime.waitForExit(100); return; } catch { /* live process with closed protocol */ }
        }
        if (state.closing || this.closed || state !== this.state) return;
        this.sink.fatal({ code: 'runtime_crashed', message: 'Claude output stream ended unexpectedly' });
      }
    } catch (error) {
      if (!state.closing && !this.closed && state === this.state) {
        const info = toAdapterError(error, 'runtime_crashed').info;
        if (state.resumed && !state.initialized && state.currentTurn) {
          this.sink.nativeTurnEnded(state.currentTurn, { status: 'failed', error: { ...info, code: 'resume_failed' } });
        } else {
          if (state.runtime) {
            try { await state.runtime.waitForExit(100); return; } catch { /* query failed while process remains alive */ }
          }
          if (!state.closing && !this.closed && state === this.state) this.sink.fatal(info);
        }
      }
    }
  }

  private accept(state: RuntimeState, message: SDKMessage): void {
    if (isLifecycle(message)) { this.onLifecycle(state, message); return; }
    if (message.type === 'system' && message.subtype === 'init') {
      state.lifecycle = message.capabilities?.includes('msg_lifecycle_v1') ?? false;
      state.initReady.resolve();
      this.sink.nativeSessionId(message.session_id);
      if (this.nativeId && this.nativeId !== message.session_id) return;
      this.nativeId = message.session_id;
      state.initialized = true;
      return;
    }
    const echoed = 'user_message_uuid' in message ? message.user_message_uuid : undefined;
    const turnId = echoed ? state.sent.get(echoed) : state.currentTurn;
    if (!turnId) {
      this.sink.diagnostic({ kind: 'late_event', message: `Claude ${message.type} without a matching active input ignored` });
      return;
    }
    const mapper = state.turns.get(turnId);
    if (!mapper) return;
    if (message.type !== 'result') { mapper.accept(message); return; }
    if (state.results.has(message.uuid)) return;
    state.results.add(message.uuid);
    if (state.results.size > 128) state.results.delete(state.results.values().next().value!);
    if (message.session_id) {
      this.sink.nativeSessionId(message.session_id);
      this.nativeId ??= message.session_id;
    }
    const success = message.subtype === 'success' && !message.is_error;
    const description = message.subtype === 'success' ? message.result : message.errors.join('\n');
    let error = mapper.error ?? claudeError(description || `Claude returned ${message.subtype}`, message.subtype);
    if (state.resumed && !state.initialized && !success) error = { ...error, code: 'resume_failed' };
    if (state.currentTurn === turnId) state.currentTurn = undefined;
    state.queuedTurns.delete(turnId);
    const tracking = this.processes.get(turnId);
    if (tracking?.timer) clearInterval(tracking.timer);
    this.sink.nativeTurnEnded(turnId, { status: success ? 'completed' : 'failed',
      ...(success ? {} : { error }), nativeDurationMs: message.duration_ms, model: mapper.model });
  }

  private async sample(turnId: string, state: RuntimeState): Promise<void> {
    const tracking = this.processes.get(turnId);
    if (!tracking || tracking.frozen) return;
    if (tracking.sample) return tracking.sample;
    tracking.sample = (async () => {
      try {
        for (const process of await state.runtime!.snapshotDescendants()) {
          if (!tracking.baseline.has(processKey(process))) tracking.observed.set(processKey(process), process);
        }
      } catch { tracking.probeFailed = true; }
    })();
    try { await tracking.sample; } finally { tracking.sample = undefined; }
  }

  async interruptTurn(stop: StopContext): Promise<void> {
    const state = this.current();
    await this.sample(stop.turnId, state); // before interrupt can reparent/terminate children
    state.interrupted = stop.turnId;
    const receipt = state.query!.interrupt();
    for (const input of stop.cancelledInputs) state.permissions.cancel(input);
    const result = await receipt;
    if (result?.still_queued.some((uuid) => state.sent.get(uuid) === stop.turnId)) {
      const tracking = this.processes.get(stop.turnId);
      if (tracking) tracking.queuedAfterInterrupt = true;
      // Never allow a stopped prompt to execute later. Core performs verified runtime recovery.
      throw adapterError('stop_cleanup_failed', 'Claude still has the interrupted input queued');
    }
  }

  async cleanupAfterInterrupt(stop: StopContext): Promise<CleanupReport> {
    const state = this.current();
    await this.sample(stop.turnId, state);
    const tracking = this.processes.get(stop.turnId);
    if (tracking?.queuedAfterInterrupt) return { status: 'unsupported', scope: 'turn', detail: 'Interrupted input remains queued' };
    if (!tracking || tracking.probeFailed) return { status: 'unsupported', scope: 'turn', detail: 'Process ownership snapshot unavailable' };
    const targets = [...tracking.observed.values()];
    if (!targets.length) return { status: 'not_required', scope: 'turn', detail: 'No new runtime descendants observed during this turn' };
    const result = await waitForExit(targets.map(identityOf), {
      timeoutMs: Math.max(1, this.timeouts.cleanupMs - 100), signal: stop.signal,
      lister: this.deps.processLister ?? defaultProcessLister,
    });
    return { status: result.exited ? 'confirmed' : 'failed', scope: 'turn',
      ...(result.exited ? { verifiedExited: targets.map(({ pid, command }) => ({ pid, command })) }
        : { survivors: result.survivors.map(({ pid, command }) => ({ pid, command })) }) };
  }

  async recoverRuntime(stop: StopContext): Promise<RecoveryReport> {
    if (!this.nativeId) throw adapterError('resume_failed', 'Claude has not assigned a native session id; cannot recover by creating a new conversation');
    const previous = this.current();
    previous.closing = true;
    previous.permissions.close();
    this.abandonQueue(previous, 'runtime_exited');
    // Do not end stdin before RuntimeSlot takes a final descendant snapshot.
    const replaced = await this.slot.replace();
    previous.input.end();
    previous.query!.close();
    if (stop.signal.aborted) throw adapterError('timeout', 'Claude recovery was cancelled');
    await this.current().query!.supportedModels();
    if (this.options.environment.connection) await this.current().query!.applyFlagSettings(claudeConnectionSettings(this.options.environment.connection));
    // Flag settings belong to the replaced process; the replacement starts from CLI defaults.
    if (typeof this.effort === 'string') this.effortDirty = true;
    this.sink.nativeSessionId(this.nativeId);
    return { status: 'resumed', mayHaveStoppedEarlierBackgroundCommands: true,
      verifiedExited: replaced.previous?.descendants.map(({ pid, command }) => ({ pid, command })),
      detail: 'Isolated runtime exit verified; replacement uses the original resume id (validated by CLI on next input)' };
  }

  async respondToInput(record: PendingInputRecord, response: InputResponse): Promise<void> { await this.current().permissions.respond(record, response); }
  async declineInputsWithText(records: readonly PendingInputRecord[], text: string): Promise<void> { this.current().permissions.decline(records, text); }
  cancelInput(record: PendingInputRecord): void { this.state?.permissions.cancel(record); }
  async setModel(model: string | null): Promise<void> {
    if (this.sink.state === 'running' || this.sink.state === 'stopping') {
      this.model = model ?? undefined;
      this.modelDirty = true;
      return;
    }
    await withTimeout(() => this.current().query!.setModel(model ?? undefined), this.timeouts.requestMs, 'Claude model change');
    this.model = model ?? undefined;
    this.modelDirty = false;
  }
  /** Next-turn semantics like `setModel`; `null` returns to the model's native default effort. */
  async setReasoningEffort(effort: string | null): Promise<void> {
    if (effort !== null) this.assertEffortOffered(effort);
    if (this.sink.state === 'running' || this.sink.state === 'stopping') {
      this.effort = effort;
      this.effortDirty = true;
      return;
    }
    await withTimeout(() => this.current().query!.applyFlagSettings({ effortLevel: effort as EffortLevel | null }), this.timeouts.requestMs, 'Claude reasoning effort change');
    this.effort = effort;
    this.effortDirty = false;
  }
  /** The CLI acknowledges unknown levels without applying them, so the native catalog is checked here. */
  private assertEffortOffered(effort: string): void {
    const wanted = this.model ?? 'default';
    const row = this.catalog.find((model) => model.value === wanted || model.resolvedModel === wanted);
    if (row && !row.supportsEffort) throw adapterError('unsupported', `Claude model ${wanted} does not support reasoning effort`);
    const offered = row ? row.supportedEffortLevels : SDK_EFFORT_LEVELS;
    if (offered && !offered.includes(effort as EffortLevel)) throw adapterError('invalid_argument', `Claude model ${wanted} does not offer reasoning effort ${effort}`);
  }
  async listModels(): Promise<ModelInfo[]> {
    const models = await withTimeout(() => this.current().query!.supportedModels(), this.timeouts.requestMs, 'Claude model catalog');
    this.catalog = models;
    return models.map((model) => ({ id: model.value, displayName: model.displayName, description: model.description,
      // `default` is the CLI's own selection; the app resolves effort levels through it while no model is chosen.
      ...(model.value === 'default' ? { isDefault: true } : {}),
      ...(model.resolvedModel ? { resolvedModel: model.resolvedModel } : {}),
      ...(model.supportsEffort && model.supportedEffortLevels?.length ? { reasoningEfforts: model.supportedEffortLevels } : {}) }));
  }
  dispose(): Promise<void> {
    if (!this.disposal) {
      const pending = this.close();
      this.disposal = pending;
      void pending.catch(() => { if (this.disposal === pending) this.disposal = undefined; });
    }
    return this.disposal;
  }
  private async close(): Promise<void> {
    this.closed = true;
    for (const tracking of this.processes.values()) if (tracking.timer) clearInterval(tracking.timer);
    const state = this.state;
    if (state) { state.closing = true; state.permissions.close(); this.abandonQueue(state, 'disposed'); }
    try {
      const report = await this.slot.shutdown();
      if (report && !report.confirmed) throw adapterError('stop_cleanup_failed', 'Claude runtime exit could not be verified');
      if (state?.runtime && state.runtime !== this.slot.current) {
        const extra = await state.runtime.terminate();
        if (!extra.confirmed) throw adapterError('stop_cleanup_failed', 'Claude pending runtime exit could not be verified');
      }
    } catch (error) {
      this.sink.diagnostic({ kind: 'warning', message: 'Claude runtime shutdown failed' });
      throw error;
    } finally {
      state?.input.end();
      try { state?.query?.close(); } catch { /* Runtime verification above remains authoritative. */ }
    }
  }
  private current(): RuntimeState {
    if (!this.state || this.closed) throw adapterError('disposed', 'Claude driver is closed');
    return this.state;
  }
}

/** Claude user content: images as native base64 blocks, the typed text, then file references (never contents). */
export async function claudeContent(input: UserInput): Promise<ClaudeContent> {
  if (!input.attachments?.length) return input.text;
  const images: ContentBlockParam[] = [];
  const references: ContentBlockParam[] = [];
  for (const attachment of input.attachments) {
    if (attachment.kind === 'image') {
      const { mediaType, data } = await readImageAttachment(attachment.path, CLAUDE_IMAGE_MAX_BYTES);
      images.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: data.toString('base64') } });
    } else if (attachment.kind === 'file') {
      references.push({ type: 'text', text: attachedFileReference(attachment) });
    } else {
      throw adapterError('unsupported', 'Claude Code skills are not exposed as attachments');
    }
  }
  return [...images, ...(input.text ? [{ type: 'text' as const, text: input.text }] : []), ...references];
}
