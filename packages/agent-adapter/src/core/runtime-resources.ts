import { RuntimeStartupError } from './runtime-process.js';
import { adapterError } from '../errors.js';
import type { RuntimeHandle, RuntimeSpawnOptions, TerminateOptions, TerminationReport } from './runtime-process.js';

/**
 * Owns every Runtime a Provider starts, including late/failed startups and probes that never reach
 * the host's AgentSession. A handle stays here until some `terminate()` returned system-level exit
 * evidence for that exact handle; failed releases are retried on the same handle, never by pid.
 */
export class RuntimeResources {
  private readonly handles = new Map<RuntimeHandle, { cwd: string; terminate: TerminateOptions | undefined }>();
  private readonly starting = new Map<Promise<RuntimeHandle>, string>();
  private readonly terminating = new Map<RuntimeHandle, Promise<TerminationReport>>();
  private readonly releases = new Map<string | undefined, Promise<void>>();

  /** Number of Runtimes not yet proven exited (diagnostics and tests). */
  get retained(): number {
    return this.handles.size;
  }

  /** Throws while a release covering `cwd` is running; the gate lifts when that release settles. */
  assertOpen(cwd: string): void {
    if (this.releases.has(undefined) || this.releases.has(cwd)) {
      throw adapterError('invalid_state', 'Runtime resources are being released');
    }
  }

  /** Never throws synchronously: callers such as the Claude SDK spawn hook need a promise to observe. */
  start(options: RuntimeSpawnOptions, factory: (options: RuntimeSpawnOptions) => Promise<RuntimeHandle>): Promise<RuntimeHandle> {
    try {
      this.assertOpen(options.cwd);
    } catch (error) {
      return Promise.reject(error);
    }
    const pending = Promise.resolve().then(() => factory(options)).then(runtime => {
      this.track(runtime, options);
      return runtime;
    }, error => {
      if (error instanceof RuntimeStartupError) this.track(error.runtime, options);
      throw error;
    });
    this.starting.set(pending, options.cwd);
    void pending.then(() => this.starting.delete(pending), () => this.starting.delete(pending));
    return pending;
  }

  /**
   * Strict release: waits for in-flight startups, disposes sessions, then terminates every retained
   * handle in scope. Rejects with an AggregateError when any exit stays unconfirmed. The gate that
   * rejects new startups lifts when it settles, so a cancelled quit or a retry can start again.
   */
  release(cwd: string | undefined, disposeSessions: () => Promise<void>): Promise<void> {
    const previous = this.releases.get(cwd);
    if (previous) return previous;
    const pending = Promise.resolve().then(async () => {
      const matches = (path: string) => cwd === undefined || cwd === path;
      // Factory completion, not a bounded startup observer, owns the late handle.
      await Promise.allSettled([...this.starting].filter(([, path]) => matches(path)).map(([operation]) => operation));
      const errors: unknown[] = [];
      try {
        await disposeSessions();
      } catch (error) {
        errors.push(...(error instanceof AggregateError ? error.errors : [error]));
      }
      const results = await Promise.allSettled([...this.handles].filter(([, owned]) => matches(owned.cwd)).map(([runtime, owned]) => this.terminate(runtime, owned.terminate)));
      for (const result of results) if (result.status === 'rejected') errors.push(result.reason);
      if (errors.length) throw new AggregateError(errors, 'Runtime release failed');
    });
    this.releases.set(cwd, pending);
    void pending.then(() => this.releases.delete(cwd), () => this.releases.delete(cwd));
    return pending;
  }

  /** Registers the handle and drops it once any caller (session, probe, release) proves its exit. */
  private track(runtime: RuntimeHandle, options: RuntimeSpawnOptions): void {
    this.handles.set(runtime, { cwd: options.cwd, terminate: options.terminate });
    const terminate = runtime.terminate.bind(runtime);
    runtime.terminate = async options => {
      const report = await terminate(options);
      if (report.confirmed) this.handles.delete(runtime);
      return report;
    };
  }

  private async terminate(runtime: RuntimeHandle, options: TerminateOptions | undefined): Promise<void> {
    let cleanup = this.terminating.get(runtime);
    if (!cleanup) {
      cleanup = Promise.resolve().then(() => runtime.terminate(options));
      this.terminating.set(runtime, cleanup);
    }
    try {
      const report = await cleanup;
      if (!report.confirmed) throw adapterError('stop_cleanup_failed', `${runtime.label} exit could not be confirmed`);
    } finally {
      this.terminating.delete(runtime);
    }
  }
}
