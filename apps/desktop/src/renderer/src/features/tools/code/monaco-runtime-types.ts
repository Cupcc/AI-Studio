import type * as Monaco from 'monaco-editor/editor/editor.api.js'

export type MonacoApi = typeof Monaco

/** What the viewers need from Monaco; tests replace it with a fake. */
export interface MonacoRuntime {
  readonly monaco: MonacoApi
  /** Registers a language id; resolves `false` when it is unknown or failed to load (show plain text then). */
  ensureLanguage(id: string): Promise<boolean>
}
