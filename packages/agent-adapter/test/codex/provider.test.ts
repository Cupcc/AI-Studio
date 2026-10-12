import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventRecorder } from '../../src/testing/event-recorder.js';
import { ScriptedRpcError } from '../../src/testing/fake-transport.js';
import { Harness, approval, model, options } from './harness.js';
import { CodexProvider } from '../../src/codex/index.js';

const harnesses: Harness[] = [];
const setup = () => { const harness = new Harness(); harnesses.push(harness); return harness; };
afterEach(async () => { await Promise.all(harnesses.splice(0).map((h) => h.provider.dispose())); });

describe('Codex Provider lifecycle / FR-CHAT-002, FR-CHAT-003, AC-02', () => {
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
  it('reports catalog failure independently of executable/version/login', async () => {
    const h = setup(); h.configure = (server) => server.handle('model/list', () => { throw new Error('catalog unavailable'); });
    const report = await h.provider.checkAvailability({ environment: options.environment, includeModels: true });
    expect(report.status).toBe('available'); expect(report.models.status).toBe('failed');
  });
});
