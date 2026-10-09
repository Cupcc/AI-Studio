import { EventEmitter } from 'node:events';
import { PassThrough, type Readable, type Writable } from 'node:stream';
import { adapterError } from '../errors.js';
import type { RuntimeExitInfo } from '../types.js';
import { deferred, sleep } from '../core/async.js';
import { EventStream, type Unsubscribe } from '../core/emitter.js';
import { createStreamLineTransport, type LineTransport } from '../core/line-transport.js';
import type { ProcessInfo } from '../core/process-probe.js';
import type { ChildProcessLike, RuntimeHandle, TerminateOptions, TerminationReport } from '../core/runtime-process.js';

let nextFakePid = 900_000;

export interface FakeRuntimeOptions {
  label?: string;
  generation?: number;
  /**
   * How `terminate()` behaves: `exit` exits and confirms; `survivors` exits but reports
   * survivors (unconfirmed); `hang` never exits and reports unconfirmed.
   */
  terminateBehavior?: 'exit' | 'survivors' | 'hang';
  /** Returned by `snapshotDescendants()` and reported as survivors for `survivors`. */
  descendants?: ProcessInfo[];
}

/**
 * In-memory {@link RuntimeHandle}. The provider under test talks to `lineTransport()` /
 * `processLike()`; the test plays the CLI through `cliTransport` and controls exits.
 */
export class FakeRuntime implements RuntimeHandle {
  readonly label: string;
  readonly generation: number;
  readonly pid = nextFakePid++;
  readonly exited: Promise<RuntimeExitInfo>;
  /** Lines the CLI side writes go to the provider's stdout. */
  readonly cliTransport: LineTransport;
  readonly terminateCalls: TerminateOptions[] = [];
  terminateBehavior: NonNullable<FakeRuntimeOptions['terminateBehavior']>;
  descendants: ProcessInfo[];
  stderrBuffer = '';

  private readonly toCli = new PassThrough();
  private readonly fromCli = new PassThrough();
  private readonly exitStream = new EventStream<RuntimeExitInfo>();
  private readonly stderrStream = new EventStream<string>();
  private readonly exitDeferred = deferred<RuntimeExitInfo>();
  private readonly childEvents = new EventEmitter();
  private exitRecord: RuntimeExitInfo | undefined;
  private transport: LineTransport | undefined;
  private expected = false;

  constructor(options: FakeRuntimeOptions = {}) {
    this.label = options.label ?? 'fake-cli';
    this.generation = options.generation ?? 1;
    this.terminateBehavior = options.terminateBehavior ?? 'exit';
    this.descendants = options.descendants ?? [];
    this.exited = this.exitDeferred.promise;
    this.cliTransport = createStreamLineTransport(this.toCli, this.fromCli);
  }

  get running(): boolean {
    return this.exitRecord === undefined;
  }

  get exitInfo(): RuntimeExitInfo | undefined {
    return this.exitRecord;
  }

  get stdin(): Writable {
    return this.toCli;
  }

  get stdout(): Readable {
    return this.fromCli;
  }

  stderrTail(): string {
    return this.stderrBuffer;
  }

  writeStderr(text: string): void {
    this.stderrBuffer = (this.stderrBuffer + text).slice(-64 * 1024);
    this.stderrStream.emit(text);
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
    this.transport ??= createStreamLineTransport(this.fromCli, this.toCli);
    return this.transport;
  }

  processLike(): ChildProcessLike {
    const events = this.childEvents;
    const view = {
      stdin: this.toCli as Writable,
      stdout: this.fromCli as Readable,
      killed: false,
      exitCode: null as number | null,
      signalCode: null as NodeJS.Signals | null,
      kill: (signal: NodeJS.Signals = 'SIGTERM') => {
        this.expected = true;
        this.exit({ code: null, signal });
        return true;
      },
      on: (event: string, listener: (...args: never[]) => void) => {
        events.on(event, listener as (...args: unknown[]) => void);
        return view;
      },
      once: (event: string, listener: (...args: never[]) => void) => {
        events.once(event, listener as (...args: unknown[]) => void);
        return view;
      },
      off: (event: string, listener: (...args: never[]) => void) => {
        events.off(event, listener as (...args: unknown[]) => void);
        return view;
      },
    };
    this.exitStream.subscribe((info) => {
      view.killed = info.expected;
      view.exitCode = info.code;
      view.signalCode = info.signal as NodeJS.Signals | null;
    });
    return view as unknown as ChildProcessLike;
  }

  async snapshotDescendants(): Promise<ProcessInfo[]> {
    return this.running ? [...this.descendants] : [];
  }

  /** Simulates an unexpected exit (crash or external kill). */
  crash(code: number | null = 1, signal: string | null = null): void {
    this.exit({ code, signal });
  }

  /** Simulates a requested, clean exit. */
  exitNormally(code = 0): void {
    this.expected = true;
    this.exit({ code, signal: null });
  }

  async terminate(options: TerminateOptions = {}): Promise<TerminationReport> {
    this.terminateCalls.push(options);
    const started = Date.now();
    this.expected = true;
    const descendants = [...this.descendants];
    if (this.terminateBehavior === 'hang') {
      await sleep(Math.min(options.graceMs ?? 10, 50));
      return { exit: undefined, forced: true, descendants, survivors: descendants, confirmed: false, elapsedMs: Date.now() - started };
    }
    this.exit({ code: null, signal: 'SIGTERM' });
    const survivors = this.terminateBehavior === 'survivors' ? descendants : [];
    return {
      exit: this.exitRecord,
      forced: false,
      descendants,
      survivors,
      confirmed: survivors.length === 0,
      elapsedMs: Date.now() - started,
    };
  }

  waitForExit(timeoutMs: number): Promise<RuntimeExitInfo> {
    if (this.exitRecord) return Promise.resolve(this.exitRecord);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(adapterError('timeout', `${this.label} did not exit within ${timeoutMs}ms`)), timeoutMs);
      void this.exited.then((info) => {
        clearTimeout(timer);
        resolve(info);
      });
    });
  }

  private exit(result: { code: number | null; signal: string | null }): void {
    if (this.exitRecord) return;
    const info: RuntimeExitInfo = {
      generation: this.generation,
      pid: this.pid,
      code: result.code,
      signal: result.signal,
      expected: this.expected,
      exitedAt: Date.now(),
    };
    if (this.stderrBuffer) info.stderrTail = this.stderrBuffer;
    this.exitRecord = info;
    this.toCli.end();
    this.fromCli.end();
    this.exitDeferred.resolve(info);
    this.exitStream.emit(info);
    this.childEvents.emit('exit', info.code, info.signal);
  }
}

/** Builds a {@link ProcessInfo} for fake descendants. */
export function fakeProcess(pid: number, command: string, extra: Partial<ProcessInfo> = {}): ProcessInfo {
  return { pid, ppid: 1, pgid: pid, state: 'S', startedAt: 'Thu Jan  1 00:00:00 2026', command, ...extra };
}
