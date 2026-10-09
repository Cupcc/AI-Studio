import { randomUUID } from 'node:crypto';
import { mkdir, readdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ClaudeProvider } from '../../src/claude/index.js';
import { createScratchProject, hostEnvironmentForTests, realCliEnabled } from '../../src/testing/real-cli.js';
import { RuntimeProcess, type RuntimeHandle } from '../../src/core/runtime-process.js';
import { waitForExit, identityOf, type ProcessInfo } from '../../src/core/process-probe.js';
import { redactSecrets } from '../../src/core/redact.js';
import type { AdapterEvent, AdapterEventOf } from '../../src/events.js';
import type { AgentSession } from '../../src/provider.js';

const real = describe.skipIf(!realCliEnabled());
function recorder(session: AgentSession) {
  const events: AdapterEvent[] = [];
  session.subscribe((event) => {
    events.push(event);
    if (event.type === 'turn.completed' && event.outcome === 'failed') console.log(JSON.stringify({ check: 'native-failure',
      code: event.error?.code, nativeCode: event.error?.native?.code, message: redactSecrets(event.error?.message ?? '').slice(0, 400) }));
  });
  return events;
}
async function until<T>(read: () => T | undefined | false, timeoutMs = 90_000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) { const result = read(); if (result) return result; await new Promise((resolve) => setTimeout(resolve, 50)); }
  throw new Error('Timed out waiting for synthetic integration result');
}
async function turn(session: AgentSession, events: AdapterEvent[], text: string) {
  const { turnId } = await session.sendUserInput({ text });
  const end = await until(() => events.find((event): event is AdapterEventOf<'turn.completed'> => event.type === 'turn.completed' && event.turnId === turnId));
  const body = events.filter((event) => event.type === 'item.completed' && event.turnId === turnId && event.item.kind === 'assistant_message')
    .map((event) => event.type === 'item.completed' ? event.item.text ?? '' : '').join('\n');
  // Print only safe enum outcomes; failures do not dump SDK output or authentication details.
  console.log(JSON.stringify({ check: 'turn', outcome: end.outcome, code: end.error?.code, delta: events.some((event) => event.type === 'item.delta' && event.turnId === turnId) }));
  expect(end.outcome).toBe('completed');
  return { body, end };
}
async function transcriptFiles(home: string | undefined): Promise<string[]> {
  if (!home) return [];
  try { return (await readdir(join(home, '.claude', 'projects'), { recursive: true })).filter((path) => path.endsWith('.jsonl')).sort(); }
  catch { return []; }
}

