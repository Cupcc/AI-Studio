import { adapterError } from '../errors.js';
import { descendantsIn, identityOf, isZombie, waitForExit, type ProcessInfo, type ProcessLister } from '../core/process-probe.js';
import type { RuntimeHandle } from '../core/runtime-process.js';
import type { CleanupReport } from '../types.js';
import type { ThreadItem } from './protocol/v2/ThreadItem.js';
import type { ThreadBackgroundTerminal } from './protocol/v2/ThreadBackgroundTerminal.js';
import type { CodexConnection } from './connection.js';
import { codexError } from './errors.js';

type Command = Extract<ThreadItem, { type: 'commandExecution' }>;
interface TurnProcesses {
  id: string;
  commands: Map<string, Command>;
  baseline: Set<string>;
  baselineProcesses: Set<string>;
  targets: Map<string, ProcessInfo>;
  roots: Map<string, ProcessInfo>;
  snapshotCovered: Set<string>;
  unsafe?: string;
  unavailable?: unknown;
  ended?: boolean;
}
const key = (p: ProcessInfo) => `${p.pid}@${p.startedAt}`;

/**
 * `processId` is opaque and is never treated as an OS pid. When available, the
 * native `osPid` must belong to this Runtime before binding its identity.
 * Codex 0.161.0 currently returns osPid:null: then retain a conservative superset
 * of every new Runtime descendant since submission. Native termination still
 * targets only current-turn item/processIds; success requires the entire observed
 * superset to exit, never just a native receipt. Earlier identities are excluded.
 */
export class CodexProcessTracker {
  private turn: TurnProcesses | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sampleInFlight: Promise<ThreadBackgroundTerminal[]> | undefined;
  private disposed = false;

  constructor(
    private readonly connection: CodexConnection,
    private readonly runtime: RuntimeHandle,
    private readonly threadId: string,
    private readonly lister: ProcessLister,
  ) {}

  async begin(turnId: string, signal: AbortSignal): Promise<void> {
    this.stopPolling();
    if (this.sampleInFlight) await this.sampleInFlight.catch(() => {});
    const turn: TurnProcesses = { id: turnId, commands: new Map(), baseline: new Set(), baselineProcesses: new Set(),
      targets: new Map(), roots: new Map(), snapshotCovered: new Set() };
    this.turn = turn;
    try {
      // Also remembers older descendants for Runtime fallback without making them
      // targets of normal per-turn cleanup.
      const baseline = await this.runtime.snapshotDescendants();
      for (const process of baseline) turn.baselineProcesses.add(key(process));
      const terminals = await this.connection.terminals(this.threadId, signal);
      for (const terminal of terminals) turn.baseline.add(terminal.processId);
    } catch (error) {
      turn.unavailable = error;
    }
    signal.throwIfAborted();
  }

  command(turnId: string, item: Command): void {
    const turn = this.turn;
    if (!turn || turn.id !== turnId || this.disposed) return;
    turn.commands.set(item.id, item);
    if (!turn.ended) this.schedule();
  }

  ended(turnId: string): void {
    if (this.turn?.id === turnId) { this.turn.ended = true; this.stopPolling(); }
  }

  dispose(): void {
    this.disposed = true;
    this.stopPolling();
  }

  async capture(signal?: AbortSignal): Promise<ThreadBackgroundTerminal[]> {
    if (this.sampleInFlight) await this.sampleInFlight.catch(() => {});
    const turn = this.turn;
    if (!turn) return [];
    const work = this.sample(turn, signal);
    this.sampleInFlight = work;
    try { return await work; } finally { if (this.sampleInFlight === work) this.sampleInFlight = undefined; }
  }

