import { adapterError } from '../errors.js';

/**
 * Push-based async iterable, e.g. the Streaming Input prompt of the Claude Agent SDK.
 * `end()` finishes iteration after queued values drain; `fail()` rejects pending reads.
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly readers: Array<{ resolve: (result: IteratorResult<T>) => void; reject: (error: unknown) => void }> = [];
  private ended = false;
  private failure: unknown;

  get size(): number {
    return this.values.length;
  }

  get isEnded(): boolean {
    return this.ended;
  }

  push(value: T): void {
    if (this.ended) throw adapterError('invalid_state', 'Queue has ended');
    const reader = this.readers.shift();
    if (reader) reader.resolve({ value, done: false });
    else this.values.push(value);
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    if (this.values.length === 0) {
      for (const reader of this.readers.splice(0)) reader.resolve({ value: undefined, done: true });
    }
  }

  fail(error: unknown): void {
    if (this.ended) return;
    this.ended = true;
    this.failure = error;
    this.values.length = 0;
    for (const reader of this.readers.splice(0)) reader.reject(error);
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.values.length > 0) return Promise.resolve({ value: this.values.shift() as T, done: false });
        if (this.failure !== undefined) return Promise.reject(this.failure);
        if (this.ended) return Promise.resolve({ value: undefined, done: true });
        return new Promise<IteratorResult<T>>((resolve, reject) => this.readers.push({ resolve, reject }));
      },
      return: () => {
        this.end();
        return Promise.resolve({ value: undefined, done: true });
      },
    };
  }
}
