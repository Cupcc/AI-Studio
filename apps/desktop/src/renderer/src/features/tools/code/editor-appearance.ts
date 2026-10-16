import { createFontGate } from '../terminal-font'
import { CODE_FONT_SIZE } from './editor-options'
import { CODE_THEME_IDS, codeSchemeOf } from './monaco-theme'
import type { MonacoApi } from './monaco-runtime-types'

export interface EditorAppearance {
  readonly fontFamily: string
  /** Monaco theme id for the current colour scheme. */
  readonly theme: string
  dispose(): void
}

/**
 * Font and theme plumbing shared by both viewers, bound to the lifetime of one editor.
 *
 * - Font: the family comes from the `--font-mono` token. Monaco measures its character cell once per font string and caches
 *   it globally, so when IBM Plex Mono is still loading the editor must not measure the fallback face: the gate holds
 *   creation until the face is usable (at most `FONT_WAIT_MS`), the cache is cleared with `remeasureFonts()` if the wait was
 *   needed, and again whenever the document finishes loading more fonts (`loadingdone`).
 * - Theme: Monaco's theme is global. A MutationObserver on `<html data-scheme>` switches it live; open editors keep their
 *   model, scroll position and selection.
 */
export async function openEditorAppearance(monaco: MonacoApi, host: HTMLElement): Promise<EditorAppearance> {
  const fontFamily = getComputedStyle(host).getPropertyValue('--font-mono').trim() || 'monospace'
  const fonts = createFontGate(`${CODE_FONT_SIZE}px ${fontFamily}`)
  const waited = fonts.pending
  await fonts.settled
  if (waited) monaco.editor.remeasureFonts()
  let scheme = codeSchemeOf()
  const observer = new MutationObserver(() => {
    const next = codeSchemeOf()
    if (next === scheme) return
    scheme = next
    monaco.editor.setTheme(CODE_THEME_IDS[next])
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-scheme'] })
  const unsubscribe = fonts.onLoaded(() => monaco.editor.remeasureFonts())
  return {
    fontFamily,
    // A getter: the scheme may change while the caller is still awaiting the language grammar.
    get theme() { return CODE_THEME_IDS[scheme] },
    dispose() { observer.disconnect(); unsubscribe(); fonts.dispose() }
  }
}
