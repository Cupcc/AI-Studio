import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanUseTool, ModelInfo as SDKModel, Options, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { ClaudeProvider, type ClaudeQuery } from '../../src/claude/index.js';
import { AsyncQueue } from '../../src/core/async-queue.js';
import { deferred } from '../../src/core/async.js';
import { FakeRuntime, fakeProcess } from '../../src/testing/fake-runtime.js';
import type { RuntimeSpawnOptions } from '../../src/core/runtime-process.js';
import type { AdapterEvent } from '../../src/events.js';
import type { AgentSession, SessionOptionsBase } from '../../src/provider.js';

const nativeId = '11111111-1111-4111-8111-111111111111';
const options: SessionOptionsBase = { cwd: '/tmp/project with spaces', environment: { env: { PATH: '/test/bin', HOST_ONLY: 'explicit' } },
  timeouts: { startupMs: 1000, terminalMs: 100, cleanupMs: 120, interruptMs: 100, recoveryMs: 1000, disposeMs: 1000 } };

class MockQuery implements ClaudeQuery {
  readonly output = new AsyncQueue<SDKMessage>();
  readonly inputs: SDKUserMessage[] = [];
  readonly modelChanges: (string | undefined)[] = [];
  readonly flagSettings: unknown[] = [];
  catalog: SDKModel[] = [{ value: 'sonnet', displayName: 'Sonnet', description: 'native' }];
  closed = false;
  interruptCalls = 0;
  onInterrupt?: () => void;
  interruptFailure = false;
  queued: string[] = [];
  constructor(readonly options: Options, prompt: AsyncIterable<SDKUserMessage>) {
    options.spawnClaudeCodeProcess!({ command: '/test/bin/claude', args: ['--sdk'], cwd: options.cwd,
      env: { ...options.env, SDK_PROTOCOL: 'required' }, signal: new AbortController().signal });
    void (async () => { for await (const input of prompt) this.inputs.push(input); })();
  }
  [Symbol.asyncIterator]() { return this.output[Symbol.asyncIterator](); }
  emit(value: unknown) { this.output.push(value as SDKMessage); }
  init(id = nativeId, capabilities: string[] = ['msg_lifecycle_v1']) { this.emit({ type: 'system', subtype: 'init', session_id: id, capabilities }); }
  lifecycle(uuid: string, state: 'queued' | 'started' | 'completed' | 'cancelled') { this.emit({ type: 'command_lifecycle', command_uuid: uuid, state, uuid: randomUUID(), session_id: nativeId }); }
  end(success = true, extra: Record<string, unknown> = {}) {
    this.emit({ type: 'result', subtype: success ? 'success' : 'error_during_execution', is_error: !success,
      result: 'ok', errors: ['cancelled'], duration_ms: 12, session_id: nativeId, uuid: randomUUID(), ...extra });
  }
  async interrupt() {
    this.interruptCalls++;
    if (this.interruptFailure) throw new Error('interrupt failed');
    this.onInterrupt?.();
    this.end(false);
    return { still_queued: this.queued };
  }
  async setModel(model?: string) { this.modelChanges.push(model); }
  async applyFlagSettings(settings: unknown) { this.flagSettings.push(settings); }
  async supportedModels(): Promise<SDKModel[]> { return this.catalog; }
  close() { this.closed = true; this.output.end(); }
  permission(tool = 'Bash', input: Record<string, unknown> = { command: 'echo test' }, context: Partial<Parameters<CanUseTool>[2]> = {}) {
    return this.options.canUseTool!(tool, input, { toolUseID: randomUUID(), requestId: randomUUID(), signal: new AbortController().signal, ...context });
  }
}

const providers: ClaudeProvider[] = [];
afterEach(async () => { await Promise.all(providers.splice(0).map((provider) => provider.dispose())); });

interface HarnessConfig {
  /** Holds every Runtime start until resolved (late startup). */
  startGate?: Promise<void>;
  /** Initial behavior of each started FakeRuntime's terminate(). */
  terminateBehavior?: FakeRuntime['terminateBehavior'];
  /** Makes the startup handshake fail after the Runtime started. */
  failInitialize?: boolean;
  /** Makes every model-catalog request after the handshake fail. */
  failCatalog?: boolean;
  /** Native model catalog returned by every Query. */
  catalog?: SDKModel[];
}

function harness(config: HarnessConfig = {}) {
  const queries: MockQuery[] = [];
  const runtimes: FakeRuntime[] = [];
  const spawns: RuntimeSpawnOptions[] = [];
  const provider = new ClaudeProvider({
    resolveExecutable: async () => ({ path: '/test/bin/claude', source: 'explicit' }),
    query: (args) => {
      const q = new MockQuery(args.options, args.prompt);
      if (config.catalog) q.catalog = config.catalog;
      if (config.failInitialize) q.supportedModels = async () => { throw new Error('initialize handshake failed'); };
      if (config.failCatalog) {
        const handshake = q.supportedModels.bind(q);
        let calls = 0;
        q.supportedModels = async () => { if (++calls > 1) throw new Error('catalog request failed'); return handshake(); };
      }
      queries.push(q);
      return q;
    },
    startRuntime: async (spawn) => {
      spawns.push(spawn);
      if (config.startGate) await config.startGate;
      const runtime = new FakeRuntime({ generation: spawn.generation, terminateBehavior: config.terminateBehavior });
      runtimes.push(runtime);
      return runtime;
    },
    processLister: { list: async () => runtimes.flatMap((runtime) => runtime.descendants) },
  });
  providers.push(provider);
  return { provider, queries, runtimes, spawns,
    async session(overrides: Partial<SessionOptionsBase> = {}) {
      const session = await provider.createSession({ ...options, ...overrides });
      const events: AdapterEvent[] = [];
      session.subscribe((event) => events.push(event));
      const q = queries.at(-1)!;
      q.init();
      await flush();
      return { session, events, q, runtime: runtimes.at(-1)! };
    } };
}
async function flush() { await new Promise((resolve) => setTimeout(resolve, 0)); }
async function sent(session: AgentSession, q: MockQuery) {
  const result = await session.sendUserInput({ text: 'hello' });
  await flush();
  expect(q.inputs.length).toBeGreaterThan(0);
  return result.turnId;
}
async function complete(session: AgentSession, q: MockQuery) { q.end(); await flush(); expect(session.state).toBe('idle'); }
const question = { questions: [{ question: 'Choose a color', header: 'Color', multiSelect: false,
  options: [{ label: 'Blue', description: 'cool' }, { label: 'Green', description: 'natural' }] }] };

