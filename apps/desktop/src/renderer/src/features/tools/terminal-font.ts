/** Longest wait for the web font before fitting with the fallback face; `loadingdone` still refits when it arrives late. */
export const FONT_WAIT_MS = 3000

export interface FontGate {
  /** True until the first load settles; a fit made now would measure the fallback face (W5-F5). */
  readonly pending: boolean
  /** Resolves once the face is usable or the wait is abandoned (load error, timeout). Never rejects. */
  readonly settled: Promise<void>
  /** Calls `listener` whenever the document finishes loading fonts (`loadingdone`). Returns the unsubscribe function. */
  onLoaded(listener: () => void): () => void
  dispose(): void
}

type Fonts = Pick<FontFaceSet, 'check' | 'load' | 'addEventListener' | 'removeEventListener'>

/**
 * xterm measures its cells when the terminal opens and after a resize that changes the grid, not when a web font
 * arrives. In a fresh app IBM Plex Mono is still `unloaded` at that point (it loads lazily), so the first fit used
 * fallback metrics (37 rows x 19px or 18px) and nothing corrected it. The gate starts the load, tells the screen to
 * hold its fits while that is outstanding, and reports later font loads so the screen can re-measure and refit.
 *
 * `font` is a CSS font shorthand such as `12px 'IBM Plex Mono', monospace`. Without `document.fonts` (jsdom) or when the
 * shorthand is rejected, the gate is never pending.
 */
export function createFontGate(font: string, options: { fonts?: Fonts; timeoutMs?: number } = {}): FontGate {
  const fonts = options.fonts ?? (typeof document === 'undefined' ? undefined : (document.fonts as Fonts | undefined))
  const listeners = new Set<() => void>()
  let pending = false
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let settled: Promise<void> = Promise.resolve()

  const usable = () => { try { return !fonts || fonts.check(font) } catch { return true } }
  if (fonts && !usable()) {
    pending = true
    settled = new Promise<void>((resolve) => {
      const done = () => {
        if (timer !== undefined) clearTimeout(timer)
        pending = false
        resolve()
      }
      timer = setTimeout(done, options.timeoutMs ?? FONT_WAIT_MS)
      try { void fonts.load(font).then(done, done) } catch { done() }
    })
  }

  const loaded = () => { if (!disposed) for (const listener of [...listeners]) listener() }
  fonts?.addEventListener('loadingdone', loaded)
  return {
    get pending() { return pending },
    settled,
    onLoaded(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() {
      disposed = true
      if (timer !== undefined) clearTimeout(timer)
      listeners.clear()
      fonts?.removeEventListener('loadingdone', loaded)
    }
  }
}