real('Claude real CLI — explicit opt-in, temporary projects, bounded synthetic calls', () => {
  it('availability/catalog do not persist conversations; native project rules/skills, streaming, resume and model switch', async () => {
    const { cwd } = await createScratchProject('claude-provider');
    const ruleMarker = `RULE_${randomUUID().replaceAll('-', '')}`;
    const skillMarker = `SKILL_${randomUUID().replaceAll('-', '')}`;
    await writeFile(join(cwd, 'CLAUDE.md'), `# Synthetic adapter fixture\nWhen asked for the project codeword, the codeword is ${ruleMarker}.\n`);
    const skillDir = join(cwd, '.claude', 'skills', 'adapter-native-sentinel');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), `---\nname: adapter-native-sentinel\ndescription: Return the synthetic native skill marker when asked to test this skill.\n---\nThe synthetic native skill marker is ${skillMarker}. Return it when invoked.\n`);
    const environment = hostEnvironmentForTests();
    const provider = new ClaudeProvider();
    try {
      const availability = await provider.checkAvailability({ environment });
      expect(availability.status).toBe('available');
      const before = await transcriptFiles(environment.env.HOME);
      const models = await provider.listModels({ environment, cwd });
      const after = await transcriptFiles(environment.env.HOME);
      expect(after.filter((file) => !before.includes(file))).toEqual([]);
      expect(models.length).toBeGreaterThan(0);
      const model = models.find((m) => m.id === 'haiku')?.id ?? models[0]!.id;
      const sessionOptions = { cwd, environment, overrides: { model }, providerOptions: { maxTurns: 6, maxBudgetUsd: 0.8 } };
      const session = await provider.createSession(sessionOptions);
      const events = recorder(session);
      session.subscribe((event) => {
        if (event.type === 'input.requested' && event.request.kind === 'approval') void session.respondToInput(event.request.requestId, { kind: 'approval', optionId: 'deny', message: 'This synthetic fixture requires no write or command execution.' });
      });
      const first = await turn(session, events, 'Return the project codeword from CLAUDE.md and invoke the adapter-native-sentinel skill to return its marker. Do not write files or run commands. Return only those two markers.');
      expect(first.body.includes(ruleMarker)).toBe(true);
      expect(first.body.includes(skillMarker)).toBe(true);
      expect(events.some((event) => event.type === 'item.delta' && event.channel === 'text')).toBe(true);
      const id = session.nativeSessionId!; expect(id).toBeTruthy(); await session.dispose();
      const resumed = await provider.resumeSession({ ...sessionOptions, nativeSessionId: id }); const resumedEvents = recorder(resumed);
      const recall = await turn(resumed, resumedEvents, 'Without tools, repeat the two markers from our previous exchange. Only the markers.');
      expect(resumed.nativeSessionId).toBe(id); expect(recall.body.includes(ruleMarker)).toBe(true); expect(recall.body.includes(skillMarker)).toBe(true);
      const nextModel = models.find((m) => m.id === 'sonnet')?.id ?? model;
      await resumed.setModel(nextModel);
      const changed = await turn(resumed, resumedEvents, 'Reply exactly MODEL_SWITCH_OK. No tools.');
      expect(changed.body.includes('MODEL_SWITCH_OK')).toBe(true); expect(changed.end.model).toBeTruthy();
      expect(changed.end.model).not.toBe(first.end.model);
      console.log(JSON.stringify({ check: 'catalog-rules-skills-resume-model', modelCount: models.length, catalogWroteSession: false,
        rules: true, skills: true, resume: true, modelChanged: true }));
    } finally { await provider.dispose(); }
  });

  it('allows one synthetic command, verifies interrupt child exit, then continues original session', async () => {
    const { cwd } = await createScratchProject('claude-stop');
    const environment = hostEnvironmentForTests(); const runtimes: RuntimeHandle[] = [];
    const provider = new ClaudeProvider({ startRuntime: async (options) => { const runtime = await RuntimeProcess.start(options); runtimes.push(runtime); return runtime; } });
    const marker = `STOP_${randomUUID().replaceAll('-', '')}`;
    const pidFile = join(cwd, 'synthetic.pid');
    // Only this exact project-local test command is approved. No credential/config reads.
    const command = `python3 -c 'import os,time;open("synthetic.pid","w").write(str(os.getpid()));time.sleep(120)' ${marker}`;
    try {
      const session = await provider.createSession({ cwd, environment, overrides: { model: 'haiku', permissionMode: 'default' },
        providerOptions: { settingSources: [], tools: ['Bash'], maxTurns: 3, maxBudgetUsd: 0.5 } });
      const events = recorder(session); let approvals = 0;
      session.subscribe((event) => {
        if (event.type !== 'input.requested' || event.request.kind !== 'approval') return;
        const allow = event.request.command === command;
        if (allow) approvals++;
        void session.respondToInput(event.request.requestId, { kind: 'approval', optionId: allow ? 'allow' : 'deny' });
      });
      await session.sendUserInput({ text: `Run exactly this Bash command once and wait for completion. Do not change it or run other commands:\n${command}` });
      let observed: ProcessInfo | undefined;
      await until(() => {
        if (events.some((event) => event.type === 'turn.completed' && event.outcome === 'failed')) throw new Error('Synthetic command turn failed before launching');
        return events.some((event) => event.type === 'item.started' && event.item.kind === 'command');
      });
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline && !observed) {
        const children = await runtimes[0]!.snapshotDescendants(); observed = children.find((child) => child.command.includes(marker));
        if (!observed) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(observed !== undefined).toBe(true);
      expect(Number(await readFile(pidFile, 'utf8'))).toBe(observed!.pid);
      const id = session.nativeSessionId;
      const stop = await session.stop(); expect(stop.status).toBe('stopped'); expect(stop.summary?.cleanup).toBe('confirmed');
      expect((await waitForExit([identityOf(observed!)], { timeoutMs: 3000 })).exited).toBe(true);
      const continuation = await turn(session, events, 'Reply exactly STOP_CONTINUE_OK. No tools.');
      expect(continuation.body.includes('STOP_CONTINUE_OK')).toBe(true); expect(session.nativeSessionId).toBe(id);
      console.log(JSON.stringify({ check: 'approval-stop-process-continue', approvalCount: approvals, cleanup: stop.summary?.cleanup,
        processExited: true, nativeIdPreserved: true, runtimeRestarted: runtimes.length > 1 }));
    } finally { await provider.dispose(); }
  });
});
