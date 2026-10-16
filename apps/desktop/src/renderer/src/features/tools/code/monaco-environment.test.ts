import { describe, expect, it } from 'vitest'
import { installMonacoEnvironment, WORKERS_DISABLED_MESSAGE } from './monaco-environment'

describe('Monaco worker environment', () => {
  it('makes getWorker THROW, so Monaco falls back to its main-thread worker instead of building a blob worker', () => {
    const target: { MonacoEnvironment?: { getWorker?: (id: string, label: string) => Worker } } = {}
    installMonacoEnvironment(target)
    // Returning undefined would send Monaco to `new Worker(blob:)`, which the production CSP (`worker-src 'none'`) reports as a violation.
    expect(() => target.MonacoEnvironment!.getWorker!('workerMain.js', 'editorWorkerService')).toThrow(WORKERS_DISABLED_MESSAGE)
  })

  it('does not provide getWorkerUrl either (that path also ends in a Worker)', () => {
    const target: { MonacoEnvironment?: Record<string, unknown> } = {}
    installMonacoEnvironment(target)
    expect(Object.keys(target.MonacoEnvironment!)).toEqual(['getWorker'])
  })

  it('is already installed on the global object when the module loads (Monaco reads it lazily)', () => {
    const environment = (globalThis as { MonacoEnvironment?: { getWorker?: () => never } }).MonacoEnvironment
    expect(() => environment!.getWorker!()).toThrow()
  })
})
