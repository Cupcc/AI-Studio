import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { SpawnedProcess } from '@anthropic-ai/claude-agent-sdk';
import type { RuntimeHandle } from '../core/runtime-process.js';

/** SDK spawning is synchronous; RuntimeProcess.start waits for the OS spawn event.
 * Buffer its stdio until that event without creating a second process manager. */
export class SpawnBridge extends EventEmitter implements SpawnedProcess {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  private runtime?: RuntimeHandle;
  private requestedSignal?: NodeJS.Signals;

  constructor(readonly ready: Promise<RuntimeHandle>) {
    super();
    this.on('error', () => {});
    this.stdin.on('error', () => {});
    this.stdout.on('error', () => {});
    void ready.then((runtime) => {
      this.runtime = runtime;
      runtime.stdout.pipe(this.stdout);
      this.stdin.pipe(runtime.stdin);
      runtime.onExit((info) => this.emit('exit', info.code, info.signal));
      if (this.requestedSignal) runtime.processLike().kill(this.requestedSignal);
    }, (error: unknown) => {
      this.stdin.destroy();
      this.stdout.destroy();
      this.emit('error', error);
    });
  }

  get killed(): boolean { return this.requestedSignal !== undefined; }
  get exitCode(): number | null { return this.runtime?.exitInfo?.code ?? null; }
  get signalCode(): NodeJS.Signals | null { return (this.runtime?.exitInfo?.signal as NodeJS.Signals | null) ?? null; }
  kill(signal: NodeJS.Signals): boolean {
    this.requestedSignal = signal;
    return this.runtime?.processLike().kill(signal) ?? true;
  }
}
