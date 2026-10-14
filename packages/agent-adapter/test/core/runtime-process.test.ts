import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultProcessLister, findAlive, identityOf, type ProcessLister } from '../../src/core/process-probe.js';
import { RuntimeProcess } from '../../src/core/runtime-process.js';
import { AdapterError } from '../../src/errors.js';

const env = { PATH: process.env.PATH ?? '/usr/bin:/bin' };
const runtimes: RuntimeProcess[] = [];

async function startNode(script: string, label = 'node-test', lister?: ProcessLister): Promise<RuntimeProcess> {
  const runtime = await RuntimeProcess.start({
    command: process.execPath,
    args: ['-e', script],
    cwd: process.cwd(),
    env,
    label,
    stderrLimitBytes: 64,
    ...(lister ? { lister } : {}),
  });
  runtimes.push(runtime);
  return runtime;
}

async function startShell(script: string): Promise<RuntimeProcess> {
  const runtime = await RuntimeProcess.start({ command: '/bin/sh', args: ['-c', script], cwd: process.cwd(), env, label: 'shell-test' });
  runtimes.push(runtime);
  return runtime;
}

/** First number the shell prints: the pid of the orphan it leaves behind. */
function printedPid(runtime: RuntimeProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no pid printed')), 5_000);
    runtime.stdout.once('data', (chunk: Buffer) => { clearTimeout(timer); resolve(Number(String(chunk).trim().split('\n')[0])); });
  });
}

/** Test-owned stragglers are killed only while their recorded identity (pid + start time) still matches. */
const strays: Array<{ pid: number; startedAt: string }> = [];
async function listed(pid: number) {
  return (await defaultProcessLister.list()).find((p) => p.pid === pid && !p.state.startsWith('Z'));
}
async function remember(pid: number) {
  const info = await listed(pid);
  if (info) strays.push({ pid, startedAt: info.startedAt });
  return info;
}
const aliveWith = async (pid: number, startedAt: string) => (await listed(pid))?.startedAt === startedAt;

/** Fake pids lie beyond the macOS pid range; the guard keeps even a valid Linux pid untouched. */
function guardKill(...fake: number[]) {
  const realKill = process.kill.bind(process);
  return vi.spyOn(process, 'kill').mockImplementation((pid, signal) => (fake.includes(pid) ? true : realKill(pid, signal)));
}
const row = (pid: number, ppid: number, pgid: number, startedAt: string) => ({ pid, ppid, pgid, state: 'S', startedAt, command: `fake ${pid}` });

afterEach(async () => {
  vi.restoreAllMocks();
  for (const stray of strays.splice(0)) {
    if (await aliveWith(stray.pid, stray.startedAt)) { try { process.kill(stray.pid, 'SIGKILL'); } catch { /* gone */ } }
  }
  await Promise.all(runtimes.splice(0).map((r) => r.terminate({ graceMs: 100, killWaitMs: 1_000 })));
});

const ECHO = `
process.stdin.setEncoding('utf8');
let buf = '';
process.stdin.on('data', (c) => {
  buf += c;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    process.stdout.write(JSON.stringify({ echo: line }) + '\\n');
  }
});
process.stderr.write('x'.repeat(200));
setInterval(() => {}, 1000);
`;

