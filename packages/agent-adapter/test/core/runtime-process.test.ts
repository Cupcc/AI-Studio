import { afterEach, describe, expect, it } from 'vitest';
import { findAlive, identityOf } from '../../src/core/process-probe.js';
import { RuntimeProcess } from '../../src/core/runtime-process.js';
import { AdapterError } from '../../src/errors.js';

const env = { PATH: process.env.PATH ?? '/usr/bin:/bin' };
const runtimes: RuntimeProcess[] = [];

async function startNode(script: string, label = 'node-test'): Promise<RuntimeProcess> {
  const runtime = await RuntimeProcess.start({
    command: process.execPath,
    args: ['-e', script],
    cwd: process.cwd(),
    env,
    label,
    stderrLimitBytes: 64,
  });
  runtimes.push(runtime);
  return runtime;
}

afterEach(async () => {
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
