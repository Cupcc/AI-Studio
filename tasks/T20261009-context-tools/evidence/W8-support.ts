// W8 独立评审用的测试支架：只依赖被评审 Adapter 的公开测试工具（FakeRuntime / ScriptedJsonRpcServer），
// 通过 `@w8/*` 别名读取清理 worktree 的源码，不复制 Adapter 代码，不调用真实 CLI 或模型。
import { vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { Options, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { CodexProvider } from '@w8/codex/index.js'
import { ClaudeProvider, type ClaudeQuery } from '@w8/claude/index.js'
import { AsyncQueue } from '@w8/core/async-queue.js'
import { FakeRuntime } from '@w8/testing/fake-runtime.js'
import { ScriptedJsonRpcServer, ScriptedRpcError } from '@w8/testing/fake-transport.js'
import type { RuntimeSpawnOptions, TerminateOptions, TerminationReport } from '@w8/core/runtime-process.js'
import type { AgentProvider, AgentSession, CreateSessionOptions } from '@w8/provider.js'
import type { AdapterEvent } from '@w8/events.js'

export type TerminateBehavior = 'exit' | 'survivors' | 'hang'

/** FakeRuntime whose terminate() can additionally be held open, to keep a release "in flight". */
export class GatedRuntime extends FakeRuntime {
  terminateGate: Promise<void> | undefined
  async terminate(options: TerminateOptions = {}): Promise<TerminationReport> {
    await this.terminateGate
    return super.terminate(options)
  }
}

export const timeouts = { startupMs: 1000, requestMs: 500, interruptMs: 300, terminalMs: 300, cleanupMs: 300, recoveryMs: 1000,
  terminateGraceMs: 1, killWaitMs: 1, disposeMs: 1000 }

export function sessionOptions(cwd: string, extra: Partial<CreateSessionOptions> = {}): CreateSessionOptions {
  return { cwd, environment: { env: { PATH: '/test/bin' } }, timeouts, ...extra }
}

export interface Rig {
  name: 'codex' | 'claude'
  provider: AgentProvider
  runtimes: GatedRuntime[]
  spawns: RuntimeSpawnOptions[]
  /** Mutable knobs read when the next runtime / session is created. */
  knobs: { startGate: Promise<void> | undefined; /** only spawns with this cwd are gated when set */ gateCwd?: string; failModelList?: boolean; terminate: TerminateBehavior; failInitialize: boolean; terminateGate: Promise<void> | undefined }
  create(cwd?: string, extra?: Partial<CreateSessionOptions>): Promise<AgentSession>
  /** Provider-internal counters (private fields, read only). */
  retained(): number
  tracked(): number
  models(cwd?: string): Promise<unknown[]>
}

export const DEFAULT_CWD = '/tmp/w8/project-a'

/** Modules a Codex rig is built from; the differential test passes the base (2f4bb5a) build here. */
export interface CodexMods {
  CodexProvider: typeof CodexProvider
  FakeRuntime: typeof FakeRuntime
  ScriptedJsonRpcServer: typeof ScriptedJsonRpcServer
  ScriptedRpcError: typeof ScriptedRpcError
}
export const currentMods: CodexMods = { CodexProvider, FakeRuntime, ScriptedJsonRpcServer, ScriptedRpcError }

export interface FakeProcess { pid: number; ppid: number; pgid: number; state: string; startedAt: string; command: string }

export function codexRig(mods: CodexMods = currentMods) {
  const runtimes: GatedRuntime[] = []
  const spawns: RuntimeSpawnOptions[] = []
  const servers: InstanceType<typeof ScriptedJsonRpcServer>[] = []
  const knobs: Rig['knobs'] = { startGate: undefined, terminate: 'exit', failInitialize: false, terminateGate: undefined }
  const state = { processes: [] as FakeProcess[], terminals: new Map<number, Array<Record<string, unknown>>>(), turns: 0 }
  // GatedRuntime extends the *current* FakeRuntime; for the base build use its own FakeRuntime directly.
  const makeRuntime = (options: ConstructorParameters<typeof FakeRuntime>[0]) => {
    if (mods === currentMods) return new GatedRuntime(options)
    return new mods.FakeRuntime(options) as unknown as GatedRuntime
  }
  const provider = new mods.CodexProvider({
    resolveExecutable: async () => ({ path: '/test/bin/codex', source: 'path' as const }),
    exec: vi.fn(async () => ({ code: 0, signal: null, stdout: 'codex-cli 0.161.0', stderr: '', timedOut: false, truncated: false })),
    processLister: { list: async () => [...state.processes] },
    runtimeFactory: async (spawn) => {
      spawns.push(spawn)
      if (knobs.startGate && (knobs.gateCwd === undefined || knobs.gateCwd === spawn.cwd)) await knobs.startGate
      const runtime = makeRuntime({ generation: spawn.generation, terminateBehavior: knobs.terminate, label: spawn.label })
      ;(runtime as GatedRuntime).terminateGate = knobs.terminateGate
      const index = runtimes.length
      runtimes.push(runtime)
      state.terminals.set(runtime.pid, [])
      const server = new mods.ScriptedJsonRpcServer(runtime.cliTransport)
      servers.push(server)
      server.handle('initialize', () => {
        if (knobs.failInitialize) throw new mods.ScriptedRpcError({ code: -32000, message: 'W8 handshake refused' })
        return {}
      })
      server.handle('model/list', () => {
        if (knobs.failModelList) throw new mods.ScriptedRpcError({ code: -32002, message: 'W8 catalog request failed' })
        return { data: [{ id: 'm1', model: 'm1', displayName: 'm1', description: 'W8', isDefault: true, hidden: false,
        supportedReasoningEfforts: [{ reasoningEffort: 'high' }] }], nextCursor: null }
      })
      server.handle('config/read', () => ({ config: { model: 'cfg' } }))
      server.handle('thread/start', () => ({ thread: { id: `thread-${index}` }, model: 'cli-model' }))
      server.handle('thread/resume', (p) => {
        if (knobs.failInitialize) throw new mods.ScriptedRpcError({ code: -32001, message: 'W8 resume refused' })
        return { thread: { id: (p as { threadId: string }).threadId }, model: 'cli-model' }
      })
      server.handle('turn/start', (p) => {
        const id = `turn-${++state.turns}`
        const turn = { id, status: 'inProgress', error: null, durationMs: null, items: [], itemsView: 'complete' }
        server.notify('turn/started', { threadId: (p as { threadId: string }).threadId, turn })
        return { turn }
      })
      server.handle('turn/interrupt', (p) => {
        const params = p as { threadId: string; turnId: string }
        server.notify('turn/completed', { threadId: params.threadId, turn: { id: params.turnId, status: 'interrupted', error: null, durationMs: null, items: [], itemsView: 'complete' } })
        return {}
      })
      server.handle('thread/backgroundTerminals/list', () => ({ data: state.terminals.get(runtime.pid), nextCursor: null }))
      // Native terminate "succeeds" but never removes the OS process: Stop must not trust it and falls back to a Runtime restart.
      server.handle('thread/backgroundTerminals/terminate', () => { state.terminals.set(runtime.pid, []); return { terminated: true } })
      return runtime
    }
  })
  const rig = {
    name: 'codex' as const, provider, runtimes, spawns, knobs, servers, state,
    create: (cwd = DEFAULT_CWD, extra: Partial<CreateSessionOptions> = {}) => provider.createSession(sessionOptions(cwd, extra)),
    retained: () => (provider as unknown as { resources?: { retained: number } }).resources?.retained ?? -1,
    tracked: () => (provider as unknown as { live: { size: number } }).live.size,
    models: (cwd = DEFAULT_CWD) => provider.listModels({ environment: { env: { PATH: '/test/bin' } }, cwd }),
    /** Starts a turn and waits until the native turn id is bound. */
    async start(session: AgentSession, text = 'hello') {
      await session.sendUserInput({ text })
      for (let i = 0; i < 200 && !session.activeTurn?.nativeTurnId; i++) await tick(2)
      if (!session.activeTurn?.nativeTurnId) throw new Error('native turn not bound')
    },
    complete(session: AgentSession, status = 'completed') {
      const runtimeIndex = runtimes.length - 1
      servers[runtimeIndex]!.notify('turn/completed', { threadId: session.nativeSessionId,
        turn: { id: session.activeTurn!.nativeTurnId, status, error: null, durationMs: null, items: [], itemsView: 'complete' } })
    },
    /** Announces a running command (and its OS process) under the current runtime. */
    command(session: AgentSession, pid = 51001) {
      const runtime = runtimes.at(-1)!
      const root: FakeProcess = { pid, ppid: runtime.pid, pgid: pid, state: 'S', startedAt: 'Thu Jan  1 00:00:00 2026', command: 'sleep 120' }
      state.processes.push(root)
      runtime.descendants.push(root)
      state.terminals.get(runtime.pid)!.push({ itemId: 'command-1', processId: 'proc-1', osPid: pid, command: 'sleep 120', cwd: DEFAULT_CWD, cpuPercent: null, rssKb: null })
      servers.at(-1)!.notify('item/started', { threadId: session.nativeSessionId, turnId: session.activeTurn!.nativeTurnId,
        item: { id: 'command-1', type: 'commandExecution', processId: 'proc-1', command: 'sleep 120', cwd: DEFAULT_CWD,
          commandActions: [{ type: 'unknown', command: 'sleep 120' }], status: 'inProgress', aggregatedOutput: null, exitCode: null, durationMs: null } })
      return root
    }
  }
  return rig
}

export class MockQuery implements ClaudeQuery {
  readonly output = new AsyncQueue<SDKMessage>()
  readonly inputs: SDKUserMessage[] = []
  closed = false
  failSupportedModels = false
  failModelsFromCall: number | undefined
  private modelCalls = 0
  queueAfterInterrupt = false
  constructor(readonly options: Options, prompt: AsyncIterable<SDKUserMessage>) {
    options.spawnClaudeCodeProcess!({ command: '/test/bin/claude', args: ['--sdk'], cwd: options.cwd, env: { ...options.env }, signal: new AbortController().signal })
    void (async () => { for await (const input of prompt) this.inputs.push(input) })()
  }
  [Symbol.asyncIterator]() { return this.output[Symbol.asyncIterator]() }
  emit(value: unknown) { this.output.push(value as SDKMessage) }
  init(id = '11111111-1111-4111-8111-111111111111') { this.emit({ type: 'system', subtype: 'init', session_id: id }) }
  end(success = true) {
    this.emit({ type: 'result', subtype: success ? 'success' : 'error_during_execution', is_error: !success, result: 'ok', errors: ['cancelled'],
      duration_ms: 1, session_id: '11111111-1111-4111-8111-111111111111', uuid: randomUUID() })
  }
  async interrupt() { this.end(false); return { still_queued: this.queueAfterInterrupt ? this.inputs.map((input) => input.uuid as string) : [] as string[] } }
  async setModel() { /* accepted */ }
  async supportedModels() {
    this.modelCalls++
    if (this.failSupportedModels) throw new Error('W8 handshake failed')
    if (this.failModelsFromCall !== undefined && this.modelCalls >= this.failModelsFromCall) throw new Error('W8 catalog request failed')
    return [{ value: 'sonnet', displayName: 'Sonnet', description: 'native' }]
  }
  close() { this.closed = true; this.output.end() }
}

export interface ClaudeMods { ClaudeProvider: typeof ClaudeProvider; FakeRuntime: typeof FakeRuntime }
export const currentClaudeMods: ClaudeMods = { ClaudeProvider, FakeRuntime }

export function claudeRig(mods: ClaudeMods = currentClaudeMods): Rig & { queries: MockQuery[]; flags: { queueAfterInterrupt: boolean; failModelsFromCall: number | undefined } } {
  const flags: { queueAfterInterrupt: boolean; failModelsFromCall: number | undefined } = { queueAfterInterrupt: false, failModelsFromCall: undefined }
  const runtimes: GatedRuntime[] = []
  const spawns: RuntimeSpawnOptions[] = []
  const queries: MockQuery[] = []
  const knobs: Rig['knobs'] = { startGate: undefined, terminate: 'exit', failInitialize: false, terminateGate: undefined }
  const provider = new mods.ClaudeProvider({
    resolveExecutable: async () => ({ path: '/test/bin/claude', source: 'explicit' as const }),
    query: (args) => {
      const query = new MockQuery(args.options, args.prompt)
      if (knobs.failInitialize) query.failSupportedModels = true
      query.queueAfterInterrupt = flags.queueAfterInterrupt
      query.failModelsFromCall = flags.failModelsFromCall
      queries.push(query)
      return query
    },
    startRuntime: async (spawn) => {
      spawns.push(spawn)
      if (knobs.startGate && (knobs.gateCwd === undefined || knobs.gateCwd === spawn.cwd)) await knobs.startGate
      const options = { generation: spawn.generation, terminateBehavior: knobs.terminate, label: spawn.label }
      const runtime = (mods === currentClaudeMods ? new GatedRuntime(options) : new mods.FakeRuntime(options)) as GatedRuntime
      runtime.terminateGate = knobs.terminateGate
      runtimes.push(runtime)
      return runtime
    },
    processLister: { list: async () => [] }
  })
  return {
    name: 'claude', provider, runtimes, spawns, knobs, queries, flags,
    create: (cwd = DEFAULT_CWD, extra = {}) => provider.createSession(sessionOptions(cwd, extra)),
    retained: () => (provider as unknown as { resources?: { retained: number } }).resources?.retained ?? -1,
    tracked: () => (provider as unknown as { sessions: { size: number } }).sessions.size,
    models: (cwd = DEFAULT_CWD) => provider.listModels({ environment: { env: { PATH: '/test/bin' } }, cwd })
  }
}

export const rigs = { codex: codexRig, claude: claudeRig } as const

/** Collects unhandled rejections for the duration of a test file; vitest also fails the run on its own. */
export function rejectionGuard() {
  const seen: unknown[] = []
  const handler = (reason: unknown) => { seen.push(reason) }
  process.on('unhandledRejection', handler)
  return {
    seen,
    async settle() { for (let i = 0; i < 6; i++) await new Promise<void>((resolve) => setImmediate(resolve)) },
    stop() { process.off('unhandledRejection', handler) }
  }
}

export const activeTimeouts = () => process.getActiveResourcesInfo().filter((name) => name === 'Timeout').length
export const tick = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms))
export const types = (events: AdapterEvent[]) => events.map((event) => event.type)

export function record(session: AgentSession): AdapterEvent[] {
  const events: AdapterEvent[] = []
  session.subscribe((event) => { events.push(event) })
  return events
}

/** Finish Claude's mock handshake so the session has a native id (no model call involved). */
export async function claudeReady(rig: ReturnType<typeof claudeRig>, session: AgentSession): Promise<MockQuery> {
  const query = rig.queries.at(-1)!
  query.init()
  await tick()
  void session
  return query
}