describe('Claude Provider — FR-CHAT-003 / FR-STATE-001..003 / AC-02, AC-03, AC-05', () => {
  it('keeps native model, effort and limits while replacing endpoint credentials', async () => {
    const h = harness();
    await h.provider.createSession({ ...options, environment: {
      env: { PATH: '/bin', ANTHROPIC_MODEL: 'local-model', ANTHROPIC_DEFAULT_SONNET_MODEL: 'local-sonnet', ANTHROPIC_MAX_OUTPUT_TOKENS: '12345', CLAUDE_CODE_EFFORT_LEVEL: 'high', ANTHROPIC_AUTH_TOKEN: 'old-token' },
      connection: { baseUrl: 'https://gateway.example', apiKey: 'new-key', auth: 'api_key' },
    } });
    expect(h.queries[0]!.options.model).toBeUndefined();
    expect(h.queries[0]!.options.env).toMatchObject({ ANTHROPIC_MODEL: 'local-model', ANTHROPIC_DEFAULT_SONNET_MODEL: 'local-sonnet', ANTHROPIC_MAX_OUTPUT_TOKENS: '12345', CLAUDE_CODE_EFFORT_LEVEL: 'high' });
    expect(h.queries[0]!.options.env).not.toHaveProperty('CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST');
    expect(h.queries[0]!.flagSettings).toEqual([expect.objectContaining({ env: expect.objectContaining({ ANTHROPIC_BASE_URL: 'https://gateway.example', ANTHROPIC_API_KEY: 'new-key', ANTHROPIC_AUTH_TOKEN: '' }) })]);
    expect(JSON.stringify(h.spawns[0]!.args)).not.toContain('new-key');
  });

  it('rejects unconfirmed runtime disposal and retries without replacing the handle', async () => {
    const h = harness();
    const { session, runtime } = await h.session();
    runtime.terminateBehavior = 'hang';
    await expect(session.dispose()).rejects.toMatchObject({ code: 'stop_cleanup_failed' });
    runtime.terminateBehavior = 'exit';
    await Promise.all([session.dispose(), session.dispose()]);
    expect(runtime.terminateCalls).toHaveLength(2);
    expect(h.runtimes).toHaveLength(1);
    await session.dispose();
    expect(runtime.terminateCalls).toHaveLength(2);
  });

  it('rejects Provider.releaseRuntimes with an AggregateError while exit is unconfirmed and retries the same handle', async () => {
    const h = harness();
    const { session, runtime } = await h.session();
    runtime.terminateBehavior = 'hang';
    const failed = h.provider.releaseRuntimes();
    await expect(failed).rejects.toBeInstanceOf(AggregateError);
    await expect(failed).rejects.toMatchObject({ errors: expect.arrayContaining([expect.objectContaining({ code: 'stop_cleanup_failed' })]) });
    expect(session.state).toBe('closed');
    expect(runtime.running).toBe(true);
    runtime.terminateBehavior = 'exit';
    await h.provider.releaseRuntimes();
    expect(runtime.running).toBe(false);
    expect(h.runtimes).toHaveLength(1);
    const calls = runtime.terminateCalls.length;
    await h.provider.releaseRuntimes();
    expect(runtime.terminateCalls).toHaveLength(calls);
  });

  it('limits releaseRuntimes(cwd) to that Project without touching another Project or disposing the Provider', async () => {
    const h = harness();
    const a = await h.session({ cwd: '/tmp/project a' });
    const b = await h.session({ cwd: '/tmp/project b' });
    b.runtime.terminateBehavior = 'hang';
    await h.provider.releaseRuntimes('/tmp/project a');
    expect(a.session.state).toBe('closed');
    expect(a.runtime.running).toBe(false);
    expect(b.session.state).toBe('idle');
    expect(b.runtime.terminateCalls).toHaveLength(0);
    expect((await h.session({ cwd: '/tmp/project a' })).session.state).toBe('idle');
    await expect(h.provider.releaseRuntimes('/tmp/project b')).rejects.toBeInstanceOf(AggregateError);
    expect(b.runtime.running).toBe(true);
    b.runtime.terminateBehavior = 'exit';
    await h.provider.releaseRuntimes('/tmp/project b');
    expect(b.runtime.running).toBe(false);
    expect(h.runtimes.at(-1)!.running).toBe(true);
  });

  it('keeps Provider.dispose() strict: it rejects while exit is unconfirmed and retries the same handle', async () => {
    const h = harness();
    const { runtime } = await h.session();
    runtime.terminateBehavior = 'hang';
    await expect(h.provider.dispose()).rejects.toBeInstanceOf(AggregateError);
    await expect(h.provider.createSession(options)).rejects.toMatchObject({ code: 'disposed' });
    runtime.terminateBehavior = 'exit';
    await h.provider.dispose();
    expect(runtime.running).toBe(false);
    expect(h.runtimes).toHaveLength(1);
    const calls = runtime.terminateCalls.length;
    await h.provider.dispose();
    expect(runtime.terminateCalls).toHaveLength(calls);
  });

  it('drops a session from the tracked set once an explicit dispose retry confirmed its release', async () => {
    const h = harness();
    const { session, runtime } = await h.session();
    const tracked = () => (h.provider as unknown as { sessions: { size: number } }).sessions.size;
    runtime.terminateBehavior = 'hang';
    await expect(session.dispose()).rejects.toMatchObject({ code: 'stop_cleanup_failed' });
    expect(tracked()).toBe(1);
    runtime.terminateBehavior = 'exit';
    await session.dispose();
    await flush();
    expect(tracked()).toBe(0);
  });

  it('emits explicit dispose events in the baseline order: runtime exit, then session state and closed', async () => {
    const h = harness();
    const { session, runtime } = await h.session();
    const order: string[] = [];
    session.subscribe((event) => { order.push(event.type); });
    await session.dispose();
    expect(runtime.running).toBe(false);
    expect(order).toEqual(['runtime.exited', 'session.state', 'session.closed']);
  });

  it('retries a Provider release with the terminate waits the Session was configured with', async () => {
    const h = harness();
    const { session, runtime } = await h.session({ timeouts: { ...options.timeouts, terminateGraceMs: 3, killWaitMs: 4 } });
    runtime.terminateBehavior = 'hang';
    await expect(session.dispose()).rejects.toBeInstanceOf(Error);
    await expect(h.provider.releaseRuntimes()).rejects.toBeInstanceOf(AggregateError);
    expect(runtime.terminateCalls.length).toBeGreaterThan(1);
    expect(runtime.terminateCalls.every((call) => call.graceMs === 3 && call.killWaitMs === 4)).toBe(true);
    runtime.terminateBehavior = 'exit';
    await h.provider.releaseRuntimes();
  });

  it('keeps the model-catalog error when the probe cleanup is also unconfirmed, and still retains the handle', async () => {
    const h = harness({ terminateBehavior: 'hang', failCatalog: true });
    await expect(h.provider.listModels({ environment: options.environment })).rejects.toMatchObject({ message: expect.stringContaining('catalog request failed') });
    expect(h.runtimes).toHaveLength(1);
    expect(h.runtimes[0]!.running).toBe(true);
    await expect(h.provider.releaseRuntimes()).rejects.toBeInstanceOf(AggregateError);
    h.runtimes[0]!.terminateBehavior = 'exit';
    await h.provider.releaseRuntimes();
    expect(h.runtimes[0]!.running).toBe(false);
  });

  it('does not turn a dropped Provider.dispose() into an unhandled rejection, yet a later call still retries', async () => {
    const unhandled: unknown[] = [];
    const watch = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', watch);
    try {
      const h = harness();
      const { runtime } = await h.session();
      runtime.terminateBehavior = 'hang';
      void h.provider.dispose();
      // Long enough for both termination attempts of the failing release (2 x 50 ms in FakeRuntime) to settle.
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(unhandled).toEqual([]);
      await expect(h.provider.dispose()).rejects.toBeInstanceOf(AggregateError);
      runtime.terminateBehavior = 'exit';
      await h.provider.dispose();
      expect(runtime.running).toBe(false);
    } finally {
      process.off('unhandledRejection', watch);
    }
  });

  it('keeps the startup error but retains an unconfirmed failed-startup Runtime for release', async () => {
    const h = harness({ terminateBehavior: 'hang', failInitialize: true });
    const error = await h.provider.createSession(options).then(() => undefined, (reason: unknown) => reason);
    expect(error).toMatchObject({ code: 'spawn_failed', message: expect.stringContaining('initialize handshake failed') });
    expect(h.runtimes).toHaveLength(1);
    expect(h.runtimes[0]!.running).toBe(true);
    await expect(h.provider.releaseRuntimes()).rejects.toBeInstanceOf(AggregateError);
    h.runtimes[0]!.terminateBehavior = 'exit';
    await h.provider.releaseRuntimes();
    expect(h.runtimes[0]!.running).toBe(false);
    expect(h.runtimes).toHaveLength(1);
  });

  it('waits for a late Runtime startup, releases it, and rejects new startups only while releasing', async () => {
    const gate = deferred<void>();
    const h = harness({ startGate: gate.promise });
    const creating = h.provider.createSession(options).then(() => undefined, (reason: unknown) => reason);
    await vi.waitFor(() => expect(h.spawns).toHaveLength(1));
    let released = false;
    const release = h.provider.releaseRuntimes().then(() => { released = true; });
    await flush();
    expect(released).toBe(false);
    await expect(h.provider.createSession(options)).rejects.toMatchObject({ code: 'invalid_state' });
    expect(h.spawns).toHaveLength(1);
    gate.resolve();
    await release;
    expect(await creating).toBeInstanceOf(Error);
    expect(h.runtimes).toHaveLength(1);
    expect(h.runtimes[0]!.running).toBe(false);
    expect((await h.provider.createSession(options)).state).toBe('idle');
    expect(h.runtimes).toHaveLength(2);
  });

  it('retains an unconfirmed model-probe Runtime and releases that exact handle later', async () => {
    const h = harness({ terminateBehavior: 'hang' });
    await expect(h.provider.listModels({ environment: options.environment, cwd: '/tmp/probe project' })).rejects.toMatchObject({ code: 'stop_cleanup_failed' });
    const runtime = h.runtimes[0]!;
    expect(runtime.running).toBe(true);
    const calls = runtime.terminateCalls.length;
    await h.provider.releaseRuntimes('/tmp/another project');
    expect(runtime.terminateCalls).toHaveLength(calls);
    await expect(h.provider.releaseRuntimes('/tmp/probe project')).rejects.toBeInstanceOf(AggregateError);
    runtime.terminateBehavior = 'exit';
    await h.provider.releaseRuntimes();
    expect(runtime.running).toBe(false);
    expect(h.runtimes).toHaveLength(1);
  });

  it('keeps native settings/model/permissions and sets human message origin; isolated SDK spawn uses SDK env', async () => {
    const h = harness(); const { session, q, events } = await h.session();
    expect(q.options.pathToClaudeCodeExecutable).toBe('/test/bin/claude');
    expect(q.options.settingSources).toBeUndefined();
    expect(q.options.permissionMode).toBeUndefined();
    expect(q.options.model).toBeUndefined();
    expect(q.options.systemPrompt).toEqual({ type: 'preset', preset: 'claude_code' });
    expect(h.spawns[0]!.env).toEqual({ PATH: '/test/bin', HOST_ONLY: 'explicit', SDK_PROTOCOL: 'required' });
    await session.sendUserInput({ text: 'hello' });
    expect(events.some((event) => event.type === 'turn.started')).toBe(true);
    await flush(); expect(q.inputs[0]!.origin).toEqual({ kind: 'human' });
    await complete(session, q);
  });

  it('deduplicates partial/full messages and maps reasoning and tool completion', async () => {
    const { session, q, events } = await harness().session(); await sent(session, q);
    const stream = (event: unknown, uuid = randomUUID()) => q.emit({ type: 'stream_event', event, uuid, parent_tool_use_id: null });
    stream({ type: 'message_start', message: { id: 'm1', model: 'sonnet' } });
    stream({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
    const uuid = randomUUID();
    stream({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } }, uuid);
    stream({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } }, uuid);
    q.emit({ type: 'assistant', uuid: 'full', message: { id: 'm1', model: 'sonnet', content: [
      { type: 'text', text: 'Hello' }, { type: 'thinking', thinking: 'Reason' }, { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'echo hi' } },
    ] } });
    q.emit({ type: 'user', uuid: 'result1', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'hi' }] } });
    await complete(session, q);
    expect(events.filter((e) => e.type === 'item.delta')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'item.completed').map((e) => e.item)).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: 'm1:0', text: 'Hello' }), expect.objectContaining({ kind: 'reasoning', text: 'Reason' }),
      expect.objectContaining({ kind: 'command', command: { command: 'echo hi', output: 'hi' } }),
    ]));
    expect(events.find((e) => e.type === 'turn.completed')).toMatchObject({ outcome: 'completed', nativeDurationMs: 12, model: 'sonnet' });
  });

  it('does not mistake success + is_error for successful completion', async () => {
    const { session, q, events } = await harness().session(); await sent(session, q);
    q.end(true, { is_error: true, result: 'rate limit 429' }); await flush();
    expect(events.find((e) => e.type === 'turn.completed')).toMatchObject({ outcome: 'failed', error: { code: 'quota_exceeded' } });
  });

  it('answers concurrent permissions independently, including suggested native permission updates', async () => {
    const { session, q } = await harness().session(); await sent(session, q);
    const suggestions = [{ type: 'addRules' as const, rules: [{ toolName: 'Bash', ruleContent: 'echo:*' }], behavior: 'allow' as const, destination: 'session' as const }];
    const first = q.permission('Bash', { command: 'echo a' }, { title: 'Native title', suggestions });
    const second = q.permission('Write', { file_path: '/tmp/b' });
    expect(session.pendingInputs).toHaveLength(2);
    expect(session.pendingInputs[0]).toMatchObject({ title: 'Native title' });
    await session.respondToInput(session.pendingInputs[1]!.requestId, { kind: 'approval', optionId: 'deny', message: 'No' });
    expect(await second).toMatchObject({ behavior: 'deny', message: 'No', decisionClassification: 'user_reject' });
    await session.respondToInput(session.pendingInputs[0]!.requestId, { kind: 'approval', optionId: 'allow_always' });
    expect(await first).toMatchObject({ behavior: 'allow', updatedInput: { command: 'echo a' }, updatedPermissions: suggestions, decisionClassification: 'user_permanent' });
    await complete(session, q);
  });

  it('honors suppressAlwaysAllowRule and native decline-default hints', async () => {
    const { session, q } = await harness().session(); await sent(session, q);
    const pending = q.permission('Bash', {}, { defaultToNo: true, suppressAlwaysAllowRule: true,
      suggestions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }] });
    expect(session.pendingInputs[0]).toMatchObject({ options: [
      { id: 'allow', primary: false }, { id: 'deny', primary: true },
    ] });
    await session.replyWithText('Use a safer path'); expect(await pending).toMatchObject({ behavior: 'deny', message: 'Use a safer path' });
    await complete(session, q);
  });

  it('answers AskUserQuestion by original question text with choices and Other text', async () => {
    const { session, q } = await harness().session(); await sent(session, q);
    const choice = q.permission('AskUserQuestion', question);
    await session.respondToInput(session.pendingInputs[0]!.requestId, { kind: 'answers', answers: { q0: { optionIds: ['o0'] } } });
    expect(await choice).toMatchObject({ behavior: 'allow', updatedInput: { ...question, answers: { 'Choose a color': 'Blue' } } });
    const other = q.permission('AskUserQuestion', question);
    expect(await session.replyWithText('Purple')).toMatchObject({ disposition: 'answered' });
    expect(await other).toMatchObject({ behavior: 'allow', updatedInput: { answers: { 'Choose a color': 'Purple' } } });
    await complete(session, q);
  });

  it('declines every pending request with composer text when multiple requests or questions exist (I-Q2)', async () => {
    const { session, q } = await harness().session(); await sent(session, q);
    const one = q.permission('AskUserQuestion', question); const two = q.permission();
    expect(await session.replyWithText('Change direction')).toMatchObject({ disposition: 'declined' });
    for (const result of await Promise.all([one, two])) expect(result).toMatchObject({ behavior: 'deny', message: 'Change direction' });
    const multi = q.permission('AskUserQuestion', { questions: [...question.questions, { ...question.questions[0], question: 'Second?' }] });
    await session.replyWithText('Neither'); expect(await multi).toMatchObject({ behavior: 'deny', message: 'Neither' });
    await complete(session, q);
  });

  it('releases native-aborted requests and declines malformed/late requests', async () => {
    const { session, q, events } = await harness().session(); await sent(session, q);
    const abort = new AbortController(); const pending = q.permission('Bash', {}, { signal: abort.signal });
    abort.abort(); expect(await pending).toMatchObject({ behavior: 'deny' }); expect(session.pendingInputs).toHaveLength(0);
    expect(events.find((e) => e.type === 'input.resolved')).toMatchObject({ resolution: { reason: 'native_resolved' } });
    expect(await q.permission('AskUserQuestion', { questions: [] })).toMatchObject({ behavior: 'deny' });
    await complete(session, q);
    expect(await q.permission()).toMatchObject({ behavior: 'deny' });
  });

  it('interrupts once, denies pending requests, verifies observed command exit and continues same runtime', async () => {
    const h = harness(); const { session, q, runtime, events } = await h.session(); await sent(session, q);
    runtime.descendants = [fakeProcess(123456, 'test-command')];
    q.onInterrupt = () => { runtime.descendants = []; };
    const pending = q.permission();
    const [one, two] = await Promise.all([session.stop(), session.stop()]);
    expect(one).toEqual(two); expect(one).toMatchObject({ status: 'stopped', summary: { cleanup: 'confirmed' } });
    expect(await pending).toMatchObject({ behavior: 'deny' }); expect(q.interruptCalls).toBe(1);
    expect(h.queries).toHaveLength(1);
    expect(events.find((e) => e.type === 'turn.completed')).toMatchObject({ outcome: 'interrupted' });
    expect(events.some((e) => e.type === 'session.error')).toBe(false);
    await sent(session, q); await complete(session, q);
  });

  it('preserves descendants already present before this turn', async () => {
    const { session, q, runtime } = await harness().session();
    runtime.descendants = [fakeProcess(1_000_001, 'earlier-service')]; await sent(session, q);
    const result = await session.stop(); expect(result).toMatchObject({ status: 'stopped', summary: { cleanup: 'not_required' } });
    expect(runtime.terminateCalls).toHaveLength(0); expect(runtime.descendants).toHaveLength(1);
  });

  it('recovers an isolated runtime after failed interrupt, without replaying input', async () => {
    const h = harness(); const { session, q, runtime } = await h.session(); await sent(session, q); q.interruptFailure = true;
    expect(await session.stop()).toMatchObject({ status: 'stopped', summary: { cleanup: 'runtime_restarted' } });
    expect(runtime.terminateCalls).toHaveLength(1); expect(h.queries).toHaveLength(2);
    const replacement = h.queries[1]!;
    expect(replacement.options.resume).toBe(nativeId); expect(replacement.inputs).toHaveLength(0);
    replacement.init(); await sent(session, replacement); await complete(session, replacement);
  });

  it('does not restart if previous runtime exit cannot be proven', async () => {
    const h = harness(); const { session, q, runtime } = await h.session(); await sent(session, q);
    runtime.terminateBehavior = 'survivors'; runtime.descendants = [fakeProcess(123456, 'survivor')]; q.interruptFailure = true;
    expect(await session.stop()).toMatchObject({ status: 'failed' }); expect(session.state).toBe('closed'); expect(h.queries).toHaveLength(1);
    await expect(h.provider.releaseRuntimes()).rejects.toBeInstanceOf(AggregateError);
    runtime.terminateBehavior = 'exit';
    await h.provider.releaseRuntimes();
  });

  it('falls back for a queued stopped message and for surviving command descendants', async () => {
    const h = harness(); const { session, q, runtime } = await h.session(); await sent(session, q);
    q.queued = [q.inputs[0]!.uuid!];
    expect(await session.stop()).toMatchObject({ status: 'stopped', summary: { cleanup: 'runtime_restarted' } });
    const next = h.queries[1]!; next.init(); await sent(session, next);
    h.runtimes[1]!.descendants = [fakeProcess(222222, 'surviving-command')];
    expect(await session.stop()).toMatchObject({ status: 'stopped', summary: { cleanup: 'runtime_restarted' } });
    expect(runtime.running).toBe(false);
  });

  it('does not report late terminal events as completion of the next turn', async () => {
    const { session, q, events } = await harness().session(); await sent(session, q);
    const first = q.inputs[0]!.uuid; await complete(session, q); await sent(session, q);
    q.end(true, { user_message_uuid: first }); await flush(); expect(session.state).toBe('running');
    await complete(session, q); expect(events.filter((e) => e.type === 'turn.completed')).toHaveLength(2);
  });

  it('drops duplicate result UUIDs even without the optional input correlation field', async () => {
    const { session, q, events } = await harness().session(); await sent(session, q);
    q.end(true, { uuid: 'same-result' }); await flush(); await sent(session, q);
    q.end(true, { uuid: 'same-result' }); await flush(); expect(session.state).toBe('running');
    await complete(session, q); expect(events.filter((e) => e.type === 'turn.completed')).toHaveLength(2);
  });

  it('recovers after runtime exit during Stop without affecting a second session', async () => {
    const h = harness(); const first = await h.session(); const second = await h.session();
    await sent(first.session, first.q); await sent(second.session, second.q);
    first.q.onInterrupt = () => first.runtime.crash(1);
    expect(await first.session.stop()).toMatchObject({ status: 'stopped', summary: { cleanup: 'runtime_restarted' } });
    expect(second.runtime.running).toBe(true); expect(second.session.state).toBe('running');
    await complete(second.session, second.q);
  });

  it('fails recovery when no native id was assigned', async () => {
    const h = harness(); const session = await h.provider.createSession(options); const q = h.queries[0]!;
    await sent(session, q); q.interruptFailure = true;
    expect(await session.stop()).toMatchObject({ status: 'failed', error: { code: 'resume_failed' } });
    expect(h.queries).toHaveLength(1);
  });

  it('rejects an already-aborted model probe without spawning the SDK process', async () => {
    const h = harness(); const signal = AbortSignal.abort();
    await expect(h.provider.listModels({ environment: options.environment, signal })).rejects.toMatchObject({ code: 'invalid_state' });
    expect(h.queries).toHaveLength(0);
  });

  it('closes a resumed session on native id mismatch or lazy resume failure', async () => {
    const h = harness(); const session = await h.provider.resumeSession({ ...options, nativeSessionId: nativeId });
    h.queries[0]!.init('22222222-2222-4222-8222-222222222222'); await flush(); expect(session.state).toBe('closed');
    const resumed = await h.provider.resumeSession({ ...options, nativeSessionId: nativeId }); const events: AdapterEvent[] = [];
    resumed.subscribe((event) => events.push(event)); await sent(resumed, h.queries[1]!); h.queries[1]!.end(false);
    await flush(); expect(resumed.state).toBe('closed');
    expect(events.find((e) => e.type === 'turn.completed')).toMatchObject({ error: { code: 'resume_failed' } });
  });

  it('isolates runtime crashes from other sessions and reports runtime_crashed', async () => {
    const h = harness(); const first = await h.session(); const second = await h.session();
    await sent(first.session, first.q); await sent(second.session, second.q);
    first.runtime.crash(1); await flush(); expect(first.session.state).toBe('closed'); expect(second.session.state).toBe('running');
    expect(first.events.find((e) => e.type === 'turn.completed')).toMatchObject({ outcome: 'failed', error: { code: 'runtime_crashed' } });
    await complete(second.session, second.q);
  });

  it('defers model switches while running to the next input and returns native models', async () => {
    const { session, q } = await harness().session(); expect(await session.listModels()).toEqual([{ id: 'sonnet', displayName: 'Sonnet', description: 'native' }]);
    await sent(session, q); await session.setModel('opus'); expect(q.modelChanges).toEqual([]);
    await complete(session, q); await sent(session, q); expect(q.modelChanges).toEqual(['opus']);
    await complete(session, q); await session.setModel(null); expect(q.modelChanges).toEqual(['opus', undefined]);
  });

  const efforts = (...levels: NonNullable<SDKModel['supportedEffortLevels']>): SDKModel[] => [
    { value: 'sonnet', displayName: 'Sonnet', description: 'native', supportsEffort: true, supportedEffortLevels: levels },
    { value: 'haiku', displayName: 'Haiku', description: 'native', supportsEffort: false, supportedEffortLevels: ['low'] },
  ];

  it('reports the native effort levels of models that support effort', async () => {
    const { session } = await harness({ catalog: efforts('low', 'medium', 'max') }).session();
    expect(await session.listModels()).toEqual([
      { id: 'sonnet', displayName: 'Sonnet', description: 'native', reasoningEfforts: ['low', 'medium', 'max'] },
      { id: 'haiku', displayName: 'Haiku', description: 'native' },
    ]);
  });

  it("marks the CLI's own default row and reports the model ID each row resolves to", async () => {
    const catalog: SDKModel[] = [{ value: 'default', displayName: 'Default (recommended)', description: 'native', supportsEffort: true, supportedEffortLevels: ['low', 'high'] },
      { value: 'sonnet', displayName: 'Sonnet', description: 'native', resolvedModel: 'claude-sonnet-native' }];
    const { session } = await harness({ catalog }).session();
    expect(await session.listModels()).toEqual([
      { id: 'default', displayName: 'Default (recommended)', description: 'native', isDefault: true, reasoningEfforts: ['low', 'high'] },
      { id: 'sonnet', displayName: 'Sonnet', description: 'native', resolvedModel: 'claude-sonnet-native' },
    ]);
  });

  it('applies the effort through native flag settings, deferring it while a turn runs, and null restores the model default', async () => {
    const { session, q } = await harness({ catalog: efforts('low', 'medium', 'high', 'max') }).session();
    await session.setReasoningEffort('low'); expect(q.flagSettings).toEqual([{ effortLevel: 'low' }]);
    await sent(session, q); await session.setReasoningEffort('max'); expect(q.flagSettings).toEqual([{ effortLevel: 'low' }]);
    await complete(session, q); await sent(session, q); expect(q.flagSettings).toEqual([{ effortLevel: 'low' }, { effortLevel: 'max' }]);
    await complete(session, q); await sent(session, q); expect(q.flagSettings).toHaveLength(2);
    await complete(session, q); await session.setReasoningEffort(null);
    expect(q.flagSettings.at(-1)).toEqual({ effortLevel: null });
  });

  it('rejects effort the selected model does not offer, since the CLI would silently accept it', async () => {
    const h = harness({ catalog: efforts('low', 'medium') });
    const { session, q } = await h.session({ overrides: { model: 'sonnet' } });
    await expect(session.setReasoningEffort('max')).rejects.toMatchObject({ code: 'invalid_argument' });
    await expect(session.setReasoningEffort('ultra')).rejects.toMatchObject({ code: 'invalid_argument' });
    await session.setModel('haiku');
    await expect(session.setReasoningEffort('low')).rejects.toMatchObject({ code: 'unsupported' });
    expect(q.flagSettings).toEqual([]);
  });

  it('checks the effort against the pending model and, for an unlisted model, against the SDK levels', async () => {
    const { session, q } = await harness({ catalog: efforts('low', 'medium') }).session();
    await session.setModel('claude-custom-model');
    await expect(session.setReasoningEffort('ultra')).rejects.toMatchObject({ code: 'invalid_argument' });
    await session.setReasoningEffort('xhigh'); expect(q.flagSettings).toEqual([{ effortLevel: 'xhigh' }]);
  });

  it('re-applies the chosen effort on the replacement runtime after verified recovery', async () => {
    const h = harness({ catalog: efforts('low', 'high') }); const { session, q } = await h.session();
    await session.setReasoningEffort('high'); await sent(session, q); q.interruptFailure = true;
    expect(await session.stop()).toMatchObject({ summary: { cleanup: 'runtime_restarted' } });
    const replacement = h.queries[1]!; replacement.init(); await flush();
    expect(replacement.flagSettings).toEqual([]);
    await sent(session, replacement); expect(replacement.flagSettings).toEqual([{ effortLevel: 'high' }]);
    await complete(session, replacement);
  });

  it('probes models without input or native session persistence', async () => {
    const h = harness(); expect(await h.provider.listModels({ environment: options.environment })).toHaveLength(1);
    expect(h.queries[0]!.options.persistSession).toBe(false); expect(h.queries[0]!.inputs).toHaveLength(0);
    expect(h.queries[0]!.closed).toBe(true); expect(h.runtimes[0]!.running).toBe(false);
  });

  it('rejects unsupported options and attachments before submitting a turn', async () => {
    const h = harness(); await expect(h.provider.createSession({ ...options, overrides: { sandboxMode: 'read-only' } })).rejects.toMatchObject({ code: 'unsupported' });
    await expect(h.provider.createSession({ ...options, providerOptions: { resume: 'other' } })).rejects.toMatchObject({ code: 'unsupported' });
    await expect(h.provider.resumeSession({ ...options, nativeSessionId: 'not-uuid' })).rejects.toMatchObject({ code: 'resume_failed' });
    const { session, events } = await h.session();
    await expect(session.sendUserInput({ text: '', attachments: [{ kind: 'skill', name: 'review', path: '/tmp/SKILL.md' }] })).rejects.toMatchObject({ code: 'unsupported' });
    await expect(session.sendUserInput({ text: 'x', attachments: [{ kind: 'image', path: '/tmp/definitely-missing-image.png' }] })).rejects.toMatchObject({ code: 'invalid_argument' });
    expect(events.some((e) => e.type === 'turn.started')).toBe(false);
  });
});

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108020000009077533de00000000c49444154789c63f8cfc00000030101009c2d36a50000000049454e44ae426082', 'hex');

