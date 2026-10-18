export interface ShutdownDependencies {
  disposeFeatures(): Promise<void>
  disposeCore(): void
  quit(): void
  onError(error: unknown): void
}

/** Keep every will-quit attempt blocked until feature-owned Runtime cleanup settles. */
export function createShutdownHandler(deps: ShutdownDependencies) {
  let disposing = false
  let disposed = false
  return (event: { preventDefault(): void }): void => {
    if (disposed) return
    event.preventDefault()
    if (disposing) return
    disposing = true
    void (async () => {
      try {
        await deps.disposeFeatures()
      } catch (error) {
        disposing = false
        deps.onError(error)
        return
      }
      try { deps.disposeCore() } catch (error) {
        disposing = false
        deps.onError(error)
        return
      }
      disposed = true
      // Electron needs another macrotask to complete a second app.quit().
      setImmediate(deps.quit)
    })()
  }
}
