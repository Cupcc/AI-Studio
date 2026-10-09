import { vi } from 'vitest';
import { CodexProvider, type CodexProviderDependencies } from '../../src/codex/index.js';
import { FakeRuntime, fakeProcess } from '../../src/testing/fake-runtime.js';
import { ScriptedJsonRpcServer } from '../../src/testing/fake-transport.js';
import type { RuntimeSpawnOptions } from '../../src/core/runtime-process.js';
import type { AgentSession, CreateSessionOptions } from '../../src/provider.js';
import type { ProcessInfo } from '../../src/core/process-probe.js';
import type { ThreadBackgroundTerminal } from '../../src/codex/protocol/v2/ThreadBackgroundTerminal.js';

export const options: CreateSessionOptions = { cwd: '/tmp/project with spaces', environment: { env: { PATH: '/test/bin', TEST_SENTINEL: 'kept' } },
  timeouts: { startupMs: 1000, requestMs: 250, interruptMs: 250, terminalMs: 250, cleanupMs: 250, recoveryMs: 1000, terminateGraceMs: 1, killWaitMs: 1 } };
export const model = (id = 'catalog-model') => ({ id: `catalog-${id}`, model: id, displayName: id, description: 'Test model',
  isDefault: true, hidden: false, supportedReasoningEfforts: [{ reasoningEffort: 'high' }] });

export class Harness {
  readonly runtimes: FakeRuntime[] = [];
  readonly servers: ScriptedJsonRpcServer[] = [];
  readonly spawns: RuntimeSpawnOptions[] = [];
  readonly terminals = new Map<number, ThreadBackgroundTerminal[]>();
  processes: ProcessInfo[] = [];
  turnNumber = 0;
  configure: ((server: ScriptedJsonRpcServer, runtime: FakeRuntime, index: number) => void) | undefined;
  readonly dependencies: CodexProviderDependencies = {
    resolveExecutable: vi.fn(async () => ({ path: '/test/bin/codex', source: 'path' as const })),
    exec: vi.fn(async (_file, args) => ({ code: 0, signal: null, stdout: args[0] === '--version' ? 'codex-cli 0.161.0' : '',
      stderr: args[0] === 'login' ? 'Logged in using ChatGPT' : '', timedOut: false, truncated: false })),
    processLister: { list: async () => [...this.processes] },
    runtimeFactory: async (spawnOptions) => {
      this.spawns.push(spawnOptions);
      const runtime = new FakeRuntime({ generation: spawnOptions.generation });
      const server = new ScriptedJsonRpcServer(runtime.cliTransport);
      const index = this.runtimes.length;
      this.runtimes.push(runtime);
      this.servers.push(server);
      this.terminals.set(runtime.pid, []);
      server.handle('initialize', () => ({}));
      server.handle('model/list', () => ({ data: [model()], nextCursor: null }));
      server.handle('config/read', () => ({ config: { model: 'cli-config-default' } }));
      server.handle('thread/start', () => ({ thread: { id: `thread-${index}` }, model: 'cli-model' }));
      server.handle('thread/resume', (p) => ({ thread: { id: (p as { threadId: string }).threadId }, model: 'cli-model' }));
      server.handle('turn/start', (p) => {
        const id = `turn-${++this.turnNumber}`;
        server.notify('turn/started', { threadId: (p as { threadId: string }).threadId, turn: turn(id) });
        return { turn: turn(id) };
      });
      server.handle('turn/interrupt', (p) => { const params = p as { threadId: string; turnId: string };
        server.notify('turn/completed', { threadId: params.threadId, turn: turn(params.turnId, 'interrupted') }); return {}; });
      server.handle('turn/steer', (p) => ({ turnId: (p as { expectedTurnId: string }).expectedTurnId }));
      server.handle('thread/backgroundTerminals/list', () => ({ data: this.terminals.get(runtime.pid), nextCursor: null }));
      server.handle('thread/backgroundTerminals/terminate', (p) => {
        const processId = (p as { processId: string }).processId;
        const target = this.terminals.get(runtime.pid)!.find((terminal) => terminal.processId === processId);
        this.terminals.set(runtime.pid, this.terminals.get(runtime.pid)!.filter((terminal) => terminal.processId !== processId));
        if (target) this.processes = this.processes.filter((process) => process.pid !== target.osPid && process.ppid !== target.osPid);
        return { terminated: Boolean(target) };
      });
      this.configure?.(server, runtime, index);
      return runtime;
    },
  };
  readonly provider = new CodexProvider(this.dependencies);

  async session(overrides: Partial<CreateSessionOptions> = {}): Promise<AgentSession> { return this.provider.createSession({ ...options, ...overrides }); }
  async start(session: AgentSession, text = 'hello'): Promise<string> {
    await session.sendUserInput({ text });
    await vi.waitFor(() => { if (!session.activeTurn?.nativeTurnId) throw new Error('Native turn not bound'); });
    return session.activeTurn!.nativeTurnId!;
  }
  notify(session: AgentSession, method: string, params: Record<string, unknown>, runtimeIndex = this.runtimes.length - 1): void {
    this.servers[runtimeIndex]!.notify(method, { threadId: session.nativeSessionId, turnId: session.activeTurn?.nativeTurnId, ...params });
  }
  complete(session: AgentSession, status: 'completed' | 'failed' | 'interrupted' = 'completed', extra: Record<string, unknown> = {}): void {
    this.notify(session, 'turn/completed', { turn: { ...turn(session.activeTurn!.nativeTurnId!, status), ...extra } });
  }
  command(session: AgentSession, itemId = 'command-1', processId = 'internal-process-7', pid = 12001, runtimeIndex = this.runtimes.length - 1): ProcessInfo {
    const runtime = this.runtimes[runtimeIndex]!;
    const root = fakeProcess(pid, 'sleep 120', { ppid: runtime.pid, pgid: pid });
    this.processes.push(root);
    runtime.descendants.push(root);
    this.terminals.get(runtime.pid)!.push({ itemId, processId, osPid: pid, command: 'sleep 120', cwd: options.cwd, cpuPercent: null, rssKb: null });
    this.notify(session, 'item/started', { item: command(itemId, processId) }, runtimeIndex);
    return root;
  }
}

export function turn(id: string, status = 'inProgress') { return { id, status, error: null, durationMs: null, items: [], itemsView: 'complete' }; }
export function command(id = 'command-1', processId: string | null = 'internal-process-7') {
  return { id, type: 'commandExecution', processId, command: 'sleep 120', cwd: options.cwd, commandActions: [{ type: 'unknown', command: 'sleep 120' }],
    status: 'inProgress', aggregatedOutput: null, exitCode: null, durationMs: null };
}
export function approval(session: AgentSession, extra: Record<string, unknown> = {}) {
  return { threadId: session.nativeSessionId, turnId: session.activeTurn?.nativeTurnId, itemId: 'approval-item', command: 'run something',
    cwd: options.cwd, availableDecisions: ['accept', 'decline', 'cancel'], ...extra };
}