describe('Claude structured attachments — FR-INPUT-001 / Tools §4.1', () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'claude-attach-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('sends images as native base64 blocks first, then the text, then path-only file references', async () => {
    const image = join(dir, 'shot.bin'); // the type comes from the header, not the name
    await writeFile(image, PNG);
    const { session, q } = await harness().session();
    await session.sendUserInput({ text: 'describe', attachments: [
      { kind: 'file', path: '/repo/src/a "quoted".ts', name: 'a "quoted".ts' }, { kind: 'image', path: image }] });
    await vi.waitFor(() => expect(q.inputs).toHaveLength(1));
    const content = q.inputs[0]!.message.content as unknown as Array<Record<string, unknown>>;
    expect(content.map((block) => block.type)).toEqual(['image', 'text', 'text']);
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG.toString('base64') } });
    expect(content[1]).toEqual({ type: 'text', text: 'describe' });
    expect(content[2]!.text).toBe('Attached file reference (local path; file contents are not embedded):\n{"name":"a \\"quoted\\".ts","path":"/repo/src/a \\"quoted\\".ts"}');
  });

  it('keeps plain text input as a string and rejects files that are not supported images before Running', async () => {
    const fake = join(dir, 'fake.png');
    await writeFile(fake, 'not an image');
    const provider = new ClaudeProvider();
    await expect(provider.checkInput({ text: 'x', attachments: [{ kind: 'image', path: fake }] })).rejects.toMatchObject({ code: 'unsupported' });
    await expect(provider.checkInput({ text: 'x', attachments: [{ kind: 'skill', name: 'review', path: '/tmp/SKILL.md' }] })).rejects.toMatchObject({ code: 'unsupported' });
    await expect(provider.checkInput({ text: 'x', attachments: [{ kind: 'file', path: fake }] })).resolves.toBeUndefined();
    const { session, q, events } = await harness().session();
    await expect(session.sendUserInput({ text: 'x', attachments: [{ kind: 'image', path: fake }] })).rejects.toMatchObject({ code: 'unsupported' });
    expect(events.some((e) => e.type === 'turn.started')).toBe(false);
    await session.sendUserInput({ text: 'plain' });
    await vi.waitFor(() => expect(q.inputs).toHaveLength(1));
    expect(q.inputs[0]!.message.content).toBe('plain');
  });
});

