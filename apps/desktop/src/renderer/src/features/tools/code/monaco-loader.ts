import type { MonacoRuntime } from './monaco-runtime-types'

let loading: Promise<MonacoRuntime> | undefined

/**
 * Loads Monaco (several MiB of script plus CSS and the codicon font) on first use. The viewer components stay small and
 * render a status line meanwhile; a failed load (missing chunk) is retried by the next call instead of being cached.
 */
export function loadMonaco(): Promise<MonacoRuntime> {
  loading ??= import('./monaco-runtime').then(
    (module) => module.runtime,
    (error: unknown) => { loading = undefined; throw error }
  )
  return loading
}
