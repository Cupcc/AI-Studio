import { defineContract, event, invoke } from './contract'
import type { BrowserBounds, BrowserExternalRef, BrowserFocusAddress, BrowserRef, BrowserState, BrowserSuggestion, BrowserZoom } from '../tools/browser'

export const browserContract = defineContract('browser', {
  invoke: {
    getState: invoke<{ projectId: string }, BrowserState>('browser:get-state'),
    navigate: invoke<BrowserRef & { url: string }, BrowserState>('browser:navigate'),
    reload: invoke<BrowserRef, BrowserState>('browser:reload'),
    stop: invoke<BrowserRef, BrowserState>('browser:stop'),
    goBack: invoke<BrowserRef, BrowserState>('browser:go-back'),
    goForward: invoke<BrowserRef, BrowserState>('browser:go-forward'),
    toggleDevTools: invoke<BrowserRef, BrowserState>('browser:toggle-dev-tools'),
    zoom: invoke<BrowserRef & { zoom: BrowserZoom }, BrowserState>('browser:zoom'),
    /** Opens the current page in the default system browser. */
    openInSystemBrowser: invoke<BrowserRef, BrowserState>('browser:open-in-system-browser'),
    /** Clears cookies, storage and cache of the browsing data shared by every Project. */
    clearData: invoke<BrowserRef, BrowserState>('browser:clear-data'),
    dismissNotice: invoke<BrowserRef, BrowserState>('browser:dismiss-notice'),
    /** A new tab after the current one; `url` is typed-address text, optional. */
    newTab: invoke<{ projectId: string; url?: string }, BrowserState>('browser:new-tab'),
    selectTab: invoke<BrowserRef, BrowserState>('browser:select-tab'),
    closeTab: invoke<BrowserRef, BrowserState>('browser:close-tab'),
    toggleFavorite: invoke<BrowserRef, BrowserState>('browser:toggle-favorite'),
    /** Favorites and history matching the typed text (shared by every Project). */
    suggest: invoke<{ query: string }, BrowserSuggestion[]>('browser:suggest'),
    clearHistory: invoke<BrowserRef, BrowserState>('browser:clear-history'),
    answerPermission: invoke<BrowserRef & { requestId: string; allow: boolean }, BrowserState>('browser:answer-permission'),
    resetPermissions: invoke<BrowserRef, BrowserState>('browser:reset-permissions'),
    setBounds: invoke<BrowserRef & { bounds: BrowserBounds }, BrowserState>('browser:set-bounds'),
    setVisible: invoke<BrowserRef & { visible: boolean }, BrowserState>('browser:set-visible'),
    focus: invoke<BrowserRef, void>('browser:focus'),
    openExternal: invoke<BrowserExternalRef, BrowserState>('browser:open-external'),
    dismissExternal: invoke<BrowserExternalRef, BrowserState>('browser:dismiss-external')
  },
  events: {
    stateChanged: event<BrowserState>('browser:state-changed'),
    focusAddress: event<BrowserFocusAddress>('browser:focus-address')
  }
})
