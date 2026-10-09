import { spawn, type ChildProcess } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { adapterError } from '../errors.js';
import type { RuntimeExitInfo } from '../types.js';
import { deferred, sleep } from './async.js';
import { EventStream, type Unsubscribe } from './emitter.js';
import { createStreamLineTransport, type LineTransport } from './line-transport.js';
import {
  defaultProcessLister,
  descendantsIn,
  findAlive,
  identityOf,
  isZombie,
  type ProcessInfo,
  type ProcessLister,
} from './process-probe.js';

export interface RuntimeSpawnOptions {
  command: string;
  args: readonly string[];
  cwd: string;
  /** Complete environment for the child; nothing is inherited implicitly. */
  env: Readonly<Record<string, string | undefined>>;
  /** Diagnostic label, e.g. `codex app-server`. */
  label?: string;
  /** Generation number assigned by the owner (increments on each restart). */
  generation?: number;
  /** Bounded stderr capture. Default 64 KiB. */
  stderrLimitBytes?: number;
  lister?: ProcessLister;
}

export interface TerminateOptions {
  /** Wait after SIGTERM before escalating to SIGKILL. */
  graceMs?: number;
  /** Wait after SIGKILL for exit and descendant verification. */
  killWaitMs?: number;
}

export interface TerminationReport {
  exit: RuntimeExitInfo | undefined;
  /** SIGKILL was needed. */
  forced: boolean;
  /** Descendants captured before signalling (they are reparented once the runtime exits). */
  descendants: ProcessInfo[];
  /** Processes from the snapshot or the runtime's process group still alive at the end. */
  survivors: ProcessInfo[];
  /** Runtime exited and no survivors: system-level exit evidence. */
  confirmed: boolean;
  elapsedMs: number;
}

/** Minimal ChildProcess shape (compatible with the Claude Agent SDK's `SpawnedProcess`). */
export interface ChildProcessLike {
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly killed: boolean;
  readonly exitCode: number | null;
  readonly signalCode: NodeJS.Signals | null;
  kill(signal?: NodeJS.Signals): boolean;
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
  off(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  off(event: 'error', listener: (error: Error) => void): this;
}

/** Runtime surface used by providers; implemented by {@link RuntimeProcess} and the test fake. */
export interface RuntimeHandle {
  readonly label: string;
  readonly generation: number;
  readonly pid: number | undefined;
  readonly running: boolean;
  readonly exitInfo: RuntimeExitInfo | undefined;
  /** Resolves when the process exits (never rejects). */
  readonly exited: Promise<RuntimeExitInfo>;
  readonly stdin: Writable;
  readonly stdout: Readable;
  stderrTail(): string;
  onExit(listener: (info: RuntimeExitInfo) => void): Unsubscribe;
  onStderr(listener: (chunk: string) => void): Unsubscribe;
  /** Newline-framed transport over stdin/stdout. Do not combine with raw stdout consumers. */
  lineTransport(): LineTransport;
  /** ChildProcess-like view for libraries that own the stdio protocol (Claude Agent SDK). */
  processLike(): ChildProcessLike;
  /** Current descendants of the runtime (excluding itself). */
  snapshotDescendants(): Promise<ProcessInfo[]>;
  /** Graceful then forced termination of the runtime's process group and recorded descendants. */
  terminate(options?: TerminateOptions): Promise<TerminationReport>;
  /** Resolves with exit info, or rejects with `timeout`. */
  waitForExit(timeoutMs: number): Promise<RuntimeExitInfo>;
}

const DEFAULT_STDERR_LIMIT = 64 * 1024;

/**
 * One isolated CLI runtime process (04 §2: one runtime per active session). Spawned as the
 * leader of its own process group so termination never reaches the host or other sessions.
 */
export class RuntimeProcess implements RuntimeHandle {
  readonly label: string;
  readonly generation: number;
  readonly exited: Promise<RuntimeExitInfo>;

  private readonly child: ChildProcess;
  private readonly lister: ProcessLister;
  private readonly stderrLimit: number;
  private stderrBuffer = '';
  private readonly stderrStream = new EventStream<string>();
  private readonly exitStream = new EventStream<RuntimeExitInfo>();
  private exitRecord: RuntimeExitInfo | undefined;
  private expectedExit = false;
  private transport: LineTransport | undefined;
  private terminating: Promise<TerminationReport> | undefined;
  private lastSnapshot: ProcessInfo[] = [];

