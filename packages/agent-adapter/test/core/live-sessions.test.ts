import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveSessions } from '../../src/core/live-sessions.js';
import { SessionController } from '../../src/core/session-controller.js';
import type { ProviderCapabilities } from '../../src/provider.js';
import { ScriptedDriver } from '../../src/testing/index.js';

const CAPABILITIES: ProviderCapabilities = {
  nativeSessionIdTiming: 'on_create',
  inputWhileRunning: 'none',
  questionRequests: true,
  freeTextAnswers: { questions: true, approvals: false },
  nativeTitle: false,
  runtimeRecovery: false,
};

// Cleanup must never leak a rejection nobody handles (vitest also fails the run on one).
const unhandled: unknown[] = [];
const watch = (reason: unknown) => unhandled.push(reason);
beforeEach(() => { process.on('unhandledRejection', watch); });
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 10));
  process.off('unhandledRejection', watch);
  expect(unhandled.splice(0)).toEqual([]);
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function track(live: LiveSessions, cwd: string) {
  let driver!: ScriptedDriver;
  const session = new SessionController(
    { providerId: 'test', capabilities: CAPABILITIES, timeouts: { disposeMs: 500 } },
    (sink) => (driver = new ScriptedDriver(sink)),
  );
  live.add(session, cwd);
  return { session, driver, sink: session.sink };
}

describe('LiveSessions', () => {
  it('keeps a session whose release is unconfirmed, rejects with every failure, and retries the same handle', async () => {
    const live = new LiveSessions();
    const a = track(live, '/a');
    const b = track(live, '/b');
    const failure = new Error('exit unconfirmed');
    const cleanup = vi.spyOn(a.driver, 'dispose').mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const attempt = live.disposeAll();
    await expect(attempt).rejects.toBeInstanceOf(AggregateError);
    await expect(attempt).rejects.toMatchObject({ errors: [failure] });
    expect(b.driver.disposed).toBe(true);
    expect(live.list()).toEqual([a.session]);
    expect(a.session.state).toBe('closed');
    await live.disposeAll();
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(live.size).toBe(0);
    await live.disposeAll();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('limits disposeAll(cwd) to that Project and leaves other sessions untouched', async () => {
    const live = new LiveSessions();
    const a = track(live, '/a');
    const b = track(live, '/b');
    vi.spyOn(b.driver, 'dispose').mockRejectedValue(new Error('would fail if touched'));
    await live.disposeAll('/a');
    expect(a.driver.disposed).toBe(true);
    expect(b.session.state).toBe('idle');
    expect(b.driver.dispose).not.toHaveBeenCalled();
    expect(live.list()).toEqual([b.session]);
    await expect(live.disposeAll('/b')).rejects.toBeInstanceOf(AggregateError);
    expect(live.list()).toEqual([b.session]);
  });

  it('drops a self-closed session only after its release is confirmed', async () => {
    const live = new LiveSessions();
    const crashed = track(live, '/a');
    const stuck = track(live, '/a');
    vi.spyOn(stuck.driver, 'dispose').mockRejectedValueOnce(new Error('exit unconfirmed')).mockResolvedValue(undefined);
    crashed.sink.fatal({ code: 'runtime_crashed', message: 'crashed' });
    stuck.sink.fatal({ code: 'runtime_crashed', message: 'crashed' });
    await flush();
    expect(crashed.driver.disposed).toBe(true);
    expect(live.list()).toEqual([stuck.session]);
    await live.disposeAll();
    expect(live.size).toBe(0);
    expect(stuck.driver.dispose).toHaveBeenCalledTimes(2);
  });

  it('drops a session once a later explicit dispose retry confirmed its release, without disposeAll', async () => {
    const live = new LiveSessions();
    const a = track(live, '/a');
    vi.spyOn(a.driver, 'dispose').mockRejectedValueOnce(new Error('exit unconfirmed')).mockResolvedValue(undefined);
    await expect(a.session.dispose()).rejects.toThrow('exit unconfirmed');
    expect(live.list()).toEqual([a.session]);
    await a.session.dispose();
    await flush();
    expect(live.size).toBe(0);
  });

  it('does not end a self-closed session event stream before the host disposes it', async () => {
    const live = new LiveSessions();
    const crashed = track(live, '/a');
    const seen: string[] = [];
    crashed.session.subscribe((event) => seen.push(event.type));
    crashed.sink.fatal({ code: 'runtime_crashed', message: 'crashed' });
    await flush();
    expect(live.size).toBe(0);
    crashed.sink.diagnostic({ kind: 'warning', message: 'still observable' });
    expect(seen).toContain('diagnostic');
    await crashed.session.dispose();
    expect(crashed.driver.callsTo('dispose')).toHaveLength(1);
  });
});
