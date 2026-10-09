import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodexProvider } from '../../src/codex/index.js';
import type { AgentSession, CreateSessionOptions } from '../../src/provider.js';
import { EventRecorder } from '../../src/testing/event-recorder.js';
import { createScratchProject, hostEnvironmentForTests, realCliEnabled } from '../../src/testing/real-cli.js';
import { defaultProcessLister, identityOf, signalProcesses, waitForExit, type ProcessInfo } from '../../src/core/process-probe.js';

// Exactly six inference turns at most; no retries. Explicit model/effort restriction
// follows the 2026-10-09 parent/user delegation for this task's real CLI checks.
describe.skipIf(!realCliEnabled() || process.env.AI_STUDIO_CODEX_STOP_ONLY === '1')('Codex real CLI (opt-in, synthetic /tmp projects)', () => {
  it('preserves context, delivers declined text, and stops current commands while retaining an earlier service', async () => {
    const provider = new CodexProvider();
    const scratch = await createScratchProject('codex-provider');
    const marker = `ADAPTER_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const oldMarker = `${marker}_OLD`;
    const currentMarker = `${marker}_CURRENT`;
    const remembered = `${marker}_MEMORY`;
    const selected = 'gpt-6-astra';
    const safeCommands = new Set([oldMarker, currentMarker]);
    const identities: ProcessInfo[] = [];
    const results: Record<string, unknown> = { model: selected, effort: 'high', protocol: '0.161.0', turnsSubmitted: 0 };
    const opts: CreateSessionOptions = { cwd: scratch.cwd, environment: hostEnvironmentForTests(),
      overrides: { model: selected, approvalPolicy: 'untrusted', sandboxMode: 'read-only' },
      providerOptions: { effort: 'high', config: { approvals_reviewer: 'user' } },
      timeouts: { startupMs: 30_000, requestMs: 30_000, terminalMs: 15_000, cleanupMs: 10_000 } };
    let session: AgentSession | undefined;
    let unsubscribe: (() => void) | undefined;
    const send = async (text: string) => {
      if (Number(results.turnsSubmitted) >= 6) throw new Error('Real CLI turn budget exhausted');
      results.turnsSubmitted = Number(results.turnsSubmitted) + 1;
      return session!.sendUserInput({ text });
    };
    const textOf = (recorder: EventRecorder) => recorder.ofType('item.completed').filter((e) => e.item.kind === 'assistant_message').map((e) => e.item.text ?? '').join('\n');
    const successful = async (recorder: EventRecorder, turnId: string) => {
      const end = await recorder.waitFor('turn.completed', (event) => event.turnId === turnId, 90_000);
      if (end.outcome !== 'completed') throw new Error(`Codex integration blocked: ${end.error?.code ?? end.outcome}`);
      return end;
    };
    const probe = async (token: string): Promise<ProcessInfo[]> => (await defaultProcessLister.list()).filter((p) =>
      /(?:^|\s)(?:\S*\/)?python[\d.]*\s+-c\s/i.test(p.command) && p.command.includes(token) && !p.state.startsWith('Z'));
    const waitProbe = async (token: string, recorder: EventRecorder, turnId: string) => {
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        const end = recorder.ofType('turn.completed').find((e) => e.turnId === turnId);
        if (end && end.outcome !== 'completed') throw new Error(`Codex integration blocked: ${end.error?.code ?? end.outcome}`);
        const processes = await probe(token);
        if (processes.length) { identities.push(...processes); return processes; }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error('Synthetic command did not start');
    };
    try {
      const availability = await provider.checkAvailability({ environment: opts.environment });
      expect(availability.status).toBe('available');
      const models = await provider.listModels({ environment: opts.environment, cwd: scratch.cwd });
      results.catalogRead = models.length > 0;
      expect(models.some((m) => m.id === selected)).toBe(true);
      session = await provider.createSession(opts);
      let recorder = new EventRecorder(session);
      let sent = await send(`Remember this synthetic marker for this conversation: ${remembered}. Reply with only that marker. Do not use tools or create subagents.`);
      await successful(recorder, sent.turnId);
      expect(textOf(recorder)).toContain(remembered);
      results.streamed = recorder.ofType('item.delta').some((event) => event.channel === 'text');
      const id = session.nativeSessionId!;
      const originalPid = recorder.ofType('runtime.started')[0]?.pid;
      await session.dispose(); recorder.dispose();
      session = await provider.resumeSession({ ...opts, nativeSessionId: id });
      recorder = new EventRecorder(session);
      sent = await send('What synthetic memory marker did I ask you to remember? Reply with only that marker. Do not use tools or create subagents.');
      await successful(recorder, sent.turnId);
      expect(textOf(recorder)).toContain(remembered);
      expect(session.nativeSessionId).toBe(id);
      expect(recorder.ofType('runtime.started')[0]?.pid).not.toBe(originalPid);
      results.crossRuntimeResumeContext = true;
      recorder.clear();

      // A-Q4: keep approval pending, queue text by turn/steer, then deny callback.
      sent = await send('Using only the command tool, run exactly /usr/bin/touch approval-probe.txt . If permission is denied, do not retry. Do not create subagents.');
      const pending = await Promise.race([
        recorder.waitFor('input.requested', (event) => event.turnId === sent.turnId, 90_000),
        recorder.waitFor('turn.completed', (event) => event.turnId === sent.turnId, 90_000).then((end) => {
          throw new Error(`Approval was not requested: ${end.error?.code ?? end.outcome}`);
        }),
      ]);
      expect(pending.request.kind).toBe('approval');
      const delivered = `${marker}_DELIVERED`;
      await session.replyWithText(`Decline that operation. Do not run any tool. Reply exactly ${delivered}.`);
      await successful(recorder, sent.turnId);
      expect(textOf(recorder)).toContain(delivered);
      await expect(access(join(scratch.cwd, 'approval-probe.txt'))).rejects.toBeDefined();
      results.sameTurnDeclineTextDelivered = true;
      recorder.clear();

      unsubscribe = session.subscribe((event) => {
        if (event.type !== 'input.requested' || event.request.kind !== 'approval') return;
        const request = event.request;
        const allowed = [...safeCommands].some((token) => request.command?.includes(token)) && Boolean(request.command?.includes('time.sleep(240)'));
        const option = request.options.find((o) => o.intent === (allowed ? 'allow' : 'deny'));
        if (option) void session!.respondToInput(request.requestId, { kind: 'approval', optionId: option.id }).catch(() => {});
      });
      const oldCommand = `/usr/bin/python3 -c 'import time; print("${oldMarker}", flush=True); time.sleep(240)'`;
      sent = await send(`Run exactly this command using exec_command with yield_time_ms=1000: ${oldCommand}. When it yields a running session, leave it running and immediately reply BACKGROUND_READY. Do not call write_stdin, wait, kill, or any other tool. Do not create subagents or read/write files.`);
      const older = await waitProbe(oldMarker, recorder, sent.turnId);
      await successful(recorder, sent.turnId);
      results.earlierServiceStarted = older.length > 0;
      recorder.clear();
      const currentCommand = `/usr/bin/python3 -c 'import time; print("${currentMarker}", flush=True); time.sleep(240)'`;
      sent = await send(`Run exactly this command using exec_command: ${currentCommand}. Keep waiting for it with write_stdin after it yields; do not return a final message before it finishes. Do not signal any process, create subagents, or read/write files.`);
      const current = await waitProbe(currentMarker, recorder, sent.turnId);
      const stop = await session.stop();
      expect(stop.status).toBe('stopped');
      expect(stop.summary?.cleanup).toBe('confirmed');
      expect((await waitForExit(current.map(identityOf), { timeoutMs: 1000 })).exited).toBe(true);
      expect((await probe(oldMarker)).length).toBeGreaterThan(0);
      results.preciseStop = true;
      results.earlierServicePreserved = true;
      results.stopCleanup = stop.summary?.cleanup;
      recorder.clear();
      sent = await send('Reply only with the synthetic memory marker from the start of our conversation. Do not use tools or create subagents.');
      await successful(recorder, sent.turnId);
      expect(textOf(recorder)).toContain(remembered);
      results.sameThreadContinuation = session.nativeSessionId === id;
    } finally {
      unsubscribe?.();
      await provider.dispose();
      // Last-resort cleanup only for captured identities of our synthetic probes.
      await signalProcesses(identities.map(identityOf), 'SIGKILL');
      results.syntheticProcessesExited = (await waitForExit(identities.map(identityOf), { timeoutMs: 2000 })).exited;
      console.log(`CODEX_FILTERED_RESULT ${JSON.stringify(results)}`);
    }
  }, 420_000);
});
