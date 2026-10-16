import type { editor } from 'monaco-editor/editor/editor.api.js'
import { openEditorAppearance } from './editor-appearance'
import { codeAriaLabel, codeEditorOptions, lockViewerModelOptions } from './editor-options'
import { languageIdForPath, PLAIN_TEXT } from './languages'
import type { MonacoRuntime } from './monaco-runtime-types'
import { VIEW_STATE_LIMIT, ViewStateStore } from './view-state-store'

export interface CodeContent {
  path: string
  text: string
  viewStateKey: string
}

/** One Monaco editor with one model, alive between `openCodeSession` and `dispose`. */
export interface CodeSession {
  /** Shows other content (another file, or a fresh read of the same one) without recreating the editor. */
  show(content: CodeContent): void
  /** Remembers the view state under the current key, then destroys the editor, its model and its observers. */
  dispose(): void
}

/** Scroll / selection of recently shown files; survives the editor being disposed when the panel is hidden. */
export const codeViewStates = new ViewStateStore<editor.ICodeEditorViewState>(VIEW_STATE_LIMIT)

/**
 * Creates the editor inside `host`. Resolves `null` (nothing created) when `cancelled()` turns true while the font and
 * grammar are still loading, so a viewer that was hidden meanwhile never builds DOM. Throws if Monaco cannot create the editor.
 */
export async function openCodeSession(
  runtime: MonacoRuntime, host: HTMLElement, initial: CodeContent, cancelled: () => boolean
): Promise<CodeSession | null> {
  const { monaco } = runtime
  const appearance = await openEditorAppearance(monaco, host)
  const wanted = languageIdForPath(initial.path)
  const registered = await runtime.ensureLanguage(wanted)
  if (cancelled()) { appearance.dispose(); return null }

  let language = registered ? wanted : PLAIN_TEXT
  let shown = initial
  let ticket = 0
  let disposed = false
  let model: editor.ITextModel | undefined
  let view: editor.IStandaloneCodeEditor | undefined
  try {
    model = monaco.editor.createModel(initial.text, language)
    view = monaco.editor.create(host, { ...codeEditorOptions(appearance.fontFamily, appearance.theme, initial.path), model })
    lockViewerModelOptions(model)
  } catch (error) {
    view?.dispose(); model?.dispose(); appearance.dispose()
    throw error
  }
  const editorInstance = view
  const textModel = model
  const restored = codeViewStates.get(initial.viewStateKey)
  if (restored) editorInstance.restoreViewState(restored)

  return {
    show(next) {
      if (disposed || (next.path === shown.path && next.text === shown.text && next.viewStateKey === shown.viewStateKey)) return
      const previous = shown
      const sameFile = next.viewStateKey === previous.viewStateKey
      // Same file read again: keep the position across the content swap. Another file: park the old position, restore the new one.
      const saved = editorInstance.saveViewState()
      if (!sameFile) codeViewStates.set(previous.viewStateKey, saved)
      const target = sameFile ? saved : codeViewStates.get(next.viewStateKey)
      if (next.text !== previous.text) textModel.setValue(next.text)
      if (next.path !== previous.path) editorInstance.updateOptions({ ariaLabel: codeAriaLabel(next.path) })
      shown = next
      if (target) editorInstance.restoreViewState(target)
      else editorInstance.setScrollPosition({ scrollTop: 0, scrollLeft: 0 })

      const nextLanguage = languageIdForPath(next.path)
      const current = ++ticket
      void runtime.ensureLanguage(nextLanguage).then((ok) => {
        const id = ok ? nextLanguage : PLAIN_TEXT
        if (disposed || current !== ticket || id === language) return
        language = id
        monaco.editor.setModelLanguage(textModel, id)
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      codeViewStates.set(shown.viewStateKey, editorInstance.saveViewState())
      appearance.dispose()
      editorInstance.dispose()
      textModel.dispose()
    }
  }
}
