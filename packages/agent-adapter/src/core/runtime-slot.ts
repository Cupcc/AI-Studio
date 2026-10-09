import { adapterError } from '../errors.js';
import type { RuntimeHandle, TerminateOptions, TerminationReport } from './runtime-process.js';

/**
 * Holds the single runtime of one session. Replacing a runtime first terminates the old one
 * and requires system-level exit evidence; without it no new runtime is started, so old and
 * new runtimes never run in parallel (04 §4 rule 7).
 */
export class RuntimeSlot<R extends RuntimeHandle = RuntimeHandle> {
  private runtime: R | undefined;
  private generationCounter = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly factory: (generation: number) => Promise<R>,
    private readonly terminateOptions: TerminateOptions = {},
  ) {}

  get current(): R | undefined {
    return this.runtime;
  }

  get generation(): number {
    return this.generationCounter;
  }

  /** Starts the first runtime. Fails if a runtime is present (use `replace`). */
  start(): Promise<R> {
    return this.serialize(async () => {
      if (this.runtime) throw adapterError('invalid_state', 'A runtime is already present in this slot');
      return this.spawnNext();
    });
  }

  /**
   * Terminates the current runtime (process group and recorded descendants), verifies exit, then
   * starts a replacement. Rejects with `stop_cleanup_failed` and starts nothing when exit is unproven.
   */
  replace(): Promise<{ runtime: R; previous: TerminationReport | undefined }> {
    return this.serialize(async () => {
      const previous = this.runtime ? await this.runtime.terminate(this.terminateOptions) : undefined;
      if (previous && !previous.confirmed) {
        throw adapterError('stop_cleanup_failed', 'Previous runtime exit could not be confirmed; not starting a parallel runtime', {
          native: {
            source: 'runtime:terminate',
            detail: { survivors: previous.survivors.map((p) => ({ pid: p.pid, command: p.command })) },
          },
        });
      }
      this.runtime = undefined;
      const runtime = await this.spawnNext();
      return { runtime, previous };
    });
  }

  /** Terminates the current runtime; the slot keeps the exited handle for inspection. */
  shutdown(): Promise<TerminationReport | undefined> {
    return this.serialize(async () => (this.runtime ? this.runtime.terminate(this.terminateOptions) : undefined));
  }

  private async spawnNext(): Promise<R> {
    const generation = ++this.generationCounter;
    const runtime = await this.factory(generation);
    this.runtime = runtime;
    return runtime;
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
