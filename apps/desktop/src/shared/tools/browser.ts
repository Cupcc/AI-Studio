/** Project-owned web preview state (Tools spec FR-TOOL-003 / §4.3, §5.4). */
export interface BrowserRef { projectId: string; generation: string }
export interface BrowserBounds { x: number; y: number; width: number; height: number }
export type BrowserStatus = 'idle' | 'loading' | 'ready' | 'failed' | 'crashed'
/** A link the page wants a system application to handle (mailto: / tel:); opened only after the user agrees. */
export interface BrowserExternalRequest {
  id: string
  url: string
  source: 'address' | 'navigation' | 'redirect' | 'window'
}
/** One tab of the Project's Browser (step 3, DEC-25). `generation` identifies it. */
export interface BrowserTab { generation: string; title: string; address: string; status: BrowserStatus }
/** A site asks for a permission; answered once per site and remembered (VS Code's per-site prompts). */
export interface BrowserPermissionRequest { id: string; origin: string; permission: string }
export interface BrowserSuggestion { kind: 'favorite' | 'history'; url: string; title: string }

/** The state of the Project's current tab, with the tab strip. `revision` counts every change of the Project's Browser. */
export interface BrowserState extends BrowserRef {
  revision: number
  /** Canonical http(s) URL of the page; saved per Project so the address survives a restart. */
  address: string
  title: string
  status: BrowserStatus
  error: string | null
  /** Actual native view visibility, not the renderer's requested visibility. */
  visible: boolean
  externalRequest: BrowserExternalRequest | null
  canGoBack: boolean
  canGoForward: boolean
  devTools: boolean
  /** Page zoom in percent (100 = default). */
  zoom: number
  /** Transient feedback, e.g. a finished download or cleared browsing data. */
  notice: string | null
  tabs: BrowserTab[]
  favorite: boolean
  permissionRequest: BrowserPermissionRequest | null
}
export const BROWSER_TAB_LIMIT = 12
export interface BrowserExternalRef extends BrowserRef { requestId: string }
export type BrowserZoom = 'in' | 'out' | 'reset'
/** Main → renderer: a shortcut typed inside the page asks the app to focus the address bar. */
export interface BrowserFocusAddress { projectId: string; generation: string }
