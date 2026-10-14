import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deferred } from '../../src/core/async.js';
import { RuntimeResources } from '../../src/core/runtime-resources.js';
import type { RuntimeHandle, RuntimeSpawnOptions } from '../../src/core/runtime-process.js';
import { FakeRuntime } from '../../src/testing/fake-runtime.js';

const spawn = (cwd: string): RuntimeSpawnOptions => ({ command: 'fake', args: [], cwd, env: {} });
const noSessions = async () => {};

// Cleanup must never leak a rejection nobody handles (vitest also fails the run on one).
const unhandled: unknown[] = [];
const watch = (reason: unknown) => unhandled.push(reason);
beforeEach(() => { process.on('unhandledRejection', watch); });
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 10));
  process.off('unhandledRejection', watch);
  expect(unhandled.splice(0)).toEqual([]);
});

function setup() {
  const resources = new RuntimeResources();
  const runtimes: FakeRuntime[] = [];
  const factory = async (options: RuntimeSpawnOptions): Promise<RuntimeHandle> => {
    const runtime = new FakeRuntime({ generation: options.generation });
    runtimes.push(runtime);
    return runtime;
  };
  return { resources, runtimes, factory, start: (cwd: string) => resources.start(spawn(cwd), factory) };
}

describe('RuntimeResources', () => {
  it('retains each started handle until some terminate() proves its exit', async () => {
    const { resources, start } = setup();
    const owned = (await start('/a')) as FakeRuntime;
    const probe = (await start('/a')) as FakeRuntime;
    expect(resources.retained).toBe(2);
    // A session or probe proving exit through its own terminate() releases the exact handle.
    expect((await owned.terminate()).confirmed).toBe(true);
    expect(resources.retained).toBe(1);
    probe.terminateBehavior = 'hang';
    expect((await probe.terminate()).confirmed).toBe(false);
    expect(resources.retained).toBe(1);
  });

  it('rejects with an AggregateError while an exit is unconfirmed and retries the same handle', async () => {
    const { resources, runtimes, start } = setup();
    const runtime = (await start('/a')) as FakeRuntime;
    runtime.terminateBehavior = 'hang';
    const failed = resources.release(undefined, noSessions);
    await expect(failed).rejects.toBeInstanceOf(AggregateError);
    await expect(failed).rejects.toMatchObject({ errors: [expect.objectContaining({ code: 'stop_cleanup_failed' })] });
    expect(resources.retained).toBe(1);
    runtime.terminateBehavior = 'exit';
    await resources.release(undefined, noSessions);
    expect(resources.retained).toBe(0);
    expect(runtimes).toHaveLength(1);
    expect(runtime.terminateCalls).toHaveLength(2);
    expect(runtime.running).toBe(false);
    // Settled success is a no-op: the confirmed handle is not terminated again.
    await resources.release(undefined, noSessions);
    expect(runtime.terminateCalls).toHaveLength(2);
  });

  it('flattens session failures with handle failures and keeps releasing handles after a session error', async () => {
    const { resources, start } = setup();
    const runtime = (await start('/a')) as FakeRuntime;
    const sessionFailure = new Error('session release failed');
    const failed = resources.release('/a', async () => { throw new AggregateError([sessionFailure], 'Session runtime release failed'); });
    await expect(failed).rejects.toMatchObject({ message: 'Runtime release failed', errors: [sessionFailure] });
    expect(runtime.running).toBe(false);
    expect(resources.retained).toBe(0);
  });

  it('re-terminates with the waits its owner registered, and with the defaults when none were', async () => {
    const { resources, start } = setup();
    const configured = (await resources.start({ ...spawn('/a'), terminate: { graceMs: 7, killWaitMs: 9 } }, async (options) => new FakeRuntime({ generation: options.generation }))) as FakeRuntime;
    const plain = (await start('/a')) as FakeRuntime;
    await resources.release('/a', noSessions);
    expect(configured.terminateCalls).toEqual([{ graceMs: 7, killWaitMs: 9 }]);
    expect(plain.terminateCalls).toEqual([{}]);
  });

  it('limits release to the requested cwd', async () => {
    const { resources, start } = setup();
    const a = (await start('/a')) as FakeRuntime;
    const b = (await start('/b')) as FakeRuntime;
    b.terminateBehavior = 'hang';
    await resources.release('/a', noSessions);
    expect(a.running).toBe(false);
    expect(b.terminateCalls).toHaveLength(0);
    expect(resources.retained).toBe(1);
    await expect(resources.release('/b', noSessions)).rejects.toBeInstanceOf(AggregateError);
    expect(b.terminateCalls).toHaveLength(1);
    b.terminateBehavior = 'exit';
    await resources.release(undefined, noSessions);
    expect(resources.retained).toBe(0);
  });

  it('shares one pending release per scope and terminates a handle once for overlapping scopes', async () => {
    const { resources, start } = setup();
    const runtime = (await start('/a')) as FakeRuntime;
    const scoped = resources.release('/a', noSessions);
    expect(resources.release('/a', noSessions)).toBe(scoped);
    const all = resources.release(undefined, noSessions);
    expect(all).not.toBe(scoped);
    await Promise.all([scoped, all]);
    expect(runtime.terminateCalls).toHaveLength(1);
  });

  it('waits for a late startup and releases its handle instead of leaking it', async () => {
    const { resources, runtimes } = setup();
    const gate = deferred<void>();
    const late = resources.start(spawn('/a'), async (options) => {
      await gate.promise;
      const runtime = new FakeRuntime({ generation: options.generation });
      runtimes.push(runtime);
      return runtime;
    });
    let released = false;
    const release = resources.release('/a', noSessions).then(() => { released = true; });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(released).toBe(false);
    gate.resolve();
    await release;
    const runtime = (await late) as FakeRuntime;
    expect(runtime.running).toBe(false);
    expect(resources.retained).toBe(0);
  });

  it('does not retain a failed factory and does not leave a pending startup behind', async () => {
    const { resources } = setup();
    await expect(resources.start(spawn('/a'), async () => { throw new Error('spawn failed'); })).rejects.toThrow('spawn failed');
    expect(resources.retained).toBe(0);
    await resources.release(undefined, noSessions);
  });

  it('gates new startups only while a release covering their cwd runs, and reopens after failure', async () => {
    const { resources, runtimes, start } = setup();
    const runtime = (await start('/a')) as FakeRuntime;
    runtime.terminateBehavior = 'hang';
    const gate = deferred<void>();
    const holding = resources.release('/a', () => gate.promise);
    // Never a synchronous throw: the Claude SDK spawn hook must observe a promise.
    let started: Promise<RuntimeHandle> | undefined;
    expect(() => { started = start('/a'); }).not.toThrow();
    await expect(started).rejects.toMatchObject({ code: 'invalid_state' });
    expect(() => resources.assertOpen('/a')).toThrow(/being released/);
    expect(() => resources.assertOpen('/b')).not.toThrow();
    await expect(start('/b')).resolves.toBeInstanceOf(FakeRuntime);
    gate.resolve();
    await expect(holding).rejects.toBeInstanceOf(AggregateError);
    expect(() => resources.assertOpen('/a')).not.toThrow();
    await expect(start('/a')).resolves.toBeInstanceOf(FakeRuntime);
    runtime.terminateBehavior = 'exit';
    await resources.release(undefined, noSessions);
    expect(resources.retained).toBe(0);
    expect(runtimes).toHaveLength(3);
  });

  it('gates every cwd during an all-Project release', async () => {
    const { resources, start } = setup();
    const gate = deferred<void>();
    const holding = resources.release(undefined, () => gate.promise);
    await expect(start('/anywhere')).rejects.toMatchObject({ code: 'invalid_state' });
    gate.resolve();
    await holding;
    await expect(start('/anywhere')).resolves.toBeInstanceOf(FakeRuntime);
    await resources.release(undefined, noSessions);
  });
});
