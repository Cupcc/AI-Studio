import { defineContract, event, invoke } from './contract'
import type { BrowserBounds, BrowserExternalRef, BrowserRef, BrowserState } from '../tools/browser'

export const browserContract = defineContract('browser', {
  invoke: {
    getState: invoke<{ projectId: string }, BrowserState>('browser:get-state'),
    navigate: invoke<BrowserRef & { url: string }, BrowserState>('browser:navigate'),
    reload: invoke<BrowserRef, BrowserState>('browser:reload'),
    setBounds: invoke<BrowserRef & { bounds: BrowserBounds }, BrowserState>('browser:set-bounds'),
    setVisible: invoke<BrowserRef & { visible: boolean }, BrowserState>('browser:set-visible'),
    focus: invoke<BrowserRef, void>('browser:focus'),
    openExternal: invoke<BrowserExternalRef, BrowserState>('browser:open-external'),
    dismissExternal: invoke<BrowserExternalRef, BrowserState>('browser:dismiss-external')
  },
  events: { stateChanged: event<BrowserState>('browser:state-changed') }
})
