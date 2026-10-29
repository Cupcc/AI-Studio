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