describe('Claude native queue — I-Q3 / A-Q2', () => {
  const ofType = <K extends AdapterEvent['type']>(events: AdapterEvent[], type: K) => events.filter((e): e is Extract<AdapterEvent, { type: K }> => e.type === type);
  async function queued(session: AgentSession, q: MockQuery, inputId: string, text = 'next') {
    const receipt = session.queueUserInput!({ text }, { inputId });
    await flush();
    const uuid = q.inputs.at(-1)!.uuid!;
    q.lifecycle(uuid, 'queued');
    await expect(receipt).resolves.toEqual({ inputId });
    return uuid;
  }

  it('reports queue capability and refuses queueing while idle, and plain sends while input is queued', async () => {
    const { session, q } = await harness().session();
    expect(session.capabilities.inputWhileRunning).toBe('queue');
    await expect(session.queueUserInput!({ text: 'x' })).rejects.toMatchObject({ code: 'invalid_state' });
    const first = await sent(session, q);
    await queued(session, q, 'in-1');
    q.end(true, { user_message_uuid: q.inputs[0]!.uuid });
    await flush();
    expect(session.state).toBe('idle');
    await expect(session.sendUserInput({ text: 'skip the queue' })).rejects.toMatchObject({ code: 'invalid_state' });
    expect(session.queuedInputIds).toEqual(['in-1']);
    expect(first).toBeTruthy();
  });

  it('folds queued input into the running turn after a tool round: one turn, one completion', async () => {
    const { session, q, events } = await harness().session();
    const turnId = await sent(session, q);
    const uuid = await queued(session, q, 'in-1');
    expect(ofType(events, 'input.started')).toEqual([]);
    q.lifecycle(uuid, 'started');
    await flush();
    expect(ofType(events, 'input.started')).toMatchObject([{ turnId, inputId: 'in-1' }]);
    expect(session.queuedInputIds).toEqual([]);
    q.end(true, { user_message_uuid: q.inputs[0]!.uuid, user_message_uuids: [q.inputs[0]!.uuid, uuid] });
    await flush();
    expect(ofType(events, 'turn.completed')).toMatchObject([{ turnId, outcome: 'completed' }]);
    expect(ofType(events, 'turn.started')).toHaveLength(1);
  });

  it('starts a native turn for input started after the previous result, and batches inputs started together', async () => {
    const { session, q, events } = await harness().session();
    const first = await sent(session, q);
    const b = await queued(session, q, 'in-b');
    const c = await queued(session, q, 'in-c');
    q.end(true, { user_message_uuid: q.inputs[0]!.uuid });
    await flush();
    q.lifecycle(b, 'started');
    q.lifecycle(c, 'started');
    q.emit({ type: 'assistant', uuid: randomUUID(), session_id: nativeId, parent_tool_use_id: null, user_message_uuid: c,
      message: { id: 'msg-b', model: 'haiku', content: [{ type: 'text', text: 'BANANA' }] } });
    await flush();
    const started = ofType(events, 'turn.started');
    expect(started).toHaveLength(2);
    const next = started[1]!;
    expect(next.turnId).not.toBe(first);
    expect(next.queuedInputIds).toEqual(['in-b']);
    expect(ofType(events, 'input.started').map((e) => [e.inputId, e.turnId])).toEqual([['in-b', next.turnId], ['in-c', next.turnId]]);
    expect(ofType(events, 'item.completed').at(-1)).toMatchObject({ turnId: next.turnId, item: { text: 'BANANA' } });
    expect(session.state).toBe('running');
    q.end(true, { user_message_uuid: c, user_message_uuids: [b, c] });
    await flush();
    expect(ofType(events, 'turn.completed').map((e) => e.turnId)).toEqual([first, next.turnId]);
    expect(session.state).toBe('idle');
  });

  it('keeps queued input across Stop and starts its turn only after the stopped turn finished', async () => {
    const { session, q, events } = await harness().session();
    const stopped = await sent(session, q);
    const b = await queued(session, q, 'in-b');
    q.interrupt = async () => {
      q.interruptCalls++;
      q.end(false, { user_message_uuid: q.inputs[0]!.uuid });
      q.lifecycle(q.inputs[0]!.uuid!, 'cancelled');
      q.lifecycle(b, 'started');
      q.emit({ type: 'assistant', uuid: randomUUID(), session_id: nativeId, parent_tool_use_id: null, user_message_uuid: b,
        message: { id: 'msg-b', model: 'haiku', content: [{ type: 'text', text: 'after stop' }] } });
      return { still_queued: [b] };
    };
    const result = await session.stop();
    await flush();
    expect(result.status).toBe('stopped');
    const order = events.filter((e) => ['turn.started', 'turn.completed', 'item.completed', 'input.started', 'input.cancelled'].includes(e.type))
      .map((e) => `${e.type}:${'turnId' in e && e.turnId === stopped ? 'A' : 'B'}`);
    expect(order).toEqual(['turn.started:A', 'turn.completed:A', 'turn.started:B', 'input.started:B', 'item.completed:B']);
    expect(ofType(events, 'turn.completed')[0]).toMatchObject({ outcome: 'interrupted' });
    expect(session.state).toBe('running');
  });

  it('cancels queued input natively, on runtime crash, and refuses queueing without the lifecycle capability', async () => {
    const h = harness();
    const { session, q, events, runtime } = await h.session();
    await sent(session, q);
    const uuid = await queued(session, q, 'in-1');
    await queued(session, q, 'in-2');
    q.lifecycle(uuid, 'cancelled');
    await flush();
    expect(ofType(events, 'input.cancelled')).toMatchObject([{ inputId: 'in-1', reason: 'native_cancelled' }]);
    runtime.crash(1);
    await flush();
    expect(ofType(events, 'input.cancelled').map((e) => e.inputId)).toEqual(['in-1', 'in-2']);
    expect(session.queuedInputIds).toEqual([]);

    const old = await harness().session();
    old.q.init(nativeId, []);
    await sent(old.session, old.q);
    await expect(old.session.queueUserInput!({ text: 'x' })).rejects.toMatchObject({ code: 'unsupported' });
    expect(old.session.queuedInputIds).toEqual([]);
  });

  it('waits for system/init before deciding whether a starting runtime can queue, and fails if it ends first', async () => {
    const h = harness();
    const session = await h.provider.createSession({ ...options });
    const q = h.queries.at(-1)!;
    await session.sendUserInput({ text: 'hello' });
    await flush();
    const receipt = session.queueUserInput!({ text: 'next' }, { inputId: 'in-1' });
    await flush();
    expect(q.inputs).toHaveLength(1);
    q.init();
    await vi.waitFor(() => expect(q.inputs).toHaveLength(2));
    q.lifecycle(q.inputs[1]!.uuid!, 'queued');
    await expect(receipt).resolves.toEqual({ inputId: 'in-1' });

    const second = await h.provider.createSession({ ...options });
    await second.sendUserInput({ text: 'hello' });
    await flush();
    const refused = second.queueUserInput!({ text: 'next' }, { inputId: 'in-2' });
    await flush();
    h.runtimes.at(-1)!.crash(1);
    await expect(refused).rejects.toMatchObject({ code: 'invalid_state' });
    expect(second.queuedInputIds).toEqual([]);
  });

  it('delivers inputs to the CLI in call order even when an earlier one reads an image', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'claude-order-'));
    const image = join(dir, 'a.png');
    await writeFile(image, PNG);
    const textOf = (input: SDKUserMessage) => typeof input.message.content === 'string' ? input.message.content
      : (input.message.content as { type: string; text?: string }[]).find((block) => block.type === 'text')!.text;
    const { session, q } = await harness().session();
    const turn = session.sendUserInput({ text: 'A', attachments: [{ kind: 'image', path: image }] });
    const first = session.queueUserInput!({ text: 'B', attachments: [{ kind: 'image', path: image }] }, { inputId: 'in-b' });
    const second = session.queueUserInput!({ text: 'C' }, { inputId: 'in-c' });
    await vi.waitFor(() => expect(q.inputs).toHaveLength(3));
    expect(q.inputs.map(textOf)).toEqual(['A', 'B', 'C']);
    await turn;
    for (const input of q.inputs.slice(1)) q.lifecycle(input.uuid!, 'queued');
    await expect(Promise.all([first, second])).resolves.toEqual([{ inputId: 'in-b' }, { inputId: 'in-c' }]);
  });

  it('opens a new turn for input the CLI starts after Stop, even before the stopped turn reports its result', async () => {
    const { session, q, events } = await harness().session();
    const stopped = await sent(session, q);
    const b = await queued(session, q, 'in-b');
    q.interrupt = async () => {
      q.interruptCalls++;
      q.lifecycle(b, 'started');
      q.end(false, { user_message_uuid: q.inputs[0]!.uuid });
      q.lifecycle(q.inputs[0]!.uuid!, 'cancelled');
      return { still_queued: [b] };
    };
    expect((await session.stop()).status).toBe('stopped');
    await flush();
    const started = ofType(events, 'input.started');
    expect(started).toHaveLength(1);
    expect(started[0]!.turnId).not.toBe(stopped);
    expect(ofType(events, 'turn.started').at(-1)).toMatchObject({ turnId: started[0]!.turnId, queuedInputIds: ['in-b'] });
    expect(ofType(events, 'turn.completed')).toMatchObject([{ turnId: stopped, outcome: 'interrupted' }]);
  });
});

