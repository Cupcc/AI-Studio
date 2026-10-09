import { adapterError } from '../errors.js';

export interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
  readonly settled: boolean;
}

export function deferred<T>(): Deferred<T> {
  let resolveFn!: (value: T) => void;
  let rejectFn!: (reason: unknown) => void;
  let settled = false;
  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  return {
    promise,
    resolve(value) {
      if (settled) return;
      settled = true;
      resolveFn(value);
    },
    reject(reason) {
      if (settled) return;
      settled = true;
      rejectFn(reason);
    },
    get settled() {
      return settled;
    },
  };
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Races `work` against a timeout. On timeout the returned promise rejects with an
 * AdapterError(`timeout`) and `controller.abort()` is called so cooperative work can stop.
 */
export async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  label: string,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort(parentSignal.reason);
    else parentSignal.addEventListener('abort', onParentAbort, { once: true });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = adapterError('timeout', `${label} timed out after ${timeoutMs}ms`);
      // Reject before aborting so work that settles on abort cannot win the race.
      reject(error);
      controller.abort(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([work(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
}

/** Polls `predicate` until it returns a truthy value or the timeout expires. */
export async function pollUntil<T>(
  predicate: () => Promise<T | undefined | null | false> | T | undefined | null | false,
  options: { timeoutMs: number; intervalMs?: number; signal?: AbortSignal },
): Promise<T | undefined> {
  const started = Date.now();
  const interval = options.intervalMs ?? 100;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() - started >= options.timeoutMs) return undefined;
    await sleep(Math.min(interval, Math.max(0, options.timeoutMs - (Date.now() - started))), options.signal);
  }
}

/** Monotonic milliseconds for durations; immune to wall-clock changes. */
export function monotonicMs(): number {
  return performance.now();
}