describe('RuntimeProcess', () => {
  it('does not confirm exit on failed probing with an empty snapshot, then retries', async () => {
    let probeFails = true;
    const runtime = await startNode('process.exit(0)', 'probe-retry', {
      list: async () => {
        if (probeFails) throw new Error('ps unavailable');
        return defaultProcessLister.list();
      },
    });
    await runtime.waitForExit(5_000);
    const first = runtime.terminate();
    expect(runtime.terminate()).toBe(first);
    expect(await first).toMatchObject({ confirmed: false, survivors: [] });
    probeFails = false;
    const retry = runtime.terminate();
    expect(retry).not.toBe(first);
    expect((await retry).confirmed).toBe(true);
    expect(runtime.terminate()).toBe(retry);
  });

  it('never confirms an exit over a never-sampled orphan of the Runtime process group that outlived its leader', async () => {
    const runtime = await startShell('sleep 300 >/dev/null 2>&1 & echo $!; exit 0');
    const orphan = await printedPid(runtime);
    const info = (await remember(orphan))!;
    expect(info.pgid).toBe(runtime.pid);
    await runtime.waitForExit(5_000);
    expect(await aliveWith(orphan, info.startedAt)).toBe(true);
    const report = await runtime.terminate({ graceMs: 100, killWaitMs: 1_500 });
    expect(report).toMatchObject({ confirmed: true, forced: true, survivors: [] });
    expect(await aliveWith(orphan, info.startedAt)).toBe(false);
  });

  it('kills a SIGTERM-ignoring orphan that was re-parented away from the Runtime while it still ran', async () => {
    const runtime = await startShell(`sh -c 'trap "" TERM; sleep 300 >/dev/null 2>&1 & echo $!'; while true; do sleep 1; done`);
    const orphan = await printedPid(runtime);
    const info = (await remember(orphan))!;
    const report = await runtime.terminate({ graceMs: 300, killWaitMs: 1_500 });
    expect(report).toMatchObject({ confirmed: true, forced: true, survivors: [] });
    expect(await aliveWith(orphan, info.startedAt)).toBe(false);
  });

  it('adopts group members listed when the leader exited, but never a group id that was recycled after that', async () => {
    const STRANGER = 999_991;
    const kill = guardKill(STRANGER);
    let leader = 0;
    let recycled = false;
    const runtime = await startNode('setTimeout(() => process.exit(0), 100)', 'recycled-group', {
      // The real sequence: nothing owned the group when the leader exited; later an unrelated group appears under the same id.
      list: async () => recycled ? [row(STRANGER, 1, leader, 'unrelated start')] : [],
    });
    leader = runtime.pid!;
    await runtime.waitForExit(5_000);
    recycled = true;
    const report = await runtime.terminate({ graceMs: 50, killWaitMs: 50 });
    expect(report).toMatchObject({ confirmed: true, forced: false, survivors: [] });
    expect(kill.mock.calls.filter(([pid]) => pid === STRANGER || pid === -leader)).toEqual([]);
  });

  it('adopts the members present at the exit instant and signals them by their listed identity', async () => {
    const MEMBER = 999_992;
    const kill = guardKill(MEMBER);
    let leader = 0;
    const runtime = await startNode('setTimeout(() => process.exit(0), 100)', 'exit-snapshot', {
      list: async () => [row(MEMBER, 1, leader, 'member start')],
    });
    leader = runtime.pid!;
    await runtime.waitForExit(5_000);
    const report = await runtime.terminate({ graceMs: 50, killWaitMs: 60 });
    // The fake member never dies, so the exit stays unconfirmed; what matters is that it was found and signalled.
    expect(report.confirmed).toBe(false);
    expect(report.survivors.map((p) => p.pid)).toEqual([MEMBER]);
    expect(kill.mock.calls.some(([pid, signal]) => pid === MEMBER && signal === 'SIGKILL')).toBe(true);
    expect(kill.mock.calls.filter(([pid]) => pid === -leader)).toEqual([]);
  });

  it('treats a group as ours after the exit-time listing failed only while no process owns the leader pid', async () => {
    const ORPHAN = 999_993;
    const kill = guardKill(ORPHAN);
    for (const leaderPidReused of [false, true]) {
      let leader = 0;
      let calls = 0;
      const runtime = await startNode('setTimeout(() => process.exit(0), 100)', 'failed-exit-listing', {
        list: async () => {
          if (++calls === 1) throw new Error('ps unavailable at the exit instant');
          return [row(ORPHAN, 1, leader, 'orphan start'), ...(leaderPidReused ? [row(leader, 1, leader, 'new leader')] : [])];
        },
      });
      leader = runtime.pid!;
      await runtime.waitForExit(5_000);
      const report = await runtime.terminate({ graceMs: 50, killWaitMs: 60 });
      if (leaderPidReused) {
        expect(report.survivors).toEqual([]);
        expect(report.confirmed).toBe(true);
      } else {
        expect(report.survivors.map((p) => p.pid)).toEqual([ORPHAN]);
        expect(report.confirmed).toBe(false);
      }
      expect(kill.mock.calls.filter(([pid]) => pid === leader)).toEqual([]);
    }
    expect(kill.mock.calls.filter(([pid]) => pid === ORPHAN).length).toBeGreaterThan(0);
  });

  it('adopts a child forked into the group after the exit only while a recorded member keeps the group alive', async () => {
    const MEMBER = 999_994;
    const FORKED = 999_995;
    const kill = guardKill(MEMBER, FORKED);
    for (const memberAlive of [true, false]) {
      let leader = 0;
      let later = false;
      const runtime = await startNode('setTimeout(() => process.exit(0), 100)', 'anchored-group', {
        list: async () => [
          ...(!later || memberAlive ? [row(MEMBER, leader, leader, 'member start')] : []),
          ...(later ? [row(FORKED, MEMBER, leader, 'forked start')] : []),
        ],
      });
      leader = runtime.pid!;
      await runtime.snapshotDescendants(); // the member is recorded while the leader still runs
      await runtime.waitForExit(5_000);
      later = true;
      const report = await runtime.terminate({ graceMs: 50, killWaitMs: 60 });
      const pids = report.survivors.map((p) => p.pid).sort();
      if (memberAlive) expect(pids).toEqual([MEMBER, FORKED]);
      else expect(pids).toEqual([]);
    }
    expect(kill.mock.calls.some(([pid, signal]) => pid === FORKED && signal === 'SIGKILL')).toBe(true);
  });

  it('does not signal the numeric group of an already exited Runtime through its ChildProcess-like view', async () => {
    const runtime = await startNode('process.exit(0)', 'exited-view');
    await runtime.waitForExit(5_000);
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    expect(runtime.processLike().kill('SIGTERM')).toBe(false);
    expect(kill.mock.calls.filter(([pid]) => Math.abs(pid) === runtime.pid)).toEqual([]);
  });

  it('only signals recorded descendants whose pid and start time still match, and retries an unconfirmed exit on the same handle', async () => {
    // Beyond the macOS pid range; the kill guard below keeps even a valid Linux pid untouched.
    const TARGET = 999_991;
    const realKill = process.kill.bind(process);
    const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => (pid === TARGET ? true : realKill(pid, signal)));
    try {
      let childPid = 0;
      let state: 'alive' | 'reused' | 'gone' = 'alive';
      const runtime = await startNode('setInterval(() => {}, 1000)', 'exact-identity', {
        list: async () => state === 'gone' ? [] : [{ pid: TARGET, ppid: childPid, pgid: 999_990, state: 'S',
          startedAt: state === 'alive' ? 'original start' : 'different start', command: 'recorded descendant' }],
      });
      childPid = runtime.pid!;
      const first = await runtime.terminate({ graceMs: 2_000, killWaitMs: 40 });
      expect(first).toMatchObject({ confirmed: false, forced: true });
      expect(first.survivors.map((p) => p.pid)).toEqual([TARGET]);
      const attempted = kill.mock.calls.filter(([pid]) => pid === TARGET).length;
      expect(attempted).toBeGreaterThan(0);
      // The pid is reused by an unrelated process (different start time): never signalled again.
      state = 'reused';
      const second = runtime.terminate({ graceMs: 100, killWaitMs: 40 });
      expect(second).not.toBe(first as unknown);
      expect(await second).toMatchObject({ confirmed: true, forced: false, survivors: [] });
      expect(kill.mock.calls.filter(([pid]) => pid === TARGET)).toHaveLength(attempted);
      expect(runtime.running).toBe(false);
    } finally {
      kill.mockRestore();
    }
  });

  it('does not leave grace or kill-wait timers behind when the Runtime exits first', async () => {
    const timers = () => process.getActiveResourcesInfo().filter((name) => name === 'Timeout').length;
    const runtime = await startNode('setInterval(() => {}, 1000)', 'timer-hygiene');
    const before = timers();
    const report = await runtime.terminate({ graceMs: 30_000, killWaitMs: 30_000 });
    expect(report).toMatchObject({ confirmed: true, forced: false });
    expect(timers()).toBeLessThanOrEqual(before);
  });

  it('runs in its own process group with line-framed stdio and bounded stderr', async () => {
    const runtime = await startNode(ECHO);
    const transport = runtime.lineTransport();
    const line = new Promise<string>((resolve) => transport.onLine(resolve));
    transport.send('ping');
    expect(JSON.parse(await line)).toEqual({ echo: 'ping' });
    const stderrSeen = new Promise<void>((resolve) => {
      if (runtime.stderrTail().length > 0) resolve();
      else runtime.onStderr(() => resolve());
    });
    await stderrSeen;
    expect(runtime.stderrTail().length).toBeLessThanOrEqual(64);
    expect(runtime.running).toBe(true);

    const report = await runtime.terminate({ graceMs: 1_000 });
    expect(report.confirmed).toBe(true);
    expect(report.forced).toBe(false);
    expect(report.exit?.expected).toBe(true);
  });

  it('maps a missing executable to not_installed', async () => {
    const error = await RuntimeProcess.start({
      command: '/nonexistent/definitely-not-a-cli',
      args: [],
      cwd: process.cwd(),
      env,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).code).toBe('not_installed');
  });

  it('detects an unexpected exit (crash) and keeps the stderr tail', async () => {
    const runtime = await startNode(`process.stderr.write('fatal: boom'); setTimeout(() => process.exit(3), 50);`);
    const info = await runtime.waitForExit(5_000);
    expect(info.expected).toBe(false);
    expect(info.code).toBe(3);
    expect(info.stderrTail).toContain('boom');
    expect(runtime.running).toBe(false);
  });

  it('escalates to SIGKILL and kills recorded descendants that left the process group', async () => {
    // The runtime ignores SIGTERM and starts a `sleep` in a new session (like a PTY command).
    const runtime = await startNode(`
      const { spawn } = require('node:child_process');
      process.on('SIGTERM', () => {});
      const c = spawn('sleep', ['60'], { detached: true, stdio: 'ignore' });
      process.stdout.write(String(c.pid) + '\\n');
      setInterval(() => {}, 1000);
    `);
    const transport = runtime.lineTransport();
    const sleepPid = Number(await new Promise<string>((resolve) => transport.onLine(resolve)));
    const descendants = await runtime.snapshotDescendants();
    const sleeper = descendants.find((d) => d.pid === sleepPid);
    expect(sleeper).toBeDefined();
    expect(sleeper!.pgid).not.toBe(runtime.pid);

    const report = await runtime.terminate({ graceMs: 200, killWaitMs: 3_000 });
    expect(report.forced).toBe(true);
    expect(report.confirmed).toBe(true);
    expect(report.descendants.map((d) => d.pid)).toContain(sleepPid);
    expect(await findAlive([identityOf(sleeper!)])).toEqual([]);
  });

  it('isolates crashes: killing one runtime leaves another working', async () => {
    const a = await startNode(ECHO, 'a');
    const b = await startNode(ECHO, 'b');
    process.kill(a.pid as number, 'SIGKILL');
    const exitA = await a.waitForExit(5_000);
    expect(exitA.expected).toBe(false);
    expect(exitA.signal).toBe('SIGKILL');

    const transportB = b.lineTransport();
    const reply = new Promise<string>((resolve) => transportB.onLine(resolve));
    transportB.send('still-alive');
    expect(JSON.parse(await reply)).toEqual({ echo: 'still-alive' });
    expect(b.running).toBe(true);
    expect(() => a.lineTransport().send('x')).toThrow();
  });

  it('terminate is idempotent and safe after exit', async () => {
    const runtime = await startNode(`setTimeout(() => process.exit(0), 10);`);
    await runtime.waitForExit(5_000);
    const first = runtime.terminate();
    const second = runtime.terminate();
    expect(first).toBe(second);
    const report = await first;
    expect(report.confirmed).toBe(true);
  });

  it('exposes a ChildProcess-like view whose kill marks the exit as expected', async () => {
    const runtime = await startNode(ECHO);
    const child = runtime.processLike();
    const exited = new Promise<[number | null, string | null]>((resolve) => child.once('exit', (code, signal) => resolve([code, signal])));
    child.kill('SIGTERM');
    const [, signal] = await exited;
    expect(signal).toBe('SIGTERM');
    expect((await runtime.exited).expected).toBe(true);
  });
});