describe('Claude availability', () => {
  it('reports missing executable without starting a runtime', async () => {
    const p = new ClaudeProvider({ resolveExecutable: async () => undefined });
    expect(await p.checkAvailability({ environment: options.environment })).toMatchObject({ status: 'not_installed', version: { status: 'skipped' } });
  });
  it.each([true, false])('reports login separately and strips account identity (loggedIn=%s)', async (loggedIn) => {
    const p = new ClaudeProvider({ resolveExecutable: async () => ({ path: '/claude', source: 'explicit' }),
      exec: async (_file, args) => ({ code: loggedIn ? 0 : 1, signal: null, stderr: '', timedOut: false, truncated: false,
        stdout: args[0] === '--version' ? '2.1.295 (Claude Code)' : JSON.stringify({ loggedIn, authMethod: 'oauth', email: 'private@example.com' }) }) });
    // Version is independently successful even when auth exits 1.
    const report = await p.checkAvailability({ environment: options.environment });
    expect(report.login).toEqual({ status: 'ok', value: { state: loggedIn ? 'logged_in' : 'logged_out', method: 'oauth' } });
    expect(JSON.stringify(report)).not.toContain('private@example.com');
    expect(report.status).toBe(loggedIn ? 'available' : 'not_logged_in');
  });
  it.each([['2.1.295', 'tested'], ['2.1.310', 'tested'], ['2.1.322', 'tested'], ['2.1.323', 'untested']])('classifies CLI %s as %s', async (version, compatibility) => {
    const p = new ClaudeProvider({ resolveExecutable: async () => ({ path: '/claude', source: 'explicit' }),
      exec: async (_file, args) => ({ code: 0, signal: null, stderr: '', timedOut: false, truncated: false,
        stdout: args[0] === '--version' ? `${version} (Claude Code)` : JSON.stringify({ loggedIn: true, authMethod: 'claude.ai' }) }) });
    const report = await p.checkAvailability({ environment: options.environment });
    expect(report.version).toMatchObject({ status: 'ok', value: { compatibility, testedVersions: '2.1.294, 2.1.295, 2.1.310, 2.1.322' } });
  });
  it('handles malformed authentication output without echoing it', async () => {
    const p = new ClaudeProvider({ resolveExecutable: async () => ({ path: '/claude', source: 'path' }),
      exec: async (_file, args) => ({ code: 0, signal: null, stderr: '', timedOut: false, truncated: false,
        stdout: args[0] === '--version' ? '2.2.1' : 'private@example.com invalid json' }) });
    const report = await p.checkAvailability({ environment: options.environment });
    expect(report.status).toBe('error'); expect(report.version).toMatchObject({ value: { compatibility: 'untested' } });
    expect(JSON.stringify(report)).not.toContain('private@example.com');
  });
});
