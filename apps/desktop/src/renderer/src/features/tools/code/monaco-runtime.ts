// Must stay the first import: Monaco reads `MonacoEnvironment` lazily, but later modules may create editors at load time.
import './monaco-environment'
import * as monaco from 'monaco-editor/editor/editor.api.js'
// Contributions are opt-in in Monaco 0.57: only what a read-only viewer needs. Everything backed by the language service
// or the worker (hover, suggestions, links, unicode highlight, folding, ...) is left out on purpose.
import 'monaco-editor/features/codicon/register.js'
import 'monaco-editor/features/diffEditor/register.js'
import 'monaco-editor/features/find/register.js'
import 'monaco-editor/features/clipboard/register.js'
import 'monaco-editor/features/contextmenu/register.js'
import 'monaco-editor/features/wordOperations/register.js'
import { JSON_CONFIGURATION, JSON_MONARCH } from './json-language'
import { JSON_LANGUAGE, PLAIN_TEXT } from './languages'
import { LANGUAGE_LOADERS } from './language-loaders'
import { defineCodeThemes } from './monaco-theme'
import type { MonacoRuntime } from './monaco-runtime-types'

defineCodeThemes(monaco.editor)

const registered = new Map<string, Promise<boolean>>()

function registerJson(): void {
  monaco.languages.register({ id: JSON_LANGUAGE, extensions: ['.json'], aliases: ['JSON'] })
  monaco.languages.setMonarchTokensProvider(JSON_LANGUAGE, JSON_MONARCH)
  monaco.languages.setLanguageConfiguration(JSON_LANGUAGE, JSON_CONFIGURATION)
}

/**
 * Makes a language id known to Monaco. Resolves `true` once it is registered (its grammar then loads on first use) and
 * `false` for unknown ids or a failed chunk, in which case the caller shows plain text. A failure is not cached.
 */
function ensureLanguage(id: string): Promise<boolean> {
  if (id === PLAIN_TEXT) return Promise.resolve(true)
  let pending = registered.get(id)
  if (!pending) {
    const load = id === JSON_LANGUAGE ? () => Promise.resolve(registerJson()) : LANGUAGE_LOADERS[id]
    pending = load
      ? load().then(() => true, (error: unknown) => { registered.delete(id); console.warn(`Monaco language "${id}" failed to load`, error); return false })
      : Promise.resolve(false)
    registered.set(id, pending)
  }
  return pending
}

export const runtime: MonacoRuntime = { monaco, ensureLanguage }
