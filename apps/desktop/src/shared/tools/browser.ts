/** Project-owned local preview state (Tools spec FR-TOOL-003 / §4.3). */
export interface BrowserRef { projectId: string; generation: string }
export interface BrowserBounds { x: number; y: number; width: number; height: number }
export type BrowserStatus = 'idle' | 'loading' | 'ready' | 'failed' | 'crashed'
export interface BrowserExternalRequest {
  id: string
  url: string
  source: 'address' | 'navigation' | 'redirect' | 'window'
}
export interface BrowserState extends BrowserRef {
  revision: number
  /** Canonical local URL; kept separately from the nonpersistent browser session. */
  address: string
  title: string
  status: BrowserStatus
  error: string | null
  /** Actual native view visibility, not the renderer's requested visibility. */
  visible: boolean
  externalRequest: BrowserExternalRequest | null
}
export interface BrowserExternalRef extends BrowserRef { requestId: string }
