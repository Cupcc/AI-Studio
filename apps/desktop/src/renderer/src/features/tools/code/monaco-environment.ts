/**
 * Monaco asks `self.MonacoEnvironment.getWorker` for its editor worker. The production CSP says `worker-src 'none'` and
 * is deliberately not relaxed for Monaco (a blob worker would let any script the renderer builds run as a worker), so
 * this hook THROWS: Monaco catches it, logs a warning and runs the editor worker on the main thread instead (`EditorWorkerClient` ->
 * `SynchronousWorkerClient`). Returning `undefined` would be worse: Monaco then builds a blob worker itself and the CSP
 * reports a violation.
 *
 * The main-thread cost is bounded by `limits.ts` (1 MiB viewer, 512 KiB per diff side, 250 ms diff budget). This module
 * must be evaluated before Monaco: `monaco-runtime.ts` imports it first.
 */
export const WORKERS_DISABLED_MESSAGE = 'Web workers are disabled by the Content Security Policy; Monaco runs its editor worker on the main thread.'

interface MonacoGlobal { MonacoEnvironment?: { getWorker?: (moduleId: string, label: string) => Worker } }

export function installMonacoEnvironment(target: MonacoGlobal = globalThis as MonacoGlobal): void {
  target.MonacoEnvironment = {
    getWorker() { throw new Error(WORKERS_DISABLED_MESSAGE) }
  }
}

installMonacoEnvironment()
