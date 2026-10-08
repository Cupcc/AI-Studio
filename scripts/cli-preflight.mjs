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
  return ps.stdout.split('\n').filter(line => line.includes(marker) && /python[\d.]*\s+-c/i.test(line))
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
  return { marker, command: `/usr/bin/python3 -c 'import time; print("${marker}", flush=True); time.sleep(47)'` };
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
async function codexChecks() {
  let c = new Codex();
  let id;
  await c.init();
  await check('codex.handshake', async () => {
    return { transport: 'stdio NDJSON', version: spawnSync('codex', ['--version'], { encoding: 'utf8' }).stdout.trim() };
  });
  await check('codex.model-catalog', async () => {
    const r = await c.request('model/list', {});
    assert(r.data?.length, 'Empty model catalog');
    return { count: r.data.length, default: r.data.find(x => x.isDefault)?.model, models: r.data.map(x => x.model) };
  });
  const marker = `STUDIO_${randomUUID().slice(0, 8)}`;
  await check('codex.create-stream-complete', async () => {
    const start = await c.start(); id = start.thread.id;
    const r = await c.turn(id, `Remember the marker ${marker}. Reply exactly ${marker}. Do not use any tools.`);
    assert(r.status === 'completed', JSON.stringify(r));
    assert(r.text.includes(marker), `Unexpected reply: ${r.text}`);
    assert(r.deltas > 0, 'No text deltas');
    return { id, cwd: start.thread.cwd, model: start.model, ...r };
  });
  await c.close();
  c = new Codex();
  await c.init();
  if (id) await check('codex.restart-resume', async () => {
    const resumed = await c.request('thread/resume', { threadId: id, cwd, sandbox: 'read-only', approvalPolicy: 'untrusted', approvalsReviewer: 'user' });
    const r = await c.turn(id, 'What marker did I give you earlier? Reply with only that marker. Do not use tools.');
    assert(resumed.thread.id === id && r.status === 'completed' && r.text.includes(marker), JSON.stringify(r));
    return { sameId: true, historyTurns: resumed.thread.turns?.length, ...r };
  });
  await check('codex.invalid-resume-and-health', async () => {
    let rejected = false;
    try { await c.request('thread/resume', { threadId: randomUUID() }); } catch { rejected = true; }
    assert(rejected, 'Invalid resume unexpectedly succeeded');
    const r = await c.request('model/list', {});
    assert(r.data?.length, 'Server unusable after error');
    return { rejected: true, serverAlive: true };
  });
  await check('codex.concurrent-session-isolation', async () => {
    const a = await c.start(); const b = await c.start({ cwd: otherCwd });
    const from = c.messages.length;
    const [ra, rb] = await Promise.all([
      c.turn(a.thread.id, 'Reply with only ALPHA_OK. Do not use tools.'),
      c.turn(b.thread.id, 'Reply with only BETA_OK. Do not use tools.'),
    ]);
    assert(ra.status === 'completed' && rb.status === 'completed' && ra.text.includes('ALPHA_OK') && rb.text.includes('BETA_OK'), JSON.stringify({ra, rb}));
    const lifecycle = c.messages.slice(from).filter(m => ['turn/started', 'turn/completed'].includes(m.method)).map(m => ({ method: m.method, threadId: m.params.threadId }));
    const firstDone = lifecycle.findIndex(x => x.method === 'turn/completed');
    assert(lifecycle.slice(0, firstDone).filter(x => x.method === 'turn/started').length === 2, 'Turns did not overlap');
    return { distinctIds: a.thread.id !== b.thread.id, separateCwd: a.thread.cwd !== b.thread.cwd, lifecycle };
  });
  await check('codex.approval-decline', async () => {
    const s = await c.start(); const from = c.messages.length;
    const work = c.turn(s.thread.id, 'Using your command execution tool, run this one command: /usr/bin/touch approval-probe.txt . Do not use any other tool. If permission is denied, stop and report denial.');
    work.catch(() => {});
    const approval = await c.wait(m => m.id !== undefined && m.method?.endsWith('/requestApproval') && m.params?.threadId === s.thread.id, from);
    await delay(1000);
    assert(!c.messages.slice(from).some(m => m.method === 'turn/completed' && m.params.threadId === s.thread.id), 'Turn ended before approval answer');
    c.send({ id: approval.id, result: { decision: 'decline' } });
    const r = await work;
    let exists = true; try { await readFile(join(cwd, 'approval-probe.txt')); } catch { exists = false; }
    assert(!exists, 'Denied command created file');
    return { method: approval.method, waitedForHost: true, deniedSideEffectAbsent: true, status: r.status };
  });
  await check('codex.interrupt-and-continue', async () => {
    const s = await c.start(); const from = c.messages.length;
    const r = await c.request('turn/start', { threadId: s.thread.id, input: [{ type: 'text', text: 'Write a very long numbered list of 10000 distinct testing ideas. Do not use tools.' }] });
    await c.wait(m => m.method === 'item/agentMessage/delta' && m.params?.threadId === s.thread.id, from);
    await c.request('turn/interrupt', { threadId: s.thread.id, turnId: r.turn.id });
    const done = await c.wait(m => m.method === 'turn/completed' && m.params?.threadId === s.thread.id && m.params?.turn?.id === r.turn.id, from);
    assert(done.params.turn.status === 'interrupted', `Unexpected status ${done.params.turn.status}`);
    const next = await c.turn(s.thread.id, 'Reply exactly AFTER_INTERRUPT_OK. Do not use tools.');
    assert(next.status === 'completed' && next.text.includes('AFTER_INTERRUPT_OK'), JSON.stringify(next));
    return { interrupted: true, sameSessionContinued: true };
  });
  await check('codex.question-and-answer', async () => {
    const s = await c.start(); const from = c.messages.length;
    const work = c.turn(s.thread.id,
      'Use request_user_input to ask me to choose one color: Blue or Green. Do not choose for me. After receiving the answer, reply with the chosen color and nothing else. Do not use other tools.',
      { collaborationMode: { mode: 'plan', settings: { model: s.model, reasoning_effort: null, developer_instructions: null } } });
    work.catch(() => {});
    const question = await c.wait(m => m.method === 'item/tool/requestUserInput' && m.params?.threadId === s.thread.id, from);
    await delay(1000);
    assert(!c.messages.slice(from).some(m => m.method === 'turn/completed' && m.params.threadId === s.thread.id), 'Turn ended before answer');
    const answers = Object.fromEntries(question.params.questions.map(q => [q.id, { answers: ['Blue'] }]));
    c.send({ id: question.id, result: { answers } });
    const r = await work;
    assert(r.status === 'completed' && r.text.includes('Blue'), JSON.stringify(r));
    return { method: question.method, questionCount: question.params.questions.length, waitedForHost: true, answerApplied: true };
  });
  await check('codex.crash-isolation-and-resume', async () => {
    const broken = new Codex(); await broken.init();
    try {
      const s = await broken.start(); const from = broken.messages.length;
      const turn = await broken.request('turn/start', { threadId: s.thread.id,
        input: [{ type: 'text', text: 'Write a very long numbered list of 10000 testing ideas. Do not use tools.' }] });
      await broken.wait(m => m.method === 'turn/started' && m.params?.turn?.id === turn.turn.id, from);
      broken.p.kill('SIGKILL');
      await bounded(new Promise(r => broken.p.once('exit', r)), 5000);
      const healthy = await c.start();
      const ok = await c.turn(healthy.thread.id, 'Reply exactly SURVIVOR_OK. Do not use tools.');
      assert(ok.status === 'completed' && ok.text.includes('SURVIVOR_OK'), JSON.stringify(ok));
      const restored = await c.request('thread/resume', { threadId: s.thread.id, cwd, sandbox: 'read-only', approvalPolicy: 'untrusted' });
      const next = await c.turn(s.thread.id, 'Reply exactly AFTER_CRASH_OK. Do not use tools.');
      assert(restored.thread.id === s.thread.id && next.status === 'completed' && next.text.includes('AFTER_CRASH_OK'), JSON.stringify(next));
      return { killedDuringTurn: true, otherProcessHealthy: true, sameIdRestored: true };
    } finally { await stop(broken.p); }
  });
  await check('codex.tool-interrupt', async () => {
    const s = await c.start(); const from = c.messages.length; const probe = makeProbe();
    const turn = await c.request('turn/start', { threadId: s.thread.id,
      input: [{ type: 'text', text: `Run exactly this command using the command tool: ${probe.command} . Do not use other tools or modify any files.` }] });
    const answered = new Set();
    const pids = await until(() => {
      for (const m of c.messages.slice(from)) {
        if (m.method?.endsWith('/requestApproval') && m.id !== undefined && !answered.has(m.id)) {
          answered.add(m.id);
          c.send({ id: m.id, result: { decision: String(m.params?.command).includes(probe.marker) ? 'accept' : 'decline' } });
        }
      }
      const pids = probePids(probe.marker); return pids.length ? pids : null;
    }, deadline);
    // Allow the process to finish startup before testing cancellation.
    await delay(1000);
    events.push({ at: Date.now(), provider: 'codex', type: 'tool_probe', phase: 'before-interrupt', processes: probeRows(probe.marker) });
    await c.request('turn/interrupt', { threadId: s.thread.id, turnId: turn.turn.id });
    const done = await c.wait(m => m.method === 'turn/completed' && m.params?.turn?.id === turn.turn.id, from);
    assert(done.params.turn.status === 'interrupted', `Unexpected status ${done.params.turn.status}`);
    try { await until(() => probePids(probe.marker).length === 0, 5000); }
    catch (e) {
      events.push({ at: Date.now(), provider: 'codex', type: 'tool_probe', phase: 'five-seconds-after-interrupt', processes: probeRows(probe.marker) });
      throw e;
    }
    return { startedPids: pids, interrupted: true, subprocessReaped: true };
  });
  await check('codex.tool-stop-runtime-fallback', async () => {
    const runtime = new Codex(); await runtime.init();
    const probe = makeProbe(); let s;
    try {
      s = await runtime.start(); const from = runtime.messages.length;
      const turn = await runtime.request('turn/start', { threadId: s.thread.id,
        input: [{ type: 'text', text: `Run exactly this command using the command tool: ${probe.command} . Do not use other tools or modify any files.` }] });
      const answered = new Set();
      await until(() => {
        for (const m of runtime.messages.slice(from)) if (m.method?.endsWith('/requestApproval') && m.id !== undefined && !answered.has(m.id)) {
          answered.add(m.id);
          runtime.send({ id: m.id, result: { decision: String(m.params?.command).includes(probe.marker) ? 'accept' : 'decline' } });
        }
        return probePids(probe.marker).length > 0;
      }, deadline);
      await runtime.request('turn/interrupt', { threadId: s.thread.id, turnId: turn.turn.id });
      await runtime.wait(m => m.method === 'turn/completed' && m.params?.turn?.id === turn.turn.id, from);
      await runtime.close();
      await until(() => probePids(probe.marker).length === 0, 5000);
      const resumed = await c.request('thread/resume', { threadId: s.thread.id, cwd, sandbox: 'read-only', approvalPolicy: 'untrusted' });
      const next = await c.turn(s.thread.id, 'Reply exactly AFTER_RUNTIME_STOP_OK. Do not use tools.');
      assert(resumed.thread.id === s.thread.id && next.status === 'completed' && next.text.includes('AFTER_RUNTIME_STOP_OK'), JSON.stringify(next));
      return { runtimeTerminated: true, subprocessReaped: true, sameSessionResumed: true, requiresIsolatedRuntime: true };
    } finally { await runtime.close(); }
  });
  await c.close();
}

