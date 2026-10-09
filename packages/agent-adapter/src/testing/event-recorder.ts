import { adapterError } from '../errors.js';
import type { AdapterEvent, AdapterEventListener, AdapterEventOf, AdapterEventType } from '../events.js';

type Subscribable = { subscribe(listener: AdapterEventListener): () => void };

/** Records a session's events and lets tests await specific ones. */
export class EventRecorder {
  readonly events: AdapterEvent[] = [];
  private readonly waiters = new Set<{ match: (event: AdapterEvent) => boolean; resolve: (event: AdapterEvent) => void }>();
  private readonly unsubscribe: () => void;

  constructor(source: Subscribable) {
    this.unsubscribe = source.subscribe((event) => {
      this.events.push(event);
      for (const waiter of [...this.waiters]) {
        if (waiter.match(event)) {
          this.waiters.delete(waiter);
          waiter.resolve(event);
        }
      }
    });
  }

  types(): string[] {
    return this.events.map((event) => event.type);
  }

  ofType<K extends AdapterEventType>(type: K): AdapterEventOf<K>[] {
    return this.events.filter((event): event is AdapterEventOf<K> => event.type === type);
  }

  last<K extends AdapterEventType>(type: K): AdapterEventOf<K> | undefined {
    const list = this.ofType(type);
    return list[list.length - 1];
  }

  /** Resolves with the first recorded or future event of `type` matching `predicate`. */
  waitFor<K extends AdapterEventType>(
    type: K,
    predicate: (event: AdapterEventOf<K>) => boolean = () => true,
    timeoutMs = 5_000,
  ): Promise<AdapterEventOf<K>> {
    const match = (event: AdapterEvent) => event.type === type && predicate(event as AdapterEventOf<K>);
    const existing = this.events.find(match);
    if (existing) return Promise.resolve(existing as AdapterEventOf<K>);
    return new Promise((resolve, reject) => {
      const waiter = {
        match,
        resolve: (event: AdapterEvent) => {
          clearTimeout(timer);
          resolve(event as AdapterEventOf<K>);
        },
      };
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(adapterError('timeout', `No ${type} event within ${timeoutMs}ms; got: ${this.types().join(', ')}`));
      }, timeoutMs);
      this.waiters.add(waiter);
    });
  }

  /** Concatenated `item.delta` text per item id, for checking that bodies are not duplicated. */
  textByItem(): Map<string, string> {
    const result = new Map<string, string>();
    for (const event of this.ofType('item.delta')) {
      if (event.channel !== 'text') continue;
      result.set(event.itemId, (result.get(event.itemId) ?? '') + event.delta);
    }
    return result;
  }

  clear(): void {
    this.events.length = 0;
  }

  dispose(): void {
    this.unsubscribe();
    this.waiters.clear();
  }
}
