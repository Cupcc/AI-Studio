import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CodexProvider } from '../../src/codex/index.js';
import { EventRecorder } from '../../src/testing/event-recorder.js';
import { createScratchProject, hostEnvironmentForTests, realCliEnabled } from '../../src/testing/real-cli.js';
import { defaultProcessLister, identityOf, signalProcesses, waitForExit, type ProcessInfo } from '../../src/core/process-probe.js';

// Separate two-turn diagnostic gate; a normal opt-in run uses the six-turn suite.
describe.skipIf(!realCliEnabled() || process.env.AI_STUDIO_CODEX_STOP_ONLY !== '1')('Codex precise Stop (opt-in, two turns)', () => {
  it('preserves an earlier background service while proving the current command exited', async () => {
    const provider = new CodexProvider();
    const scratch = await createScratchProject('codex-stop');
    const marker = `STOP_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const old = `${marker}_OLD`;
    const current = `${marker}_CURRENT`;
    const captured: ProcessInfo[] = [];
    const results: Record<string, unknown> = { turnsSubmitted: 0, model: 'gpt-6-astra', effort: 'high' };
    const probe = async (token: string) => (await defaultProcessLister.list()).filter((p) =>
      /(?:^|\s)(?:\S*\/)?python[\d.]*\s+-c\s/i.test(p.command) && p.command.includes(token) && !p.state.startsWith('Z'));
    try {
      const session = await provider.createSession({ cwd: scratch.cwd, environment: hostEnvironmentForTests(),
        overrides: { model: 'gpt-6-astra', approvalPolicy: 'untrusted', sandboxMode: 'read-only' },
        providerOptions: { effort: 'high', config: { approvals_reviewer: 'user' } } });
      const recorder = new EventRecorder(session);
      session.subscribe((event) => {
        if (event.type !== 'input.requested' || event.request.kind !== 'approval') return;
        const request = event.request;
        const allowed = Boolean(request.command?.includes(marker) && request.command?.includes('time.sleep(240)'));
        const option = request.options.find((o) => o.intent === (allowed ? 'allow' : 'deny'));
        if (option) void session.respondToInput(request.requestId, { kind: 'approval', optionId: option.id }).catch(() => {});
      });
      const waitProbe = async (token: string, turnId: string) => {
        const deadline = Date.now() + 90_000;
        while (Date.now() < deadline) {
          const end = recorder.ofType('turn.completed').find((event) => event.turnId === turnId);
          if (end && end.outcome !== 'completed') throw new Error(`CLI blocked: ${end.error?.code ?? end.outcome}`);
          const processes = await probe(token);
          if (processes.length) { captured.push(...processes); return processes; }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error('Synthetic command did not start');
      };
      const command = (token: string) => `/usr/bin/python3 -c 'import time; print("${token}", flush=True); time.sleep(240)'`;
      results.turnsSubmitted = 1;
      const first = await session.sendUserInput({ text: `Run exactly this command using exec_command with yield_time_ms=1000: ${command(old)}. When it yields a running session, leave it running and immediately reply BACKGROUND_READY. Do not call write_stdin, wait, kill, or any other tool. Do not create subagents or read/write files.` });
      await waitProbe(old, first.turnId);
      const finished = await recorder.waitFor('turn.completed', (event) => event.turnId === first.turnId, 90_000);
      expect(finished.outcome).toBe('completed');
      results.earlierServiceStarted = true;
      console.log('CODEX_STOP_PROGRESS earlier-service-running');
      results.turnsSubmitted = 2;
      const second = await session.sendUserInput({ text: `Run exactly this command using exec_command: ${command(current)}. Keep waiting for it with write_stdin after it yields. Do not return a final message before it finishes. Do not signal processes, create subagents, or read/write files.` });
      const target = await waitProbe(current, second.turnId);
      console.log('CODEX_STOP_PROGRESS current-command-running');
      const stop = await session.stop();
      results.stopStatus = stop.status;
      results.cleanup = stop.summary?.cleanup;
      results.cleanupDetail = stop.summary?.cleanupReport?.detail;
      results.recoveryReason = stop.summary?.recoveryReason;
      expect(stop.status).toBe('stopped');
      expect(stop.summary?.cleanup).toBe('confirmed');
      expect((await waitForExit(target.map(identityOf), { timeoutMs: 1000 })).exited).toBe(true);
      expect((await probe(old)).length).toBeGreaterThan(0);
      results.currentCommandExited = true;
      results.earlierServicePreserved = true;
      results.sameRuntime = recorder.ofType('runtime.started').length === 1;
      results.uniqueInterruptedTerminal = recorder.ofType('turn.completed').filter((event) => event.turnId === second.turnId && event.outcome === 'interrupted').length === 1;
    } finally {
      await provider.dispose();
      await signalProcesses(captured.map(identityOf), 'SIGKILL');
      results.syntheticProcessesExited = (await waitForExit(captured.map(identityOf), { timeoutMs: 2000 })).exited;
      console.log(`CODEX_STOP_FILTERED_RESULT ${JSON.stringify(results)}`);
    }
  }, 240_000);
});
