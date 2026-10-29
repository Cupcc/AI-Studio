import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventRecorder } from '../../src/testing/event-recorder.js';
import { ScriptedRpcError } from '../../src/testing/fake-transport.js';
import { Harness, approval, model, options } from './harness.js';
import { CodexProvider } from '../../src/codex/index.js';
import { deferred } from '../../src/core/async.js';

const harnesses: Harness[] = [];
const setup = () => { const harness = new Harness(); harnesses.push(harness); return harness; };
afterEach(async () => { await Promise.all(harnesses.splice(0).map((h) => h.provider.dispose())); });

describe('Codex Provider lifecycle / FR-CHAT-002, FR-CHAT-003, AC-02', () => {
  it('rejects unconfirmed runtime disposal and retries the exact runtime', async () => {
    const h = setup();
    const session = await h.session();
    const runtime = h.runtimes[0]!;
    runtime.terminateBehavior = 'hang';
    await expect(session.dispose()).rejects.toMatchObject({ code: 'stop_cleanup_failed' });
    expect(h.runtimes).toHaveLength(1);
    runtime.terminateBehavior = 'exit';
    await Promise.all([session.dispose(), session.dispose()]);
    expect(runtime.terminateCalls).toHaveLength(2);
    expect(h.runtimes).toHaveLength(1);
    await session.dispose();
    expect(runtime.terminateCalls).toHaveLength(2);
  });

  it('rejects Provider.releaseRuntimes with an AggregateError while exit is unconfirmed and retries the same handle', async () => {
    const h = setup();
    const session = await h.session();
    const runtime = h.runtimes[0]!;
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

  it('drops a session from the tracked set once an explicit dispose retry confirmed its release', async () => {
    const h = setup();
    const session = await h.session();
    const tracked = () => (h.provider as unknown as { live: { size: number } }).live.size;
    h.runtimes[0]!.terminateBehavior = 'hang';
    await expect(session.dispose()).rejects.toMatchObject({ code: 'stop_cleanup_failed' });
    expect(tracked()).toBe(1);
    h.runtimes[0]!.terminateBehavior = 'exit';
    await session.dispose();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(tracked()).toBe(0);
  });

  it('retries a Provider release with the terminate waits the Session was configured with', async () => {
    const h = setup();
    const session = await h.session({ timeouts: { ...options.timeouts, terminateGraceMs: 3, killWaitMs: 4 } });
    const runtime = h.runtimes[0]!;
    runtime.terminateBehavior = 'hang';
    await expect(session.dispose()).rejects.toBeInstanceOf(Error);
    await expect(h.provider.releaseRuntimes()).rejects.toBeInstanceOf(AggregateError);
    expect(runtime.terminateCalls.length).toBeGreaterThan(1);
    expect(runtime.terminateCalls.every((call) => call.graceMs === 3 && call.killWaitMs === 4)).toBe(true);
    runtime.terminateBehavior = 'exit';
    await h.provider.releaseRuntimes();
  });

  it('limits releaseRuntimes(cwd) to that Project without touching another Project or disposing the Provider', async () => {
    const h = setup();
    const a = await h.session({ cwd: '/tmp/project a' });
    const b = await h.session({ cwd: '/tmp/project b' });
    h.runtimes[1]!.terminateBehavior = 'hang';
    await h.provider.releaseRuntimes('/tmp/project a');
    expect(a.state).toBe('closed');
    expect(h.runtimes[0]!.running).toBe(false);
    expect(b.state).toBe('idle');
    expect(h.runtimes[1]!.terminateCalls).toHaveLength(0);
    expect((await h.session({ cwd: '/tmp/project a' })).state).toBe('idle');
    await expect(h.provider.releaseRuntimes('/tmp/project b')).rejects.toBeInstanceOf(AggregateError);
    expect(b.state).toBe('closed');
    expect(h.runtimes[1]!.running).toBe(true);
    h.runtimes[1]!.terminateBehavior = 'exit';
    await h.provider.releaseRuntimes('/tmp/project b');
    expect(h.runtimes[1]!.running).toBe(false);
    expect(h.runtimes[2]!.running).toBe(true);
  });

  it('keeps Provider.dispose() strict: it rejects while exit is unconfirmed and retries the same handle', async () => {
    const h = setup();
    await h.session();
    const runtime = h.runtimes[0]!;
    runtime.terminateBehavior = 'hang';
    await expect(h.provider.releaseRuntimes()).rejects.toBeInstanceOf(AggregateError);
    const first = h.provider.dispose();
    expect(h.provider.dispose()).toBe(first);
    await expect(first).rejects.toBeInstanceOf(AggregateError);
    await expect(h.session()).rejects.toMatchObject({ code: 'disposed' });
    runtime.terminateBehavior = 'exit';
    await h.provider.dispose();
    expect(runtime.running).toBe(false);
    expect(h.runtimes).toHaveLength(1);
    const calls = runtime.terminateCalls.length;
    await h.provider.dispose();
    expect(runtime.terminateCalls).toHaveLength(calls);
  });

  it('keeps the startup error but retains an unconfirmed failed-startup Runtime for release', async () => {
    const h = setup();
    h.configure = (server, runtime) => {
      runtime.terminateBehavior = 'hang';
      server.handle('thread/start', () => { throw new Error('thread start failed'); });
    };
    const error = await h.session().then(() => undefined, (reason: unknown) => reason);
    expect(error).toMatchObject({ code: 'provider_error', message: expect.stringContaining('thread start failed') });
    expect(h.runtimes).toHaveLength(1);
    expect(h.runtimes[0]!.running).toBe(true);
    await expect(h.provider.releaseRuntimes()).rejects.toBeInstanceOf(AggregateError);
    h.runtimes[0]!.terminateBehavior = 'exit';
    await h.provider.releaseRuntimes();
    expect(h.runtimes[0]!.running).toBe(false);
    expect(h.runtimes).toHaveLength(1);
  });

  it('waits for a late Runtime startup, releases it, and rejects new startups only while releasing', async () => {
    const h = setup();
    const gate = deferred<void>();
    const factory = h.dependencies.runtimeFactory!;
    let requested = 0;
    h.dependencies.runtimeFactory = async (spawn) => { requested++; await gate.promise; return factory(spawn); };
    const creating = h.session().then(() => undefined, (reason: unknown) => reason);
    await vi.waitFor(() => expect(requested).toBe(1));
    let released = false;
    const release = h.provider.releaseRuntimes().then(() => { released = true; });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(released).toBe(false);
    await expect(h.session()).rejects.toMatchObject({ code: 'invalid_state' });
    expect(requested).toBe(1);
    gate.resolve();
    await release;
    expect(await creating).toBeInstanceOf(Error);
    expect(h.runtimes).toHaveLength(1);
    expect(h.runtimes[0]!.running).toBe(false);
    expect((await h.session()).state).toBe('idle');
    expect(h.runtimes).toHaveLength(2);
  });

  it('retains an unconfirmed model-probe Runtime and releases that exact handle later', async () => {
    const h = setup();
    h.configure = (_server, runtime) => { runtime.terminateBehavior = 'hang'; };
    await expect(h.provider.listModels({ environment: options.environment, cwd: '/tmp/probe project' })).rejects.toMatchObject({ code: 'stop_cleanup_failed' });
    const runtime = h.runtimes[0]!;
    expect(runtime.running).toBe(true);
    await h.provider.releaseRuntimes('/tmp/another project');
    expect(runtime.terminateCalls).toHaveLength(1);
    await expect(h.provider.releaseRuntimes('/tmp/probe project')).rejects.toBeInstanceOf(AggregateError);
    expect(runtime.terminateCalls).toHaveLength(2);
    runtime.terminateBehavior = 'exit';
    await h.provider.releaseRuntimes();
    expect(runtime.running).toBe(false);
    expect(h.runtimes).toHaveLength(1);
  });

  it('keeps the model-catalog error when the probe cleanup is also unconfirmed, and still retains the handle', async () => {
    const h = setup();
    h.configure = (server, runtime) => { server.handle('model/list', () => { throw new Error('catalog unavailable'); }); runtime.terminateBehavior = 'hang'; };
    const failure = await h.provider.listModels({ environment: options.environment }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ message: expect.stringContaining('catalog unavailable') });
    expect(failure).not.toMatchObject({ code: 'stop_cleanup_failed' });
    const runtime = h.runtimes[0]!;
    expect(runtime.running).toBe(true);
    await expect(h.provider.releaseRuntimes()).rejects.toBeInstanceOf(AggregateError);
    runtime.terminateBehavior = 'exit';
    await h.provider.releaseRuntimes();
    expect(runtime.running).toBe(false);
  });

  it('uses native defaults, supplied environment and one Runtime per Session', async () => {
    const h = setup();
    const a = await h.session();
    const b = await h.session();
    expect(a.nativeSessionId).not.toBe(b.nativeSessionId);
    expect(h.spawns).toHaveLength(2);
    expect(h.spawns[0]).toMatchObject({ args: ['app-server', '--listen', 'stdio://'], cwd: options.cwd, env: options.environment.env });
    expect(h.servers[0]!.received.find((r) => r.method === 'thread/start')!.params).toEqual({ cwd: options.cwd });
    expect(h.servers[0]!.received.find((r) => r.method === 'initialize')!.params).toMatchObject({ capabilities: { experimentalApi: true } });
    expect(h.servers[0]!.received.map((r) => r.method).slice(0, 3)).toEqual(['initialize', 'initialized', 'thread/start']);
    const events = new EventRecorder(a);
    expect(events.events.find((e) => e.type === 'session.native_id')).toMatchObject({ nativeSessionId: a.nativeSessionId });
    await a.dispose();
    expect(h.runtimes[0]!.running).toBe(false);
    expect(h.runtimes[1]!.running).toBe(true);
  });

  it('passes only explicit native overrides and rejects unknown provider options', async () => {
    const h = setup();
    await h.session({ overrides: { model: 'selected', approvalPolicy: 'on-request', sandboxMode: 'read-only' },
      providerOptions: { config: { custom_setting: 'kept' }, effort: 'high' } });
    expect(h.servers[0]!.received.find((r) => r.method === 'thread/start')!.params).toEqual({ cwd: options.cwd, model: 'selected', approvalPolicy: 'on-request', sandbox: 'read-only', config: { custom_setting: 'kept' } });
    expect(() => h.provider.createSession({ ...options, providerOptions: { threadId: 'injected' } })).toThrow(/Unsupported/);
    expect(() => h.provider.createSession({ ...options, overrides: { permissionMode: 'bypassPermissions' } })).toThrow(/permissionMode/);
    expect(() => h.provider.createSession({ ...options, cwd: 'relative' })).toThrow(/absolute/);
  });

  it('resumes the exact original id and never silently starts another thread', async () => {
    const h = setup();
    const session = await h.provider.resumeSession({ ...options, nativeSessionId: 'original' });
    expect(session.nativeSessionId).toBe('original');
    expect(h.servers[0]!.received.some((r) => r.method === 'thread/start')).toBe(false);
    expect(h.servers[0]!.received.find((r) => r.method === 'thread/resume')!.params).toEqual({ cwd: options.cwd, threadId: 'original', excludeTurns: true });
  });

  it.each(['rejected', 'different-id'])('fails resume (%s) and shuts down its Runtime', async (failure) => {
    const h = setup();
    h.configure = (server) => server.handle('thread/resume', () => {
      if (failure === 'rejected') throw new ScriptedRpcError({ code: -32600, message: 'No such thread' });
      return { thread: { id: 'wrong' }, model: 'cli-model' };
    });
    await expect(h.provider.resumeSession({ ...options, nativeSessionId: 'original' })).rejects.toMatchObject({ code: 'resume_failed' });
    expect(h.runtimes[0]!.running).toBe(false);
    expect(h.servers[0]!.received.some((r) => r.method === 'thread/start')).toBe(false);
  });

  it('provides Running synchronously, binds notifications before response, and completes text by replacement', async () => {
    const h = setup();
    const session = await h.session();
    const recorder = new EventRecorder(session);
    const sent = session.sendUserInput({ text: 'hello', attachments: [{ kind: 'file', path: '/tmp/a.ts' }, { kind: 'image', path: '/tmp/a.png' }] });
    expect(recorder.events.some((event) => event.type === 'turn.started')).toBe(true);
    await sent;
    await vi.waitFor(() => expect(session.activeTurn?.nativeTurnId).toBeTruthy());
    h.notify(session, 'item/started', { item: { type: 'agentMessage', id: 'message', text: '' } });
    h.notify(session, 'item/agentMessage/delta', { itemId: 'message', delta: 'hello ' });
    h.notify(session, 'item/agentMessage/delta', { itemId: 'message', delta: 'world' });
    h.notify(session, 'item/completed', { item: { type: 'agentMessage', id: 'message', text: 'hello world' } });
    h.complete(session, 'completed', { durationMs: 123 });
    const result = await recorder.waitFor('turn.completed');
    expect(result).toMatchObject({ outcome: 'completed', nativeDurationMs: 123, model: 'cli-model' });
    expect(recorder.events.filter((e) => e.type === 'item.completed')).toMatchObject([{ item: { text: 'hello world' } }]);
    expect(h.servers[0]!.received.find((r) => r.method === 'turn/start')!.params).toMatchObject({ input: [
      { type: 'text', text: 'hello', text_elements: [] }, { type: 'mention', name: 'a.ts', path: '/tmp/a.ts' }, { type: 'localImage', path: '/tmp/a.png' },
    ] });
  });

  it.each(['completed', 'stopped'] as const)('retains steering acknowledgement when the native turn is %s first', async outcome => {
    const h = setup(); const session = await h.session();
    await h.start(session);
    const turn = session.activeTurn!;
    h.servers[0]!.handle('turn/steer', async () => {
      if (outcome === 'completed') h.complete(session);
      else await session.stop();
      return { turnId: turn.nativeTurnId };
    });
    await expect(session.sendUserInput({ text: 'additional input' })).resolves.toEqual({ turnId: turn.turnId });
    expect(session.state).toBe('idle');
    expect(h.servers[0]!.received.filter(request => request.method === 'turn/start')).toHaveLength(1);
  });

  it('delivers running input through native turn/steer without opening another turn', async () => {
    const h = setup(); const session = await h.session();
    await h.start(session);
    const nativeTurnId = session.activeTurn!.nativeTurnId!;
    h.servers[0]!.handle('turn/steer', (params) => {
      expect(params).toMatchObject({ threadId: session.nativeSessionId, expectedTurnId: nativeTurnId,
        input: [{ type: 'text', text: 'continue with tests', text_elements: [] }] });
      return { turnId: nativeTurnId };
    });
    expect(await session.sendUserInput({ text: 'continue with tests' })).toEqual({ turnId: session.activeTurn!.turnId });
    expect(h.servers[0]!.received.filter((request) => request.method === 'turn/start')).toHaveLength(1);
    expect(h.servers[0]!.received.filter((request) => request.method === 'turn/steer')).toHaveLength(1);
    h.complete(session);
  });

  it.each([
    ['unauthorized', 'auth_required'], ['usageLimitExceeded', 'quota_exceeded'], ['rateLimitExceeded', 'quota_exceeded'],
    [{ httpConnectionFailed: { httpStatusCode: 503 } }, 'network_error'], [{ httpConnectionFailed: { httpStatusCode: 401 } }, 'auth_required'], ['other', 'provider_error'],
  ])('maps native failure %j to %s without successful completion', async (info, code) => {
    const h = setup(); const session = await h.session(); const recorder = new EventRecorder(session);
    await h.start(session);
    h.complete(session, 'failed', { error: { message: 'native failure', codexErrorInfo: info } });
    expect(await recorder.waitFor('turn.completed')).toMatchObject({ outcome: 'failed', error: { code } });
  });

  it('keeps retry notifications nonterminal and ignores other-thread / late events', async () => {
    const h = setup(); const session = await h.session(); const recorder = new EventRecorder(session);
    const native = await h.start(session);
    h.notify(session, 'error', { error: { message: 'retrying', codexErrorInfo: 'other' }, willRetry: true });
    h.notify(session, 'item/agentMessage/delta', { threadId: 'foreign', itemId: 'wrong', delta: 'bad' });
    expect(session.state).toBe('running');
    h.complete(session); await recorder.waitFor('turn.completed');
    h.notify(session, 'item/agentMessage/delta', { turnId: native, itemId: 'late', delta: 'bad' });
    expect(recorder.events.filter((e) => e.type === 'item.delta')).toHaveLength(0);
    expect(recorder.events.filter((e) => e.type === 'turn.completed')).toHaveLength(1);
  });

  it('isolates a crash and reports native titles', async () => {
    const h = setup(); const a = await h.session(); const b = await h.session(); const recorder = new EventRecorder(a);
    await h.start(a); await h.start(b);
    h.notify(a, 'thread/name/updated', { threadName: 'A native title' }, 0);
    h.runtimes[0]!.crash(9);
    expect(await recorder.waitFor('turn.completed')).toMatchObject({ outcome: 'failed', error: { code: 'runtime_crashed' } });
    expect(a.state).toBe('closed'); expect(b.state).toBe('running');
    expect(recorder.events.find((e) => e.type === 'session.title')).toMatchObject({ title: 'A native title' });
  });

  it('uses model slugs across paginated catalogs and reads them without creating a thread', async () => {
    const h = setup();
    h.configure = (server) => server.handle('model/list', (p) => (p as { cursor?: string }).cursor
      ? { data: [model('second')], nextCursor: null } : { data: [model('first')], nextCursor: 'next' });
    expect((await h.provider.listModels({ environment: options.environment })).map((m) => m.id)).toEqual(['first', 'second']);
    expect(h.servers[0]!.received.some((r) => r.method.startsWith('thread/'))).toBe(false);
    expect(h.runtimes[0]!.running).toBe(false);
  });

  it('lists native skills without creating a Thread and releases its probe runtime', async () => {
    const h = setup();
    h.configure = server => server.handle('skills/list', p => ({ data: [{ cwd: (p as { cwds: string[] }).cwds[0], skills: [{ name: 'example', description: 'Use example', path: '/skills/example/SKILL.md', enabled: true }], errors: [] }] }));
    expect(await h.provider.listSkills({ cwd: options.cwd, environment: options.environment })).toMatchObject({ skills: [{ name: 'example', path: '/skills/example/SKILL.md' }], errors: [] });
    expect(h.servers[0]!.received.some(r => r.method.startsWith('thread/'))).toBe(false);
    expect(h.servers[0]!.received.find(r => r.method === 'skills/list')!.params).toEqual({ cwds: [options.cwd], forceReload: true });
    expect(h.runtimes[0]!.running).toBe(false);
  });

  it('passes explicit image and skill inputs in ordinary and running messages', async () => {
    const h = setup(); const session = await h.session();
    const attachments = [{ kind: 'image' as const, path: '/project/pic.png' }, { kind: 'skill' as const, name: 'example', path: '/skills/example/SKILL.md' }];
    await session.sendUserInput({ text: 'first', attachments });
    await vi.waitFor(() => expect(session.activeTurn?.nativeTurnId).toBeTruthy());
    await session.sendUserInput({ text: 'second', attachments });
    for (const method of ['turn/start', 'turn/steer']) expect(h.servers[0]!.received.find(r => r.method === method)!.params).toMatchObject({ input: [{ type: 'text' }, { type: 'localImage', path: '/project/pic.png' }, { type: 'skill', name: 'example', path: '/skills/example/SKILL.md' }] });
  });

  it('keeps public reasoning sources and indexes separate and ignores late deltas after the final item', async () => {
    const h = setup(); const session = await h.session(); const recorder = new EventRecorder(session);
    await h.start(session);
    h.notify(session, 'item/started', { item: { id: 'think', type: 'reasoning', summary: [], content: [] } });
    h.notify(session, 'item/reasoning/textDelta', { itemId: 'think', contentIndex: 0, delta: 'public content' });
    h.notify(session, 'item/reasoning/summaryTextDelta', { itemId: 'think', summaryIndex: 1, delta: 'second' });
    h.notify(session, 'item/reasoning/summaryTextDelta', { itemId: 'think', summaryIndex: 0, delta: 'first' });
    h.notify(session, 'item/reasoning/summaryTextDelta', { itemId: 'think', summaryIndex: 0, delta: ' part' });
    await vi.waitFor(() => expect(recorder.events.filter(e => e.type === 'item.updated')).toHaveLength(4));
    expect(recorder.events.filter(e => e.type === 'item.updated').at(-1)).toMatchObject({ item: { text: 'first part\nsecond' } });
    h.notify(session, 'item/completed', { item: { id: 'think', type: 'reasoning', summary: ['final summary'], content: ['public content'] } });
    h.notify(session, 'item/reasoning/textDelta', { itemId: 'think', contentIndex: 0, delta: 'late' });
    await vi.waitFor(() => expect(recorder.events.filter(e => e.type === 'item.completed')).toHaveLength(1));
    expect(recorder.events.filter(e => e.type === 'item.updated')).toHaveLength(4);
    expect(recorder.events.find(e => e.type === 'item.completed')).toMatchObject({ item: { text: 'final summary', status: 'completed' } });
  });

  it('retains public native tool output, review text and agent results through completed events', async () => {
    const h = setup(); const session = await h.session(); const recorder = new EventRecorder(session);
    await h.start(session);
    const items = [
      { id: 'function', type: 'functionCallOutput', name: 'inspect', namespace: 'tools', output: 'native output marker' },
      { id: 'review', type: 'exitedReviewMode', review: 'native review marker' },
      { id: 'agents', type: 'collabAgentToolCall', tool: 'wait', status: 'completed', prompt: 'native prompt', senderThreadId: 'parent', receiverThreadIds: ['child'], model: null, reasoningEffort: null, agentsStates: { child: { status: 'completed', message: 'native agent result' } } },
      { id: 'image', type: 'imageView', path: '/project/result.png' },
      { id: 'web', type: 'webSearch', query: 'native query', action: { type: 'search', query: 'native query', queries: null }, results: [{ title: 'native result', url: 'https://example.test/result' }] },
    ];
    for (const item of items) h.notify(session, 'item/completed', { item });
    await vi.waitFor(() => expect(recorder.events.filter(e => e.type === 'item.completed')).toHaveLength(items.length));
    const events = recorder.events.filter(e => e.type === 'item.completed');
    expect(events[0]).toMatchObject({ item: { tool: { name: 'inspect', server: 'tools', result: 'native output marker' } } });
    expect(events[1]).toMatchObject({ item: { text: 'native review marker' } });
    expect(events[2]).toMatchObject({ item: { tool: { input: { prompt: 'native prompt' }, result: { child: { message: 'native agent result' } } } } });
    expect(events[3]).toMatchObject({ item: { tool: { result: { path: '/project/result.png' } } } });
    expect(events[4]).toMatchObject({ item: { tool: { input: { action: { type: 'search' } }, result: [{ title: 'native result' }] } } });
  });

  it('snapshots reasoning effort for the next turn and explicitly restores the configured CLI default', async () => {
    const h = setup();
    h.configure = server => server.handle('config/read', () => ({ config: { model: 'configured-model', model_reasoning_effort: 'high' } }));
    const session = await h.session();
    await session.setReasoningEffort('low');
    await h.start(session);
    await session.setReasoningEffort('xhigh');
    expect(h.servers[0]!.received.filter(r => r.method === 'turn/start')[0]!.params).toMatchObject({ effort: 'low' });
    h.complete(session); await vi.waitFor(() => expect(session.state).toBe('idle'));
    await h.start(session);
    expect(h.servers[0]!.received.filter(r => r.method === 'turn/start')[1]!.params).toMatchObject({ effort: 'xhigh' });
    h.complete(session); await vi.waitFor(() => expect(session.state).toBe('idle'));
    await session.setReasoningEffort(null);
    await h.start(session);
    expect(h.servers[0]!.received.filter(r => r.method === 'turn/start')[2]!.params).toMatchObject({ effort: 'high' });
  });

  it('passes native effort strings such as max without a stale client enum', async () => {
    const h = setup(); const session = await h.session({ providerOptions: { effort: 'max' } });
    await h.start(session);
    expect(h.servers[0]!.received.find(r => r.method === 'turn/start')!.params).toMatchObject({ effort: 'max' });
    expect(() => h.provider.createSession({ ...options, providerOptions: { effort: 1 } })).toThrow(/Invalid reasoning/);
    expect(() => h.provider.createSession({ ...options, providerOptions: { effort: ' ' } })).toThrow(/Invalid reasoning/);
  });

  it('sets models for the next turn and resolves CLI default when reset', async () => {
    const h = setup(); const session = await h.session();
    await h.start(session); await session.setModel('new-model');
    expect(h.servers[0]!.received.filter((r) => r.method === 'turn/start')).toHaveLength(1);
    h.complete(session); await vi.waitFor(() => expect(session.state).toBe('idle'));
    await h.start(session);
    expect(h.servers[0]!.received.filter((r) => r.method === 'turn/start')[1]!.params).toMatchObject({ model: 'new-model' });
    h.complete(session); await vi.waitFor(() => expect(session.state).toBe('idle'));
    await session.setModel(null); expect(session.model).toBeUndefined();
    await h.start(session);
    expect(h.servers[0]!.received.filter((r) => r.method === 'turn/start')[2]!.params).toMatchObject({ model: 'cli-config-default' });
  });
});

describe('Codex Needs Input / FR-STATE-002', () => {
  it('keeps simultaneous approvals independent and preserves ordered object decisions', async () => {
    const h = setup(); const session = await h.session(); await h.start(session);
    const amendment = { acceptWithExecpolicyAmendment: { execpolicy_amendment: ['git', 'status'] } };
    const first = h.servers[0]!.request('item/commandExecution/requestApproval', approval(session, { availableDecisions: ['decline', amendment, 'accept'] }));
    const second = h.servers[0]!.request('item/fileChange/requestApproval', approval(session, { itemId: 'file' }));
    expect(session.pendingInputs).toHaveLength(2);
    const [a, b] = session.pendingInputs;
    expect(a?.kind === 'approval' && a.options.map((o) => o.intent)).toEqual(['deny', 'allow_always', 'allow']);
    await session.respondToInput(b!.requestId, { kind: 'approval', optionId: '2' });
    expect(await second).toEqual({ decision: 'decline' }); expect(session.pendingInputs).toHaveLength(1);
    await session.respondToInput(a!.requestId, { kind: 'approval', optionId: '1' });
    expect(await first).toEqual({ decision: amendment }); expect(session.pendingInputs).toHaveLength(0);
  });

  it('maps question choices/free text and secret answer masking', async () => {
    const h = setup(); const session = await h.session(); const recorder = new EventRecorder(session); await h.start(session);
    const answer = h.servers[0]!.request('item/tool/requestUserInput', approval(session, { questions: [
      { id: 'q', header: 'Choice', question: 'Choose', options: [{ label: 'Blue', description: 'Cool' }], isOther: true, isSecret: true },
    ] }));
    expect(await session.replyWithText('secret answer')).toMatchObject({ disposition: 'answered' });
    expect(await answer).toEqual({ answers: { q: { answers: ['secret answer'] } } });
    expect(JSON.stringify(recorder.events.filter((e) => e.type === 'input.resolved'))).not.toContain('secret answer');
  });

  it('delivers composer text into the same turn before releasing multiple requests', async () => {
    const h = setup(); const session = await h.session(); await h.start(session);
    const responses = [h.servers[0]!.request('item/commandExecution/requestApproval', approval(session)),
      h.servers[0]!.request('item/fileChange/requestApproval', approval(session))];
    h.servers[0]!.handle('turn/steer', (p) => {
      expect(h.servers[0]!.peer.pendingRequestCount).toBe(2);
      expect(p).toMatchObject({ expectedTurnId: session.activeTurn?.nativeTurnId, input: [{ type: 'text', text: 'Use another approach' }] });
      return { turnId: session.activeTurn?.nativeTurnId };
    });
    expect(await session.replyWithText('Use another approach')).toMatchObject({ disposition: 'declined' });
    expect(await Promise.all(responses)).toEqual([{ decision: 'decline' }, { decision: 'decline' }]);
    expect(h.servers[0]!.received.filter((r) => r.method === 'turn/start')).toHaveLength(1);
  });

  it('leaves requests answerable when same-turn text delivery fails', async () => {
    const h = setup(); const session = await h.session(); await h.start(session);
    const response = h.servers[0]!.request('item/commandExecution/requestApproval', approval(session));
    h.servers[0]!.handle('turn/steer', () => { throw new ScriptedRpcError({ code: -32600, message: 'Not steerable' }); });
    await expect(session.replyWithText('new instruction')).rejects.toThrow('Not steerable');
    expect(session.pendingInputs).toHaveLength(1);
    await session.respondToInput(session.pendingInputs[0]!.requestId, { kind: 'approval', optionId: '1' });
    expect(await response).toEqual({ decision: 'decline' });
  });

  it('surfaces permissions and denies unknown, late, or unrelated requests', async () => {
    const h = setup(); const session = await h.session(); await h.start(session);
    const permission = h.servers[0]!.request('item/permissions/requestApproval', approval(session, { permissions: { network: { enabled: true }, fileSystem: null } }));
    await session.respondToInput(session.pendingInputs[0]!.requestId, { kind: 'approval', optionId: 'turn' });
    expect(await permission).toEqual({ permissions: { network: { enabled: true } }, scope: 'turn' });
    await expect(h.servers[0]!.request('item/custom/requestApproval', approval(session))).rejects.toMatchObject({ code: -32601 });
    const native = session.activeTurn!.nativeTurnId!;
    h.complete(session); await vi.waitFor(() => expect(session.state).toBe('idle'));
    expect(await h.servers[0]!.request('item/commandExecution/requestApproval', approval(session, { turnId: native }))).toEqual({ decision: 'decline' });
  });
});

describe('Codex availability', () => {
  it('reports missing executable without further probes', async () => {
    const h = setup(); const exec = vi.fn(); const provider = new CodexProvider({ resolveExecutable: async () => undefined, exec });
    expect((await provider.checkAvailability({ environment: options.environment })).status).toBe('not_installed');
    expect(exec).not.toHaveBeenCalled(); await provider.dispose(); expect(h.runtimes).toHaveLength(0);
  });
  it.each([['Logged in using ChatGPT secret@example.test', 0, 'available'], ['Not logged in', 1, 'not_logged_in'], ['ambiguous', 2, 'error']])('reports login status without retaining raw auth (%s)', async (output, code, status) => {
    const h = setup();
    const provider = new CodexProvider({ ...h.dependencies, exec: async (_path, args) => ({ code: args[0] === '--version' ? 0 : code, signal: null,
      stdout: args[0] === '--version' ? 'codex-cli 0.162.0' : '', stderr: args[0] === 'login' ? output : '', timedOut: false, truncated: false }) });
    const report = await provider.checkAvailability({ environment: options.environment });
    expect(report.status).toBe(status); expect(JSON.stringify(report)).not.toContain('secret@example.test');
    expect(report.version).toMatchObject({ value: { compatibility: 'untested' } }); await provider.dispose();
  });
  describe.each(['stdout', 'stderr'] as const)('login status on %s', (stream) => {
    it.each([
      { name: 'configured API key', output: 'API key configured - fake-secret-key\nAuthentication is checked when you send a request.', code: 0, status: 'available', login: { state: 'logged_in', method: 'api_key' } },
      { name: 'legacy API key login', output: 'Logged in using an API key - fake-secret-key', code: 0, status: 'available', login: { state: 'logged_in', method: 'api_key' } },
      { name: 'ChatGPT login', output: 'Logged in using ChatGPT fake-account@example.test', code: 0, status: 'available', login: { state: 'logged_in', method: 'chatgpt' } },
      { name: 'logout with zero exit', output: 'Not logged in', code: 0, status: 'not_logged_in', login: { state: 'logged_out' } },
      { name: 'logout with nonzero exit', output: 'Not logged in', code: 1, status: 'not_logged_in', login: { state: 'logged_out' } },
      { name: 'nonzero configured key', output: 'API key configured - fake-secret-key', code: 1, status: 'error' },
      { name: 'nonzero legacy login', output: 'Logged in using an API key - fake-secret-key', code: 1, status: 'error' },
      { name: 'unknown successful output', output: 'Unknown status fake-secret-key', code: 0, status: 'error' },
      { name: 'negated configured key', output: 'No API key configured', code: 0, status: 'error' },
      { name: 'timed out configured key', output: 'API key configured - fake-secret-key', code: 0, timedOut: true, status: 'error' },
    ])('$name', async ({ output, code, timedOut = false, status, login }) => {
      const h = setup();
      const exec = vi.fn(async (_path, args) => args[0] === '--version'
        ? { code: 0, signal: null, stdout: 'codex-cli 0.164.0', stderr: '', timedOut: false, truncated: false }
        : { code, signal: null, stdout: '', stderr: '', [stream]: output, timedOut, truncated: false });
      const provider = new CodexProvider({ ...h.dependencies, exec });
      try {
        const report = await provider.checkAvailability({ environment: options.environment, includeModels: false });
        expect(report.status).toBe(status);
        expect(report.login).toMatchObject(login ? { status: 'ok', value: login }
          : { status: 'failed', error: { code: timedOut ? 'timeout' : 'provider_error' } });
        expect(JSON.stringify(report)).not.toMatch(/fake-secret-key|fake-account@example\.test/);
        expect(report.version).toMatchObject({ value: { compatibility: 'untested' } });
        expect(exec.mock.calls.map(([, args]) => args)).toEqual([['--version'], ['login', 'status']]);
        expect(h.runtimes).toHaveLength(0);
      } finally { await provider.dispose(); }
    });
  });
  it('reports catalog failure independently of executable/version/login', async () => {
    const h = setup(); h.configure = (server) => server.handle('model/list', () => { throw new Error('catalog unavailable'); });
    const report = await h.provider.checkAvailability({ environment: options.environment, includeModels: true });
    expect(report.status).toBe('available'); expect(report.models.status).toBe('failed');
  });
});
