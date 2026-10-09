import { describe, expect, it } from 'vitest';
import { RuntimeSlot } from '../../src/core/runtime-slot.js';
import { AdapterError } from '../../src/errors.js';
import { FakeRuntime, fakeProcess } from '../../src/testing/index.js';

describe('RuntimeSlot', () => {
  it('starts once and replaces only after the old runtime exit is confirmed', async () => {
    const created: FakeRuntime[] = [];
    const slot = new RuntimeSlot(async (generation) => {
      const runtime = new FakeRuntime({ generation });
      created.push(runtime);
      return runtime;
    });
    const first = await slot.start();
    expect(first.generation).toBe(1);
    await expect(slot.start()).rejects.toThrow(/already present/);

    const { runtime, previous } = await slot.replace();
    expect(previous?.confirmed).toBe(true);
    expect(first.running).toBe(false);
    expect(runtime.generation).toBe(2);
    expect(slot.current).toBe(runtime);
    expect(created).toHaveLength(2);
  });

  it('refuses to start a parallel runtime when the old one is not proven gone', async () => {
    let count = 0;
    const slot = new RuntimeSlot(async (generation) => {
      count++;
      return new FakeRuntime({ generation, terminateBehavior: 'survivors', descendants: [fakeProcess(4242, 'python sleep')] });
    });
    const first = await slot.start();
    const error = await slot.replace().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).code).toBe('stop_cleanup_failed');
    expect(count).toBe(1);
    expect(slot.current).toBe(first);
  });

  it('serializes concurrent replace calls', async () => {
    const slot = new RuntimeSlot(async (generation) => new FakeRuntime({ generation }));
    await slot.start();
    const [a, b] = await Promise.all([slot.replace(), slot.replace()]);
    expect(a.runtime.generation).toBe(2);
    expect(b.runtime.generation).toBe(3);
    expect(a.runtime.running).toBe(false);
    expect(b.runtime.running).toBe(true);
  });
});
