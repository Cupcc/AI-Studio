import { randomUUID } from 'node:crypto';
import { access, mkdir, readdir, writeFile, readFile } from 'node:fs/promises';
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
  const startedAt = Date.now();
  session.subscribe((event) => {
    events.push(event);
    // Opt-in diagnostics contain only protocol enums/counts, never prompt, response or tool content.
    if (process.env.AI_STUDIO_CLAUDE_TRACE === '1' && event.type !== 'item.delta') {
      console.log(JSON.stringify({ check: 'protocol-event', atMs: Date.now() - startedAt, sessionId: session.sessionId,
        type: event.type,
        ...(event.type === 'session.state' ? { state: event.state } : {}),
        ...(event.type === 'input.requested' ? { kind: event.request.kind, nativeType: event.request.nativeType } : {}),
        ...(event.type === 'input.resolved' ? { resolution: event.resolution.status } : {}),
        ...(event.type === 'turn.completed' ? { outcome: event.outcome, code: event.error?.code } : {}),
        ...(event.type === 'item.started' || event.type === 'item.completed' ? { itemKind: event.item.kind } : {}) }));
    }
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
      let observed: ProcessInfo[] = [];
      let commandPid = 0;
      await until(() => {
        if (events.some((event) => event.type === 'turn.completed' && event.outcome === 'failed')) throw new Error('Synthetic command turn failed before launching');
        return events.some((event) => event.type === 'item.started' && event.item.kind === 'command');
      });
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline && !observed.length) {
        const children = await runtimes[0]!.snapshotDescendants();
        commandPid = Number(await readFile(pidFile, 'utf8').catch(() => '')) || 0;
        // CLI 2.1.310 can run the command through a wrapper shell whose argv also carries the marker:
        // track the command process itself (pid file) and every marked descendant.
        const matches = children.filter((child) => child.pid === commandPid || child.command.includes(marker));
        if (commandPid && matches.some((child) => child.pid === commandPid)) observed = matches;
        else await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(observed.some((child) => child.pid === commandPid)).toBe(true);
      const id = session.nativeSessionId;
      const stop = await session.stop(); expect(stop.status).toBe('stopped'); expect(stop.summary?.cleanup).toBe('confirmed');
      expect((await waitForExit(observed.map(identityOf), { timeoutMs: 3000 })).exited).toBe(true);
      const continuation = await turn(session, events, 'Reply exactly STOP_CONTINUE_OK. No tools.');
      expect(continuation.body.includes('STOP_CONTINUE_OK')).toBe(true); expect(session.nativeSessionId).toBe(id);
      console.log(JSON.stringify({ check: 'approval-stop-process-continue', approvalCount: approvals, cleanup: stop.summary?.cleanup,
        processExited: true, trackedProcesses: observed.length, nativeIdPreserved: true, runtimeRestarted: runtimes.length > 1 }));
    } finally { await provider.dispose(); }
  });

  it('applies the selected reasoning effort to the next turn (Bash sees CLAUDE_EFFORT) and null restores the model default', async () => {
    const { cwd } = await createScratchProject('claude-effort');
    const environment = hostEnvironmentForTests(); const provider = new ClaudeProvider();
    // Only this exact command is approved; it prints a non-sensitive level name.
    const command = 'printenv CLAUDE_EFFORT || echo UNSET';
    try {
      const session = await provider.createSession({ cwd, environment, overrides: { model: 'haiku', permissionMode: 'default' },
        providerOptions: { settingSources: [], tools: ['Bash'], maxTurns: 3, maxBudgetUsd: 0.3 } });
      const events = recorder(session);
      session.subscribe((event) => {
        if (event.type !== 'input.requested' || event.request.kind !== 'approval') return;
        void session.respondToInput(event.request.requestId, { kind: 'approval', optionId: event.request.command === command ? 'allow' : 'deny' });
      });
      const observe = async (): Promise<string> => {
        const { turnId } = await session.sendUserInput({ text: `Run exactly this Bash command once and reply with nothing else:\n${command}` });
        const end = await until(() => events.find((event): event is AdapterEventOf<'turn.completed'> => event.type === 'turn.completed' && event.turnId === turnId));
        expect(end.outcome).toBe('completed');
        const ran = events.find((event): event is AdapterEventOf<'item.completed'> => event.type === 'item.completed' && event.turnId === turnId && event.item.kind === 'command');
        return (ran?.item.command?.output ?? '').trim();
      };
      await session.setReasoningEffort('low'); const low = await observe();
      await session.setReasoningEffort('max'); const max = await observe();
      await session.setReasoningEffort(null); const reset = await observe();
      // Only enumerated level names are printed.
      console.log(JSON.stringify({ check: 'effort-applied', low, max, reset }));
      expect(low).toBe('low'); expect(max).toBe('max');
      expect(reset).not.toBe('max'); expect(reset).not.toBe('UNSET');
    } finally { await provider.dispose(); }
  });

  it('answers a real AskUserQuestion from the card and from composer text (Needs Input)', async () => {
    const { cwd } = await createScratchProject('claude-question');
    const environment = hostEnvironmentForTests(); const provider = new ClaudeProvider();
    const answerFromCard = new Set<string>();
    try {
      const session = await provider.createSession({ cwd, environment, overrides: { model: 'haiku', permissionMode: 'default' },
        providerOptions: { settingSources: [], tools: ['AskUserQuestion'], maxTurns: 4, maxBudgetUsd: 0.4 } });
      const events = recorder(session);
      session.subscribe((event) => {
        if (event.type !== 'input.requested' || event.request.kind !== 'question' || !answerFromCard.size) return;
        const question = event.request.questions[0]!;
        const option = question.options.find((entry) => entry.label.toLowerCase().includes('banana'));
        if (option) void session.respondToInput(event.request.requestId, { kind: 'answers', answers: { [question.id]: { optionIds: [option.id] } } });
      });
      const ask = 'Use the AskUserQuestion tool exactly once to ask which fruit I prefer (options: Apple and Banana). Then reply with only the chosen fruit in UPPERCASE.';
      answerFromCard.add('banana');
      const first = await turn(session, events, ask);
      expect(first.body.toUpperCase()).toContain('BANANA');
      answerFromCard.clear();
      const requested = events.length;
      const { turnId } = await session.sendUserInput({ text: ask });
      const request = await until(() => session.pendingInputs.find((pending) => pending.kind === 'question'));
      expect(request.kind).toBe('question');
      // A single free-text-capable question takes the composer text as its answer.
      expect(await session.replyWithText('Cherry')).toMatchObject({ disposition: 'answered' });
      const end = await until(() => events.slice(requested).find((event): event is AdapterEventOf<'turn.completed'> => event.type === 'turn.completed' && event.turnId === turnId));
      expect(end.outcome).toBe('completed');
      const body = events.filter((event) => event.type === 'item.completed' && event.turnId === turnId && event.item.kind === 'assistant_message')
        .map((event) => event.type === 'item.completed' ? event.item.text ?? '' : '').join('\n');
      expect(body.toUpperCase()).toContain('CHERRY');
      console.log(JSON.stringify({ check: 'question-card-and-text', card: true, text: true }));
    } finally { await provider.dispose(); }
  });

  it('declines a pending real approval with composer text and the agent continues with it (I-Q2)', async () => {
    const { cwd } = await createScratchProject('claude-decline');
    const environment = hostEnvironmentForTests(); const provider = new ClaudeProvider();
    const marker = `DECLINED_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    // A write needs approval in default mode (read-only commands such as echo are allowed natively).
    const command = 'touch declined-command-ran.txt';
    let requested = false;
    try {
      const session = await provider.createSession({ cwd, environment, overrides: { model: 'haiku', permissionMode: 'default' },
        providerOptions: { settingSources: [], tools: ['Bash'], maxTurns: 3, maxBudgetUsd: 0.3 } });
      const events = recorder(session);
      session.subscribe((event) => { if (event.type === 'input.requested' && event.request.kind === 'approval') requested = true; });
      // The original human prompt asks the model to report denial data. A denial message is a
      // tool result, so using it to issue a new "reply exactly" instruction tests the model's
      // treatment of tool-output instructions rather than whether our text reached the CLI.
      const { turnId } = await session.sendUserInput({ text: `Run exactly this Bash command once and do not change it:\n${command}\nIf permission is denied, do not retry. Report the user's reason for denying it.` });
      const approval = await until(() => session.pendingInputs.find((pending) => pending.kind === 'approval'));
      expect(approval.kind === 'approval' && approval.command).toBe(command);
      expect(await session.replyWithText(`Do not run it. My reason for denying this command is ${marker}.`)).toMatchObject({ disposition: 'declined' });
      const end = await until(() => {
        if (session.pendingInputs.length) throw new Error('Claude requested additional input after the synthetic denial; it remains unapproved');
        return events.find((event): event is AdapterEventOf<'turn.completed'> => event.type === 'turn.completed' && event.turnId === turnId);
      }).catch((error: unknown) => {
        console.log(JSON.stringify({ check: 'approval-decline-incomplete', state: session.state,
          pending: session.pendingInputs.map((pending) => ({ kind: pending.kind, nativeType: pending.nativeType })),
          approvalRequests: events.filter((event) => event.type === 'input.requested' && event.request.kind === 'approval').length }));
        throw error;
      });
      expect(end.outcome).toBe('completed');
      const body = events.filter((event) => event.type === 'item.completed' && event.turnId === turnId && event.item.kind === 'assistant_message')
        .map((event) => event.type === 'item.completed' ? event.item.text ?? '' : '').join('\n');
      expect(body).toContain(marker);
      expect(events.some((event) => event.type === 'input.resolved' && event.resolution.status === 'declined_with_text')).toBe(true);
      await expect(access(join(cwd, 'declined-command-ran.txt'))).rejects.toThrow();
      console.log(JSON.stringify({ check: 'approval-declined-with-text', requested, agentUsedText: true }));
    } finally { await provider.dispose(); }
  });

  it('runs two Claude sessions concurrently; Stop of one leaves the other usable (AC-03 Adapter part)', async () => {
    const a = await createScratchProject('claude-concurrent-a'); const b = await createScratchProject('claude-concurrent-b');
    const environment = hostEnvironmentForTests(); const runtimes: RuntimeHandle[] = [];
    const provider = new ClaudeProvider({ startRuntime: async (options) => { const runtime = await RuntimeProcess.start(options); runtimes.push(runtime); return runtime; } });
    const marker = `CONC_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const sleeper = `python3 -c 'import os,time;open("synthetic.pid","w").write(str(os.getpid()));time.sleep(120)' ${marker}`;
    try {
      const options = { environment, overrides: { model: 'haiku', permissionMode: 'default' }, providerOptions: { settingSources: [], tools: ['Bash'], maxTurns: 3, maxBudgetUsd: 0.4 } };
      const sessionA = await provider.createSession({ cwd: a.cwd, ...options }); const sessionB = await provider.createSession({ cwd: b.cwd, ...options });
      const eventsA = recorder(sessionA); const eventsB = recorder(sessionB);
      sessionA.subscribe((event) => {
        if (event.type === 'input.requested' && event.request.kind === 'approval') void sessionA.respondToInput(event.request.requestId, { kind: 'approval', optionId: event.request.command === sleeper ? 'allow' : 'deny' });
      });
      await sessionA.sendUserInput({ text: `Run exactly this Bash command once and wait for completion:\n${sleeper}` });
      await until(() => eventsA.some((event) => event.type === 'item.started' && event.item.kind === 'command'));
      expect(sessionA.state).toBe('running');
      // B completes while A is still running its long command.
      const second = await turn(sessionB, eventsB, `Reply exactly ${marker}_B. No tools.`);
      expect(second.body).toContain(`${marker}_B`);
      expect(sessionA.state).toBe('running'); expect(runtimes).toHaveLength(2);
      const stop = await sessionA.stop(); expect(stop.status).toBe('stopped'); expect(stop.summary?.cleanup).toBe('confirmed');
      expect(sessionB.state).toBe('idle');
      expect(eventsB.some((event) => event.type === 'turn.completed' && event.outcome === 'interrupted')).toBe(false);
      const again = await turn(sessionB, eventsB, `Reply exactly ${marker}_B2. No tools.`);
      expect(again.body).toContain(`${marker}_B2`);
      console.log(JSON.stringify({ check: 'concurrent-stop-isolated', runtimes: runtimes.length, stopCleanup: stop.summary?.cleanup, otherIdle: true }));
    } finally { await provider.dispose(); }
  });
});
