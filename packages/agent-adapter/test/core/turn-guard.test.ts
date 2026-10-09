import { describe, expect, it } from 'vitest';
import { TurnGuard } from '../../src/core/turn-guard.js';
import { AdapterError } from '../../src/errors.js';

describe('TurnGuard', () => {
  it('runs idle → running → idle and refuses a second submission while running', () => {
    const guard = new TurnGuard();
    guard.beginTurn('t1', 1, 1);
    expect(guard.state).toBe('running');
    expect(() => guard.beginTurn('t2', 2, 2)).toThrowError(AdapterError);
    expect(guard.recordNativeEnd('t1', { status: 'completed' }, 3)).toBe('accepted');
    guard.finish('t1', 3);
    expect(guard.state).toBe('idle');
    expect(guard.current).toBeUndefined();
  });

  it('records stop intent once; duplicate stop is idempotent; submissions are paused while stopping', () => {
    const guard = new TurnGuard();
    expect(guard.requestStop(0)).toBe('no_active_turn');
    guard.beginTurn('t1', 1, 1);
    expect(guard.requestStop(5)).toBe('requested');
    expect(guard.current?.stopRequestedAt).toBe(5);
    expect(guard.requestStop(6)).toBe('already_stopping');
    expect(guard.current?.stopRequestedAt).toBe(5);
    expect(() => guard.assertCanSubmit()).toThrow(/stopping/);
    guard.finish('t1', 7);
    expect(guard.state).toBe('idle');
    expect(() => guard.assertCanSubmit()).not.toThrow();
  });

  it('accepts one native terminal state and classifies later ones as duplicate or late', () => {
    const guard = new TurnGuard();
    guard.beginTurn('t1', 1, 1);
    expect(guard.recordNativeEnd('t1', { status: 'interrupted' }, 2)).toBe('accepted');
    expect(guard.recordNativeEnd('t1', { status: 'completed' }, 3)).toBe('duplicate');
    expect(guard.current?.nativeEnd?.status).toBe('interrupted');
    guard.finish('t1', 4);
    expect(guard.classify('t1')).toBe('finished');
    expect(guard.recordNativeEnd('t1', { status: 'completed' }, 5)).toBe('late');
    expect(guard.recordNativeEnd('nope', { status: 'completed' }, 5)).toBe('unknown');
    // A late event never resurrects the finished turn.
    expect(guard.current).toBeUndefined();
    expect(guard.state).toBe('idle');
  });

  it('maps native turn ids, also after the turn finished', () => {
    const guard = new TurnGuard();
    guard.beginTurn('t1', 1, 1);
    expect(guard.bindNativeTurnId('t1', 'n1')).toBe(true);
    expect(guard.bindNativeTurnId('t1', 'other')).toBe(false);
    guard.finish('t1', 2);
    expect(guard.turnIdForNative('n1')).toBe('t1');
    expect(guard.bindNativeTurnId('missing', 'n2')).toBe(false);
  });

  it('stays closed after close, even when the current turn is finished afterwards', () => {
    const guard = new TurnGuard();
    guard.beginTurn('t1', 1, 1);
    expect(guard.close()).toBe('running');
    guard.finish('t1', 2);
    expect(guard.state).toBe('closed');
    expect(() => guard.assertCanSubmit()).toThrow(/closed/);
    expect(guard.requestStop(3)).toBe('no_active_turn');
  });
});