class Inbox {
  values = []; waiters = []; ended = false;
  push(text) {
    const value = { type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null, session_id: '' };
    const r = this.waiters.shift(); if (r) r({ value, done: false }); else this.values.push(value);
  }
  end() { this.ended = true; for (const r of this.waiters.splice(0)) r({ done: true }); }
  [Symbol.asyncIterator]() { return this; }
  next() {
    if (this.values.length) return Promise.resolve({ value: this.values.shift(), done: false });
    if (this.ended) return Promise.resolve({ done: true });
    return new Promise(r => this.waiters.push(r));
  }
  return() { this.end(); return Promise.resolve({ done: true }); }
}
async function claudeChecks() {
  const sdkDir = flag('--sdk-dir');
  assert(sdkDir, '--sdk-dir must point to an installed @anthropic-ai/claude-agent-sdk package');
  const sdk = await import(pathToFileURL(join(resolve(sdkDir), 'sdk.mjs')).href);
  const cli = spawnSync('which', ['claude'], { encoding: 'utf8' }).stdout.trim();
  const base = { cwd, pathToClaudeCodeExecutable: cli, permissionMode: 'default', settingSources: [],
    tools: [], includePartialMessages: true, persistSession: true, maxTurns: 5,
    extraArgs: { 'strict-mcp-config': null, 'no-chrome': null },
    systemPrompt: 'This is a bounded integration test. Follow the synthetic test prompt. Do not create subagents or read unrelated files.',
  };
  // Preserve the SDK-provided environment; it contains protocol-specific flags.
  base.spawnClaudeCodeProcess = options => {
    const p = spawn(options.command, options.args, { cwd: options.cwd ?? cwd, env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    processes.add(p); p.once('exit', () => processes.delete(p)); return p;
  };
  class Claude {
    constructor(options = {}) {
      this.inbox = new Inbox(); this.messages = []; this.waiters = new Set();
      this.q = sdk.query({ prompt: this.inbox, options: { ...base, ...options } });
      this.pump = (async () => {
        try {
          for await (const m of this.q) {
            this.messages.push(m);
            const delta = m.type === 'stream_event' && m.event?.delta?.type === 'text_delta' ? m.event.delta.text : undefined;
            events.push({ at: Date.now(), provider: 'claude', type: m.type, subtype: m.subtype, sessionId: m.session_id,
              eventType: m.event?.type, delta: delta ? redact(delta) : undefined,
              result: m.type === 'result' ? { subtype: m.subtype, isError: m.is_error, errors: m.errors?.map(redact), text: redact(m.result ?? '') } : undefined });
            for (const w of [...this.waiters]) if (w.predicate(m)) { this.waiters.delete(w); w.resolve(m); }
          }
        } catch (e) { this.error = e; }
        finally { for (const w of this.waiters) w.reject(this.error ?? new Error('Claude stream closed')); this.waiters.clear(); }
      })();
    }
    wait(predicate, from = 0) {
      const found = this.messages.slice(from).find(predicate); if (found) return Promise.resolve(found);
      if (this.error) return Promise.reject(this.error);
      let w;
      return bounded(new Promise((resolve, reject) => { w = { predicate, resolve, reject }; this.waiters.add(w); })).finally(() => this.waiters.delete(w));
    }
    async turn(text) {
      const from = this.messages.length; this.inbox.push(text);
      const r = await this.wait(m => m.type === 'result', from);
      const slice = this.messages.slice(from);
      return { id: r.session_id, subtype: r.subtype, isError: r.is_error, text: r.result, errors: r.errors,
        deltas: slice.filter(m => m.type === 'stream_event' && m.event?.delta?.type === 'text_delta').length,
        permissionDenials: r.permission_denials?.length ?? 0 };
    }
    async close() { this.inbox.end(); this.q.close(); await bounded(this.pump, 5000).catch(() => {}); }
  }
  let c = new Claude(); let id;
  const marker = `STUDIO_${randomUUID().slice(0, 8)}`;
  await check('claude.model-catalog', async () => {
    const models = await bounded(c.q.supportedModels());
    assert(models.length, 'Empty model catalog');
    return { count: models.length, models: models.map(x => x.value) };
  });
  await check('claude.create-stream-complete', async () => {
    const r = await c.turn(`Remember the marker ${marker}. Reply exactly ${marker}. Do not use tools.`);
    id = r.id;
    assert(!r.isError && r.text?.includes(marker) && r.deltas > 0, JSON.stringify(r));
    return r;
  });
  await c.close();
  if (id) {
    c = new Claude({ resume: id });
    await check('claude.restart-resume', async () => {
      const r = await c.turn('What marker did I give you earlier? Reply with only that marker.');
      assert(r.id === id && !r.isError && r.text?.includes(marker), JSON.stringify(r)); return { sameId: true, ...r };
    });
    await c.close();
  }
  await check('claude.concurrent-session-isolation', async () => {
    const a = new Claude(); const b = new Claude({ cwd: otherCwd });
    try {
      const started = Date.now();
      const [ra, rb] = await Promise.all([a.turn('Reply exactly CLAUDE_ALPHA_OK.'), b.turn('Reply exactly CLAUDE_BETA_OK.')]);
      assert(!ra.isError && !rb.isError && ra.id !== rb.id && ra.text?.includes('CLAUDE_ALPHA_OK') && rb.text?.includes('CLAUDE_BETA_OK'), JSON.stringify({ ra, rb }));
      const frames = events.filter(x => x.provider === 'claude' && x.at >= started && x.type === 'stream_event' && x.eventType === 'message_start');
      return { distinctIds: true, simultaneousRequests: true, messageStartEvents: frames.length };
    } finally { await a.close(); await b.close(); }
  });
  await check('claude.approval-decline', async () => {
    let called; let answer;
    const approval = new Promise(r => { called = r; });
    const response = new Promise(r => { answer = r; });
    c = new Claude({ tools: ['Write'], canUseTool: async (tool, input) => {
      events.push({ at: Date.now(), provider: 'claude', type: 'host_approval', tool });
      called({ tool, path: input.file_path });
      return response;
    } });
    try {
      const work = c.turn('Use the Write tool to create approval-probe.txt containing APPROVAL_TEST. If denied, stop and report denial.');
      work.catch(() => {});
      const request = await bounded(approval);
      await delay(1000);
      assert(!c.messages.some(m => m.type === 'result'), 'Turn ended before host response');
      answer({ behavior: 'deny', message: 'Integration test: deny this synthetic write.' });
      const r = await work;
      let exists = true; try { await readFile(join(cwd, 'approval-probe.txt')); } catch { exists = false; }
      assert(!exists, 'Denied write created file');
      return { tool: request.tool, waitedForHost: true, deniedSideEffectAbsent: true, ...r };
    } finally { answer({ behavior: 'deny', message: 'Test cleanup.' }); await c.close(); }
  });
  await check('claude.interrupt-and-continue', async () => {
    c = new Claude();
    try {
      const from = c.messages.length;
      c.inbox.push('Write a very long numbered list of 10000 distinct testing ideas.');
      await c.wait(m => m.type === 'stream_event' && m.event?.delta?.type === 'text_delta', from);
      const receipt = await bounded(c.q.interrupt());
      const terminal = await c.wait(m => m.type === 'result', from);
      const next = await c.turn('Reply exactly AFTER_INTERRUPT_OK.');
      assert(!next.isError && next.text?.includes('AFTER_INTERRUPT_OK') && next.id === terminal.session_id, JSON.stringify(next));
      return { receipt, terminalSubtype: terminal.subtype, terminalIsError: terminal.is_error, sameSessionContinued: true };
    } finally { await c.close(); }
  });
  await check('claude.invalid-resume', async () => {
    c = new Claude({ resume: randomUUID() });
    try {
      let rejected = false; let detail;
      try { const r = await c.turn('Reply OK.'); detail = r; rejected = r.isError === true; }
      catch (e) { rejected = true; detail = redact(e.message); }
      assert(rejected, 'Invalid resume unexpectedly succeeded'); return { rejected, detail };
    } finally { await c.close(); }
  });
  await check('claude.question-and-answer', async () => {
    let asked; let answer;
    const question = new Promise(r => { asked = r; });
    const response = new Promise(r => { answer = r; });
    c = new Claude({ tools: ['AskUserQuestion'], canUseTool: async (tool, input) => {
      asked({ tool, input }); return response;
    } });
    try {
      const work = c.turn('Use AskUserQuestion to ask me to choose Blue or Green. Do not choose for me. After receiving my answer, reply with only the chosen color.');
      work.catch(() => {});
      const request = await bounded(question);
      assert(request.tool === 'AskUserQuestion', `Unexpected tool ${request.tool}`);
      await delay(1000);
      assert(!c.messages.some(m => m.type === 'result'), 'Turn ended before question answer');
      const answers = Object.fromEntries(request.input.questions.map(q => [q.question, 'Blue']));
      answer({ behavior: 'allow', updatedInput: { ...request.input, answers } });
      const r = await work;
      assert(!r.isError && r.text?.includes('Blue'), JSON.stringify(r));
      return { tool: request.tool, waitedForHost: true, answerApplied: true, id: r.id };
    } finally { answer({ behavior: 'deny', message: 'Test cleanup.' }); await c.close(); }
  });
  await check('claude.crash-isolation-and-resume', async () => {
    const before = new Set(processes);
    const broken = new Claude(); const healthy = new Claude();
    try {
      const from = broken.messages.length;
      const brokenWork = broken.turn('Write a very long numbered list of 10000 testing ideas.');
      brokenWork.catch(() => {});
      const init = await broken.wait(m => m.type === 'system' && m.subtype === 'init');
      await bounded(healthy.q.supportedModels());
      const brokenPid = [...processes].find(p => !before.has(p));
      await broken.wait(m => m.type === 'stream_event' && m.event?.type === 'message_start', from);
      brokenPid.kill('SIGKILL');
      await bounded(new Promise(r => brokenPid.once('exit', r)), 5000);
      const ok = await healthy.turn('Reply exactly SURVIVOR_OK.');
      assert(ok.id !== init.session_id && !ok.isError && ok.text?.includes('SURVIVOR_OK'), JSON.stringify(ok));
      const restored = new Claude({ resume: init.session_id });
      try {
        const next = await restored.turn('Reply exactly AFTER_CRASH_OK.');
        assert(next.id === init.session_id && !next.isError && next.text?.includes('AFTER_CRASH_OK'), JSON.stringify(next));
      } finally { await restored.close(); }
      return { killedDuringTurn: true, otherProcessHealthy: true, sameIdRestored: true };
    } finally { await broken.close(); await healthy.close(); }
  });
  await check('claude.tool-interrupt', async () => {
    const probe = makeProbe();
    c = new Claude({ tools: ['Bash'], canUseTool: async (tool, input) => {
      if (tool === 'Bash' && input.command === probe.command) return { behavior: 'allow', updatedInput: input };
      return { behavior: 'deny', message: 'Only the exact synthetic sleep probe is authorized.' };
    } });
    try {
      const from = c.messages.length;
      const work = c.turn(`Run exactly this command using Bash: ${probe.command} . Do not use other tools or modify files.`);
      work.catch(() => {});
      const pids = await until(() => { const pids = probePids(probe.marker); return pids.length ? pids : null; }, deadline);
      const receipt = await bounded(c.q.interrupt());
      const terminal = await c.wait(m => m.type === 'result', from);
      await until(() => probePids(probe.marker).length === 0, 5000);
      return { startedPids: pids, receipt, terminalSubtype: terminal.subtype, subprocessReaped: true };
    } finally { await c.close(); }
  });
}

try {
  console.log(JSON.stringify({ provider, out, cwd, startedAt: new Date().toISOString() }));
  if (provider === 'codex') await codexChecks();
  else if (provider === 'claude') await claudeChecks();
  else throw new Error(`Unknown provider: ${provider}`);
} catch (e) { record('harness', 'fail', redact(e.message)); }
finally {
  for (const p of processes) await stop(p);
  await writeFile(join(out, `${provider}-results.json`), JSON.stringify({ provider, at: new Date().toISOString(), results }, null, 2) + '\n');
  await writeFile(join(out, `${provider}-events.jsonl`), events.map(x => JSON.stringify(x)).join('\n') + '\n');
  console.log(JSON.stringify({ evidence: out, passed: results.filter(x => x.status === 'pass').length, failed: results.filter(x => x.status === 'fail').length }));
  process.exitCode = results.some(x => x.status === 'fail') ? 1 : 0;
}
