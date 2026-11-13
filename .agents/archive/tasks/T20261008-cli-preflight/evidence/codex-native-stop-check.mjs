import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

// Development spike, not a production Adapter. Only synthetic prompts and fixtures.
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
};
const provider = flag('--provider', 'codex');
const out = resolve(flag('--out', await mkdtemp(join(tmpdir(), 'ai-studio-cli-'))));
await mkdir(out, { recursive: true });
const cwd = join(out, 'project with spaces');
const otherCwd = join(out, 'other project');
await mkdir(cwd, { recursive: true });
await mkdir(otherCwd, { recursive: true });
const results = [];
const events = [];
const processes = new Set();
const deadline = Number(flag('--timeout', '90000'));
const only = new RegExp(flag('--only', '.*'));
const delay = ms => new Promise(r => setTimeout(r, ms));
const redact = value => String(value)
  .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
  .replace(/\b(?:sk-|agt_code)[A-Za-z0-9_*-]+/g, '[redacted]')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]');
function record(label, status, detail) {
  const entry = { label, status, detail, at: new Date().toISOString() };
  results.push(entry);
  console.log(JSON.stringify(entry));
}
async function check(label, fn) {
  if (!only.test(label)) return;
  try { record(label, 'pass', await fn()); }
  catch (e) { record(label, 'fail', redact(e.message)); }
  finally {
    // Only terminate exact synthetic probes created by this harness.
    const markers = events.filter(e => e.type === 'tool_probe').flatMap(e => e.processes ?? [])
      .flatMap(row => row.command.match(/STUDIO_SLEEP_[a-f0-9]+/g) ?? []);
    for (const marker of new Set(markers)) for (const pid of probePids(marker)) {
      try { process.kill(pid, 'SIGTERM'); } catch {}
    }
  }
}
function assert(value, message) { if (!value) throw new Error(message); }
function probePids(marker) {
  return probeRows(marker).map(row => row.pid);
}
function probeRows(marker) {
  const ps = spawnSync('ps', ['-axo', 'pid=,args='], { encoding: 'utf8' });
  assert(ps.status === 0, 'Cannot inspect test subprocess');
  return ps.stdout.split('\n').filter(line => line.includes(marker) && /^\s*\d+\s+\S*python[\d.]*\s+-c\s/i.test(line))
    .map(line => ({ pid: Number(line.trim().split(/\s+/, 1)[0]), command: line.trim().replace(/^\d+\s+/, '') }));
}
async function until(predicate, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await predicate(); if (value) return value;
    await delay(200);
  }
  throw new Error(`Condition not reached after ${timeout}ms`);
}
function makeProbe() {
  const marker = `STUDIO_SLEEP_${randomUUID().replaceAll('-', '')}`;
  return { marker, command: `/usr/bin/python3 -c 'import time; print("${marker}", flush=True); time.sleep(120)'` };
}
function bounded(promise, timeout = deadline) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout);
  })]).finally(() => clearTimeout(timer));
}
function child(command, argv, directory) {
  const p = spawn(command, argv, { cwd: directory, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
  processes.add(p);
  p.once('exit', () => processes.delete(p));
  return p;
}
async function stop(p) {
  if (p.exitCode !== null || p.signalCode !== null) return;
  try { process.kill(-p.pid, 'SIGTERM'); } catch { p.kill('SIGTERM'); }
  await Promise.race([new Promise(r => p.once('exit', r)), delay(1500)]);
  // Reap remaining test descendants even when the parent has already exited.
  try { process.kill(-p.pid, 'SIGKILL'); } catch {}
}
function summarizeCodex(m) {
  const p = m.params ?? {};
  return {
    provider: 'codex', method: m.method, requestId: m.method && m.id !== undefined ? m.id : undefined,
    threadId: p.threadId ?? p.thread?.id, turnId: p.turnId ?? p.turn?.id,
    status: p.turn?.status ?? p.status?.type, itemType: p.item?.type,
    itemStatus: p.item?.status, exitCode: p.item?.exitCode,
    delta: m.method === 'item/agentMessage/delta' ? redact(p.delta) : undefined,
    error: m.method === 'error' ? redact(p.error?.message ?? '') : undefined,
  };
}
class Codex {
  constructor(directory = cwd) {
    this.p = child('codex', ['app-server', '--listen', 'stdio://', '-c', 'features.multi_agent=false'], directory);
    this.messages = [];
    this.waiters = new Set();
    this.pending = new Map();
    this.seq = 0;
    this.stderr = '';
    this.p.stderr.on('data', b => { this.stderr = (this.stderr + redact(b)).slice(-3000); });
    this.p.on('error', e => this.fail(e));
    this.p.on('exit', (code, signal) => this.fail(new Error(`app-server exited: ${code}/${signal}`)));
    createInterface({ input: this.p.stdout }).on('line', line => {
      let m;
      try { m = JSON.parse(line); } catch { return; }
      this.messages.push(m);
      if (m.method) events.push({ at: Date.now(), ...summarizeCodex(m) });
      if (m.id !== undefined && !m.method) {
        const callback = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) callback?.reject(new Error(redact(JSON.stringify(m.error))));
        else callback?.resolve(m.result);
      }
      for (const w of [...this.waiters]) if (w.predicate(m)) {
        this.waiters.delete(w); w.resolve(m);
      }
    });
  }
  fail(e) {
    for (const p of this.pending.values()) p.reject(e);
    this.pending.clear();
    for (const w of this.waiters) w.reject(e);
    this.waiters.clear();
  }
  send(m) { this.p.stdin.write(JSON.stringify(m) + '\n'); }
  request(method, params = {}) {
    const id = ++this.seq;
    const p = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.send({ id, method, params });
    return bounded(p).finally(() => this.pending.delete(id));
  }
  wait(predicate, from = 0, timeout = deadline) {
    const found = this.messages.slice(from).find(predicate);
    if (found) return Promise.resolve(found);
    let waiter;
    return bounded(new Promise((resolve, reject) => {
      waiter = { predicate, resolve, reject }; this.waiters.add(waiter);
    }), timeout).finally(() => this.waiters.delete(waiter));
  }
  async init() {
    const r = await this.request('initialize', {
      clientInfo: { name: 'ai_studio_preflight', title: 'AI Developer Studio Preflight', version: '0.1.0' },
      capabilities: { experimentalApi: true },
    });
    this.send({ method: 'initialized', params: {} });
    return r;
  }
  async start(options = {}) {
    return this.request('thread/start', {
      cwd, sandbox: 'read-only', approvalPolicy: 'untrusted', approvalsReviewer: 'user',
      developerInstructions: 'This is a bounded CLI integration check. Do not create subagents. Do not read credentials or unrelated files. Follow only the synthetic test prompt.',
      ...options,
    });
  }
  async turn(threadId, text, params = {}) {
    const from = this.messages.length;
    const r = await this.request('turn/start', { threadId, input: [{ type: 'text', text }], ...params });
    const done = await this.wait(m => m.method === 'turn/completed' && m.params?.threadId === threadId && m.params?.turn?.id === r.turn.id, from);
    const messages = this.messages.slice(from).filter(m => m.params?.threadId === threadId);
    const textResult = messages.filter(m => m.method === 'item/completed' && m.params.item?.type === 'agentMessage').map(m => m.params.item.text).join('\n');
    return { status: done.params.turn.status, error: done.params.turn.error, text: textResult,
      deltas: messages.filter(m => m.method === 'item/agentMessage/delta').length, turnId: r.turn.id };
  }
  async close() { await stop(this.p); }
}

async function nativeStopCheck() {
  const c = new Codex();
  const probes = [];
  try {
    await c.init();
    await check('codex.native-stop-clean-terminate-isolation', async () => {
      async function launchProbe(label) {
        const probe = makeProbe();
        probes.push(probe);
        const s = await c.start();
        const from = c.messages.length;
        const turn = await c.request('turn/start', { threadId: s.thread.id,
          input: [{ type: 'text', text: `Remember ${probe.marker}. Run exactly this command using the command tool: ${probe.command} . Do not use other tools, create subagents, read unrelated files, or modify any files.` }] });
        const answered = new Set();
        await until(() => {
          for (const m of c.messages.slice(from)) {
            if (m.method?.endsWith('/requestApproval') && m.id !== undefined && !answered.has(m.id)) {
              answered.add(m.id);
              console.log(JSON.stringify({stage: label + '.approval', command: m.params?.command}));
              c.send({ id: m.id, result: { decision: String(m.params?.command).includes(probe.marker) && String(m.params?.command).includes('time.sleep(120)') ? 'accept' : 'decline' } });
            }
          }
          return probePids(probe.marker).length > 0;
        }, deadline);
        await delay(1000);
        events.push({ at: Date.now(), provider: 'codex', type: 'tool_probe', label, phase: 'started', processes: probeRows(probe.marker) });
        console.log(JSON.stringify({ stage: label + '.started', threadId: s.thread.id, turnId: turn.turn.id }));
        return { probe, s, from, turn };
      }
      async function interrupt(run) {
        await c.request('turn/interrupt', { threadId: run.s.thread.id, turnId: run.turn.turn.id });
        const done = await c.wait(m => m.method === 'turn/completed' && m.params?.turn?.id === run.turn.turn.id, run.from);
        assert(done.params.turn.status === 'interrupted', 'Expected interrupted terminal status');
      }
      const runtimePid = c.p.pid;
      const victim = await launchProbe('victim');
      await interrupt(victim);
      await delay(1000);
      const victimBefore = await c.request('thread/backgroundTerminals/list', { threadId: victim.s.thread.id });
      assert(probePids(victim.probe.marker).length > 0, 'Probe already exited after turn interrupt');
      assert(victimBefore.data?.some(t => t.command.includes(victim.probe.marker)), 'Interrupted probe absent from native background terminal list');
      console.log(JSON.stringify({ stage: 'victim.interrupted-but-process-alive', backgroundCount: victimBefore.data.length }));

      const survivor = await launchProbe('survivor');
      const startedCleanup = Date.now();
      const cleanReply = await c.request('thread/backgroundTerminals/clean', { threadId: victim.s.thread.id });
      await until(() => probePids(victim.probe.marker).length === 0, 5000);
      const cleanLatencyMs = Date.now() - startedCleanup;
      const victimAfter = await c.request('thread/backgroundTerminals/list', { threadId: victim.s.thread.id });
      assert(victimAfter.data?.length === 0, 'Native terminal list not empty after clean');
      assert(probePids(survivor.probe.marker).length > 0, 'Cleaning victim stopped survivor subprocess');
      const survivorState = await c.request('thread/read', { threadId: survivor.s.thread.id });
      assert(survivorState.thread.status?.type === 'active', 'Survivor turn not active after victim cleanup');
      console.log(JSON.stringify({ stage: 'victim.cleaned-survivor-still-active', cleanLatencyMs }));

      await interrupt(survivor);
      const survivorBefore = await c.request('thread/backgroundTerminals/list', { threadId: survivor.s.thread.id });
      const terminal = survivorBefore.data?.find(t => t.command.includes(survivor.probe.marker));
      assert(terminal, 'Survivor terminal absent from native terminal list');
      const terminateStarted = Date.now();
      const terminateReply = await c.request('thread/backgroundTerminals/terminate', { threadId: survivor.s.thread.id, processId: terminal.processId });
      assert(terminateReply.terminated === true, 'Native terminate returned false');
      await until(() => probePids(survivor.probe.marker).length === 0, 5000);
      const terminateLatencyMs = Date.now() - terminateStarted;
      const survivorAfter = await c.request('thread/backgroundTerminals/list', { threadId: survivor.s.thread.id });
      assert(survivorAfter.data?.length === 0, 'Native terminal list not empty after terminate');

      for (const run of [victim, survivor]) {
        const next = await c.turn(run.s.thread.id, 'What marker did I tell you to remember? Reply with only that marker. Do not use tools.');
        assert(next.status === 'completed' && next.text.includes(run.probe.marker), 'Original thread continuation lost context');
      }
      assert(c.p.pid === runtimePid && c.p.exitCode === null && c.p.signalCode === null, 'Runtime restarted or exited during cleanup');
      return { cliVersion: spawnSync('codex', ['--version'], { encoding: 'utf8' }).stdout.trim(),
        turnInterruptPreservedBackground: true, cleanReply, cleanLatencyMs,
        cleanedThreadNativeListEmpty: true, cleanedThreadOsProbeExited: true,
        otherThreadStillActive: true, otherThreadProbePreserved: true,
        terminateReply, terminateLatencyMs, terminatedThreadOsProbeExited: true,
        sameRuntimeContinued: true, originalThreadContextPreserved: true };
    });
  } finally {
    // Clean only the synthetic probes made by this run, regardless of native API outcome.
    for (const probe of probes) for (const pid of probePids(probe.marker)) {
      try { process.kill(pid, 'SIGKILL'); } catch {}
    }
    await c.close();
  }
}

try {
  console.log(JSON.stringify({ provider, out, cwd, startedAt: new Date().toISOString() }));
  await nativeStopCheck();
} catch (e) { record('harness', 'fail', redact(e.message)); }
finally {
  for (const p of processes) await stop(p);
  await writeFile(join(out, 'codex-results.json'), JSON.stringify({ provider, at: new Date().toISOString(), results }, null, 2) + '\n');
  await writeFile(join(out, 'codex-events.jsonl'), events.map(x => JSON.stringify(x)).join('\n') + '\n');
  console.log(JSON.stringify({ evidence: out, passed: results.filter(x => x.status === 'pass').length, failed: results.filter(x => x.status === 'fail').length }));
  process.exitCode = results.some(x => x.status === 'fail') ? 1 : 0;
}
