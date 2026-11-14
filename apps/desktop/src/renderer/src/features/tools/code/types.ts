/** Props of the lazily loaded code viewers (Monaco behind these interfaces, so the library stays replaceable). */
export interface CodeViewerProps {
  path: string
  text: string
  active: boolean
  /** Scroll / selection are restored per key when the same file is shown again. */
  viewStateKey: string
  onError?(message: string): void
  /** Soft wrap (⌥Z in VS Code). */
  wordWrap?: boolean
  /** Scrolls to and selects this 1-based line; a new `nonce` repeats the request for the same line. */
  revealLine?: { line: number; nonce: number }
  /**
   * The text can be edited (TOOLS-Q13). `onChange` receives the whole text after edits: at once while the file is not
   * `dirty`, then at most every ~150 ms and whenever the editor loses focus or goes away. `onSave` is ⌘S inside the editor, after the
   * pending text was delivered. The model (and its undo history) outlives the editor under `viewStateKey`.
   */
  editable?: boolean
  /** The owner already holds unsaved text for this file: later edits are batched. While false, each edit is reported at once. */
  dirty?: boolean
  onChange?(text: string): void
  onSave?(): void
}

export interface CodeDiffViewerProps {
  path: string
  original: string
  modified: string
  active: boolean
  viewStateKey: string
  /** Side by side (default) or inline, as the toggle in VS Code's diff editor. */
  sideBySide?: boolean
  /** Collapse unchanged regions (default true). */
  hideUnchanged?: boolean
  /** Moves to the next / previous change; a new `nonce` repeats the move. */
  navigate?: { direction: 'next' | 'previous'; nonce: number }
}
