import { describe, expect, it, vi } from 'vitest';
import { EventStream, TypedEmitter } from '../../src/core/emitter.js';

describe('EventStream', () => {
  it('delivers in order and queues re-entrant emits until the current event reached every listener', () => {
    const stream = new EventStream<number>();
    const seen: string[] = [];
    stream.subscribe((n) => {
      seen.push(`a${n}`);
      if (n === 1) stream.emit(2);
    });
    stream.subscribe((n) => seen.push(`b${n}`));
    stream.emit(1);
    expect(seen).toEqual(['a1', 'b1', 'a2', 'b2']);
  });

  it('isolates listener exceptions', () => {
    const errors: unknown[] = [];
    const stream = new EventStream<number>({ onListenerError: (e) => errors.push(e) });
    const good = vi.fn();
    stream.subscribe(() => {
      throw new Error('boom');
    });
    stream.subscribe(good);
    expect(() => stream.emit(1)).not.toThrow();
    expect(good).toHaveBeenCalledWith(1);
    expect(errors).toHaveLength(1);
  });

  it('supports unsubscribe, once and clean dispose', () => {
    const stream = new EventStream<number>();
    const a = vi.fn();
    const once = vi.fn();
    const off = stream.subscribe(a);
    stream.once(once);
    stream.emit(1);
    off();
    stream.emit(2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(once).toHaveBeenCalledTimes(1);
    stream.dispose();
    const late = vi.fn();
    stream.subscribe(late);
    stream.emit(3);
    expect(late).not.toHaveBeenCalled();
    expect(stream.listenerCount).toBe(0);
  });

  it('does not deliver to a listener removed during dispatch', () => {
    const stream = new EventStream<number>();
    const b = vi.fn();
    let offB = () => {};
    stream.subscribe(() => offB());
    offB = stream.subscribe(b);
    stream.emit(1);
    expect(b).not.toHaveBeenCalled();
  });
});

describe('TypedEmitter', () => {
  it('routes by event type and disposes all channels', () => {
    const emitter = new TypedEmitter<{ a: number; b: string }>();
    const a = vi.fn();
    const b = vi.fn();
    emitter.on('a', a);
    emitter.once('b', b);
    emitter.emit('a', 1);
    emitter.emit('b', 'x');
    emitter.emit('b', 'y');
    expect(a).toHaveBeenCalledWith(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(emitter.listenerCount('a')).toBe(1);
    emitter.dispose();
    emitter.emit('a', 2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(emitter.listenerCount('a')).toBe(0);
  });
});
