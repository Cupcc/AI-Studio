import type { editor } from 'monaco-editor/editor/editor.api.js'
import { openEditorAppearance } from './editor-appearance'
import { codeAriaLabel, codeEditorOptions, lockViewerModelOptions } from './editor-options'
import { languageIdForPath, PLAIN_TEXT } from './languages'
import { keepCodeModel, takeCodeModel } from './model-cache'
import type { MonacoRuntime } from './monaco-runtime-types'
import { VIEW_STATE_LIMIT, ViewStateStore } from './view-state-store'

export interface CodeContent {
  path: string
  text: string
  viewStateKey: string
}

/** Editing (TOOLS-Q13): read on every use, so the caller can pass the latest values. */
export interface CodeEditing {
  onChange(text: string): void
  onSave(): void
  /** The owner already holds unsaved text for this file. Until it does, every edit is reported at once. */
  dirty: boolean
}
/** Quiet time before an edit is reported again; focus loss and disposal report at once. */
export const CODE_CHANGE_DEBOUNCE_MS = 150

/** One Monaco editor with one model, alive between `openCodeSession` and `dispose`. */
export interface CodeSession {
  /** Shows other content (another file, or a fresh read of the same one) without recreating the editor. */
  show(content: CodeContent): void
  setWordWrap(on: boolean): void
  /** Scrolls the 1-based line into the centre and selects it. */
  revealLine(line: number): void
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
  runtime: MonacoRuntime, host: HTMLElement, initial: CodeContent, cancelled: () => boolean, editing?: () => CodeEditing
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
  // An editable file returns to the model it had (same text): its undo history survives a tab switch or a hidden panel.
  const cached = editing ? takeCodeModel(initial.viewStateKey, initial.text) : undefined
  try {
    model = cached ?? monaco.editor.createModel(initial.text, language)
    if (cached && cached.getLanguageId() !== language) monaco.editor.setModelLanguage(cached, language)
    view = monaco.editor.create(host, { ...codeEditorOptions(appearance.fontFamily, appearance.theme, initial.path, !!editing), model })
    if (!cached) lockViewerModelOptions(model)
  } catch (error) {
    view?.dispose(); model?.dispose(); appearance.dispose()
    throw error
  }
  const editorInstance = view
  const textModel = model
  const restored = codeViewStates.get(initial.viewStateKey)
  if (restored) editorInstance.restoreViewState(restored)

  // Edits are reported as whole texts; the text reported last counts as shown, so it is not pushed back into the model.
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending = false
  const report = () => {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined }
    if (!pending || !editing) return
    pending = false
    const text = textModel.getValue()
    shown = { ...shown, text }
    editing().onChange(text)
  }
  if (editing) {
    textModel.onDidChangeContent((event) => {
      // `setValue` (new content from disk, or another file) is not an edit.
      if (event.isFlush || disposed) return
      pending = true
      // A clean file must be known as unsaved from its first changed character: closing, quitting or a write from
      // outside may come before any quiet moment (after a save, after undoing back to the saved text).
      if (!editing().dirty) { report(); return }
      if (timer === undefined) timer = setTimeout(report, CODE_CHANGE_DEBOUNCE_MS)
    })
    editorInstance.onDidBlurEditorText(report)
    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => { report(); editing().onSave() })
  }

  return {
    show(next) {
      if (disposed || (next.path === shown.path && next.text === shown.text && next.viewStateKey === shown.viewStateKey)) return
      const previous = shown
      const sameFile = next.viewStateKey === previous.viewStateKey
      // Same file read again: keep the position across the content swap. Another file: park the old position, restore the new one.
      const saved = editorInstance.saveViewState()
      if (!sameFile) codeViewStates.set(previous.viewStateKey, saved)
      const target = sameFile ? saved : codeViewStates.get(next.viewStateKey)
      if (next.text !== previous.text) {
        // New content replaces the model: the owner discarded or replaced the edits (revert, reload of an unchanged file).
        if (timer !== undefined) { clearTimeout(timer); timer = undefined }
        pending = false
        textModel.setValue(next.text)
      }
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
    setWordWrap(on) {
      if (!disposed) editorInstance.updateOptions({ wordWrap: on ? 'on' : 'off' })
    },
    revealLine(line) {
      if (disposed) return
      const target = Math.max(1, Math.min(textModel.getLineCount(), Math.floor(line)))
      editorInstance.setSelection({ startLineNumber: target, startColumn: 1, endLineNumber: target, endColumn: textModel.getLineMaxColumn(target) })
      editorInstance.revealLineInCenter(target)
    },
    dispose() {
      if (disposed) return
      report()
      disposed = true
      codeViewStates.set(shown.viewStateKey, editorInstance.saveViewState())
      appearance.dispose()
      editorInstance.dispose()
      if (editing) keepCodeModel(shown.viewStateKey, textModel)
      else textModel.dispose()
    }
  }
}
