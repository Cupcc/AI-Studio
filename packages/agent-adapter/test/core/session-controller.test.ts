import { describe, expect, it, vi } from 'vitest';
import { SessionController, type InputRequestInit, type SessionSink } from '../../src/core/session-controller.js';
import type { AdapterTimeouts } from '../../src/core/timeouts.js';
import { AdapterError } from '../../src/errors.js';
import type { ProviderCapabilities } from '../../src/provider.js';
import { EventRecorder, ScriptedDriver, type ScriptedDriverBehavior } from '../../src/testing/index.js';

const CAPABILITIES: ProviderCapabilities = {
  nativeSessionIdTiming: 'on_create',
  inputWhileRunning: 'none',
  questionRequests: true,
  freeTextAnswers: { questions: true, approvals: false },
  nativeTitle: true,
  runtimeRecovery: true,
};

const FAST: Partial<AdapterTimeouts> = { interruptMs: 100, terminalMs: 100, cleanupMs: 100, recoveryMs: 300, disposeMs: 500 };

function makeSession(
  options: {
    behavior?: ScriptedDriverBehavior;
    capabilities?: Partial<ProviderCapabilities>;
    timeouts?: Partial<AdapterTimeouts>;
    expectedNativeSessionId?: string;
    subscribe?: boolean;
  } = {},
) {
  let driver!: ScriptedDriver;
  let clock = 0;
  const controller = new SessionController(
    {
      providerId: 'test',
      capabilities: { ...CAPABILITIES, ...options.capabilities },
      timeouts: { ...FAST, ...options.timeouts },
      ...(options.expectedNativeSessionId ? { expectedNativeSessionId: options.expectedNativeSessionId } : {}),
      monotonic: () => clock,
    },
    (sink) => (driver = new ScriptedDriver(sink, options.behavior ?? {})),
  );
  const recorder = options.subscribe === false ? undefined : new EventRecorder(controller);
  return {
    controller,
    driver,
    sink: controller.sink,
    recorder: recorder as EventRecorder,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const approval = (overrides: Partial<Extract<InputRequestInit, { kind: 'approval' }>> = {}): InputRequestInit => ({
  kind: 'approval',
  subject: 'command',
  title: 'Run /usr/bin/touch probe.txt',
  command: '/usr/bin/touch probe.txt',
  nativeType: 'item/commandExecution/requestApproval',
  options: [
    { id: 'accept', label: 'Allow', intent: 'allow', primary: true },
    { id: 'decline', label: 'Deny', intent: 'deny' },
  ],
  allowsMessage: false,
  ...overrides,
});

const question = (overrides: { allowFreeText?: boolean; secret?: boolean; count?: number } = {}): InputRequestInit => ({
  kind: 'question',
  nativeType: 'item/tool/requestUserInput',
  questions: Array.from({ length: overrides.count ?? 1 }, (_, i) => ({
    id: `q${i}`,
    header: 'Color',
    prompt: 'Pick a color',
    options: [
      { id: 'blue', label: 'Blue' },
      { id: 'green', label: 'Green' },
    ],
    multiSelect: false,
    allowFreeText: overrides.allowFreeText ?? true,
    secret: overrides.secret ?? false,
  })),
});

async function startTurn(controller: SessionController) {
  const { turnId } = await controller.sendUserInput({ text: 'hello' });
  return turnId;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('SessionController: turns', () => {
  it('emits turn.started on submit, before the CLI acknowledges (FR-STATE-001)', async () => {
    const { controller, recorder } = makeSession({ behavior: { onStartTurn: () => new Promise(() => {}) } });
    const { turnId } = await controller.sendUserInput({ text: 'hi' });
    expect(recorder.types()).toEqual(['session.state', 'turn.started']);
    expect(recorder.last('turn.started')?.turnId).toBe(turnId);
    expect(controller.state).toBe('running');
    expect(controller.activeTurn).toMatchObject({ turnId, stopRequested: false });
  });

  it('rejects submissions while running and empty input', async () => {
    const { controller } = makeSession();
    await expect(controller.sendUserInput({ text: '  ' })).rejects.toMatchObject({ code: 'invalid_argument' });
    await startTurn(controller);
    await expect(controller.sendUserInput({ text: 'again' })).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('steers into the running turn when the provider supports it', async () => {
    const onSteer = vi.fn(async () => {});
    const { controller, driver } = makeSession({ capabilities: { inputWhileRunning: 'steer' }, behavior: { onSteer } });
    const turnId = await startTurn(controller);
    expect(await controller.sendUserInput({ text: 'more' })).toEqual({ turnId });
    expect(onSteer).toHaveBeenCalledTimes(1);
    expect(driver.callsTo('startTurn')).toHaveLength(1);
  });

  it('streams deltas, completes the message without duplicating text, and reports duration', async () => {
    const { controller, sink, recorder, advance } = makeSession();
    const turnId = await startTurn(controller);
    sink.bindNativeTurnId(turnId, 'native-turn-1');
    sink.itemStarted(turnId, { itemId: 'm1', kind: 'assistant_message', status: 'in_progress' });
    sink.itemDelta(turnId, 'm1', 'text', 'STUDIO_');
    sink.itemDelta(turnId, 'm1', 'text', '399f');
    sink.itemCompleted(turnId, { itemId: 'm1', kind: 'assistant_message', status: 'completed', text: 'STUDIO_399f' });
    advance(138_000);
    sink.nativeTurnEnded(turnId, { status: 'completed', nativeDurationMs: 137_500, model: 'gpt-6.1-sol' });

    expect(recorder.textByItem().get('m1')).toBe('STUDIO_399f');
    expect(recorder.last('item.completed')?.item.text).toBe('STUDIO_399f');
    const done = recorder.last('turn.completed')!;
    expect(done).toMatchObject({ turnId, nativeTurnId: 'native-turn-1', outcome: 'completed', durationMs: 138_000, nativeDurationMs: 137_500, model: 'gpt-6.1-sol', stopRequested: false });
    expect(done.error).toBeUndefined();
    expect(controller.state).toBe('idle');
    expect(recorder.types().slice(-2)).toEqual(['turn.completed', 'session.state']);
  });

  it('fills the final text from deltas when the native completion omits it', async () => {
    const { controller, sink, recorder } = makeSession();
    const turnId = await startTurn(controller);
    sink.itemStarted(turnId, { itemId: 'm1', kind: 'assistant_message', status: 'in_progress' });
    sink.itemDelta(turnId, 'm1', 'text', 'abc');
    sink.itemCompleted(turnId, { itemId: 'm1', kind: 'assistant_message', status: 'completed' });
    expect(recorder.last('item.completed')?.item.text).toBe('abc');
  });

  it('reports failures with a normalized error and stays usable', async () => {
    const { controller, sink, recorder } = makeSession();
    const turnId = await startTurn(controller);
    sink.nativeTurnEnded(turnId, {
      status: 'failed',
      error: { code: 'quota_exceeded', message: 'Usage limit', native: { source: 'codex:turn/completed', code: 'usageLimitExceeded' } },
    });
    expect(recorder.last('turn.completed')).toMatchObject({ outcome: 'failed', error: { code: 'quota_exceeded' } });
    expect(controller.state).toBe('idle');
    await expect(controller.sendUserInput({ text: 'retry' })).resolves.toHaveProperty('turnId');
  });

  it('fails the turn when native submission rejects', async () => {
    const { controller, recorder } = makeSession({
      behavior: {
        onStartTurn: async () => {
          throw new AdapterError({ code: 'protocol_error', message: 'turn/start rejected' });
        },
      },
    });
    await startTurn(controller);
    await recorder.waitFor('turn.completed');
    expect(recorder.last('turn.completed')).toMatchObject({ outcome: 'failed', error: { code: 'protocol_error' } });
  });

  it('closes open items when a turn ends without their completion', async () => {
    const { controller, sink, recorder } = makeSession();
    const turnId = await startTurn(controller);
    sink.itemStarted(turnId, { itemId: 'm1', kind: 'assistant_message', status: 'in_progress' });
    sink.itemDelta(turnId, 'm1', 'text', 'partial');
    sink.itemStarted(turnId, {
      itemId: 'c1',
      kind: 'command',
      status: 'in_progress',
      activity: { verb: 'run', label: 'Run python3 sleep', target: 'python3' },
    });
    sink.nativeTurnEnded(turnId, { status: 'interrupted' });
    const closed = recorder.ofType('item.completed');
    expect(closed.map((e) => [e.item.itemId, e.item.status, e.item.text])).toEqual([
      ['m1', 'interrupted', 'partial'],
      ['c1', 'interrupted', undefined],
    ]);
    expect(recorder.last('turn.completed')).toMatchObject({ outcome: 'interrupted', stopRequested: false });
  });

  it('drops late events after the terminal state without resurrecting the turn', async () => {
    const { controller, sink, recorder } = makeSession();
    const turnId = await startTurn(controller);
    sink.nativeTurnEnded(turnId, { status: 'completed' });
    const count = recorder.events.length;
    sink.itemDelta(turnId, 'm1', 'text', 'late');
    sink.itemCompleted(turnId, { itemId: 'c1', kind: 'command', status: 'failed' });
    sink.nativeTurnEnded(turnId, { status: 'failed' });
    expect(sink.inputRequested(turnId, approval(), {})).toBeUndefined();
    const added = recorder.events.slice(count);
    expect(added.every((e) => e.type === 'diagnostic' && e.kind === 'late_event')).toBe(true);
    expect(recorder.ofType('turn.completed')).toHaveLength(1);
    expect(controller.state).toBe('idle');
    expect(controller.activeTurn).toBeUndefined();
  });

  it('applies model changes to subsequent turns and validates them', async () => {
    const { controller, driver, recorder } = makeSession();
    await controller.setModel('gpt-6.1-sol');
    expect(controller.model).toBe('gpt-6.1-sol');
    expect(recorder.last('model.changed')?.model).toBe('gpt-6.1-sol');
    await controller.setModel(null);
    expect(controller.model).toBeUndefined();
    await expect(controller.setModel('')).rejects.toMatchObject({ code: 'invalid_argument' });
    expect(driver.callsTo('setModel').map((c) => c.args[0])).toEqual(['gpt-6.1-sol', null]);
  });

  it('reports a native title once per change', async () => {
    const { sink, recorder } = makeSession();
    sink.nativeTitle('Fix the build');
    sink.nativeTitle('Fix the build');
    sink.nativeTitle('  ');
    expect(recorder.ofType('session.title').map((e) => e.title)).toEqual(['Fix the build']);
  });
});

describe('SessionController: input requests', () => {
  it('handles concurrent requests independently and validates answers', async () => {
    const { controller, sink, driver, recorder } = makeSession();
    const turnId = await startTurn(controller);
    const a = sink.inputRequested(turnId, approval(), { rpcId: 1 })!;
    const b = sink.inputRequested(turnId, approval({ title: 'Edit file' }), { rpcId: 2 })!;
    expect(controller.pendingInputs.map((r) => r.requestId)).toEqual([a, b]);
    expect(recorder.ofType('input.requested')).toHaveLength(2);

    await expect(controller.respondToInput(a, { kind: 'approval', optionId: 'nope' })).rejects.toMatchObject({ code: 'invalid_argument' });
    await expect(controller.respondToInput(a, { kind: 'approval', optionId: 'decline', message: 'no' })).rejects.toMatchObject({
      code: 'invalid_argument',
    });
    await controller.respondToInput(b, { kind: 'approval', optionId: 'decline' });
    expect(controller.pendingInputs.map((r) => r.requestId)).toEqual([a]);
    await controller.respondToInput(a, { kind: 'approval', optionId: 'accept' });
    await expect(controller.respondToInput(a, { kind: 'approval', optionId: 'accept' })).rejects.toMatchObject({ code: 'invalid_argument' });

    expect(recorder.ofType('input.resolved').map((e) => [e.requestId, e.resolution])).toEqual([
      [b, { status: 'answered', response: { kind: 'approval', optionId: 'decline' } }],
      [a, { status: 'answered', response: { kind: 'approval', optionId: 'accept' } }],
    ]);
    expect(driver.callsTo('respondToInput')).toHaveLength(2);
  });

  it('refuses a second answer while the first is in flight and restores the request when the driver fails', async () => {
    let fail = true;
    let release!: () => void;
    const { controller, sink } = makeSession({
      behavior: {
        onRespond: () =>
          new Promise<void>((resolve, reject) => {
            release = () => (fail ? reject(new Error('write failed')) : resolve());
          }),
      },
    });
    const turnId = await startTurn(controller);
    const id = sink.inputRequested(turnId, approval(), {})!;
    const first = controller.respondToInput(id, { kind: 'approval', optionId: 'accept' });
    await expect(controller.respondToInput(id, { kind: 'approval', optionId: 'decline' })).rejects.toMatchObject({ code: 'invalid_state' });
    release();
    await expect(first).rejects.toMatchObject({ code: 'provider_error' });
    expect(controller.pendingInputs).toHaveLength(1);
    fail = false;
    const second = controller.respondToInput(id, { kind: 'approval', optionId: 'decline' });
    release();
    await second;
    expect(controller.pendingInputs).toHaveLength(0);
  });

  it('validates question answers and redacts secret free text in events', async () => {
    const { controller, sink, recorder } = makeSession();
    const turnId = await startTurn(controller);
    const id = sink.inputRequested(turnId, question({ secret: true }), {})!;
    await expect(controller.respondToInput(id, { kind: 'answers', answers: {} })).rejects.toMatchObject({ code: 'invalid_argument' });
    await expect(
      controller.respondToInput(id, { kind: 'answers', answers: { q0: { optionIds: ['blue', 'green'] } } }),
    ).rejects.toMatchObject({ code: 'invalid_argument' });
    await controller.respondToInput(id, { kind: 'answers', answers: { q0: { text: 'hunter2' } } });
    expect(JSON.stringify(recorder.last('input.resolved'))).not.toContain('hunter2');
  });

  it.each([
    ['answer', 'success'], ['answer', 'failure'],
    ['composer', 'success'], ['composer', 'failure'],
  ] as const)('honours native withdrawal during an in-flight %s followed by %s (FR-STATE-002)', async (kind, outcome) => {
    let release!: () => void;
    let first = true;
    const inFlight = new Promise<void>((resolve, reject) => {
      release = () => outcome === 'failure' ? reject(new Error('delivery failed')) : resolve();
    });
    const deliver = () => first ? inFlight : Promise.resolve();
    const { controller, sink, recorder } = makeSession({
      behavior: { onRespond: deliver, onDeclineWithText: deliver },
    });
    const turnId = await startTurn(controller);
    const withdrawn = sink.inputRequested(turnId, approval(), { rpcId: 1 })!;
    const pending = kind === 'answer'
      ? controller.respondToInput(withdrawn, { kind: 'approval', optionId: 'accept' })
      : controller.replyWithText('Use another approach');
    const other = sink.inputRequested(turnId, approval(), { rpcId: 2 })!;

    sink.inputResolvedNatively(withdrawn);
    sink.inputResolvedNatively(withdrawn);
    expect(controller.pendingInputs.map((request) => request.requestId)).toEqual([other]);
    expect(recorder.ofType('input.resolved')).toMatchObject([
      { requestId: withdrawn, resolution: { status: 'cancelled', reason: 'native_resolved' } },
    ]);
    release();
    if (outcome === 'failure') await expect(pending).rejects.toMatchObject({ code: 'provider_error' });
    else await pending;
    expect(controller.pendingInputs.map((request) => request.requestId)).toEqual([other]);
    expect(recorder.ofType('input.resolved')).toHaveLength(1);
    await expect(controller.respondToInput(withdrawn, { kind: 'approval', optionId: 'accept' }))
      .rejects.toMatchObject({ code: 'invalid_argument' });
    first = false;
    await controller.respondToInput(other, { kind: 'approval', optionId: 'decline' });
    expect(controller.pendingInputs).toEqual([]);
    expect(recorder.ofType('input.resolved')).toHaveLength(2);
  });

  it('reports native withdrawal and cancels leftovers when the turn ends', async () => {
    const { controller, sink, driver, recorder } = makeSession();
    const turnId = await startTurn(controller);
    const a = sink.inputRequested(turnId, approval(), { rpcId: 7 })!;
    const b = sink.inputRequested(turnId, approval(), { rpcId: 8 })!;
    expect(sink.findInputByNativeRef((ref) => (ref as { rpcId: number }).rpcId === 7)?.request.requestId).toBe(a);
    sink.inputResolvedNatively(a);
    sink.nativeTurnEnded(turnId, { status: 'completed' });
    expect(recorder.ofType('input.resolved').map((e) => [e.requestId, e.resolution])).toEqual([
      [a, { status: 'cancelled', reason: 'native_resolved' }],
      [b, { status: 'cancelled', reason: 'turn_ended' }],
    ]);
    expect(driver.callsTo('cancelInput').map((c) => c.args)).toEqual([[b, 'turn_ended']]);
  });

  describe('replyWithText (I-Q2)', () => {
    it('answers the single pending free-text question with the text', async () => {
      const { controller, sink, driver, recorder } = makeSession();
      const turnId = await startTurn(controller);
      const id = sink.inputRequested(turnId, question(), {})!;
      expect(await controller.replyWithText('Teal')).toEqual({ disposition: 'answered', requestIds: [id] });
      expect(driver.callsTo('respondToInput')[0]!.args[1]).toEqual({ kind: 'answers', answers: { q0: { text: 'Teal' } } });
      expect(recorder.last('input.resolved')?.resolution).toEqual({
        status: 'answered',
        viaText: true,
        response: { kind: 'answers', answers: { q0: { text: 'Teal' } } },
      });
    });

    it('declines every pending request with the text otherwise', async () => {
      const { controller, sink, driver, recorder } = makeSession();
      const turnId = await startTurn(controller);
      const a = sink.inputRequested(turnId, approval(), {})!;
      const b = sink.inputRequested(turnId, question(), {})!;
      expect(await controller.replyWithText('Use a temp dir instead')).toEqual({ disposition: 'declined', requestIds: [a, b] });
      expect(driver.callsTo('declineInputsWithText')[0]!.args).toEqual([[a, b], 'Use a temp dir instead']);
      expect(recorder.ofType('input.resolved').map((e) => e.resolution)).toEqual([
        { status: 'declined_with_text', text: 'Use a temp dir instead' },
        { status: 'declined_with_text', text: 'Use a temp dir instead' },
      ]);
      expect(controller.pendingInputs).toHaveLength(0);
    });

    it('declines a single approval or a multi-question request, and rejects when nothing is pending', async () => {
      const { controller, sink, driver } = makeSession();
      const turnId = await startTurn(controller);
      await expect(controller.replyWithText('hi')).rejects.toMatchObject({ code: 'invalid_state' });
      sink.inputRequested(turnId, question({ count: 2 }), {});
      expect((await controller.replyWithText('both blue')).disposition).toBe('declined');
      sink.inputRequested(turnId, approval(), {});
      expect((await controller.replyWithText('no')).disposition).toBe('declined');
      sink.inputRequested(turnId, question({ allowFreeText: false }), {});
      expect((await controller.replyWithText('red')).disposition).toBe('declined');
      expect(driver.callsTo('declineInputsWithText')).toHaveLength(3);
    });
  });
});

describe('SessionController: Stop (04 §4)', () => {
  it('interrupts, maps the native end to interrupted without error, and resumes accepting input', async () => {
    const { controller, driver, recorder } = makeSession();
    const turnId = await startTurn(controller);
    const result = await controller.stop();
    expect(result).toMatchObject({ status: 'stopped', turnId, summary: { cleanup: 'not_required' } });
    const done = recorder.last('turn.completed')!;
    expect(done).toMatchObject({ outcome: 'interrupted', stopRequested: true });
    expect(done.error).toBeUndefined();
    // The scripted CLI reports `interrupted` together with the acknowledgement, so no separate wait phase.
    expect(recorder.ofType('stop.updated').map((e) => e.phase)).toEqual(['requested', 'interrupting', 'completed']);
    expect(recorder.ofType('session.state').map((e) => e.state)).toEqual(['running', 'stopping', 'idle']);
    expect(driver.callsTo('interruptTurn')).toHaveLength(1);
    await expect(controller.sendUserInput({ text: 'next' })).resolves.toHaveProperty('turnId');
  });

  it('never reports a user Stop as an error even when the native result is an error (Claude error_during_execution)', async () => {
    const { controller, recorder } = makeSession({
      behavior: {
        onInterrupt: (stop, sink) => {
          setTimeout(() =>
            sink.nativeTurnEnded(stop.turnId, {
              status: 'failed',
              error: {
                code: 'provider_error',
                message: 'error_during_execution',
                native: { source: 'claude:result', code: 'error_during_execution', message: 'is_error=true' },
              },
            }),
          );
        },
      },
    });
    await startTurn(controller);
    const result = await controller.stop();
    expect(result.status).toBe('stopped');
    expect(result.error).toBeUndefined();
    const done = recorder.last('turn.completed')!;
    expect(done.outcome).toBe('interrupted');
    expect(done.error).toBeUndefined();
    expect(done.stop?.nativeDiagnostic).toMatchObject({ code: 'error_during_execution' });
  });

  it('is idempotent, pauses submissions and is a no-op without a turn', async () => {
    let end!: () => void;
    const { controller, driver } = makeSession({
      behavior: { onInterrupt: (stop, sink) => void (end = () => sink.nativeTurnEnded(stop.turnId, { status: 'interrupted' })) },
    });
    expect(await controller.stop()).toEqual({ status: 'not_running' });
    await startTurn(controller);
    const first = controller.stop();
    const second = controller.stop();
    expect(second).toBe(first);
    expect(controller.state).toBe('stopping');
    await expect(controller.sendUserInput({ text: 'x' })).rejects.toMatchObject({ code: 'invalid_state' });
    await flush();
    end();
    await first;
    expect(driver.callsTo('interruptTurn')).toHaveLength(1);
  });

  it('cancels pending requests at stop time, hands them to interruptTurn and rejects new ones', async () => {
    let seenCancelled: string[] = [];
    let sinkRef!: SessionSink;
    const { controller, sink, recorder, driver } = makeSession({
      behavior: {
        onInterrupt: (stop, s) => {
          seenCancelled = stop.cancelledInputs.map((r) => r.request.requestId);
          sinkRef = s;
          expect(s.inputRequested(stop.turnId, approval(), {})).toBeUndefined();
          queueMicrotask(() => s.nativeTurnEnded(stop.turnId, { status: 'interrupted' }));
        },
      },
    });
    const turnId = await startTurn(controller);
    const id = sink.inputRequested(turnId, approval(), {})!;
    const stopping = controller.stop();
    expect(recorder.last('input.resolved')).toMatchObject({ requestId: id, resolution: { status: 'cancelled', reason: 'turn_stopping' } });
    await expect(controller.respondToInput(id, { kind: 'approval', optionId: 'accept' })).rejects.toMatchObject({ code: 'invalid_argument' });
    await stopping;
    expect(seenCancelled).toEqual([id]);
    expect(sinkRef).toBe(sink);
    expect(driver.callsTo('cancelInput')).toHaveLength(0);
  });

  it('runs cleanup after the native terminal state and reports confirmed exit evidence', async () => {
    const { controller, recorder } = makeSession({
      behavior: {
        cleanup: (stop) => {
          expect(stop.nativeEnd?.status).toBe('interrupted');
          return { status: 'confirmed', scope: 'turn', verifiedExited: [{ pid: 19495, command: 'python -c sleep' }] };
        },
      },
    });
    await startTurn(controller);
    const result = await controller.stop();
    expect(result.summary).toMatchObject({ cleanup: 'confirmed', cleanupReport: { scope: 'turn' } });
    expect(recorder.ofType('stop.updated').map((e) => e.phase)).toContain('cleaning_up');
  });

  it.each([
    ['interrupt_failed', { onInterrupt: async () => Promise.reject(new Error('no active turn to interrupt')) }],
    ['terminal_timeout', { onInterrupt: async () => {} }],
    ['cleanup_unsupported', { cleanup: () => ({ status: 'unsupported' as const, scope: 'none' as const }) }],
    ['cleanup_failed', { cleanup: () => ({ status: 'failed' as const, scope: 'turn' as const, survivors: [{ pid: 1, command: 'x' }] }) }],
    ['cleanup_timeout', { cleanup: () => new Promise<never>(() => {}) }],
  ] as const)('falls back to runtime recovery on %s and keeps the session usable', async (reason, behavior) => {
    const { controller, driver, recorder } = makeSession({
      behavior: {
        ...behavior,
        recover: (stop, sink) => {
          sink.runtimeStarted({ generation: 2, pid: 1234 });
          sink.nativeSessionId('native-1');
          return { status: 'resumed', mayHaveStoppedEarlierBackgroundCommands: true, detail: stop.recoveryReason ?? '' };
        },
      },
    });
    controller.sink.nativeSessionId('native-1');
    await startTurn(controller);
    const result = await controller.stop();
    expect(result).toMatchObject({ status: 'stopped', summary: { cleanup: 'runtime_restarted', recoveryReason: reason } });
    expect(driver.callsTo('recoverRuntime')[0]!.args).toEqual([result.turnId, reason]);
    expect(recorder.last('turn.completed')).toMatchObject({ outcome: 'interrupted' });
    expect(recorder.last('turn.completed')!.error).toBeUndefined();
    expect(controller.state).toBe('idle');
    expect(driver.callsTo('startTurn')).toHaveLength(1); // the cancelled input is never re-run
  });

  it('closes the session with stop_cleanup_failed when cleanup fails and recovery is unavailable', async () => {
    const { controller, recorder, driver } = makeSession({
      capabilities: { runtimeRecovery: false },
      behavior: { cleanup: () => ({ status: 'failed', scope: 'turn' }) },
    });
    await startTurn(controller);
    const result = await controller.stop();
    expect(result).toMatchObject({ status: 'failed', error: { code: 'stop_cleanup_failed' }, summary: { cleanup: 'failed' } });
    expect(recorder.last('turn.completed')).toMatchObject({ outcome: 'interrupted' });
    expect(recorder.last('turn.completed')!.error).toBeUndefined();
    expect(recorder.last('session.error')?.error.code).toBe('stop_cleanup_failed');
    expect(recorder.last('session.closed')).toMatchObject({ reason: 'stop_failed' });
    expect(controller.state).toBe('closed');
    await flush();
    expect(driver.disposed).toBe(true);
  });

  it('closes the session when recovery cannot resume the same native session', async () => {
    const { controller, recorder } = makeSession({
      behavior: {
        onInterrupt: async () => {
          throw new Error('interrupt unavailable');
        },
        recover: async () => {
          throw new AdapterError({ code: 'resume_failed', message: 'thread not found' });
        },
      },
    });
    await startTurn(controller);
    const result = await controller.stop();
    expect(result).toMatchObject({ status: 'failed', error: { code: 'resume_failed' } });
    expect(recorder.last('session.closed')?.reason).toBe('stop_failed');
  });

  it('treats a native completion that wins the race as completed and skips cleanup', async () => {
    const cleanup = vi.fn(() => ({ status: 'confirmed' as const, scope: 'turn' as const }));
    const { controller, recorder } = makeSession({
      behavior: { onInterrupt: (stop, sink) => sink.nativeTurnEnded(stop.turnId, { status: 'completed' }), cleanup },
    });
    await startTurn(controller);
    const result = await controller.stop();
    expect(result.status).toBe('already_completed');
    expect(recorder.last('turn.completed')).toMatchObject({ outcome: 'completed', stopRequested: true });
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('waits for a slow native submission before interrupting', async () => {
    let accept!: () => void;
    const { controller, driver } = makeSession({
      behavior: { onStartTurn: () => new Promise<void>((resolve) => (accept = resolve)) },
      timeouts: { interruptMs: 1_000 },
    });
    await startTurn(controller);
    const stopping = controller.stop();
    await flush();
    expect(driver.callsTo('interruptTurn')).toHaveLength(0);
    accept();
    await stopping;
    expect(driver.callsTo('interruptTurn')).toHaveLength(1);
  });
});

describe('SessionController: runtime exit, native ids, isolation', () => {
  it('fails the turn and closes the session when the runtime crashes during a turn', async () => {
    const { controller, sink, driver, recorder } = makeSession();
    const turnId = await startTurn(controller);
    const id = sink.inputRequested(turnId, approval(), {})!;
    sink.runtimeExited({ generation: 1, code: null, signal: 'SIGKILL', expected: false, exitedAt: 1, stderrTail: 'panic' });
    expect(recorder.last('runtime.exited')).toMatchObject({ duringTurn: true, expected: false });
    expect(recorder.last('input.resolved')).toMatchObject({ requestId: id, resolution: { reason: 'runtime_exited' } });
    expect(recorder.last('turn.completed')).toMatchObject({
      outcome: 'failed',
      error: { code: 'runtime_crashed', native: { detail: { stderrTail: 'panic' } } },
    });
    expect(recorder.last('session.closed')?.reason).toBe('runtime_exited');
    expect(controller.state).toBe('closed');
    await expect(controller.sendUserInput({ text: 'x' })).rejects.toMatchObject({ code: 'invalid_state' });
    await flush();
    expect(driver.disposed).toBe(true);
  });

  it('closes without a turn error when an idle runtime exits', async () => {
    const { controller, sink, recorder } = makeSession();
    sink.runtimeExited({ generation: 1, code: 1, signal: null, expected: false, exitedAt: 1 });
    expect(recorder.last('runtime.exited')?.duringTurn).toBe(false);
    expect(recorder.ofType('turn.completed')).toHaveLength(0);
    expect(controller.state).toBe('closed');
  });

  it('treats a runtime exit during Stop as the terminal state and recovers', async () => {
    const { controller, recorder, driver } = makeSession({
      behavior: {
        onInterrupt: (_stop, sink) => sink.runtimeExited({ generation: 1, code: null, signal: 'SIGTERM', expected: false, exitedAt: 1 }),
        recover: () => ({ status: 'resumed', mayHaveStoppedEarlierBackgroundCommands: true }),
      },
    });
    await startTurn(controller);
    const result = await controller.stop();
    expect(result).toMatchObject({ status: 'stopped', summary: { recoveryReason: 'runtime_exited', cleanup: 'runtime_restarted' } });
    expect(recorder.last('turn.completed')?.outcome).toBe('interrupted');
    expect(driver.callsTo('recoverRuntime')).toHaveLength(1);
    expect(controller.state).toBe('idle');
  });

  it('ignores exits of superseded runtime generations', async () => {
    const { controller, sink, recorder } = makeSession();
    sink.runtimeStarted({ generation: 2 });
    sink.runtimeExited({ generation: 1, code: 0, signal: null, expected: false, exitedAt: 1 });
    expect(controller.state).toBe('idle');
    expect(recorder.ofType('runtime.exited')).toHaveLength(0);
  });

  it('accepts a native id that arrives after the first input and never lets it change', async () => {
    const { controller, sink, recorder } = makeSession({ capabilities: { nativeSessionIdTiming: 'after_first_input' } });
    expect(controller.nativeSessionId).toBeUndefined();
    await startTurn(controller);
    sink.nativeSessionId('9cf4bcd2');
    sink.nativeSessionId('9cf4bcd2');
    expect(recorder.ofType('session.native_id').map((e) => e.nativeSessionId)).toEqual(['9cf4bcd2']);
    sink.nativeSessionId('other');
    expect(recorder.last('session.error')?.error.code).toBe('resume_failed');
    expect(recorder.last('turn.completed')).toMatchObject({ outcome: 'failed', error: { code: 'resume_failed' } });
    expect(controller.state).toBe('closed');
    expect(controller.nativeSessionId).toBe('9cf4bcd2');
  });

  it('rejects a resumed session that binds to a different native id', () => {
    const { controller, sink, recorder } = makeSession({ expectedNativeSessionId: 'thread-1' });
    sink.nativeSessionId('thread-2');
    expect(recorder.last('session.closed')).toMatchObject({ reason: 'resume_failed', error: { code: 'resume_failed' } });
    expect(controller.nativeSessionId).toBeUndefined();
  });

  it('closes the session when the first turn reveals a failed resume', async () => {
    const { controller, sink, recorder } = makeSession({ expectedNativeSessionId: 'f9c4a6b0' });
    const turnId = await startTurn(controller);
    sink.nativeTurnEnded(turnId, {
      status: 'failed',
      error: { code: 'resume_failed', message: 'No conversation found with session ID: f9c4a6b0' },
    });
    expect(recorder.last('turn.completed')).toMatchObject({ outcome: 'failed', error: { code: 'resume_failed' } });
    expect(recorder.last('session.closed')?.reason).toBe('resume_failed');
  });

  it('fails the turn on a fatal error, but keeps a Stop in flight as interrupted', async () => {
    const a = makeSession();
    await startTurn(a.controller);
    a.sink.fatal({ code: 'protocol_error', message: 'desync' });
    expect(a.recorder.last('turn.completed')).toMatchObject({ outcome: 'failed', error: { code: 'protocol_error' } });
    expect(a.recorder.last('session.closed')?.reason).toBe('fatal_error');

    const b = makeSession({ behavior: { onInterrupt: (_stop, sink) => sink.fatal({ code: 'protocol_error', message: 'desync' }) } });
    await startTurn(b.controller);
    const result = await b.controller.stop();
    expect(result.status).toBe('failed');
    expect(b.recorder.last('turn.completed')?.outcome).toBe('interrupted');
    expect(b.recorder.last('turn.completed')?.error).toBeUndefined();
    expect(b.recorder.last('session.closed')?.reason).toBe('fatal_error');
  });

  it('isolates sessions: a crash in one does not affect another', async () => {
    const a = makeSession();
    const b = makeSession();
    await startTurn(a.controller);
    const turnB = await startTurn(b.controller);
    a.sink.runtimeExited({ generation: 1, code: null, signal: 'SIGKILL', expected: false, exitedAt: 1 });
    expect(a.controller.state).toBe('closed');
    expect(b.controller.state).toBe('running');
    b.sink.nativeTurnEnded(turnB, { status: 'completed' });
    expect(b.recorder.last('turn.completed')?.outcome).toBe('completed');
  });
});

describe('SessionController: subscription and dispose', () => {
  it('propagates driver cleanup failure and retries on the same closed handle', async () => {
    const { controller, driver, recorder } = makeSession();
    const cleanup = vi.spyOn(driver, 'dispose').mockRejectedValueOnce(new Error('still alive')).mockResolvedValue(undefined);
    const first = controller.dispose();
    expect(controller.dispose()).toBe(first);
    await expect(first).rejects.toThrow('still alive');
    expect(controller.state).toBe('closed');
    expect(await controller.closed).toBe('disposed');
    await controller.dispose();
    await controller.dispose();
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(recorder.ofType('session.closed')).toHaveLength(1);
  });

  it('does not duplicate actual cleanup after its bounded observer times out', async () => {
    const { controller, driver } = makeSession({ timeouts: { disposeMs: 10 } });
    let release!: () => void;
    const cleanup = vi.spyOn(driver, 'dispose').mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
    await expect(controller.dispose()).rejects.toMatchObject({ code: 'timeout' });
    const retry = controller.dispose();
    release();
    await retry;
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('handles background cleanup rejection without losing explicit retry', async () => {
    const { controller, driver, sink } = makeSession();
    const cleanup = vi.spyOn(driver, 'dispose').mockRejectedValueOnce(new Error('background failure')).mockResolvedValue(undefined);
    sink.fatal({ code: 'runtime_crashed', message: 'crashed' });
    await flush();
    await controller.dispose();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('reports unconfirmed cleanup as a diagnostic and never as an unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const watch = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', watch);
    try {
      const { controller, driver, sink, recorder } = makeSession();
      vi.spyOn(driver, 'dispose').mockRejectedValue(new Error('exit unconfirmed'));
      sink.fatal({ code: 'runtime_crashed', message: 'crashed' });
      await expect(controller.dispose()).rejects.toThrow('exit unconfirmed');
      await expect(controller.dispose()).rejects.toThrow('exit unconfirmed');
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).toEqual([]);
      expect(recorder.ofType('diagnostic').some((event) => event.message.includes('exit unconfirmed'))).toBe(true);
    } finally {
      process.off('unhandledRejection', watch);
    }
  });

  it('finalizes an active turn once when cleanup stays unconfirmed, then retries only the driver', async () => {
    const { controller, driver, recorder } = makeSession();
    const cleanup = vi.spyOn(driver, 'dispose').mockRejectedValueOnce(new Error('exit unconfirmed')).mockResolvedValue(undefined);
    await startTurn(controller);
    await expect(controller.dispose()).rejects.toThrow('exit unconfirmed');
    expect(controller.state).toBe('closed');
    await controller.dispose();
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(recorder.ofType('turn.completed')).toHaveLength(1);
    expect(recorder.ofType('session.closed')).toHaveLength(1);
    expect(driver.callsTo('interruptTurn')).toHaveLength(1);
  });

  it('resolves released only once the driver confirmed, whichever attempt succeeded first', async () => {
    const { controller, driver, sink, recorder } = makeSession();
    const cleanup = vi.spyOn(driver, 'dispose').mockRejectedValueOnce(new Error('exit unconfirmed')).mockResolvedValue(undefined);
    let released = false;
    void controller.released.then(() => { released = true; });
    sink.fatal({ code: 'runtime_crashed', message: 'crashed' });
    await flush();
    expect(controller.state).toBe('closed');
    expect(released).toBe(false);
    // The explicit retry is the attempt that confirms; the event stream is only cut by dispose() itself.
    sink.diagnostic({ kind: 'warning', message: 'still delivered' });
    expect(recorder.ofType('diagnostic').some((event) => event.message === 'still delivered')).toBe(true);
    await controller.dispose();
    await flush();
    expect(released).toBe(true);
    expect(cleanup).toHaveBeenCalledTimes(2);
    sink.diagnostic({ kind: 'warning', message: 'after dispose' });
    expect(recorder.ofType('diagnostic').some((event) => event.message === 'after dispose')).toBe(false);
  });

  it('emits dispose events after the runtime release (runtime exit first), and still closes before reporting a failure', async () => {
    const order: string[] = [];
    const ok = makeSession();
    vi.spyOn(ok.driver, 'dispose').mockImplementation(async () => { order.push('driver.dispose'); });
    ok.controller.subscribe((event) => { order.push(event.type); });
    await ok.controller.dispose();
    expect(order).toEqual(['driver.dispose', 'session.state', 'session.closed']);
    expect(ok.controller.state).toBe('closed');

    const failing = makeSession();
    vi.spyOn(failing.driver, 'dispose').mockRejectedValue(new Error('exit unconfirmed'));
    const events: string[] = [];
    failing.controller.subscribe((event) => { events.push(event.type); });
    await expect(failing.controller.dispose()).rejects.toThrow('exit unconfirmed');
    expect(events).toContain('session.closed');
    expect(events.filter((type) => type === 'session.closed')).toHaveLength(1);
    expect(await failing.controller.closed).toBe('disposed');
  });

  it('buffers events emitted before the first subscription', async () => {
    const { controller, sink } = makeSession({ subscribe: false });
    sink.nativeSessionId('thread-1');
    const recorder = new EventRecorder(controller);
    expect(recorder.types()).toEqual(['session.native_id']);
  });

  it('isolates listener exceptions from the state machine', async () => {
    const errors: unknown[] = [];
    let driver!: ScriptedDriver;
    const controller = new SessionController(
      { providerId: 'test', capabilities: CAPABILITIES, onListenerError: (e) => errors.push(e) },
      (sink) => (driver = new ScriptedDriver(sink)),
    );
    controller.subscribe(() => {
      throw new Error('bad listener');
    });
    const { turnId } = await controller.sendUserInput({ text: 'x' });
    driver.sink.nativeTurnEnded(turnId, { status: 'completed' });
    expect(controller.state).toBe('idle');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('dispose stops an active turn, terminates the driver once and closes', async () => {
    const { controller, driver, recorder } = makeSession();
    await startTurn(controller);
    await Promise.all([controller.dispose(), controller.dispose()]);
    expect(recorder.last('turn.completed')).toMatchObject({ outcome: 'interrupted', stopRequested: true });
    expect(recorder.last('session.closed')?.reason).toBe('disposed');
    expect(driver.callsTo('dispose')).toHaveLength(1);
    expect(controller.state).toBe('closed');
    expect(await controller.closed).toBe('disposed');
  });

  it('dispose finalizes the turn even when the Stop flow hangs', async () => {
    const { controller, driver, recorder } = makeSession({
      timeouts: { interruptMs: 5_000, disposeMs: 50 },
      behavior: { onInterrupt: () => new Promise(() => {}) },
    });
    await startTurn(controller);
    await controller.dispose();
    expect(recorder.last('turn.completed')).toMatchObject({ outcome: 'interrupted', stop: { cleanup: 'failed' } });
    expect(driver.disposed).toBe(true);
    expect(controller.state).toBe('closed');
  });
});
