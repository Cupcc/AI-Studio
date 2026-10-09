import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  descendantsIn,
  findAlive,
  identityOf,
  listDescendants,
  parsePsOutput,
  signalProcesses,
  waitForExit,
  type ProcessInfo,
} from '../../src/core/process-probe.js';

const spawned: number[] = [];
afterEach(() => {
  for (const pid of spawned.splice(0)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
});

describe('parsePsOutput', () => {
  it('parses lstart columns and keeps argument spacing', () => {
    const rows = parsePsOutput(
      [
        '  101     1   101 Ss   Thu Oct  9 07:17:00 2026     /usr/bin/python3 -c import time;  time.sleep(5)',
        '  102   101   101 Z+   Thu Oct  9 07:17:01 2026     (sleep)',
        'garbage',
      ].join('\n'),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ pid: 101, ppid: 1, pgid: 101, state: 'Ss', startedAt: 'Thu Oct 9 07:17:00 2026' });
    expect(rows[0]!.command).toBe('/usr/bin/python3 -c import time;  time.sleep(5)');
    expect(rows[1]!.state).toBe('Z+');
  });

  it('builds descendant trees and skips zombies', () => {
    const p = (pid: number, ppid: number, state = 'S'): ProcessInfo => ({
      pid,
      ppid,
      pgid: pid,
      state,
      startedAt: 's',
      command: String(pid),
    });
    const all = [p(10, 1), p(11, 10), p(12, 11), p(13, 10, 'Z'), p(14, 13), p(20, 1)];
    expect(descendantsIn(all, 10).map((x) => x.pid)).toEqual([11, 12, 14]);
    expect(descendantsIn(all, 10, true).map((x) => x.pid)).toEqual([10, 11, 12, 14]);
  });
});

describe('process probing with a real child', () => {
  it('lists a short-lived sleep child, then proves it exited after a signal', async () => {
    const child = spawn('sleep', ['30'], { stdio: 'ignore' });
    spawned.push(child.pid as number);
    const descendants = await listDescendants(process.pid);
    const sleepInfo = descendants.find((d) => d.pid === child.pid);
    expect(sleepInfo).toBeDefined();
    expect(sleepInfo!.command).toContain('sleep 30');

    const identity = identityOf(sleepInfo!);
    expect(await findAlive([identity])).toHaveLength(1);
    const before = await waitForExit([identity], { timeoutMs: 100, intervalMs: 20 });
    expect(before.exited).toBe(false);

    const signalled = await signalProcesses([identity], 'SIGTERM');
    expect(signalled.signalled).toEqual([child.pid]);
    const after = await waitForExit([identity], { timeoutMs: 5_000, intervalMs: 25 });
    expect(after.exited).toBe(true);
    expect(after.survivors).toEqual([]);
  });

  it('never matches a reused pid with a different start time', async () => {
    const child = spawn('sleep', ['30'], { stdio: 'ignore' });
    spawned.push(child.pid as number);
    const alive = await findAlive([{ pid: child.pid as number, startedAt: 'Mon Jan  1 00:00:00 2001' }]);
    expect(alive).toEqual([]);
    const result = await signalProcesses([{ pid: child.pid as number, startedAt: 'Mon Jan  1 00:00:00 2001' }], 'SIGKILL');
    expect(result.signalled).toEqual([]);
    expect(child.exitCode).toBeNull();
  });
});
