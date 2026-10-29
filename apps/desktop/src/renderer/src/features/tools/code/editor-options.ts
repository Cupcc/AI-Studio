import { displayName } from '../../../lib/display-path'
import type { editor, IDisposable } from 'monaco-editor/editor/editor.api.js'
import { CODE_DIFF_MAX_COMPUTATION_MS } from './limits'

export const CODE_FONT_SIZE = 12
export const CODE_LINE_HEIGHT = 18

export const codeAriaLabel = (path: string) => `文件内容：${displayName(path)}`
export const originalAriaLabel = (path: string) => `原始版本：${displayName(path)}`
export const modifiedAriaLabel = (path: string) => `修改后版本：${displayName(path)}`

/**
 * Options shared by both viewers: strictly read-only, and every feature that needs the language service or the (disabled)
 * worker, or that costs main-thread time on a large file, is off. `tabFocusMode` keeps Tab / Shift+Tab moving focus out of
 * the editor: a read-only viewer has no use for a tab character, and Monaco's default swallows the key (a keyboard trap).
 */
function viewerOptions(fontFamily: string, theme: string) {
  return {
    theme,
    readOnly: true,
    domReadOnly: true,
    automaticLayout: true,
    tabFocusMode: true,
    accessibilitySupport: 'auto',
    fontFamily,
    fontSize: CODE_FONT_SIZE,
    lineHeight: CODE_LINE_HEIGHT,
    fontLigatures: false,
    minimap: { enabled: false },
    links: false,
    wordBasedSuggestions: 'off',
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    parameterHints: { enabled: false },
    hover: { enabled: 'off' },
    occurrencesHighlight: 'off',
    selectionHighlight: false,
    matchBrackets: 'never',
    codeLens: false,
    colorDecorators: false,
    // Indentation-based ranges without a language service (DEC-25); controls appear on hover like VS Code.
    folding: true,
    foldingStrategy: 'indentation',
    showFoldingControls: 'mouseover',
    foldingMaximumRegions: 2000,
    glyphMargin: false,
    stickyScroll: { enabled: false },
    bracketPairColorization: { enabled: false },
    guides: { indentation: true, bracketPairs: false, highlightActiveIndentation: false },
    renderWhitespace: 'none',
    renderControlCharacters: false,
    renderLineHighlight: 'line',
    scrollBeyondLastLine: false,
    overviewRulerLanes: 0,
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
    lineNumbersMinChars: 3,
    lineDecorationsWidth: 8,
    padding: { top: 6, bottom: 6 },
    cursorBlinking: 'solid',
    contextmenu: true,
    dragAndDrop: false,
    copyWithSyntaxHighlighting: false,
    emptySelectionClipboard: false,
    fixedOverflowWidgets: true,
    scrollbar: { useShadows: false, verticalScrollbarSize: 10, horizontalScrollbarSize: 10, alwaysConsumeMouseWheel: false },
    find: { addExtraSpaceOnTop: false, seedSearchStringFromSelection: 'selection', autoFindInSelection: 'never' }
  } satisfies editor.IEditorOptions & editor.IGlobalEditorOptions
}

/**
 * Bracket pair colourisation is a model option owned by Monaco's configuration service. Creating an editor resets it to
 * enabled on models that already exist (observed in 0.57.0: the editor option of the same name is false, the model's is true),
 * so it is switched off on the model AFTER the editor exists and kept off if the service rewrites it. Colourised brackets
 * would bypass the contrast-checked token colours of `monaco-theme.ts`.
 */
export const VIEWER_MODEL_OPTIONS = {
  bracketColorizationOptions: { enabled: false, independentColorPoolPerBracketType: false }
} satisfies editor.ITextModelUpdateOptions

export function lockViewerModelOptions(model: editor.ITextModel): IDisposable {
  const apply = () => { if (model.getOptions().bracketPairColorizationOptions.enabled) model.updateOptions(VIEWER_MODEL_OPTIONS) }
  apply()
  return model.onDidChangeOptions(apply)
}

export function codeEditorOptions(fontFamily: string, theme: string, path: string): editor.IStandaloneEditorConstructionOptions {
  return { ...viewerOptions(fontFamily, theme), ariaLabel: codeAriaLabel(path) }
}

export function diffEditorOptions(fontFamily: string, theme: string, path: string): editor.IStandaloneDiffEditorConstructionOptions {
  return {
    ...viewerOptions(fontFamily, theme),
    originalAriaLabel: originalAriaLabel(path),
    modifiedAriaLabel: modifiedAriaLabel(path),
    originalEditable: false,
    renderSideBySide: true,
    useInlineViewWhenSpaceIsLimited: true,
    // The diff gutter has no room for folding; unchanged regions collapse instead.
    folding: false,
    renderOverviewRuler: false,
    renderMarginRevertIcon: false,
    renderGutterMenu: false,
    renderIndicators: true,
    // Git reports whitespace changes, so the viewer does too.
    ignoreTrimWhitespace: false,
    diffAlgorithm: 'advanced',
    diffCodeLens: false,
    experimental: { showMoves: false },
    // The worker is disabled: the diff runs on the main thread. Both limits bound that cost (also `limits.ts`).
    maxComputationTime: CODE_DIFF_MAX_COMPUTATION_MS,
    maxFileSize: 1,
    hideUnchangedRegions: { enabled: true, contextLineCount: 3, minimumLineCount: 4, revealLineCount: 20 }
  }
}
