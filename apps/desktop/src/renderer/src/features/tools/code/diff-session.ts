import type { editor, IDisposable } from 'monaco-editor/editor/editor.api.js'
import { openEditorAppearance } from './editor-appearance'
import { diffEditorOptions, modifiedAriaLabel, originalAriaLabel, lockViewerModelOptions } from './editor-options'
import { languageIdForPath, PLAIN_TEXT } from './languages'
import type { MonacoRuntime } from './monaco-runtime-types'
import { VIEW_STATE_LIMIT, ViewStateStore } from './view-state-store'

export interface DiffContent {
  path: string
  original: string
  modified: string
  viewStateKey: string
}

/** One Monaco diff editor with its two models, alive between `openDiffSession` and `dispose`. */
export interface DiffSession {
  show(content: DiffContent): void
  configure(options: { sideBySide: boolean; hideUnchanged: boolean }): void
  goToDiff(direction: 'next' | 'previous'): void
  dispose(): void
}

export const diffViewStates = new ViewStateStore<editor.IDiffEditorViewState>(VIEW_STATE_LIMIT)

/** Like `openCodeSession`: resolves `null` when cancelled before anything was created. */
export async function openDiffSession(
  runtime: MonacoRuntime, host: HTMLElement, initial: DiffContent, cancelled: () => boolean
): Promise<DiffSession | null> {
  const { monaco } = runtime
  const appearance = await openEditorAppearance(monaco, host)
  const wanted = languageIdForPath(initial.path)
  const registered = await runtime.ensureLanguage(wanted)
  if (cancelled()) { appearance.dispose(); return null }

  let language = registered ? wanted : PLAIN_TEXT
  let shown = initial
  let ticket = 0
  let disposed = false
  let pendingRestore: IDisposable | undefined
  let pendingState: editor.IDiffEditorViewState | undefined
  let original: editor.ITextModel | undefined
  let modified: editor.ITextModel | undefined
  let view: editor.IStandaloneDiffEditor | undefined
  try {
    original = monaco.editor.createModel(initial.original, language)
    modified = monaco.editor.createModel(initial.modified, language)
    view = monaco.editor.createDiffEditor(host, diffEditorOptions(appearance.fontFamily, appearance.theme, initial.path))
    view.setModel({ original, modified })
    lockViewerModelOptions(original); lockViewerModelOptions(modified)
  } catch (error) {
    view?.dispose(); original?.dispose(); modified?.dispose(); appearance.dispose()
    throw error
  }
  const diffEditor = view
  const originalModel = original
  const modifiedModel = modified

  /**
   * The diff is computed asynchronously, and with `hideUnchangedRegions` the layout (collapsed regions) only exists once it
   * arrives, so the scroll position is restored on the first update after the models changed, not before.
   */
  const restoreWhenComputed = (state: editor.IDiffEditorViewState | null | undefined) => {
    pendingRestore?.dispose()
    pendingRestore = pendingState = undefined
    if (!state) return
    const subscription = diffEditor.onDidUpdateDiff(() => {
      subscription.dispose()
      if (pendingRestore === subscription) pendingRestore = pendingState = undefined
      diffEditor.restoreViewState(state)
    })
    pendingRestore = subscription
    pendingState = state
  }
  // `originalAriaLabel` / `modifiedAriaLabel` are construction options only; later changes go to the two sub-editors.
  const relabel = (path: string) => {
    diffEditor.getOriginalEditor().updateOptions({ ariaLabel: originalAriaLabel(path) })
    diffEditor.getModifiedEditor().updateOptions({ ariaLabel: modifiedAriaLabel(path) })
  }
  /** The position to remember: the one still waiting to be restored wins over the editor's momentary top-of-file state. */
  const currentViewState = () => (pendingRestore ? pendingState : diffEditor.saveViewState())
  restoreWhenComputed(diffViewStates.get(initial.viewStateKey))

  return {
    show(next) {
      const previous = shown
      if (disposed || (next.path === previous.path && next.original === previous.original && next.modified === previous.modified && next.viewStateKey === previous.viewStateKey)) return
      const sameFile = next.viewStateKey === previous.viewStateKey
      const saved = currentViewState()
      if (!sameFile) diffViewStates.set(previous.viewStateKey, saved)
      const target = sameFile ? saved : diffViewStates.get(next.viewStateKey)
      if (next.original !== previous.original) originalModel.setValue(next.original)
      if (next.modified !== previous.modified) modifiedModel.setValue(next.modified)
      if (next.path !== previous.path) relabel(next.path)
      shown = next
      restoreWhenComputed(target)

      const nextLanguage = languageIdForPath(next.path)
      const current = ++ticket
      void runtime.ensureLanguage(nextLanguage).then((ok) => {
        const id = ok ? nextLanguage : PLAIN_TEXT
        if (disposed || current !== ticket || id === language) return
        language = id
        monaco.editor.setModelLanguage(originalModel, id)
        monaco.editor.setModelLanguage(modifiedModel, id)
      })
    },
    configure({ sideBySide, hideUnchanged }) {
      if (disposed) return
      // An explicit choice: the automatic inline fallback for narrow panels applies only to side by side.
      diffEditor.updateOptions({ renderSideBySide: sideBySide, useInlineViewWhenSpaceIsLimited: sideBySide, hideUnchangedRegions: { enabled: hideUnchanged } })
    },
    goToDiff(direction) {
      if (!disposed) diffEditor.goToDiff(direction)
    },
    dispose() {
      if (disposed) return
      disposed = true
      diffViewStates.set(shown.viewStateKey, currentViewState())
      pendingRestore?.dispose()
      appearance.dispose()
      // The diff editor does not own its models: detach, destroy the editor, then free the models.
      diffEditor.setModel(null)
      diffEditor.dispose()
      originalModel.dispose()
      modifiedModel.dispose()
    }
  }
}
