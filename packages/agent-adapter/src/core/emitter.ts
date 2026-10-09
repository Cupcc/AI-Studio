export type Unsubscribe = () => void;

export interface EmitterOptions {
  /** Receives exceptions thrown by listeners. Listener failures never reach the emitter's caller. */
  onListenerError?: (error: unknown) => void;
}

const defaultListenerErrorReporter = (error: unknown) => {
  const detail = error instanceof Error ? error : new Error(String(error));
  process.emitWarning(detail, { code: 'AGENT_ADAPTER_LISTENER_ERROR' });
};

/**
 * Single-channel event stream with ordered, non-reentrant delivery: an `emit` issued from
 * inside a listener is queued and delivered after the current event reached every listener,
 * so all listeners observe the same order.
 */
export class EventStream<T> {
  private readonly listeners = new Set<(value: T) => void>();
  private readonly queue: T[] = [];
  private dispatching = false;
  private disposed = false;
  private readonly onListenerError: (error: unknown) => void;

  constructor(options: EmitterOptions = {}) {
    this.onListenerError = options.onListenerError ?? defaultListenerErrorReporter;
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  subscribe(listener: (value: T) => void): Unsubscribe {
    if (this.disposed) return () => {};
    // Wrap so the same function can be subscribed twice and unsubscribed independently.
    const entry = (value: T) => listener(value);
    this.listeners.add(entry);
    return () => {
      this.listeners.delete(entry);
    };
  }

  once(listener: (value: T) => void): Unsubscribe {
    const unsubscribe = this.subscribe((value) => {
      unsubscribe();
      listener(value);
    });
    return unsubscribe;
  }

  emit(value: T): void {
    if (this.disposed) return;
    this.queue.push(value);
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      while (this.queue.length > 0) {
        const next = this.queue.shift() as T;
        for (const listener of [...this.listeners]) {
          if (!this.listeners.has(listener)) continue;
          try {
            listener(next);
          } catch (error) {
            this.onListenerError(error);
          }
        }
      }
    } finally {
      this.dispatching = false;
    }
  }

  /** Removes all listeners; later emits and subscriptions are no-ops. */
  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    this.queue.length = 0;
  }
}

/** Typed multi-channel emitter built from {@link EventStream}s. */
export class TypedEmitter<Events extends Record<string, unknown>> {
  private readonly streams = new Map<keyof Events, EventStream<unknown>>();
  private disposed = false;

  constructor(private readonly options: EmitterOptions = {}) {}

  on<K extends keyof Events>(type: K, listener: (payload: Events[K]) => void): Unsubscribe {
    if (this.disposed) return () => {};
    return this.stream(type).subscribe(listener as (value: unknown) => void);
  }

  once<K extends keyof Events>(type: K, listener: (payload: Events[K]) => void): Unsubscribe {
    if (this.disposed) return () => {};
    return this.stream(type).once(listener as (value: unknown) => void);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    if (this.disposed) return;
    this.streams.get(type)?.emit(payload);
  }

  listenerCount<K extends keyof Events>(type: K): number {
    return this.streams.get(type)?.listenerCount ?? 0;
  }

  dispose(): void {
    this.disposed = true;
    for (const stream of this.streams.values()) stream.dispose();
    this.streams.clear();
  }

  private stream(type: keyof Events): EventStream<unknown> {
    let stream = this.streams.get(type);
    if (!stream) {
      stream = new EventStream<unknown>(this.options);
      this.streams.set(type, stream);
    }
    return stream;
  }
}