  async cleanup(turnId: string, timeoutMs: number, signal: AbortSignal): Promise<CleanupReport> {
    this.stopPolling();
    const turn = this.turn;
    if (!turn || turn.id !== turnId) return { status: 'failed', scope: 'turn', detail: 'No process ownership record for this turn' };
    let terminals: ThreadBackgroundTerminal[];
    try { terminals = await this.capture(signal); }
    catch (error) {
      if (turn.commands.size === 0 && !turn.unsafe) return { status: 'not_required', scope: 'none' };
      return { status: codexError(error, 'backgroundTerminals/list').code === 'unsupported' ? 'unsupported' : 'failed',
        scope: 'turn', error: codexError(error, 'backgroundTerminals/list').info };
    }
    if (turn.unsafe) return { status: 'failed', scope: 'turn', detail: turn.unsafe };
    if (turn.unavailable && turn.commands.size > 0) {
      return { status: 'failed', scope: 'turn', detail: 'The pre-turn process baseline was unavailable' };
    }
    const current = terminals.filter((terminal) => turn.commands.has(terminal.itemId) && !turn.baseline.has(terminal.processId));
    const unknown = terminals.filter((terminal) => !turn.baseline.has(terminal.processId) && !turn.commands.has(terminal.itemId));
    if (unknown.length) return { status: 'failed', scope: 'turn', detail: 'A new native process has no current-turn item mapping' };
    for (const command of turn.commands.values()) {
      if (command.status === 'declined') continue;
      if (!turn.roots.has(command.id) && !turn.snapshotCovered.has(command.id)) {
        // A protocol completion/empty list is not OS exit evidence. Very short
        // commands may be unobservable; use the isolated Runtime fallback.
        return { status: 'failed', scope: 'turn', detail: `No OS identity captured for command ${command.id}` };
      }
    }
    if (turn.targets.size === 0 && current.length === 0) return { status: 'not_required', scope: 'none' };
    for (const terminal of current) {
      signal.throwIfAborted();
      await this.connection.request('thread/backgroundTerminals/terminate', { threadId: this.threadId, processId: terminal.processId }, signal);
    }
    const targets = [...turn.targets.values()];
    const verification = await waitForExit(targets.map(identityOf), { timeoutMs, intervalMs: 50, lister: this.lister, signal });
    const surviving = new Set(verification.survivors.map(key));
    return { status: verification.exited ? 'confirmed' : 'failed', scope: 'turn',
      verifiedExited: targets.filter((p) => !surviving.has(key(p))).map(({ pid, command }) => ({ pid, command })),
      survivors: verification.survivors.map(({ pid, command }) => ({ pid, command })),
      detail: turn.snapshotCovered.size > 0
        ? 'Native osPid unavailable: verified all observed new Runtime descendant identities against the pre-turn baseline'
        : 'Verified pid/start-time identities using the OS process table; native receipts are not exit evidence' };
  }

  private async sample(turn: TurnProcesses, signal?: AbortSignal): Promise<ThreadBackgroundTerminal[]> {
    const terminals = await this.connection.terminals(this.threadId, signal);
    // Store a pre-interrupt snapshot in the shared Runtime too: a crash can
    // otherwise reparent descendants before RuntimeSlot gets to terminate it.
    await this.runtime.snapshotDescendants();
    const processes = await this.lister.list();
    if (this.runtime.pid === undefined) throw adapterError('stop_cleanup_failed', 'Runtime has no OS pid');
    const descendants = descendantsIn(processes, this.runtime.pid);
    const owned = new Set(descendants.map(key));
    const newDescendants = descendants.filter((process) => !turn.baselineProcesses.has(key(process)));
    for (const terminal of terminals) {
      const command = turn.commands.get(terminal.itemId);
      if (!command) continue;
      if (turn.baseline.has(terminal.processId)) {
        turn.unsafe = 'Current item reused a process from an earlier turn';
        continue;
      }
      if (command.processId !== null && command.processId !== terminal.processId) {
        turn.unsafe = 'Native item/process mapping changed';
        continue;
      }
      if (terminal.osPid === null) {
        if (newDescendants.length > 0) {
          turn.snapshotCovered.add(command.id);
          for (const process of newDescendants) turn.targets.set(key(process), process);
        }
        continue;
      }
      const root = processes.find((p) => p.pid === terminal.osPid && !isZombie(p));
      if (!root) continue;
      const previous = turn.roots.get(command.id);
      if (previous && key(previous) !== key(root)) {
        turn.unsafe = 'Native command OS identity changed';
        continue;
      }
      if (!previous && !owned.has(key(root))) {
        turn.unsafe = 'Native OS pid is outside the Session Runtime';
        continue;
      }
      turn.roots.set(command.id, root);
      turn.targets.set(key(root), root);
    }
    // Follow every retained descendant, including a detached/reparented child.
    for (const remembered of [...turn.targets.values()]) {
      const alive = processes.find((p) => key(p) === key(remembered) && !isZombie(p));
      if (!alive) continue;
      for (const child of descendantsIn(processes, alive.pid, true)) turn.targets.set(key(child), child);
    }
    return terminals;
  }

  private schedule(): void {
    if (this.timer || this.disposed) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.capture().catch(() => {}).finally(() => {
        if (!this.disposed && this.turn && this.polling) this.schedule();
      });
    }, 100);
    this.polling = true;
    this.timer.unref();
  }
  private polling = false;
  private stopPolling(): void {
    this.polling = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
