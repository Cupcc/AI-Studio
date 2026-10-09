import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventRecorder } from '../../src/testing/event-recorder.js';
import { ScriptedRpcError } from '../../src/testing/fake-transport.js';
import { fakeProcess } from '../../src/testing/fake-runtime.js';
import { Harness, approval, command, options, turn } from './harness.js';

const harnesses: Harness[] = [];
const setup = () => { const harness = new Harness(); harnesses.push(harness); return harness; };
afterEach(async () => { await Promise.all(harnesses.splice(0).map((h) => h.provider.dispose())); });

describe('Codex Stop / 04 §4.1–7, FR-SESSION-003, AC-03', () => {
  it('interrupts then terminates only current-turn processIds, proving root/child exit and retaining earlier services', async () => {
    const h = setup(); const session = await h.session();
    const runtime = h.runtimes[0]!;
    const earlier = fakeProcess(10001, 'earlier service', { ppid: runtime.pid });
    h.processes.push(earlier); runtime.descendants.push(earlier);
    h.terminals.get(runtime.pid)!.push({ itemId: 'old-item', processId: 'old-process', osPid: earlier.pid, cwd: options.cwd, command: earlier.command, cpuPercent: null, rssKb: null });
    await h.start(session);
    const root = h.command(session, 'current', 'opaque-900000', 12001);
    const child = fakeProcess(12002, 'nested child', { ppid: root.pid, pgid: root.pid });
    h.processes.push(child); runtime.descendants.push(child);
    const recorder = new EventRecorder(session);
    const first = session.stop(); const second = session.stop();
    expect(first).toBe(second);
    await expect(session.sendUserInput({ text: 'not yet' })).rejects.toMatchObject({ code: 'invalid_state' });
    const result = await first;
    expect(result).toMatchObject({ status: 'stopped', summary: { cleanup: 'confirmed', cleanupReport: { scope: 'turn',
      verifiedExited: expect.arrayContaining([{ pid: root.pid, command: root.command }, { pid: child.pid, command: child.command }]) } } });
    expect(h.processes).toEqual([earlier]); expect(runtime.running).toBe(true); expect(h.runtimes).toHaveLength(1);
    expect(h.servers[0]!.received.filter((r) => r.method.endsWith('/terminate'))).toEqual([
      { kind: 'request', method: 'thread/backgroundTerminals/terminate', params: { threadId: session.nativeSessionId, processId: 'opaque-900000' } },
    ]);
    expect(h.servers[0]!.received.some((r) => r.method.endsWith('/clean'))).toBe(false);
    expect(recorder.ofType('turn.completed')).toHaveLength(1);
    expect(recorder.last('turn.completed')).toMatchObject({ outcome: 'interrupted', stopRequested: true });
    expect(await session.stop()).toEqual({ status: 'not_running' });
    await h.start(session, 'continue'); expect(h.runtimes).toHaveLength(1);
  });

  it('does not treat terminated:true or an empty native list as proof of system exit', async () => {
    const h = setup(); const session = await h.session(); await h.start(session); const root = h.command(session);
    h.servers[0]!.handle('thread/backgroundTerminals/terminate', () => { h.terminals.set(h.runtimes[0]!.pid, []); return { terminated: true }; });
    const result = await session.stop();
    expect(result).toMatchObject({ status: 'stopped', summary: { cleanup: 'runtime_restarted', recovery: { mayHaveStoppedEarlierBackgroundCommands: true } } });
    expect(h.runtimes[0]!.terminateCalls.length).toBeGreaterThan(0);
    expect(h.runtimes[0]!.running).toBe(false); expect(h.runtimes[1]!.running).toBe(true);
    expect(h.runtimes[0]!.descendants).toContain(root);
    expect(h.servers[1]!.received.find((r) => r.method === 'thread/resume')!.params).toMatchObject({ threadId: 'thread-0', cwd: options.cwd });
    expect(h.servers[1]!.received.some((r) => r.method === 'turn/start' || r.method === 'thread/start')).toBe(false);
  });

  it('uses pid/start-time identity after native termination, tolerating safe pid reuse', async () => {
    const h = setup(); const session = await h.session(); await h.start(session); const root = h.command(session);
    h.servers[0]!.handle('thread/backgroundTerminals/terminate', () => {
      h.processes = [fakeProcess(root.pid, 'unrelated reused pid', { ppid: 1, startedAt: 'different start time' })];
      return { terminated: true };
    });
    expect(await session.stop()).toMatchObject({ status: 'stopped', summary: { cleanup: 'confirmed' } });
    expect(h.processes[0]!.command).toBe('unrelated reused pid'); expect(h.runtimes).toHaveLength(1);
  });

  it.each(['outside-runtime', 'missing-item-mapping', 'changed-process-id', 'unobserved-command'])('falls back conservatively for %s', async (kind) => {
    const h = setup(); const session = await h.session(); await h.start(session); const root = h.command(session);
    const terminal = h.terminals.get(h.runtimes[0]!.pid)![0]!;
    if (kind === 'outside-runtime') root.ppid = 123;
    if (kind === 'missing-item-mapping') terminal.itemId = 'unmapped';
    if (kind === 'changed-process-id') terminal.processId = 'different-native-id';
    if (kind === 'unobserved-command') { h.terminals.set(h.runtimes[0]!.pid, []); h.processes = []; }
    expect(await session.stop()).toMatchObject({ status: 'stopped', summary: { cleanup: 'runtime_restarted' } });
    expect(h.servers[0]!.received.some((r) => r.method.endsWith('/terminate'))).toBe(false);
    expect(session.nativeSessionId).toBe('thread-0');
  });

  it('handles the pinned native implementation osPid:null with a pre-turn OS baseline and conservative exit evidence', async () => {
    const h = setup(); const session = await h.session(); const runtime = h.runtimes[0]!;
    const earlier = fakeProcess(10001, 'old service', { ppid: runtime.pid });
    h.processes.push(earlier); runtime.descendants.push(earlier);
    h.terminals.get(runtime.pid)!.push({ itemId: 'old', processId: 'old', osPid: null, command: 'old service', cwd: options.cwd, cpuPercent: null, rssKb: null });
    await h.start(session); const target = h.command(session);
    h.terminals.get(runtime.pid)![1]!.osPid = null;
    h.servers[0]!.handle('thread/backgroundTerminals/terminate', () => {
      h.processes = h.processes.filter((p) => p.pid !== target.pid);
      h.terminals.set(runtime.pid, h.terminals.get(runtime.pid)!.slice(0, 1)); return { terminated: true };
    });
    expect(await session.stop()).toMatchObject({ status: 'stopped', summary: { cleanup: 'confirmed', cleanupReport: {
      verifiedExited: [{ pid: target.pid, command: target.command }], detail: expect.stringContaining('pre-turn baseline'),
    } } });
    expect(h.processes).toEqual([earlier]); expect(h.runtimes).toHaveLength(1);
  });

  it('does not claim exit for null-osPid commands without any new observable descendant', async () => {
    const h = setup(); const session = await h.session(); await h.start(session); h.command(session);
    h.terminals.get(h.runtimes[0]!.pid)![0]!.osPid = null;
    h.processes = [];
    expect(await session.stop()).toMatchObject({ status: 'stopped', summary: { cleanup: 'runtime_restarted' } });
  });

  it.each(['unavailable', 'terminate-error', 'interrupt-error', 'terminal-timeout'])('recovers original identity/configuration on %s', async (failure) => {
    const h = setup(); const session = await h.session({ overrides: { model: 'selected-model', sandboxMode: 'read-only' }, providerOptions: { config: { sample: 'same' } } });
    await h.start(session); h.command(session);
    if (failure === 'unavailable') h.servers[0]!.handle('thread/backgroundTerminals/list', () => { throw new ScriptedRpcError({ code: -32601, message: 'experimental API unavailable' }); });
    if (failure === 'terminate-error') h.servers[0]!.handle('thread/backgroundTerminals/terminate', () => { throw new Error('could not terminate'); });
    if (failure === 'interrupt-error') h.servers[0]!.handle('turn/interrupt', () => { throw new Error('interrupt failed'); });
    if (failure === 'terminal-timeout') h.servers[0]!.handle('turn/interrupt', () => ({}));
    const recorder = new EventRecorder(session);
    expect(await session.stop()).toMatchObject({ status: 'stopped', summary: { cleanup: 'runtime_restarted' } });
    expect(h.servers[1]!.received.find((r) => r.method === 'thread/resume')!.params).toMatchObject({ threadId: 'thread-0', cwd: options.cwd, model: 'selected-model', sandbox: 'read-only', config: { sample: 'same' } });
    expect(recorder.ofType('turn.completed')).toHaveLength(1);
    expect(recorder.last('turn.completed')!.error).toBeUndefined();
  });

  it('requires old Runtime exit before replacement, and reports cleanup failure when survivors remain', async () => {
    const h = setup(); const session = await h.session(); await h.start(session); h.command(session);
    h.runtimes[0]!.terminateBehavior = 'survivors';
    h.servers[0]!.handle('thread/backgroundTerminals/terminate', () => { throw new Error('failure'); });
    const recorder = new EventRecorder(session);
    expect(await session.stop()).toMatchObject({ status: 'failed', error: { code: 'stop_cleanup_failed' } });
    expect(h.runtimes).toHaveLength(1); expect(session.state).toBe('closed');
    expect(recorder.last('turn.completed')).toMatchObject({ outcome: 'interrupted', stop: { cleanup: 'failed' } });
    expect(recorder.last('session.error')).toMatchObject({ error: { code: 'stop_cleanup_failed' } });
  });

  it('closes explicitly when Runtime replacement cannot resume the original thread', async () => {
    const h = setup(); h.configure = (server, _runtime, index) => {
      if (index > 0) server.handle('thread/resume', () => { throw new Error('thread history missing'); });
    };
    const session = await h.session(); await h.start(session); h.command(session);
    h.servers[0]!.handle('thread/backgroundTerminals/terminate', () => { throw new Error('failure'); });
    expect(await session.stop()).toMatchObject({ status: 'failed', error: { code: 'resume_failed' } });
    expect(session.state).toBe('closed'); expect(session.nativeSessionId).toBe('thread-0');
    expect(h.runtimes.every((r) => !r.running)).toBe(true);
    expect(h.servers[1]!.received.some((r) => r.method === 'thread/start')).toBe(false);
  });

  it('isolates fallback from another concurrently running Session', async () => {
    const h = setup(); const a = await h.session(); const b = await h.session();
    await h.start(a); h.command(a, 'a', 'a-process', 12001, 0);
    await h.start(b); const survivor = h.command(b, 'b', 'b-process', 12002, 1);
    h.servers[0]!.handle('thread/backgroundTerminals/terminate', () => { throw new Error('failure'); });
    expect(await a.stop()).toMatchObject({ status: 'stopped', summary: { cleanup: 'runtime_restarted' } });
    expect(h.runtimes[1]!.running).toBe(true); expect(h.runtimes[1]!.terminateCalls).toHaveLength(0);
    expect(h.processes).toContain(survivor); expect(b.state).toBe('running');
  });

  it('cancels all pending requests in protocol order and accepts no new requests while stopping', async () => {
    const h = setup(); const session = await h.session(); await h.start(session);
    const answer = h.servers[0]!.request('item/commandExecution/requestApproval', approval(session));
    let late!: Promise<unknown>;
    h.servers[0]!.handle('turn/interrupt', (p) => {
      const params = p as { turnId: string; threadId: string };
      late = h.servers[0]!.request('item/fileChange/requestApproval', approval(session));
      h.servers[0]!.notify('turn/completed', { threadId: params.threadId, turn: turn(params.turnId, 'interrupted') }); return {};
    });
    const recorder = new EventRecorder(session);
    const stop = session.stop();
    expect(session.pendingInputs).toHaveLength(0);
    expect(await stop).toMatchObject({ status: 'stopped' });
    expect(await answer).toEqual({ decision: 'decline' }); expect(await late).toEqual({ decision: 'decline' });
    expect(recorder.ofType('input.resolved')).toMatchObject([{ resolution: { status: 'cancelled', reason: 'turn_stopping' } }]);
  });

  it('keeps a successful completion race successful without terminating its service', async () => {
    const h = setup(); const session = await h.session(); await h.start(session); const root = h.command(session);
    h.servers[0]!.handle('turn/interrupt', (p) => {
      const params = p as { turnId: string; threadId: string };
      h.servers[0]!.notify('turn/completed', { threadId: params.threadId, turn: turn(params.turnId, 'completed') }); return {};
    });
    const recorder = new EventRecorder(session);
    expect(await session.stop()).toMatchObject({ status: 'already_completed' });
    expect(recorder.last('turn.completed')).toMatchObject({ outcome: 'completed', stopRequested: true });
    expect(h.processes).toContain(root); expect(h.servers[0]!.received.some((r) => r.method.endsWith('/terminate'))).toBe(false);
  });

  it('ignores late command completions and old native turn events after recovery', async () => {
    const h = setup(); const session = await h.session(); const oldTurn = await h.start(session); h.command(session);
    h.servers[0]!.handle('thread/backgroundTerminals/terminate', () => { throw new Error('failure'); });
    await session.stop(); const recorder = new EventRecorder(session); recorder.clear(); await h.start(session);
    h.notify(session, 'item/completed', { turnId: oldTurn, item: { ...command(), status: 'completed' } });
    h.notify(session, 'turn/completed', { turn: turn(oldTurn, 'completed') });
    expect(session.state).toBe('running'); expect(recorder.ofType('turn.completed')).toHaveLength(0);
  });

  it('tracks a detached descendant captured before reparenting and refuses false exit', async () => {
    const h = setup(); const session = await h.session(); await h.start(session); const root = h.command(session);
    const child = fakeProcess(12002, 'detached grandchild', { ppid: root.pid, pgid: 12002 });
    h.processes.push(child); h.runtimes[0]!.descendants.push(child);
    // Let the live tracker observe ancestry before the child detaches.
    await vi.waitFor(() => expect(h.servers[0]!.received.filter((r) => r.method === 'thread/backgroundTerminals/list').length).toBeGreaterThan(1));
    // A sample can be between its RPC and ps snapshot; wait for its bounded poll.
    await new Promise((resolve) => setTimeout(resolve, 120));
    child.ppid = 1;
    h.servers[0]!.handle('thread/backgroundTerminals/terminate', () => {
      h.processes = h.processes.filter((p) => p.pid !== root.pid); h.terminals.set(h.runtimes[0]!.pid, []); return { terminated: true };
    });
    const result = await session.stop();
    expect(result).toMatchObject({ status: 'stopped', summary: { cleanup: 'runtime_restarted' } });
    expect(h.runtimes[0]!.descendants).toContain(child);
  });
});