  private constructor(child: ChildProcess, options: RuntimeSpawnOptions) {
    this.child = child;
    this.label = options.label ?? options.command;
    this.generation = options.generation ?? 1;
    this.lister = options.lister ?? defaultProcessLister;
    this.stderrLimit = options.stderrLimitBytes ?? DEFAULT_STDERR_LIMIT;
    const exit = deferred<RuntimeExitInfo>();
    this.exited = exit.promise;

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      this.stderrBuffer = (this.stderrBuffer + chunk).slice(-this.stderrLimit);
      this.stderrStream.emit(chunk);
    });
    // Unhandled stream errors (EPIPE after a crash) must never reach the host process.
    child.stdin?.on('error', () => {});
    child.stdout?.on('error', () => {});
    child.stderr?.on('error', () => {});
    child.on('error', () => {});
    child.once('exit', (code, signal) => {
      const info: RuntimeExitInfo = {
        generation: this.generation,
        code,
        signal,
        expected: this.expectedExit,
        exitedAt: Date.now(),
      };
      if (child.pid !== undefined) info.pid = child.pid;
      const tail = this.stderrTail();
      if (tail) info.stderrTail = tail;
      this.exitRecord = info;
      exit.resolve(info);
      this.exitStream.emit(info);
      this.exitStream.dispose();
    });
  }

  /** Spawns and resolves once the OS confirmed the spawn; maps ENOENT to `not_installed`. */
  static async start(options: RuntimeSpawnOptions): Promise<RuntimeProcess> {
    const child = spawn(options.command, [...options.args], {
      cwd: options.cwd,
      env: options.env as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
      windowsHide: true,
    });
    const runtime = new RuntimeProcess(child, options);
    await new Promise<void>((resolve, reject) => {
      const onSpawn = () => {
        child.off('error', onError);
        resolve();
      };
      const onError = (error: NodeJS.ErrnoException) => {
        child.off('spawn', onSpawn);
        const code = error.code === 'ENOENT' ? 'not_installed' : 'spawn_failed';
        reject(
          adapterError(code, `Failed to start ${runtime.label}: ${error.message}`, {
            cause: error,
            native: { source: 'runtime:spawn', code: error.code ?? 'unknown', message: error.message },
          }),
        );
      };
      child.once('spawn', onSpawn);
      child.once('error', onError);
    });
    return runtime;
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  get running(): boolean {
    return this.exitRecord === undefined;
  }

  get exitInfo(): RuntimeExitInfo | undefined {
    return this.exitRecord;
  }

  get stdin(): Writable {
    return this.child.stdin as Writable;
  }

  get stdout(): Readable {
    return this.child.stdout as Readable;
  }

  stderrTail(): string {
    return this.stderrBuffer;
  }

  onExit(listener: (info: RuntimeExitInfo) => void): Unsubscribe {
    if (this.exitRecord) {
      const info = this.exitRecord;
      queueMicrotask(() => listener(info));
      return () => {};
    }
    return this.exitStream.subscribe(listener);
  }

  onStderr(listener: (chunk: string) => void): Unsubscribe {
    return this.stderrStream.subscribe(listener);
  }

  lineTransport(): LineTransport {
    this.transport ??= createStreamLineTransport(this.stdout, this.stdin);
    return this.transport;
  }

  processLike(): ChildProcessLike {
    const child = this.child;
    const markExpectedAndKill = (signal: NodeJS.Signals = 'SIGTERM') => {
      this.expectedExit = true;
      return this.signalGroup(signal);
    };
    const view = {
      get stdin() {
        return child.stdin as Writable;
      },
      get stdout() {
        return child.stdout as Readable;
      },
      get killed() {
        return child.killed;
      },
      get exitCode() {
        return child.exitCode;
      },
      get signalCode() {
        return child.signalCode;
      },
      kill: markExpectedAndKill,
      on(event: 'exit' | 'error', listener: (...args: never[]) => void) {
        child.on(event, listener as (...args: unknown[]) => void);
        return view;
      },
      once(event: 'exit' | 'error', listener: (...args: never[]) => void) {
        child.once(event, listener as (...args: unknown[]) => void);
        return view;
      },
      off(event: 'exit' | 'error', listener: (...args: never[]) => void) {
        child.off(event, listener as (...args: unknown[]) => void);
        return view;
      },
    };
    return view as unknown as ChildProcessLike;
  }

  async snapshotDescendants(): Promise<ProcessInfo[]> {
    const pid = this.child.pid;
    if (pid === undefined || !this.running) return [];
    const processes = await this.lister.list();
    const snapshot = descendantsIn(processes, pid, false);
    this.rememberSnapshot(snapshot);
    return snapshot;
  }

  waitForExit(timeoutMs: number): Promise<RuntimeExitInfo> {
    if (this.exitRecord) return Promise.resolve(this.exitRecord);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(adapterError('timeout', `${this.label} did not exit within ${timeoutMs}ms`)),
        timeoutMs,
      );
      void this.exited.then((info) => {
        clearTimeout(timer);
        resolve(info);
      });
    });
  }

  terminate(options: TerminateOptions = {}): Promise<TerminationReport> {
    this.terminating ??= this.runTermination(options);
    return this.terminating;
  }

  private rememberSnapshot(snapshot: ProcessInfo[]): void {
    const known = new Map(this.lastSnapshot.map((p) => [`${p.pid}@${p.startedAt}`, p]));
    for (const p of snapshot) known.set(`${p.pid}@${p.startedAt}`, p);
    this.lastSnapshot = [...known.values()];
  }

  private async runTermination(options: TerminateOptions): Promise<TerminationReport> {
    const started = Date.now();
    const graceMs = options.graceMs ?? 2_000;
    const killWaitMs = options.killWaitMs ?? 3_000;
    this.expectedExit = true;
    const pid = this.child.pid;

    if (this.running) {
      try {
        await this.snapshotDescendants();
      } catch {
        // Snapshot failure must not block termination; verification below still uses the group.
      }
    }
    const descendants = [...this.lastSnapshot];

    let forced = false;
    if (this.running) {
      this.signalGroup('SIGTERM');
      await Promise.race([this.exited, sleep(graceMs)]);
    }
    let survivors = await this.collectSurvivors(descendants);
    if (this.running || survivors.length > 0) {
      forced = true;
      this.signalGroup('SIGKILL');
      for (const p of survivors) {
        try {
          process.kill(p.pid, 'SIGKILL');
        } catch {
          // Already gone.
        }
      }
      const deadline = Date.now() + killWaitMs;
      await Promise.race([this.exited, sleep(killWaitMs)]);
      survivors = await this.collectSurvivors(descendants);
      while (survivors.length > 0 && Date.now() < deadline) {
        await sleep(50);
        survivors = await this.collectSurvivors(descendants);
      }
    }
    const exit = this.exitRecord;
    return {
      exit,
      forced,
      descendants,
      survivors,
      confirmed: exit !== undefined && survivors.length === 0 && pid !== undefined,
      elapsedMs: Date.now() - started,
    };
  }

  private async collectSurvivors(descendants: readonly ProcessInfo[]): Promise<ProcessInfo[]> {
    const pid = this.child.pid;
    if (pid === undefined) return [];
    let processes: ProcessInfo[];
    try {
      processes = await this.lister.list();
    } catch {
      return [...descendants];
    }
    const result = new Map<string, ProcessInfo>();
    for (const alive of await findAlive(descendants.map(identityOf), { list: async () => processes })) {
      result.set(`${alive.pid}@${alive.startedAt}`, alive);
    }
    for (const member of processes) {
      if (member.pgid === pid && member.pid !== pid && !isZombie(member)) {
        result.set(`${member.pid}@${member.startedAt}`, member);
      }
    }
    return [...result.values()];
  }

  private signalGroup(signal: NodeJS.Signals): boolean {
    const pid = this.child.pid;
    if (pid === undefined) return false;
    try {
      process.kill(-pid, signal);
      return true;
    } catch {
      try {
        return this.child.kill(signal);
      } catch {
        return false;
      }
    }
  }
}
