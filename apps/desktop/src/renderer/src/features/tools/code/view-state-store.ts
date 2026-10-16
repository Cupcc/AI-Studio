/**
 * Bounded least-recently-used store of editor view states (scroll position, selection, ...), keyed by the panel's
 * `viewStateKey`. Module level on purpose: a viewer is disposed whenever its panel is hidden or unmounted, and the
 * position must survive that. Only opaque objects produced by `saveViewState()` are stored; they are small.
 */
export class ViewStateStore<T> {
  private readonly entries = new Map<string, T>()

  constructor(readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit must be a positive integer')
  }

  get size(): number { return this.entries.size }

  /** Reads and refreshes the entry (it becomes the most recently used). */
  get(key: string): T | undefined {
    const value = this.entries.get(key)
    if (value === undefined) return undefined
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  /** Stores the state; `null` / `undefined` (nothing to restore) removes the key instead. Evicts the oldest entries over the limit. */
  set(key: string, value: T | null | undefined): void {
    this.entries.delete(key)
    if (value === null || value === undefined) return
    this.entries.set(key, value)
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value as string)
  }

  delete(key: string): void { this.entries.delete(key) }
  clear(): void { this.entries.clear() }
}

/** Number of files / diffs whose position is remembered; older ones fall back to the top of the file. */
export const VIEW_STATE_LIMIT = 100
