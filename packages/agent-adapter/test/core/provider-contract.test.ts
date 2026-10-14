import { describe, expect, it, vi } from 'vitest';
import { ProviderRegistry } from '../../src/registry.js';
import { ensureSession } from '../../src/session-helpers.js';
import { EventRecorder, FakeProvider } from '../../src/testing/index.js';
import type { SessionController } from '../../src/core/session-controller.js';

const base = { cwd: '/tmp/project with spaces', environment: { env: { PATH: '/usr/bin' } } };

describe('provider contract via FakeProvider', () => {
  it('retry after a runtime crash: resume the same native id, then send the message again (S-Q2)', async () => {
    const provider = new FakeProvider('codex');
    const first = await provider.createSession(base);
    const nativeId = first.nativeSessionId!;
    expect(nativeId).toBeDefined();
    const firstRecord = provider.sessions[0]!;
    const { turnId } = await first.sendUserInput({ text: 'build it' });
    firstRecord.controller.sink.runtimeExited({ generation: 1, code: null, signal: 'SIGKILL', expected: false, exitedAt: 1 });
    expect(first.state).toBe('closed');

    const { session, action } = await ensureSession(provider, first, { ...base, nativeSessionId: nativeId });
    expect(action).toBe('resumed');
    expect(session.nativeSessionId).toBe(nativeId);
    const recorder = new EventRecorder(session);
    const retried = await session.sendUserInput({ text: 'build it' });
    expect(retried.turnId).not.toBe(turnId);
    provider.sessions[1]!.controller.sink.nativeTurnEnded(retried.turnId, { status: 'completed' });
    expect(recorder.last('turn.completed')?.outcome).toBe('completed');
    // The crashed turn's input was not replayed by the adapter.
    expect(provider.sessions[1]!.driver.callsTo('startTurn')).toHaveLength(1);
  });

  it('reuses a live session and creates only when no native id exists', async () => {
    const provider = new FakeProvider('claude-code', { capabilities: { nativeSessionIdTiming: 'after_first_input' } });
    const created = await ensureSession(provider, undefined, base);
    expect(created.action).toBe('created');
    expect(created.session.nativeSessionId).toBeUndefined();
    const reused = await ensureSession(provider, created.session, base);
    expect(reused).toEqual({ session: created.session, action: 'reused' });
  });

  it('ensureSession starts no replacement while the closed session exit is unconfirmed, and resumes after a retry', async () => {
    const provider = new FakeProvider('codex');
    const first = await provider.createSession(base);
    const nativeId = first.nativeSessionId!;
    const cleanup = vi.spyOn(provider.sessions[0]!.driver, 'dispose').mockRejectedValue(new Error('exit unconfirmed'));
    provider.sessions[0]!.controller.sink.runtimeExited({ generation: 1, code: null, signal: 'SIGKILL', expected: false, exitedAt: 1 });
    await expect(ensureSession(provider, first, { ...base, nativeSessionId: nativeId })).rejects.toThrow('exit unconfirmed');
    expect(provider.sessions).toHaveLength(1);
    cleanup.mockResolvedValue(undefined);
    const { session, action } = await ensureSession(provider, first, { ...base, nativeSessionId: nativeId });
    expect(action).toBe('resumed');
    expect(session.nativeSessionId).toBe(nativeId);
    expect(provider.sessions).toHaveLength(2);
  });

  it('rejects resume with resume_failed and never creates a new native session', async () => {
    const provider = new FakeProvider('codex');
    await expect(ensureSession(provider, undefined, { ...base, nativeSessionId: 'unknown-thread' })).rejects.toMatchObject({
      code: 'resume_failed',
    });
    expect(provider.sessions).toHaveLength(0);
  });

  it('shutdownAll disposes every live session of every provider', async () => {
    const registry = new ProviderRegistry();
    const codex = new FakeProvider('codex');
    const claude = new FakeProvider('claude-code');
    registry.register(codex);
    registry.register(claude);
    expect(() => registry.register(new FakeProvider('codex'))).toThrow(/already registered/);
    const a = await codex.createSession(base);
    const b = await claude.createSession(base);
    await a.sendUserInput({ text: 'long task' });
    await registry.shutdownAll();
    expect(a.state).toBe('closed');
    expect(b.state).toBe('closed');
    expect(codex.sessions[0]!.driver.disposed).toBe(true);
    expect(claude.sessions[0]!.driver.disposed).toBe(true);
    expect(await (a as SessionController).closed).toBe('disposed');
  });

  it('shutdownAll attempts every provider and rejects instead of reporting success over an unconfirmed exit', async () => {
    const registry = new ProviderRegistry();
    const codex = new FakeProvider('codex');
    const claude = new FakeProvider('claude-code');
    registry.register(codex);
    registry.register(claude);
    await codex.createSession(base);
    await claude.createSession(base);
    const failure = new Error('exit unconfirmed');
    const cleanup = vi.spyOn(codex.sessions[0]!.driver, 'dispose').mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const attempt = registry.shutdownAll();
    await expect(attempt).rejects.toBeInstanceOf(AggregateError);
    await expect(attempt).rejects.toMatchObject({ errors: [expect.objectContaining({ errors: [failure] })] });
    expect(claude.sessions[0]!.driver.disposed).toBe(true);
    await registry.shutdownAll();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('releaseRuntimes is strict, retryable on the same session handle and limited to one Project', async () => {
    const provider = new FakeProvider('codex');
    const a = await provider.createSession({ ...base, cwd: '/tmp/project a' });
    const b = await provider.createSession({ ...base, cwd: '/tmp/project b' });
    const cleanup = vi.spyOn(provider.sessions[0]!.driver, 'dispose').mockRejectedValueOnce(new Error('exit unconfirmed')).mockResolvedValue(undefined);
    await expect(provider.releaseRuntimes('/tmp/project a')).rejects.toBeInstanceOf(AggregateError);
    expect(a.state).toBe('closed');
    expect(b.state).toBe('idle');
    expect(provider.sessions[1]!.driver.disposed).toBe(false);
    await provider.releaseRuntimes('/tmp/project a');
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(provider.sessions).toHaveLength(2);
    await provider.releaseRuntimes('/tmp/project a');
    expect(cleanup).toHaveBeenCalledTimes(2);
    await provider.releaseRuntimes();
    expect(b.state).toBe('closed');
    expect(provider.sessions[1]!.driver.disposed).toBe(true);
  });

  it('reports availability through the shared summary', async () => {
    const provider = new FakeProvider('codex');
    provider.availability.login = { status: 'ok', value: { state: 'logged_out' } };
    const report = await provider.checkAvailability({ environment: { env: {} } });
    expect(report).toMatchObject({ providerId: 'codex', status: 'not_logged_in', reason: { code: 'auth_required' } });
  });
});
