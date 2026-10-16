/** Props of the lazily loaded code viewers (Monaco behind these interfaces, so the library stays replaceable). */
export interface CodeViewerProps {
  path: string
  text: string
  active: boolean
  /** Scroll / selection are restored per key when the same file is shown again. */
  viewStateKey: string
  onError?(message: string): void
}

export interface CodeDiffViewerProps {
  path: string
  original: string
  modified: string
  active: boolean
  viewStateKey: string
}
